// Service Worker for Z.ai GLM Usage Tracker (Manifest V3)

const DEFAULT_SETTINGS = {
  timezone: 'Asia/Dhaka', // Default to Dhaka (UTC+6)
  timeFormat: '12h',      // '12h' or '24h'
  refreshInterval: 5,     // in minutes (1 to 1440)
  region: 'global',       // 'global' (api.z.ai) or 'bigmodel-cn' (open.bigmodel.cn)
  apiKey: '',
  planName: 'GLM Coding Plan'
};

// Lifecycle: Installation & Initialization
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(['settings']);
  if (!current.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }

  const rawInterval = (current.settings && current.settings.refreshInterval) || DEFAULT_SETTINGS.refreshInterval;
  const interval = Math.max(1, Math.min(1440, parseInt(rawInterval, 10) || 5));
  await chrome.alarms.create('fetchUsageAlarm', {
    periodInMinutes: interval
  });

  await syncUsage();
});

// Periodic alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'fetchUsageAlarm') {
    await syncUsage();
  }
});

// Message listener from Popup and Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REFRESH_USAGE') {
    (async () => {
      try {
        const result = await syncUsage();
        sendResponse({ success: true, result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (message.type === 'PAGE_SCRAPED_DATA') {
    (async () => {
      try {
        if (message.data) {
          const currentStorage = await chrome.storage.local.get(['usageData']);
          const mergedData = {
            ...(currentStorage.usageData || {}),
            ...message.data,
            source: 'page_content_script',
            lastUpdated: Date.now()
          };
          await chrome.storage.local.set({ usageData: mergedData });
          updateBadge(mergedData);
        }
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'SETTINGS_UPDATED') {
    (async () => {
      const { settings } = await chrome.storage.local.get(['settings']);
      const interval = Math.max(1, Math.min(1440, parseInt(settings?.refreshInterval, 10) || 5));
      await chrome.alarms.create('fetchUsageAlarm', {
        periodInMinutes: interval
      });
      await syncUsage();
      sendResponse({ success: true });
    })();
    return true;
  }
});

/**
 * Sync usage data via direct API if key is present
 */
async function syncUsage() {
  const { settings = DEFAULT_SETTINGS, usageData: cachedData } = await chrome.storage.local.get(['settings', 'usageData']);

  if (!settings.apiKey) {
    if (cachedData) {
      updateBadge(cachedData);
    }
    return { status: 'no_api_key', data: cachedData };
  }

  const base = settings.region === 'bigmodel-cn' ? 'https://open.bigmodel.cn' : 'https://api.z.ai';
  const quotaUrl = `${base}/api/monitor/usage/quota/limit`;

  try {
    const json = await fetchWithAuth(quotaUrl, settings.apiKey);
    if (!json || json.success === false || !json.data || !Array.isArray(json.data.limits)) {
      throw new Error((json && (json.msg || json.message)) || 'Invalid quota response structure');
    }

    const parsed = parseQuotaResponse(json.data);
    parsed.lastUpdated = Date.now();
    parsed.source = 'api';

    await chrome.storage.local.set({ usageData: parsed });
    updateBadge(parsed);
    return { status: 'success', data: parsed };
  } catch (error) {
    console.error('Failed to sync Z.ai usage:', error);
    return { status: 'error', error: error.message, data: cachedData };
  }
}

/**
 * Try Authorization both as raw key and as Bearer token
 */
async function fetchWithAuth(url, apiKey) {
  const tokenCandidates = [apiKey.trim(), `Bearer ${apiKey.trim()}`];

  for (const token of tokenCandidates) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': token,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Accept-Language': 'en-US,en'
        }
      });

      if (res.status === 200) {
        return await res.json();
      }
      if (res.status === 401) {
        continue;
      }
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    } catch (err) {
      if (err.message.includes('HTTP 401')) continue;
      if (token === tokenCandidates[tokenCandidates.length - 1]) throw err;
    }
  }

  throw new Error('Authentication failed for both raw and Bearer formats');
}

/**
 * Parse Z.ai limits array
 */
function parseQuotaResponse(data) {
  const limits = data.limits || [];

  let sessionLimit = null; // 5-Hour rolling window
  let weeklyLimit = null;  // 7-day window
  let mcpLimit = null;     // MCP tool calls

  for (const raw of limits) {
    if (!raw || typeof raw !== 'object') continue;

    // Multipliers for unit: 1: day (1440m), 3: hour (60m), 5: min, 6: week (10080m)
    const multipliers = { 1: 1440, 3: 60, 5: 1, 6: 10080 };
    const windowMinutes = (raw.number > 0 && multipliers[raw.unit]) ? raw.number * multipliers[raw.unit] : null;

    const parsedItem = {
      type: raw.type,
      percentage: Math.max(0, Math.min(100, Math.round(raw.percentage || 0))),
      currentValue: raw.currentValue ?? 0,
      usage: raw.usage ?? 0,
      remaining: raw.remaining ?? null,
      unit: raw.unit,
      number: raw.number,
      windowMinutes,
      nextResetTime: raw.nextResetTime ? Number(raw.nextResetTime) : null,
      details: Array.isArray(raw.usageDetails) ? raw.usageDetails : []
    };

    if (raw.type === 'TIME_LIMIT') {
      mcpLimit = parsedItem;
    } else if (raw.type === 'TOKENS_LIMIT' || raw.type === 'CREDIT_LIMIT') {
      if (windowMinutes === 300 || (raw.unit === 3 && raw.number === 5)) {
        sessionLimit = parsedItem;
      } else if (windowMinutes === 10080 || raw.unit === 6) {
        weeklyLimit = parsedItem;
      } else if (!sessionLimit) {
        sessionLimit = parsedItem;
      } else if (!weeklyLimit) {
        weeklyLimit = parsedItem;
      }
    }
  }

  // Detected plan tier
  let planTier = data.planName || data.plan || data.packageName;
  if (!planTier && data.level) {
    planTier = `GLM ${data.level.charAt(0).toUpperCase() + data.level.slice(1)} Plan`;
  }
  if (!planTier) planTier = 'GLM Lite Plan';

  return {
    planTier,
    sessionLimit,
    weeklyLimit,
    mcpLimit,
    rawLimits: limits
  };
}

/**
 * Update the toolbar icon badge with current 5-hour usage
 */
function updateBadge(usageData) {
  if (!usageData) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  const primary = usageData.sessionLimit || usageData.primaryLimit;
  if (!primary || typeof primary.percentage !== 'number') {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  const pct = Math.round(primary.percentage);
  chrome.action.setBadgeText({ text: `${pct}%` });

  // Color code: green < 60%, orange 60-80%, red > 80%
  let color = '#10B981'; // emerald green
  if (pct >= 85) {
    color = '#EF4444'; // red
  } else if (pct >= 60) {
    color = '#F59E0B'; // amber/orange
  }

  chrome.action.setBadgeBackgroundColor({ color });
}
