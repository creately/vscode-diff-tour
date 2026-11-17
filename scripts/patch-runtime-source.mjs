const INSERT_AFTER = '  const turns: Turn[] = asks.map((ask, index) => {';
const INSERT_BEFORE = '\n\n  for (const turn of turns) {';

const RECOVERY_LOGIC = `

  // A continuation after a crash or limit interruption is part of the same
  // logical code-changing turn. Keep the original turn identity and extend
  // its snapshot through the continuation's final boundary.
  const logicalTurns: Turn[] = [];
  const logicalBySourceTurn = new Map<string, Turn>();
  for (const turn of turns) {
    const corrected = turn.correction?.reason === 'interrupted'
      ? logicalBySourceTurn.get(\`${'${turn.session}'}#${'${turn.correction.of}'}\`)
      : undefined;
    if (!corrected) {
      logicalTurns.push(turn);
      logicalBySourceTurn.set(\`${'${turn.session}'}#${'${turn.turn}'}\`, turn);
      continue;
    }

    corrected.endedAt = turn.endedAt;
    corrected.recovered = true;
    if (turn.summary) corrected.summary = turn.summary;
    if (corrected.trees?.from && turn.trees?.to) {
      corrected.trees = { from: corrected.trees.from, to: turn.trees.to };
      corrected.changes = diffTrees(cwd, corrected.trees.from, corrected.trees.to);
    }
    logicalBySourceTurn.set(\`${'${turn.session}'}#${'${turn.turn}'}\`, corrected);
  }`;

export function patchRuntimeTurns(source) {
  if (!source.includes(INSERT_AFTER) || !source.includes(INSERT_BEFORE)) {
    throw new Error('Unsupported Diff Tour trajectory source; update the recovery patch for the current runtime.');
  }
  const withRecovery = source.replace(INSERT_BEFORE, `${RECOVERY_LOGIC}\n\n  for (const turn of logicalTurns) {`);
  return withRecovery
    .replace('for (const other of turns) {', 'for (const other of logicalTurns) {')
    .replace('const items: TrajectoryItem[] = [...turns];', 'const items: TrajectoryItem[] = [...logicalTurns];');
}
