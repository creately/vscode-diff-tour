const { createHash } = require('node:crypto');
const { copyFileSync, existsSync, mkdirSync, readFileSync, chmodSync } = require('node:fs');
const { dirname, join } = require('node:path');

function stageRuntime(extensionPath, storagePath) {
  const source = join(extensionPath, 'runtime');
  const executable = process.platform === 'win32' ? 'diff-tour.exe' : 'diff-tour';
  if (!existsSync(join(source, executable))) return null;
  const files = [executable, 'scanner/index.js', 'scanner/cli.js', 'assets/template.html', 'assets/review.html', 'assets/review-viewer.iife.js', 'skills/diff-tour/SKILL.md'];
  const hash = createHash('sha256');
  for (const relative of files) hash.update(readFileSync(join(source, relative)));
  const target = join(storagePath, 'runtime', hash.digest('hex').slice(0, 16));
  for (const relative of files) {
    const dest = join(target, relative);
    mkdirSync(dirname(dest), { recursive: true });
    if (!existsSync(dest)) copyFileSync(join(source, relative), dest);
  }
  if (process.platform !== 'win32') chmodSync(join(target, executable), 0o755);
  return target;
}

module.exports = { stageRuntime };
