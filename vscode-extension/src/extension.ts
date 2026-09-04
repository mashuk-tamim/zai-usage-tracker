import * as vscode from 'vscode';
import * as https from 'https';

let statusBarItem: vscode.StatusBarItem;
let refreshInterval: NodeJS.Timeout | null = null;

export async function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'zaiUsageTracker.refresh';
  context.subscriptions.push(statusBarItem);

  // Attempt to migrate old key if present in plaintext config
  const oldKey = vscode.workspace.getConfiguration('zaiUsageTracker').get<string>('apiKey');
  if (oldKey) {
    await context.secrets.store('apiKey', oldKey);
    await vscode.workspace.getConfiguration('zaiUsageTracker').update('apiKey', undefined, vscode.ConfigurationTarget.Global);
  }

  const refreshCommand = vscode.commands.registerCommand('zaiUsageTracker.refresh', () => {
    updateUsageData(context);
  });
  
  const configureCommand = vscode.commands.registerCommand('zaiUsageTracker.configureApiKey', async () => {
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your Z.ai API Key',
      password: true
    });
    if (apiKey) {
      await context.secrets.store('apiKey', apiKey);
      vscode.window.showInformationMessage('Z.ai API Key saved!');
      updateUsageData(context);
    }
  });

  const selectTimeFormatCommand = vscode.commands.registerCommand('zaiUsageTracker.selectTimeFormat', async () => {
    const selected = await vscode.window.showQuickPick([
      { label: '12h', description: '12-hour format with AM/PM (e.g. 01:14 PM)' },
      { label: '24h', description: '24-hour format (e.g. 13:14)' }
    ], {
      placeHolder: 'Select Time Format for Reset Timestamps'
    });
    if (selected) {
      await vscode.workspace.getConfiguration('zaiUsageTracker').update('timeFormat', selected.label, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Z.ai Time Format set to ${selected.label}`);
      updateUsageData(context);
    }
  });

  const configureIntervalCommand = vscode.commands.registerCommand('zaiUsageTracker.configureRefreshInterval', async () => {
    const current = vscode.workspace.getConfiguration('zaiUsageTracker').get<number>('refreshIntervalMinutes') || 5;
    const input = await vscode.window.showInputBox({
      prompt: 'Enter background refresh interval in minutes (1 to 1440 mins / 24 hours)',
      value: String(current),
      validateInput: (val) => {
        const num = parseInt(val, 10);
        if (isNaN(num) || num < 1 || num > 1440) {
          return 'Please enter a number between 1 and 1440 (minutes).';
        }
        return null;
      }
    });
    if (input) {
      const mins = Math.max(1, Math.min(1440, parseInt(input, 10) || 5));
      await vscode.workspace.getConfiguration('zaiUsageTracker').update('refreshIntervalMinutes', mins, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Z.ai Refresh interval set to ${mins} minute(s)!`);
      scheduleRefresh(context);
    }
  });

  context.subscriptions.push(refreshCommand, configureCommand, selectTimeFormatCommand, configureIntervalCommand);

  // Initial fetch
  updateUsageData(context);

  // Listen for config changes
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('zaiUsageTracker.timezone') || 
        e.affectsConfiguration('zaiUsageTracker.timeFormat') || 
        e.affectsConfiguration('zaiUsageTracker.refreshIntervalMinutes')) {
      updateUsageData(context);
      scheduleRefresh(context);
    }
  }));

  scheduleRefresh(context);
}

function scheduleRefresh(context: vscode.ExtensionContext) {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  const rawMinutes = vscode.workspace.getConfiguration('zaiUsageTracker').get<number>('refreshIntervalMinutes') || 5;
  const minutes = Math.max(1, Math.min(1440, rawMinutes));
  refreshInterval = setInterval(() => updateUsageData(context), minutes * 60 * 1000);
}

async function updateUsageData(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('zaiUsageTracker');
  const apiKey = await context.secrets.get('apiKey');

  if (!apiKey) {
    statusBarItem.text = `$(key) Z.ai: Setup API Key`;
    statusBarItem.tooltip = 'Click to configure Z.ai API Key';
    statusBarItem.command = 'zaiUsageTracker.configureApiKey';
    statusBarItem.show();
    return;
  }

  statusBarItem.text = `$(sync~spin) Z.ai: Syncing...`;
  statusBarItem.show();

  try {
    const data = await fetchUsageData(apiKey);
    const parsed = parseQuotaResponse(data);
    
    // Status bar text shows 5h and weekly percentage
    const sessionPct = parsed.sessionLimit ? Math.round(parsed.sessionLimit.percentage) : 0;
    const weeklyPct = parsed.weeklyLimit ? Math.round(parsed.weeklyLimit.percentage) : null;
    statusBarItem.text = weeklyPct !== null 
      ? `$(pulse) Z.ai: ${sessionPct}% (5h) | W: ${weeklyPct}%`
      : `$(pulse) Z.ai: ${sessionPct}% (5h)`;
    statusBarItem.command = 'zaiUsageTracker.refresh';
    
    // Tooltip shows detailed breakdown
    const tz = config.get<string>('timezone') || 'Asia/Dhaka';
    const timeFormat = config.get<string>('timeFormat') || '12h';
    statusBarItem.tooltip = buildTooltip(parsed, tz, timeFormat);

  } catch (error: any) {
    statusBarItem.text = `$(error) Z.ai: Error`;
    statusBarItem.tooltip = error.message;
    console.error('Z.ai Usage Tracker Error:', error);
  }
}

function fetchUsageData(apiKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.z.ai',
      path: '/api/monitor/usage/quota/limit',
      method: 'GET',
      timeout: 10000,
      headers: {
        'Authorization': apiKey,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        } else if (res.statusCode === 401 && !options.headers['Authorization'].startsWith('Bearer ')) {
           // Try Bearer token if raw key fails
           options.headers['Authorization'] = `Bearer ${apiKey}`;
           const req2 = https.request(options, (res2) => {
             let data2 = '';
             res2.on('data', chunk => data2 += chunk);
             res2.on('end', () => {
               if (res2.statusCode === 200) {
                 try {
                   resolve(JSON.parse(data2));
                 } catch (e) {
                   reject(new Error('Invalid JSON response'));
                 }
               } else {
                 reject(new Error(`HTTP ${res2.statusCode}`));
               }
             });
           });
           req2.on('timeout', () => {
             req2.destroy();
             reject(new Error('Request timed out'));
           });
           req2.on('error', reject);
           req2.end();
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

function parseQuotaResponse(response: any) {
  if (!response || response.success === false || !response.data || !Array.isArray(response.data.limits)) {
    throw new Error('Invalid quota response structure');
  }

  let sessionLimit: any = null;
  let weeklyLimit: any = null;
  let mcpLimit: any = null;

  for (const raw of response.data.limits) {
    if (!raw) continue;
    const multipliers: { [key: number]: number } = { 1: 1440, 3: 60, 5: 1, 6: 10080 };
    const windowMinutes = (raw.number > 0 && multipliers[raw.unit]) ? raw.number * multipliers[raw.unit] : null;
    
    const parsedItem = {
      type: raw.type,
      percentage: raw.percentage || 0,
      currentValue: raw.currentValue || 0,
      usage: raw.usage || 0,
      windowMinutes,
      nextResetTime: raw.nextResetTime ? Number(raw.nextResetTime) : null
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

  let planTier = response.data.planName || response.data.plan;
  if (!planTier && response.data.level) {
    planTier = `GLM ${response.data.level.charAt(0).toUpperCase() + response.data.level.slice(1)} Plan`;
  }
  if (!planTier) planTier = 'GLM Lite Plan';

  return {
    planTier,
    sessionLimit,
    weeklyLimit,
    mcpLimit
  };
}

function formatNumber(num: number) {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return String(num);
}

function buildTooltip(parsed: any, timezone: string, timeFormat: string = '12h'): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;

  md.appendMarkdown(`**${parsed.planTier} Usage**\n\n`);

  if (parsed.sessionLimit) {
    const s = parsed.sessionLimit;
    const unit = s.type === 'CREDIT_LIMIT' ? 'Credits' : 'Tokens';
    md.appendMarkdown(`### 5-Hour Limit\n`);
    md.appendMarkdown(`**${Math.round(s.percentage)}% Used**\n`);
    md.appendMarkdown(`${unit}: ${formatNumber(s.currentValue)} / ${formatNumber(s.usage)}\n`);
    if (s.nextResetTime) {
       md.appendMarkdown(`Reset Time: ${formatDate(s.nextResetTime, timezone, timeFormat)}\n\n`);
    } else {
       md.appendMarkdown('\n');
    }
  }

  if (parsed.weeklyLimit) {
    const w = parsed.weeklyLimit;
    const unit = w.type === 'CREDIT_LIMIT' ? 'Credits' : 'Tokens';
    md.appendMarkdown(`### Weekly Limit\n`);
    md.appendMarkdown(`**${Math.round(w.percentage)}% Used**\n`);
    md.appendMarkdown(`${unit}: ${formatNumber(w.currentValue)} / ${formatNumber(w.usage)}\n`);
    if (w.nextResetTime) {
       md.appendMarkdown(`Reset Time: ${formatDate(w.nextResetTime, timezone, timeFormat)}\n\n`);
    } else {
       md.appendMarkdown('\n');
    }
  }

  if (parsed.mcpLimit) {
    md.appendMarkdown(`### MCP Tool Calls\n`);
    md.appendMarkdown(`**${Math.round(parsed.mcpLimit.percentage)}% Used**\n`);
    md.appendMarkdown(`Calls: ${parsed.mcpLimit.currentValue} / ${parsed.mcpLimit.usage}\n`);
  }

  return md;
}

function formatDate(epochMs: number, timezone: string, timeFormat: string = '12h'): string {
  try {
    const tzOption = timezone === 'local' ? undefined : timezone;
    const is24h = timeFormat === '24h';
    const formatter = new Intl.DateTimeFormat(is24h ? 'en-GB' : 'en-US', {
      timeZone: tzOption,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: is24h ? '2-digit' : 'numeric',
      minute: '2-digit',
      hour12: !is24h
    });
    return formatter.format(new Date(epochMs)).replace(',', '');
  } catch (e) {
    return new Date(epochMs).toLocaleString();
  }
}

export function deactivate() {
  if (refreshInterval) clearInterval(refreshInterval);
}
