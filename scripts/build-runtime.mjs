import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
bun('build', '--compile', join(app, 'packages/diff-tour/bin/diff-tour.ts'), `--outfile=${join(runtime, binary)}`);
bun('build', join(scanner, 'index.ts'), '--target=bun', `--outfile=${join(runtime, 'scanner/index.js')}`);
bun('build', join(scanner, 'cli.ts'), '--target=bun', `--outfile=${join(runtime, 'scanner/cli.js')}`);
for (const file of ['template.html', 'review.html']) {
  copyFileSync(join(app, 'packages/diff-tour/assets', file), join(runtime, 'assets', file));
}
const viewer = join(app, 'dist/review-viewer/review-viewer.iife.js');
if (!existsSync(viewer)) bun('run', 'build:review-viewer');
copyFileSync(viewer, join(runtime, 'assets/review-viewer.iife.js'));
copyFileSync(join(app, 'packages/diff-tour/skill/antigravity/SKILL.md'), join(runtime, 'skills/diff-tour/SKILL.md'));
