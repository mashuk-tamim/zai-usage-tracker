// Content script for Z.ai Usage Tracker & Dhaka Timezone Converter (UTC+8 -> UTC+6)

(() => {
  // Guard against multiple executions
  if (window.__zai_dhaka_tracker_injected) return;
  window.__zai_dhaka_tracker_injected = true;

  const BEIJING_OFFSET_HOURS = 8;
  let activeTimezone = 'Asia/Dhaka';
  let activeTimeFormat = '12h';

  // Load configured settings
  chrome.storage.local.get(['settings'], (res) => {
    if (res?.settings?.timezone) activeTimezone = res.settings.timezone;
    if (res?.settings?.timeFormat) activeTimeFormat = res.settings.timeFormat;
  });

  // Listen for setting changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      const newSettings = changes.settings.newValue;
      if (newSettings?.timezone) activeTimezone = newSettings.timezone;
      if (newSettings?.timeFormat) activeTimeFormat = newSettings.timeFormat;
    }
  });

  // State
  let conversionActive = true;
  let floatingWidget = null;
  let lastScrapedData = null;

  // Regex pattern for Beijing timestamps:
  // e.g., "2026-09-04 18:30:25", "2026/09/04 18:30", "2026-09-04T18:30:00"
  const FULL_DATETIME_REGEX = /\b(\d{4})[-/](\d{2})[-/](\d{2})[\sT](\d{2}):(\d{2})(?::(\d{2}))?\b/g;

  /**
   * Convert a timestamp string parsed as Beijing (UTC+8) into user timezone
   */
  function convertBeijingToDhaka(year, month, day, hour, minute, second = 0) {
    // Treat the parsed values as UTC+8
    const utcMillis = Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10) - BEIJING_OFFSET_HOURS,
      parseInt(minute, 10),
      parseInt(second, 10)
    );

    const dateObj = new Date(utcMillis);
    const tzTarget = activeTimezone === 'local' ? undefined : activeTimezone;

    const formatter24 = new Intl.DateTimeFormat('en-GB', {
      timeZone: tzTarget,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: second !== undefined ? '2-digit' : undefined,
      hour12: false
    });

    const formatter12 = new Intl.DateTimeFormat('en-US', {
      timeZone: tzTarget,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: second !== undefined ? '2-digit' : undefined,
      hour12: true
    });

    return {
      formatted24: formatter24.format(dateObj).replace(',', ''),
      formatted12: formatter12.format(dateObj),
      dateObj
    };
  }

  /**
   * Scan and replace timestamps in DOM text nodes
   */
  function processNode(node) {
    if (!conversionActive || !node) return;

    // Avoid recursing into our own injected elements, script tags, style tags, or inputs
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (['script', 'style', 'textarea', 'input', 'select'].includes(tag)) return;
      if (node.classList && (node.classList.contains('zai-time-converted-wrap') || node.classList.contains('zai-tracker-floating-widget'))) return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue;
      if (!text || text.length < 10) return;

      FULL_DATETIME_REGEX.lastIndex = 0;
      if (!FULL_DATETIME_REGEX.test(text)) return;

      FULL_DATETIME_REGEX.lastIndex = 0;
      const parent = node.parentNode;
      if (!parent || parent.closest('.zai-time-converted-wrap') || parent.closest('.zai-tracker-floating-widget')) return;

      const fragment = document.createDocumentFragment();
      let lastIdx = 0;
      let match;

      while ((match = FULL_DATETIME_REGEX.exec(text)) !== null) {
        const matchStart = match.index;
        const matchEnd = FULL_DATETIME_REGEX.lastIndex;
        const rawString = match[0];

        // Text before match
        if (matchStart > lastIdx) {
          fragment.appendChild(document.createTextNode(text.substring(lastIdx, matchStart)));
        }

        const [_, y, m, d, h, min, s] = match;
        const converted = convertBeijingToDhaka(y, m, d, h, min, s || 0);

        const wrapSpan = document.createElement('span');
        wrapSpan.className = 'zai-time-converted-wrap';
        const tzLabel = activeTimezone === 'Asia/Dhaka' ? 'Dhaka Time (UTC+6)' : activeTimezone;
        wrapSpan.title = `Original (UTC+8 Beijing): ${rawString}\nConverted to ${tzLabel}`;

        const origSpan = document.createElement('span');
        origSpan.className = 'zai-original-time';
        origSpan.textContent = rawString;

        const is24h = activeTimeFormat === '24h';
        const timeDisplay = is24h ? converted.formatted24 : converted.formatted12;
        const flag = activeTimezone === 'Asia/Dhaka' ? '🇧🇩 ' : '🕒 ';
        const cityShort = activeTimezone === 'Asia/Dhaka' ? 'Dhaka' : 'Local';

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'zai-dhaka-badge';
        badgeSpan.textContent = `${flag}${timeDisplay} (${cityShort})`;

        wrapSpan.appendChild(origSpan);
        wrapSpan.appendChild(badgeSpan);
        fragment.appendChild(wrapSpan);

        lastIdx = matchEnd;
      }

      if (lastIdx < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastIdx)));
      }

      parent.replaceChild(fragment, node);
      return;
    }

    // Traverse children
    let child = node.firstChild;
    while (child) {
      const next = child.nextSibling;
      processNode(child);
      child = next;
    }
  }

  /**
   * Scrape quota metrics from visible DOM
   */
  function scrapePageMetrics() {
    try {
      const textContent = document.body.innerText;
      let sessionPercent = null;
      let weeklyPercent = null;
      let planName = 'GLM Coding Plan';

      // Look for plan tier indicators
      if (/Lite Plan|GLM-Lite|Lite/i.test(textContent)) {
        planName = 'GLM Lite Plan';
      } else if (/Pro Plan|GLM-Pro|Pro/i.test(textContent)) {
        planName = 'GLM Pro Plan';
      } else if (/Max Plan|GLM-Max|Max/i.test(textContent)) {
        planName = 'GLM Max Plan';
      }

      // Look for percentage patterns
      // Often appears inside progress indicators, cards, or next to '5-hour' / '5h'
      const pcts = textContent.match(/(\d{1,3}(?:\.\d+)?)\s*%/g);
      if (pcts && pcts.length > 0) {
        const numbers = pcts.map(p => parseFloat(p.replace('%', '')));
        if (numbers.length >= 1) sessionPercent = numbers[0];
        if (numbers.length >= 2) weeklyPercent = numbers[1];
      }

      if (sessionPercent !== null) {
        const scraped = {
          planTier: planName,
          sessionLimit: {
            percentage: sessionPercent,
            windowMinutes: 300
          },
          weeklyLimit: weeklyPercent !== null ? {
            percentage: weeklyPercent,
            windowMinutes: 10080
          } : null,
          scrapedAt: Date.now()
        };

        lastScrapedData = scraped;
        chrome.runtime.sendMessage({
          type: 'PAGE_SCRAPED_DATA',
          data: scraped
        }).catch(() => {});

        updateFloatingWidget(scraped);
      }
    } catch (e) {
      console.debug('DOM scrape failed:', e);
    }
  }

  /**
   * In-page discreet floating pill widget
   */
  function createFloatingWidget() {
    if (document.getElementById('zai-tracker-floating-widget')) return;

    floatingWidget = document.createElement('div');
    floatingWidget.id = 'zai-tracker-floating-widget';
    floatingWidget.className = 'zai-tracker-floating-widget';
    const icon = document.createElement('div');
    icon.className = 'zai-tracker-floating-icon';
    icon.textContent = 'Z';

    const content = document.createElement('div');
    content.className = 'zai-tracker-floating-content';

    const title = document.createElement('div');
    title.className = 'zai-tracker-floating-title';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = '🇧🇩 Dhaka Time Active';
    title.appendChild(titleSpan);

    const subtitle = document.createElement('div');
    subtitle.className = 'zai-tracker-floating-subtitle';
    subtitle.id = 'zai-floating-sub';
    subtitle.textContent = 'UTC+8 timestamps converted to Dhaka (UTC+6)';

    content.appendChild(title);
    content.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'zai-tracker-floating-close';
    closeBtn.title = 'Dismiss floating badge';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => {
      floatingWidget.style.display = 'none';
    });

    floatingWidget.appendChild(icon);
    floatingWidget.appendChild(content);
    floatingWidget.appendChild(closeBtn);

    document.body.appendChild(floatingWidget);
  }

  function updateFloatingWidget(data) {
    if (!floatingWidget) return;
    const sub = document.getElementById('zai-floating-sub');
    if (sub && data.sessionLimit) {
      sub.textContent = `5h Quota: ${Math.round(data.sessionLimit.percentage)}% used • Auto Dhaka Time`;
    }
  }

  // Debounced mutation observer with disconnect to prevent infinite loops
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      observer.disconnect();
      processNode(document.body);
      scrapePageMetrics();
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }, 200);
  });

  // Initialize
  function init() {
    processNode(document.body);
    createFloatingWidget();
    scrapePageMetrics();

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
