# Z.ai (GLM) Usage Tracker & Dhaka Timezone Suite 🇧🇩⚡

[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![VS Code Extension](https://img.shields.io/badge/VS%20Code%20Extension-v1.0.0-007ACC?logo=visualstudiocode&logoColor=white)](vscode-extension/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An all-in-one productivity suite featuring a **Google Chrome Extension (Manifest V3)** and a companion **Visual Studio Code / Cursor Extension** crafted for developers using the **Z.ai (GLM) Coding Plan** (Lite, Pro, Max).

Never guess when your 5-hour rolling limit or weekly quota resets again. This suite automatically converts Beijing / Singapore (UTC+8) timestamps to **Dhaka Time (UTC+6)** (or your local timezone), gives you live countdown tickers, and monitors your quotas right from your browser toolbar and IDE status bar.

---

## 🌟 Key Highlights

- 🇧🇩 **Native Dhaka Timezone Conversion**: Automatically converts all dashboard timestamps from Beijing (UTC+8) to Dhaka Time (UTC+6) in real time.
- 🕒 **12h / 24h Flexible Formatting**: Seamlessly switch between 12-hour format with AM/PM (e.g., `01:14 PM`) and military 24-hour format (e.g., `13:14`).
- ⏱️ **Live Reset Countdown**: Keep track of exactly how many minutes and seconds remain until your 5-hour rolling quota and weekly limits refresh.
- 📊 **Dual Monitoring Options**:
  - **Browser Extension**: Sleek popup dashboard with visual percentage rings, toolbar badge colors, and in-page floating indicators.
  - **VS Code Extension**: Unobtrusive status bar widget and interactive tooltip without leaving your editor.
- 🔒 **Zero-Leak Privacy Architecture**: Your API keys are stored locally using browser storage and VS Code's encrypted `SecretStorage`. No analytics, no middleman servers.

---

## 🚀 Components

### 1. Chrome Extension (Manifest V3)

| Feature | Description |
| :--- | :--- |
| **In-Page Timezone Converter** | Injects directly into `https://z.ai/manage-apikey/coding-plan/personal/usage`, displaying the converted Dhaka time right beside original timestamps. |
| **Floating Status Pill** | Non-intrusive floating indicator in the bottom-right corner verifying that timezone conversion is active. |
| **Toolbar Popup Dashboard** | High-contrast dark-mode popup displaying live progress bars for 5-Hour rolling window, Weekly limit, and MCP tool call allowances. |
| **Dynamic Toolbar Badge** | Real-time percentage badge on Chrome's toolbar with color alerts: 🟢 `< 60%`, 🟡 `60% - 80%`, 🔴 `> 80%`. |
| **Dual Sync Mode** | **Zero-Config DOM Scraper** (works automatically when browsing the dashboard) or **24/7 Background Sync** via your personal API key. |

### 2. VS Code Extension

| Feature | Description |
| :--- | :--- |
| **Status Bar Item** | Minimalist status bar indicator showing current 5-hour quota usage percentage and reset countdown (e.g., `$(zap) 45% (3h 12m)`). |
| **Rich Hover Tooltip** | Hover over the status bar item to inspect complete details: 5-Hour Quota, Weekly Quota, MCP tool calls, and exact formatted reset times. |
| **Command Palette Actions** | Instant access to refresh usage, update API credentials, change refresh intervals, or toggle 12h/24h time formatting. |
| **Custom Refresh Rates** | Configurable background refresh intervals ranging from 1 to 1440 minutes. |

---

## 📦 Installation Guide

### Option A: Installing the Chrome Extension (Developer Mode)

1. Clone or download this repository:
   ```bash
   git clone git@github-personal:mashuk-tamim/zai-usage-tracker.git
   ```
2. Open **Google Chrome** (or any Chromium browser like Brave, Edge, Arc).
3. In the URL bar, go to:
   ```text
   chrome://extensions/
   ```
4. Enable **Developer mode** using the toggle in the top-right corner.
5. Click the **Load unpacked** button in the top-left corner.
6. Select the `chrome-extension` folder inside this repository.
7. Click Chrome's extensions (puzzle piece) icon on the toolbar and **pin** **Z.ai GLM Usage Tracker** for 1-click access.

---

### Option B: Installing the VS Code Extension

#### 1. Compile and Package Locally
```bash
cd vscode-extension
npm install
npm run compile
```

#### 2. Run in Development Mode
1. Open the `vscode-extension` folder in VS Code or Cursor:
   ```bash
   code vscode-extension
   ```
2. Press `F5` (or go to **Run and Debug** -> **Run Extension**).
3. A new Extension Development Host window will open with the extension active in your status bar.

#### 3. Package as `.vsix` (Optional for permanent install)
```bash
npx @vscode/vsce package
code --install-extension zai-usage-tracker-1.0.0.vsix
```

---

## ⚙️ Configuration & Setup

### Getting your Z.ai API Key
1. Sign in to your [Z.ai Console](https://z.ai).
2. Head to the [API Keys Management Page](https://z.ai/manage-apikey/apikey-list).
3. Copy your API Key.

### In Chrome Extension:
1. Click the **Z** extension icon on your browser toolbar.
2. Click the **Settings (⚙️)** gear icon in the top header.
3. Paste your API Key and configure your preferred timezone (default: `Asia/Dhaka`) and time format (`12h` or `24h`).
4. Click **Save Settings**.

### In VS Code:
1. Press `Cmd + Shift + P` (macOS) or `Ctrl + Shift + P` (Windows/Linux).
2. Type and run:
   ```text
   Z.ai: Setup / Full Configuration Wizard
   ```
   *(Or run individual commands: `Z.ai: Configure API Key`, `Z.ai: Configure Timezone`, `Z.ai: Select Time Format`, `Z.ai: Configure Refresh Interval`).*
3. Follow the quick prompts to set your API Key (stored in OS Keychain via `SecretStorage`), Timezone (`Asia/Dhaka` or local), Time Format (`12h` or `24h`), and refresh interval.
4. Settings can also be adjusted anytime via **Settings** (`Cmd + ,`):
   - `zaiUsageTracker.timezone`: `Asia/Dhaka` (or any IANA timezone identifier)
   - `zaiUsageTracker.timeFormat`: `12h` or `24h`
   - `zaiUsageTracker.refreshIntervalMinutes`: Interval in minutes (default: `5`)

---

## 📂 Project Structure

```text
z-ai-usage-tracker/
├── chrome-extension/        # Google Chrome Extension (Manifest V3)
│   ├── manifest.json        # Extension manifest definition
│   ├── background/
│   │   └── service-worker.js# Alarms, dynamic badge updater & API sync
│   ├── content/
│   │   ├── content-script.js# In-page scraper & Dhaka timezone converter
│   │   └── content-style.css# In-page badge styling and floating pill widget
│   ├── popup/
│   │   ├── popup.html       # Toolbar popup interface
│   │   ├── popup.css        # Glassmorphism dark-mode styles
│   │   └── popup.js         # Countdown ticker & settings controller
│   ├── icons/               # 16px, 32px, 48px, 128px PNG icons
│   ├── generate-icons.py    # Pillow script for generating icons
│   └── CHROMEWEBSTORE.md    # Store listing assets & permissions rationale
├── vscode-extension/        # Companion Visual Studio Code extension
│   ├── package.json         # Extension manifest, commands & settings
│   ├── tsconfig.json        # TypeScript configuration
│   └── src/
│       └── extension.ts     # Status bar controller, API poller & SecretStorage
├── .gitignore               # Excluded dependencies, build artifacts, OS files
├── LICENSE                  # MIT License
└── README.md                # Project documentation
```

---

## 🔐 Security & Privacy

- **Direct Connections Only**: Network requests are sent strictly to official `https://api.z.ai` endpoints.
- **No Third-Party Analytics**: No tracking scripts, analytics libraries, or external telemetry are used.
- **Isolated Storage**:
  - Chrome Extension uses Chrome's sandboxed `chrome.storage.local`.
  - VS Code Extension uses native `vscode.ExtensionContext.secrets` (Keychain on macOS, Secret Service on Linux, Credential Manager on Windows).

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to open an issue or submit a pull request:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
