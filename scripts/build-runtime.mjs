import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchRuntimeTurns } from './patch-runtime-source.mjs';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(process.env.CREATELY_AI_REPO || join(packageDir, '..', 'creately-ai'));
const rdm = resolve(process.env.RDM_REPO || join(app, '..', 'rdm'));
const scanner = join(rdm, 'packages', 'rdm-codebase', 'src');
const runtime = join(packageDir, 'runtime');
const binary = process.platform === 'win32' ? 'diff-tour.exe' : 'diff-tour';

if (!existsSync(join(app, 'packages', 'diff-tour', 'bin', 'diff-tour.ts'))) throw new Error(`Diff Tour source not found at ${app}. Set CREATELY_AI_REPO for this build.`);
if (!existsSync(join(scanner, 'index.ts'))) throw new Error(`RDM scanner source not found at ${scanner}. Set RDM_REPO for this build.`);
const bun = (...args) => execFileSync('bun', args, { cwd: app, stdio: 'inherit' });
mkdirSync(join(runtime, 'scanner'), { recursive: true });
mkdirSync(join(runtime, 'assets'), { recursive: true });
mkdirSync(join(runtime, 'skills', 'diff-tour'), { recursive: true });
const stage = mkdtempSync(join(tmpdir(), 'vscode-diff-tour-runtime-'));
try {
  const stagedTour = join(stage, 'packages', 'diff-tour');
  cpSync(join(app, 'packages', 'diff-tour'), stagedTour, { recursive: true });
  symlinkSync(join(app, 'src'), join(stage, 'src'), process.platform === 'win32' ? 'junction' : 'dir');
  const turns = join(stagedTour, 'src', 'ledger', 'turns.ts');
  writeFileSync(turns, patchRuntimeTurns(readFileSync(turns, 'utf8')));
  bun('build', '--compile', join(stagedTour, 'bin', 'diff-tour.ts'), `--outfile=${join(runtime, binary)}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
bun('build', join(scanner, 'index.ts'), '--target=bun', `--outfile=${join(runtime, 'scanner/index.js')}`);
bun('build', join(scanner, 'cli.ts'), '--target=bun', `--outfile=${join(runtime, 'scanner/cli.js')}`);
for (const file of ['template.html', 'review.html']) {
  copyFileSync(join(app, 'packages/diff-tour/assets', file), join(runtime, 'assets', file));
}
const viewer = join(app, 'dist/review-viewer/review-viewer.iife.js');
if (!existsSync(viewer)) bun('run', 'build:review-viewer');
copyFileSync(viewer, join(runtime, 'assets/review-viewer.iife.js'));
copyFileSync(join(app, 'packages/diff-tour/skill/antigravity/SKILL.md'), join(runtime, 'skills/diff-tour/SKILL.md'));
