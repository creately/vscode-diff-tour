import test from 'node:test';
import assert from 'node:assert/strict';
import { patchRuntimeTurns } from '../scripts/patch-runtime-source.mjs';

test('recovery patch collapses interrupted continuations into logical turns', () => {
  const source = `
  const turns: Turn[] = asks.map((ask, index) => {
    return ask;
  });

  for (const turn of turns) {
    for (const other of turns) {
    }
  }
  const items: TrajectoryItem[] = [...turns];
  `;
  const patched = patchRuntimeTurns(source);
  assert.match(patched, /const logicalTurns: Turn\[\] = \[\]/);
  assert.match(patched, /turn\.correction\?\.reason === 'interrupted'/);
  assert.match(patched, /corrected\.trees = \{ from: corrected\.trees\.from, to: turn\.trees\.to \}/);
  assert.match(patched, /for \(const other of logicalTurns\)/);
  assert.match(patched, /const items: TrajectoryItem\[\] = \[\.\.\.logicalTurns\]/);
});

test('recovery patch fails closed when the upstream trajectory changes', () => {
  assert.throws(() => patchRuntimeTurns('export const trajectory = () => [];'), /Unsupported Diff Tour trajectory source/);
});
