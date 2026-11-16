const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { basename, dirname, join, resolve } = require('node:path');

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000 }).trim();
}

function gitRoot(folder) {
  try { return git(folder, ['rev-parse', '--show-toplevel']); }
  catch { return null; }
}

function paths(root, config, runtimeDir) {
  const parent = dirname(root);
  const localCli = join(root, 'packages', 'diff-tour', 'bin', 'diff-tour.ts');
  const localScanner = join(root, 'packages', 'rdm-codebase', 'src', 'index.ts');
  return {
    cli: config.cliPath || (runtimeDir ? join(runtimeDir, process.platform === 'win32' ? 'diff-tour.exe' : 'diff-tour') : existsSync(localCli) ? localCli : join(parent, 'creately-ai', 'packages', 'diff-tour', 'bin', 'diff-tour.ts')),
    scanner: runtimeDir ? join(runtimeDir, 'scanner', 'index.js') : existsSync(localScanner) ? localScanner : join(parent, 'rdm', 'packages', 'rdm-codebase', 'src', 'index.ts'),
  };
}

function hooksConfigured(root, agent, cli) {
  if (agent === 'antigravity') {
    const file = join(root, '.agents', 'hooks.json');
    if (!existsSync(file) || !existsSync(join(root, '.agents', 'skills', 'diff-tour', 'SKILL.md'))) return false;
    try {
      const config = JSON.parse(readFileSync(file, 'utf8'))['diff-tour'];
      return config?.enabled !== false && ['SessionStart', 'PreInvocation', 'Stop'].every(event =>
        config?.[event]?.some(hook => typeof hook.command === 'string' && hook.command.includes(cli) && hook.command.includes('--harness antigravity')));
    } catch { return false; }
  }
  const file = join(root, agent === 'codex' ? '.codex/hooks.json' : '.claude/settings.json');
  if (!existsSync(file)) return false;
  try {
    const hooks = JSON.parse(readFileSync(file, 'utf8')).hooks;
    return ['UserPromptSubmit', 'Stop'].every(event =>
      Array.isArray(hooks?.[event]) && hooks[event].some(entry =>
        entry.hooks?.some(hook => typeof hook.command === 'string' && hook.command.includes(cli) && hook.command.includes('record'))));
  } catch { return false; }
}

function projectStatus(root, config, runtimeDir) {
  const found = paths(root, config, runtimeDir);
  let branch;
  try { branch = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']); }
  catch { branch = `detached-${git(root, ['rev-parse', '--short', 'HEAD'])}`; }
  const commonDir = resolve(root, git(root, ['rev-parse', '--git-common-dir']));
  const settings = join(commonDir, 'creately', 'diff-tour-diagrams.json');
  let configuredScanner = '';
  try { configuredScanner = JSON.parse(readFileSync(settings, 'utf8')).codebaseModule || ''; }
  catch { /* No scanner setting yet. */ }
  const reviewDir = join(root, '.ai-changes', 'review', branch);
  const antigravityActive = existsSync(join(commonDir, 'creately', 'changes', branch, 'antigravity-heartbeat.json'));
  return {
    root, name: basename(root), branch, paths: found,
    cli: existsSync(found.cli), scanner: existsSync(found.scanner),
    map: existsSync(join(root, '.creately', 'system', 'system.rdm')),
    codex: hooksConfigured(root, 'codex', found.cli), claude: hooksConfigured(root, 'claude', found.cli),
    antigravity: hooksConfigured(root, 'antigravity', found.cli), antigravityActive,
    configuredScanner, scannerReady: Boolean((configuredScanner && existsSync(configuredScanner)) || (runtimeDir && existsSync(found.scanner))),
    story: existsSync(join(reviewDir, 'story.json')),
    review: existsSync(join(reviewDir, 'index.html')),
    reviewPath: join(reviewDir, 'index.html'),
  };
}

module.exports = { gitRoot, paths, projectStatus };
