# Chrome Web Store Listing Information

## 1. Extension Metadata

- **Name**: Z.ai GLM Usage Tracker & Dhaka Time
- **Short Name**: Z.ai Tracker
- **Version**: 1.0.0
- **Category**: Productivity / Developer Tools
- **Default Language**: English

### Summary (Max 132 characters)
Track Z.ai & GLM coding plan usage, monitor 5-hour rolling quota resets, and convert Beijing time (UTC+8) to Dhaka (UTC+6).

---

## 2. Detailed Description

```markdown
Track your Z.ai (GLM) coding plan quota at a glance and never miss a reset deadline!

If you use the Z.ai GLM Lite, Pro, or Max coding plan from Bangladesh or other UTC+6 regions, keeping track of your 5-hour rolling quota and converting Beijing/Singapore time (UTC+8) on the official dashboard is tedious. This extension solves that completely.

⚡ KEY FEATURES

1. In-Page Dhaka Timezone Converter (UTC+8 → UTC+6)
- Automatically converts all Beijing timestamps on `https://z.ai/manage-apikey/coding-plan/personal/usage` to Dhaka Time (UTC+6) in-place.
- Clean dual-time display: see both the original Beijing time and your exact local Dhaka time.
- Floating indicator on the usage dashboard showing active Dhaka time conversion.

2. Live 5-Hour Quota Reset Countdown
- Live countdown ticker ("Resets in 1h 22m 15s") showing exactly when your rolling quota replenishes.
- Clear timestamp display in Dhaka time (12-hour format with AM/PM).

3. Instant Toolbar Popup & Usage Meters
- Check 5-hour rolling tokens/credits usage and weekly allowance anytime without keeping the tab open.
- Color-coded visual progress indicators: Green (<60%), Amber (60-80%), Red (>80%).
- MCP tool calls and web search usage monitor.

4. Dynamic Toolbar Icon Badge
- Live percentage badge (e.g. "35%") directly on your browser extension icon.
- Background sync updates your badge automatically every 5, 10, or 15 minutes.

5. Zero-Config + Optional Background Sync
- Zero-config mode: Automatically captures data whenever you visit the Z.ai dashboard.
- Background sync mode: Optionally paste your Z.ai API key to enable 24/7 background quota monitoring.

🔒 PRIVACY & SECURITY
- 100% Client-Side: Your API key and usage stats never leave your local browser.
- No third-party tracking, no analytics, and no external servers.
- Keys are saved exclusively in your browser's encrypted local storage (`chrome.storage.local`).
```

---

## 3. Permission Justifications (For Review Team)

### `storage`
> **Justification**: Used to store the user's optional API key, preferred refresh interval, chosen timezone (Dhaka UTC+6 default), and cached quota values so the popup opens instantly without network latency.

### `alarms`
> **Justification**: Used to periodically trigger the background service worker to fetch the latest quota stats and update the extension badge text every 5–15 minutes (as selected by the user).

### Host Permissions:
- `https://api.z.ai/*`
  > **Justification**: Required to query the Z.ai quota monitoring endpoint (`/api/monitor/usage/quota/limit`) when the user configures their API key for background sync.
- `https://open.bigmodel.cn/*`
  > **Justification**: Required for users on the BigModel China regional cluster to fetch their quota limits.
- `https://z.ai/*`
  > **Justification**: Required for the content script on `https://z.ai/manage-apikey/coding-plan/personal/usage` to convert displayed Beijing timestamps to Dhaka time directly in the DOM.

---

## 4. Privacy Practices

- **Single Purpose**: Track Z.ai GLM coding plan quotas and adjust timezone for developers in Dhaka (UTC+6).
- **Does the extension collect personally identifiable information?** No.
- **Does the extension sell user data to third parties?** No.
- **Does the extension use or transfer user data for purposes unrelated to the item's core functionality?** No.
- **Does the extension use or transfer user data to determine creditworthiness or for lending purposes?** No.

---

## 5. Asset Checklist

- [x] **Small Icon**: 16x16 PNG (`icons/icon-16.png`)
- [x] **Browser Action Icon**: 32x32 PNG (`icons/icon-32.png`)
- [x] **Management Page Icon**: 48x48 PNG (`icons/icon-48.png`)
- [x] **Web Store Tile Icon**: 128x128 PNG (`icons/icon-128.png`)
- [ ] **Promo Marquee (Optional)**: 440x280 PNG
- [ ] **Screenshots**: At least one 1280x800 or 640x400 screenshot of the popup dashboard and in-page converter.
