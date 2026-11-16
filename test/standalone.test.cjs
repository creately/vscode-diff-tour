const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { projectStatus } = require('../src/project');
const { stageRuntime } = require('../src/runtime');

test('bundled runtime scans a Git project without source checkout paths', () => {
  const packageDir = resolve(__dirname, '..');
  const storage = mkdtempSync(join(tmpdir(), 'diff-tour-storage-'));
  const runtime = stageRuntime(packageDir, storage);
  assert.ok(runtime, 'build the extension runtime before this test');
  assert.equal(stageRuntime(packageDir, storage), runtime);
  assert.ok(existsSync(join(runtime, 'skills', 'diff-tour', 'SKILL.md')));
  const executable = join(runtime, process.platform === 'win32' ? 'diff-tour.exe' : 'diff-tour');
  const repo = mkdtempSync(join(tmpdir(), 'diff-tour-standalone-'));
  const env = { ...process.env, PATH: process.platform === 'win32' ? process.env.PATH : '/usr/bin:/bin' };
  const run = (command, args, input) => {
    const result = spawnSync(command, args, { cwd: repo, env, input, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout;
  };
  try {
    run('git', ['init', '-b', 'main']);
    run('git', ['config', 'user.email', 'test@example.com']);
    run('git', ['config', 'user.name', 'Test']);
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'index.ts'), 'export interface Item { id: string }\n');
    run('git', ['add', '.']);
    run('git', ['commit', '-m', 'Initial project']);

    const status = projectStatus(repo, {}, runtime);
    assert.equal(status.paths.cli, executable);
    assert.equal(status.cli, true);
    assert.equal(status.scanner, true);
    const inventory = join(storage, 'inventory.json');
    run(executable, ['scan-c4', 'c4', repo, '--repo', 'github.com/example/demo', '--out', inventory, '--min-imports', '1']);
    assert.equal(JSON.parse(readFileSync(inventory, 'utf8')).schemaVersion, 'c4-inventory/1.0');

    const bundle = join(storage, 'bundle.json');
    run(executable, ['scan-bundle', status.paths.scanner, repo, 'github.com/example/demo', bundle]);
    assert.ok(Array.isArray(JSON.parse(readFileSync(bundle, 'utf8')).views));
    run(executable, ['map', 'init', '--repo', repo]);
    assert.ok(existsSync(join(repo, '.creately', 'system', 'system.rdm')));
    run('git', ['add', '.creately/system']);
    run('git', ['commit', '-m', 'Add system map']);
    run('git', ['checkout', '-b', 'feature']);
    const hook = { session_id: 'standalone-test', cwd: repo };
    run(executable, ['record'], JSON.stringify({ ...hook, hook_event_name: 'UserPromptSubmit', prompt: 'Add an item name.' }));
    writeFileSync(join(repo, 'src', 'index.ts'), 'export interface Item { id: string; name: string }\n');
    run(executable, ['record'], JSON.stringify({ ...hook, hook_event_name: 'Stop', last_assistant_message: 'Added item name.' }));
    const turns = JSON.parse(run(executable, ['turns', '--repo', repo, '--json']));
    assert.equal(turns.filter((turn) => turn.kind === 'turn' && turn.endedAt).length, 1);
    run(executable, ['auto-review', '--repo', repo]);
    const automaticReview = join(repo, '.ai-changes', 'review', 'feature');
    assert.ok(existsSync(join(automaticReview, 'index.html')));
    const automaticData = JSON.parse(readFileSync(join(automaticReview, 'index.review.json'), 'utf8'));
    assert.equal(automaticData.change.trajectory.length, 1);
    assert.ok(automaticData.turnViews.length > 0);
    const antigravityHooks = JSON.parse(run(executable, ['hooks', 'print', '--harness', 'antigravity', '--repo', repo]));
    assert.equal(antigravityHooks['diff-tour'].PreInvocation.length, 1);
    assert.equal(antigravityHooks['diff-tour'].Stop.length, 1);
    mkdirSync(join(repo, '.agents', 'skills', 'diff-tour'), { recursive: true });
    writeFileSync(join(repo, '.agents', 'hooks.json'), JSON.stringify(antigravityHooks));
    copyFileSync(join(runtime, 'skills', 'diff-tour', 'SKILL.md'), join(repo, '.agents', 'skills', 'diff-tour', 'SKILL.md'));
    assert.equal(projectStatus(repo, {}, runtime).antigravity, true);
    assert.equal(existsSync(join(repo, '.git', 'creately', 'diff-tour-diagrams.json')), false);
    run(executable, ['diagrams', 'update', '--repo', repo]);
    const turnViews = JSON.parse(readFileSync(join(repo, '.ai-changes', 'review', 'feature', 'turn-views.json'), 'utf8'));
    assert.equal(turnViews.turns.length, 1);
    assert.ok(turnViews.turns[0].views.length > 0);
    run('git', ['add', 'src/index.ts']);
    run('git', ['commit', '-m', 'Add item name']);
    run(executable, ['review', '--repo', repo, '--base', 'main']);
    const reviewDir = join(repo, '.ai-changes', 'review', 'feature');
    const data = JSON.parse(readFileSync(join(reviewDir, 'data.json'), 'utf8'));
    const hunks = data.files.flatMap((file) => file.hunks.map((hunk) => hunk.id));
    const elements = Object.keys(data.change.map.elements);
    assert.ok(hunks.length > 0);
    writeFileSync(join(reviewDir, 'story.json'), JSON.stringify({
      title: 'Item name',
      intent: { asked: 'Add an item name.', approach: ['Extend the item contract.'], outcome: 'Items have a name.', sources: [{ session: 'standalone-test', turn: 1 }] },
      steps: [{ id: 's1', title: 'Extend item contract', why: 'Show the added field.', hunks, verdict: 'on_intent', serves: [{ session: 'standalone-test', turn: 1 }], elements }],
      skipped: [],
    }));
    run(executable, ['review', '--repo', repo, '--base', 'main']);
    assert.ok(existsSync(join(reviewDir, 'index.html')));
    assert.ok(existsSync(join(reviewDir, 'review-viewer.iife.js')));
    const antigravityRecord = (event, input) => run(executable, ['record', '--harness', 'antigravity', '--event', event, '--repo', repo], JSON.stringify(input));
    const antigravityInput = { conversationId: 'antigravity-test', lastUserInput: 'Add a quantity.' };
    antigravityRecord('PreInvocation', antigravityInput);
    antigravityRecord('PreInvocation', antigravityInput);
    writeFileSync(join(repo, 'src', 'index.ts'), 'export interface Item { id: string; name: string; quantity: number }\n');
    assert.equal(JSON.parse(antigravityRecord('Stop', { ...antigravityInput, fullyIdle: true })).decision, 'stop');
    const antigravityTurns = JSON.parse(run(executable, ['turns', '--repo', repo, '--json']));
    assert.equal(antigravityTurns.filter((turn) => turn.kind === 'turn' && turn.session === 'antigravity-test' && turn.endedAt).length, 1);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(storage, { recursive: true, force: true });
  }
});
