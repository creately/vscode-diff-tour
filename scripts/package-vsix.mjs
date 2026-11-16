import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = resolve(process.env.CREATELY_AI_REPO || join(packageDir, '..', 'creately-ai'));
const supportedPlatforms = new Set(['darwin', 'win32']);

if (!supportedPlatforms.has(platform())) {
  throw new Error(`VSIX packaging currently supports macOS and Windows; received ${platform()}.`);
}

const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
if (!existsSync(join(appDir, 'package.json'))) {
  throw new Error(`Creately AI repository not found at ${appDir}. Set CREATELY_AI_REPO for this build.`);
}
const platformName = platform() === 'win32' ? 'windows' : 'macos';
const output = join(packageDir, `vscode-diff-tour-${manifest.version}-${platformName}-${arch()}.vsix`);
const run = (cwd, ...args) => execFileSync('bun', args, { cwd, stdio: 'inherit', env: process.env });

run(appDir, 'run', 'build:review-viewer');
run(packageDir, 'x', '--bun', '@vscode/vsce', 'package', '--out', output);
console.log(`\nCreated ${output}`);
