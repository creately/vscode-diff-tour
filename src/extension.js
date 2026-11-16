const vscode = require('vscode');
const { spawn, execFile } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const http = require('node:http');
const { gitRoot, projectStatus } = require('./project');
const { stageRuntime } = require('./runtime');

let selectedRoot;
let dashboard;
let dashboardUrl;
let dashboardRoot;
let dashboardReady;
let output;
let tree;
let statusBar;
let runtimeDir;
let dashboardKey;
let workspaceState;

function config() {
  const settings = vscode.workspace.getConfiguration('diffTour');
  return { cliPath: settings.get('cliPath', '') };
}

function roots() {
  return [...new Set((vscode.workspace.workspaceFolders || []).map(folder => gitRoot(folder.uri.fsPath)).filter(Boolean))];
}

async function project() {
  const available = roots();
  if (!available.length) throw new Error('Open a Git project in VS Code first.');
  if (!selectedRoot || !available.includes(selectedRoot)) {
    if (available.length > 1) {
      selectedRoot = await vscode.window.showQuickPick(available, { placeHolder: 'Select the Git project for Diff Tour' });
      if (!selectedRoot) return null;
    } else selectedRoot = available[0];
  }
  return projectStatus(selectedRoot, config(), runtimeDir);
}

function run(command, args, cwd, timeout = 30000) {
  return new Promise((resolve, reject) => execFile(command, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(new Error((stderr || error.message).trim()));
    else resolve(stdout);
  }));
}

async function cli(p, args, timeout) {
  if (!p.cli) throw new Error(`Diff Tour CLI was not found at ${p.paths.cli}. Reinstall the bundled extension.`);
  const source = p.paths.cli.endsWith('.ts');
  return run(source ? 'bun' : p.paths.cli, [...(source ? [p.paths.cli] : []), ...args, '--repo', p.root], p.root, timeout);
}

async function turns(p) {
  const items = JSON.parse(await cli(p, ['turns', '--json']));
  return items.filter(item => item.kind === 'turn' && item.endedAt);
}

async function refresh() {
  try {
    const p = await project();
    if (!p) return;
    let completed = [];
    let error = '';
    if (p.cli) {
      try { completed = await turns(p); }
      catch (cause) { error = cause.message; }
    }
    let serviceState;
    if (dashboard && dashboard.exitCode === null && dashboardUrl) {
      try { serviceState = await request('GET', 'api/state'); }
      catch (cause) { output.appendLine(`Status refresh: ${cause.message}`); }
    }
    tree.setState(p, completed.length, error, serviceState);
    statusBar.text = error ? '$(warning) Diff Tour: Error' : !p.map || !(p.codex || p.claude || p.antigravity) || !p.scannerReady ? '$(circle-outline) Diff Tour: Setup needed' : p.review ? '$(check) Diff Tour: Ready' : '$(sync) Diff Tour: Preparing review';
    statusBar.tooltip = error || `${p.name} / ${p.branch} · ${completed.length} completed turns`;
    statusBar.show();
  } catch (cause) {
    tree.setError(cause.message);
    statusBar.text = '$(warning) Diff Tour: Error';
    statusBar.tooltip = cause.message;
    statusBar.show();
  }
}

async function action(fn) {
  try { await fn(); }
  catch (cause) { vscode.window.showErrorMessage(`Diff Tour: ${cause.message}`); output.appendLine(String(cause.stack || cause)); }
  await refresh();
}

async function showDashboard(url, external) {
  if (external) {
    await vscode.env.openExternal(vscode.Uri.parse(url));
    return;
  }
  try {
    await vscode.commands.executeCommand('simpleBrowser.show', url);
  } catch (cause) {
    output.appendLine(`VS Code browser unavailable: ${cause.message}`);
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }
}

function ensureDashboard(p) {
  if (!p.cli) throw new Error(`Diff Tour CLI was not found at ${p.paths.cli}. Reinstall the bundled extension.`);
  if (dashboard && dashboard.exitCode === null && dashboardRoot === p.root && dashboardReady) return dashboardReady;
  if (dashboard && dashboard.exitCode === null) dashboard.kill();
  dashboardUrl = undefined;
  dashboardRoot = p.root;
  dashboardKey = randomBytes(32).toString('hex');
  const source = p.paths.cli.endsWith('.ts');
  dashboard = spawn(source ? 'bun' : p.paths.cli, [...(source ? [p.paths.cli] : []), 'start', '--repo', p.root, '--no-open'], { cwd: p.root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DIFF_TOUR_EXTENSION_KEY: dashboardKey } });
  const child = dashboard;
  let stdout = '';
  dashboardReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Diff Tour dashboard did not start within 15 seconds. See Diff Tour output.'));
    }, 15000);
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      output.append(chunk.toString());
      const match = stdout.match(/Diff Tour dashboard: (http:\/\/127\.0\.0\.1:\d+\/)/);
      if (match && !dashboardUrl) {
        dashboardUrl = match[1];
        clearTimeout(timer);
        resolve(dashboardUrl);
      }
    });
    child.on('error', cause => { clearTimeout(timer); reject(cause); });
    child.on('exit', code => {
      clearTimeout(timer);
      if (!dashboardUrl) reject(new Error(`Diff Tour dashboard exited before starting (${code}). See Diff Tour output.`));
      if (dashboard === child) { dashboard = undefined; dashboardUrl = undefined; dashboardReady = undefined; dashboardRoot = undefined; }
      if (code && code !== 0) vscode.window.showWarningMessage(`Diff Tour dashboard exited (${code}). See Diff Tour output.`);
    });
  });
  child.stderr.on('data', chunk => output.append(chunk.toString()));
  return dashboardReady;
}

async function request(method, path, body) {
  if (!dashboardUrl) throw new Error('Diff Tour service is not running.');
  const target = new URL(path, dashboardUrl);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(target, {
      method,
      headers: {
        'X-Diff-Tour-Extension-Key': dashboardKey,
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }),
      },
      timeout: 125000,
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const value = JSON.parse(raw);
          if (res.statusCode < 200 || res.statusCode >= 300) reject(new Error(value.error || `Diff Tour returned ${res.statusCode}`));
          else resolve(value);
        } catch (cause) { reject(cause); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Diff Tour operation timed out.')));
    req.on('error', reject);
    req.end(payload);
  });
}

async function serviceAction(path, body, title) {
  const p = await project();
  if (!p) return null;
  await ensureDashboard(p);
  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Diff Tour: ${title}`, cancellable: false }, () => request('POST', path, body));
  if (result.message) vscode.window.showInformationMessage(result.message);
  return result;
}

function saved(p, field, fallback = '') {
  return workspaceState.get(`${p.root}:${field}`, fallback);
}

async function input(p, field, prompt, fallback, validateInput) {
  const value = await vscode.window.showInputBox({ prompt, value: saved(p, field, fallback), ignoreFocusOut: true, validateInput });
  if (value !== undefined) await workspaceState.update(`${p.root}:${field}`, value.trim());
  return value?.trim();
}

async function scanRepo() {
  const p = await project(); if (!p) return;
  await ensureDashboard(p);
  const state = await request('GET', 'api/state');
  const repositoryId = await input(p, 'repositoryId', 'Repository ID', state.repositoryId || '', value => /^[\w.-]+\/[\w.-]+\/[\w.-]+$/.test(value) ? null : 'Use a repository ID such as github.com/org/repo');
  if (repositoryId === undefined) return;
  const moduleRoot = await input(p, 'moduleRoot', 'Module root relative to this repository (blank scans the whole repository)', 'src');
  if (moduleRoot === undefined) return;
  await serviceAction('api/scan', { repositoryId, moduleRoot }, 'Scanning repository');
}

async function connectCreately() {
  const p = await project(); if (!p) return;
  const url = await input(p, 'createlyUrl', 'Creately host URL', 'http://localhost:5174', value => { try { return new URL(value).origin === value.replace(/\/$/, '') ? null : 'Enter a host URL'; } catch { return 'Enter a valid URL'; } });
  if (!url) return;
  const result = await serviceAction('api/connect', { url }, 'Connecting to Creately');
  if (result?.url) await vscode.env.openExternal(vscode.Uri.parse(result.url));
}

async function sendScan() {
  const p = await project(); if (!p) return;
  await ensureDashboard(p);
  const state = await request('GET', 'api/state');
  if (!state.scan) throw new Error('Scan the repository first.');
  if (!state.connected) throw new Error('Connect to Creately first.');
  const url = await input(p, 'folderUrl', 'Destination System Design folder link', '', value => {
    try { return /^\/dashboard\/[A-Za-z0-9_-]{4,100}$/.test(new URL(value).pathname) ? null : 'Paste a Creately System Design folder link'; }
    catch { return 'Paste a valid folder link'; }
  });
  if (!url) return;
  const result = await serviceAction('api/send-scan', { url }, 'Sending scan to Creately');
  if (result?.reviewUrl) {
    await workspaceState.update(`${p.root}:importUrl`, result.reviewUrl);
    const choice = await vscode.window.showInformationMessage('Scan sent for review. Your system is unchanged until you accept the import.', 'Review import');
    if (choice) await vscode.env.openExternal(vscode.Uri.parse(result.reviewUrl));
  }
}

async function openDashboard() {
  const p = await project();
  if (!p) return;
  await vscode.env.openExternal(vscode.Uri.parse(await ensureDashboard(p)));
}

class ProjectTree {
  constructor() { this.emitter = new vscode.EventEmitter(); this.onDidChangeTreeData = this.emitter.event; this.items = []; }
  setState(p, count, error, serviceState) {
    const item = (label, description) => ({ label, description });
    this.items = [
      item(`${p.name} / ${p.branch}`, 'Git project'),
      item('System map', p.map ? 'Ready' : 'Needs setup'),
      item('Agent capture', ['Codex', 'Claude', 'Antigravity'].filter((_, index) => [p.codex, p.claude, p.antigravity][index]).join(' + ') || 'Needs setup'),
      item('Completed turns', String(count)),
      item('Local review', p.review ? 'Ready' : 'Waiting for a completed prompt'),
      item('Creately', serviceState?.connected ? 'Connected' : 'Not connected'),
      item('Current system scan', serviceState?.scan ? `${serviceState.scan.elements} elements` : 'Not scanned'),
    ];
    if (!p.cli) this.items.push(item('Diff Tour CLI missing', p.paths.cli));
    if (!p.scannerReady) this.items.push(item('Bundled scanner unavailable', 'Reinstall the extension'));
    if (error) this.items.push(item('Readiness error', error));
    this.emitter.fire();
  }
  setError(message) { this.items = [{ label: 'Diff Tour unavailable', description: message }]; this.emitter.fire(); }
  getTreeItem(value) { const row = new vscode.TreeItem(value.label); row.description = value.description; return row; }
  getChildren() { return this.items; }
  dispose() { this.emitter.dispose(); }
}

function activate(context) {
  workspaceState = context.workspaceState;
  runtimeDir = stageRuntime(context.extensionPath, context.globalStorageUri.fsPath);
  output = vscode.window.createOutputChannel('Diff Tour');
  tree = new ProjectTree();
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  statusBar.command = 'workbench.view.extension.diffTour';
  context.subscriptions.push(output, tree, statusBar, vscode.window.registerTreeDataProvider('diffTour.project', tree));
  const command = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, () => action(fn)));
  command('diffTour.selectProject', async () => {
    const available = roots();
    selectedRoot = await vscode.window.showQuickPick(available, { placeHolder: 'Select the Git project for Diff Tour' });
  });
  command('diffTour.refresh', refresh);
  command('diffTour.openDashboard', openDashboard);
  command('diffTour.openDashboardBrowser', openDashboard);
  command('diffTour.setupMap', () => serviceAction('api/map', {}, 'Proposing system map'));
  command('diffTour.addCodex', () => serviceAction('api/hooks', { agent: 'codex' }, 'Installing Codex hooks'));
  command('diffTour.addClaude', () => serviceAction('api/hooks', { agent: 'claude' }, 'Installing Claude hooks'));
  command('diffTour.addAntigravity', () => serviceAction('api/hooks', { agent: 'antigravity' }, 'Installing Antigravity hooks and skill'));
  command('diffTour.connectCreately', connectCreately);
  command('diffTour.scanRepo', scanRepo);
  command('diffTour.sendScan', sendScan);
  command('diffTour.openImport', async () => {
    const p = await project(); if (!p) return;
    const url = saved(p, 'importUrl');
    if (!url) throw new Error('Send a scan first.');
    await vscode.env.openExternal(vscode.Uri.parse(url));
  });
  command('diffTour.actions', async () => {
    const p = await project(); if (!p) return;
    const actions = [
      ['Open dashboard in browser', 'diffTour.openDashboard'],
      ['Open review', 'diffTour.openReview'], ['Refresh review', 'diffTour.refreshReview'],
      ['Add Codex hooks', 'diffTour.addCodex'], ['Add Claude hooks', 'diffTour.addClaude'], ['Add Antigravity', 'diffTour.addAntigravity'],
      ['Connect to Creately', 'diffTour.connectCreately'], ['Scan repository', 'diffTour.scanRepo'],
      ['Send scan to Creately', 'diffTour.sendScan'], ['Review import in Creately', 'diffTour.openImport'],
      ['Select Git project', 'diffTour.selectProject'],
    ];
    const choice = await vscode.window.showQuickPick(actions.map(([label, command]) => ({ label, command })), { placeHolder: 'Diff Tour action' });
    if (choice) await vscode.commands.executeCommand(choice.command);
  });
  command('diffTour.showTurns', async () => {
    const p = await project(); if (!p) return;
    const items = await turns(p);
    if (!items.length) { vscode.window.showInformationMessage('Diff Tour has no completed turns on this branch.'); return; }
    const choice = await vscode.window.showQuickPick(items.slice().reverse().map(turn => ({
      label: `${turn.at.slice(0, 16).replace('T', ' ')} · ${turn.prompt.split('\n')[0].slice(0, 90)}`,
      description: `${turn.changes?.length ?? 'No snapshot'} files · session ${turn.session.slice(0, 8)}`,
      turn,
    })), { placeHolder: `${items.length} completed turns · ${p.branch}` });
    if (choice) { output.appendLine(JSON.stringify(choice.turn, null, 2)); output.show(true); }
  });
  command('diffTour.refreshReview', async () => {
    const p = await project(); if (!p) return;
    const result = await cli(p, ['review'], 120000);
    output.appendLine(result); output.show(true);
  });
  command('diffTour.openReview', async () => {
    const p = await project(); if (!p) return;
    if (!p.review) throw new Error('Local review is not built. Run Refresh Local Review and complete story.json if requested.');
    await showDashboard(`${await ensureDashboard(p)}review/`, false);
  });
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => { selectedRoot = undefined; void refresh(); }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('diffTour')) void refresh(); }));
  const refreshTimer = setInterval(() => { if (dashboard && dashboard.exitCode === null) void refresh(); }, 10000);
  context.subscriptions.push({ dispose: () => clearInterval(refreshTimer) });
  context.subscriptions.push({ dispose: () => { if (dashboard && dashboard.exitCode === null) dashboard.kill(); } });
  void refresh();
}

function deactivate() { if (dashboard && dashboard.exitCode === null) dashboard.kill(); }

module.exports = { activate, deactivate };
