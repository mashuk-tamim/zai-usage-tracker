// Popup Controller for Z.ai GLM Usage Tracker

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const planBadge = document.getElementById('plan-badge');
  const sessionPct = document.getElementById('session-pct');
  const sessionProgressFill = document.getElementById('session-progress-fill');
  const sessionNumbers = document.getElementById('session-numbers');
  const sessionStatusText = document.getElementById('session-status-text');
  
  const resetCountdown = document.getElementById('reset-countdown');
  const resetTimestamp = document.getElementById('reset-timestamp');

  const weeklyPct = document.getElementById('weekly-pct');
  const weeklyProgressFill = document.getElementById('weekly-progress-fill');
  const weeklyNumbers = document.getElementById('weekly-numbers');

  const mcpPct = document.getElementById('mcp-pct');
  const mcpNumbers = document.getElementById('mcp-numbers');
  const mcpRemaining = document.getElementById('mcp-remaining');

  const lastUpdatedText = document.getElementById('last-updated-text');
  const noKeyBanner = document.getElementById('no-key-banner');

  // Settings elements
  const btnSettingsToggle = document.getElementById('btn-settings-toggle');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const settingsPanel = document.getElementById('settings-panel');
  const apiKeyInput = document.getElementById('api-key-input');
  const btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
  const timezoneSelect = document.getElementById('timezone-select');
  const timeformatSelect = document.getElementById('timeformat-select');
  const regionSelect = document.getElementById('region-select');
  const intervalInput = document.getElementById('interval-input');
  const btnSaveSettings = document.getElementById('btn-save-settings');

  // Actions
  const btnRefresh = document.getElementById('btn-refresh');
  const refreshSpinner = document.getElementById('refresh-spinner');
  const toast = document.getElementById('toast');

  let currentResetEpoch = null;
  let countdownInterval = null;
  let currentTimezone = 'Asia/Dhaka';
  let currentTimeFormat = '12h';

  // Load timezones
  function populateTimezones() {
    try {
      const timezones = Intl.supportedValuesOf('timeZone');
      timezones.forEach(tz => {
        const option = document.createElement('option');
        option.value = tz;
        option.textContent = tz.replace(/_/g, ' ');
        timezoneSelect.appendChild(option);
      });
      const localOption = document.createElement('option');
      localOption.value = 'local';
      localOption.textContent = 'Browser Local Time';
      timezoneSelect.appendChild(localOption);
    } catch (e) {
      timezoneSelect.innerHTML = '<option value="Asia/Dhaka">Asia/Dhaka</option><option value="Asia/Shanghai">Asia/Shanghai</option><option value="local">Browser Local Time</option>';
    }
  }
  populateTimezones();

  // Load initial data
  const { settings, usageData } = await chrome.storage.local.get(['settings', 'usageData']);
  
  if (settings) {
    if (settings.apiKey) apiKeyInput.value = settings.apiKey;
    if (settings.timezone) {
      timezoneSelect.value = settings.timezone;
      currentTimezone = settings.timezone;
    }
    if (settings.timeFormat) {
      timeformatSelect.value = settings.timeFormat;
      currentTimeFormat = settings.timeFormat;
    }
    if (settings.region) regionSelect.value = settings.region;
    if (settings.refreshInterval !== undefined) {
      intervalInput.value = String(settings.refreshInterval);
    } else {
      intervalInput.value = '5';
    }
  } else {
    intervalInput.value = '5';
  }

  updateDashboard(usageData, settings);

  // Periodic countdown runner
  startCountdownRunner(currentTimezone, currentTimeFormat);

  // Event Listeners
  btnSettingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  btnToggleKeyVisibility.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      btnToggleKeyVisibility.textContent = '🔒';
    } else {
      apiKeyInput.type = 'password';
      btnToggleKeyVisibility.textContent = '👁️';
    }
  });

  btnSaveSettings.addEventListener('click', async () => {
    const intervalVal = Math.max(1, Math.min(1440, parseInt(intervalInput.value, 10) || 5));
    intervalInput.value = String(intervalVal);

    const newSettings = {
      apiKey: apiKeyInput.value.trim(),
      timezone: timezoneSelect.value,
      timeFormat: timeformatSelect.value || '12h',
      region: regionSelect.value,
      refreshInterval: intervalVal,
      planName: (usageData && usageData.planTier) || 'GLM Lite Plan'
    };

    currentTimezone = newSettings.timezone;
    currentTimeFormat = newSettings.timeFormat;

    await chrome.storage.local.set({ settings: newSettings });

    // Notify service worker
    chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED' }).catch(() => {});

    showToast('Settings saved successfully!');
    settingsPanel.classList.add('hidden');

    // Trigger immediate refresh with new settings
    triggerRefresh();
  });

  btnRefresh.addEventListener('click', () => {
    triggerRefresh();
  });

  /**
   * Trigger refresh via background worker
   */
  async function triggerRefresh() {
    refreshSpinner.classList.add('spinning');
    btnRefresh.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'REFRESH_USAGE' });
      const { settings: updatedSettings, usageData: updatedData } = await chrome.storage.local.get(['settings', 'usageData']);
      if (updatedSettings) {
        currentTimezone = updatedSettings.timezone || currentTimezone;
        currentTimeFormat = updatedSettings.timeFormat || currentTimeFormat;
      }
      updateDashboard(updatedData, updatedSettings);
      startCountdownRunner(currentTimezone, currentTimeFormat);
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      refreshSpinner.classList.remove('spinning');
      btnRefresh.disabled = false;
    }
  }

  /**
   * Format numbers to compact strings (e.g., 800M, 1.2B)
   */
  function formatCompactNumber(num) {
    if (!num && num !== 0) return '0';
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return String(num);
  }

  /**
   * Update Dashboard UI with latest metrics
   */
  function updateDashboard(data, currentSettings) {
    const tz = currentSettings?.timezone || 'Asia/Dhaka';
    const hasKey = Boolean(currentSettings?.apiKey);

    if (noKeyBanner) {
      noKeyBanner.style.display = hasKey ? 'none' : 'flex';
    }

    if (!data) {
      lastUpdatedText.textContent = hasKey ? 'Syncing...' : 'Open Z.ai or add API key';
      return;
    }

    // Plan tier
    if (data.planTier) {
      planBadge.textContent = data.planTier;
    }

    // 5-Hour rolling window
    const session = data.sessionLimit;
    if (session) {
      const pct = Math.max(0, Math.min(100, Math.round(session.percentage || 0)));
      sessionPct.textContent = `${pct}%`;
      sessionProgressFill.style.width = `${pct}%`;

      // Color coding & status
      sessionProgressFill.classList.remove('warning', 'danger');
      sessionStatusText.classList.remove('green', 'yellow', 'red');

      if (pct >= 85) {
        sessionProgressFill.classList.add('danger');
        sessionStatusText.classList.add('red');
        sessionStatusText.textContent = 'High Usage';
      } else if (pct >= 60) {
        sessionProgressFill.classList.add('warning');
        sessionStatusText.classList.add('yellow');
        sessionStatusText.textContent = 'Moderate';
      } else {
        sessionStatusText.classList.add('green');
        sessionStatusText.textContent = 'Normal';
      }

      if (session.usage || session.currentValue) {
        const used = session.currentValue || 0;
        const total = session.usage || 800_000_000;
        const unitLabel = session.type === 'CREDIT_LIMIT' ? 'credits' : 'tokens';
        sessionNumbers.textContent = `${formatCompactNumber(used)} / ${formatCompactNumber(total)} ${unitLabel}`;
      } else {
        sessionNumbers.textContent = `${pct}% of 5-hour quota`;
      }

      // Store reset epoch for countdown runner
      currentResetEpoch = session.nextResetTime || null;
      renderResetDisplay(currentResetEpoch, tz, currentSettings?.timeFormat || currentTimeFormat);
    }

    // Weekly allowance
    const weekly = data.weeklyLimit;
    const weeklyStatusText = document.getElementById('weekly-status-text');
    if (weekly) {
      const wPct = Math.max(0, Math.min(100, Math.round(weekly.percentage || 0)));
      weeklyPct.textContent = `${wPct}%`;
      weeklyProgressFill.style.width = `${wPct}%`;

      if (weekly.usage) {
        const used = weekly.currentValue || 0;
        const total = weekly.usage || 0;
        const unitLabel = weekly.type === 'CREDIT_LIMIT' ? 'credits' : 'tokens';
        weeklyNumbers.textContent = `${formatCompactNumber(used)} / ${formatCompactNumber(total)} ${unitLabel}`;
      } else {
        weeklyNumbers.textContent = `${wPct}% used this week`;
      }

      if (weekly.nextResetTime && weeklyStatusText) {
        const is24h = (currentSettings?.timeFormat || currentTimeFormat) === '24h';
        const weeklyFmt = new Intl.DateTimeFormat(is24h ? 'en-GB' : 'en-US', {
          timeZone: tz === 'local' ? undefined : tz,
          month: 'short',
          day: 'numeric',
          hour: is24h ? '2-digit' : 'numeric',
          minute: '2-digit',
          hour12: !is24h
        }).format(new Date(weekly.nextResetTime));
        weeklyStatusText.textContent = `Resets ${weeklyFmt}`;
      }
    }

    // MCP / Tool calls
    const mcp = data.mcpLimit;
    if (mcp) {
      const mPct = Math.max(0, Math.min(100, Math.round(mcp.percentage || 0)));
      mcpPct.textContent = `${mPct}%`;
      if (mcp.usage) {
        mcpNumbers.textContent = `${mcp.currentValue || 0} / ${mcp.usage} calls`;
      }
      if (mcp.remaining !== null && mcp.remaining !== undefined) {
        mcpRemaining.textContent = `${mcp.remaining} remaining`;
      }
    }

    // Last updated timestamp
    if (data.lastUpdated) {
      const timeAgo = formatTimeAgo(data.lastUpdated);
      lastUpdatedText.textContent = `Updated ${timeAgo}`;
    } else {
      lastUpdatedText.textContent = 'Live data';
    }
  }

  /**
   * Render reset countdown and formatted timestamp
   */
  function renderResetDisplay(resetEpoch, timezone, timeFormat) {
    if (!resetEpoch) {
      resetCountdown.textContent = 'Rolling Dynamic Quota';
      resetTimestamp.textContent = 'Refreshes 5h after usage';
      return;
    }

    const now = Date.now();
    const diffMs = resetEpoch - now;

    const tzOption = timezone === 'local' ? undefined : timezone;
    const is24h = (timeFormat || currentTimeFormat) === '24h';
    const timeFormatter = new Intl.DateTimeFormat(is24h ? 'en-GB' : 'en-US', {
      timeZone: tzOption,
      month: 'short',
      day: 'numeric',
      hour: is24h ? '2-digit' : 'numeric',
      minute: '2-digit',
      hour12: !is24h
    });

    const formattedTzTime = timeFormatter.format(new Date(resetEpoch));
    const tzLabel = timezone === 'Asia/Dhaka' ? 'Dhaka' : timezone === 'Asia/Shanghai' ? 'Beijing' : 'Local';
    resetTimestamp.textContent = `at ${formattedTzTime} (${tzLabel} time)`;

    if (diffMs <= 0) {
      resetCountdown.textContent = 'Quota Reset Available';
      resetCountdown.style.color = '#34D399';
    } else {
      const totalSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      let timeString = '';
      if (hours > 0) timeString += `${hours}h `;
      timeString += `${minutes}m ${seconds}s`;

      resetCountdown.textContent = `Resets in ${timeString}`;
      resetCountdown.style.color = '#38BDF8';
    }
  }

  /**
   * Start 1-second countdown ticker
   */
  function startCountdownRunner(timezone, timeFormat) {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      if (currentResetEpoch) {
        renderResetDisplay(currentResetEpoch, timezone, timeFormat);
      }
    }, 1000);
  }

  /**
   * Relative time formatter ("2m ago")
   */
  function formatTimeAgo(timestamp) {
    const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSeconds < 60) return 'just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return 'earlier today';
  }

  /**
   * Toast helper
   */
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }
});
