import { runEvalCorpus, type EvalScoreboard } from "../eval/runner.js";

export async function evalCommand(dir: string): Promise<{
  scoreboard: EvalScoreboard;
  exitCode: number;
}> {
  const scoreboard = await runEvalCorpus(dir);
  console.log(JSON.stringify(scoreboard, null, 2));
  const exitCode = scoreboard.failedCases > 0 ? 1 : 0;
  console.error(
    `adaparse:eval cases=${scoreboard.cases} passed=${scoreboard.passedCases} ` +
      `failed=${scoreboard.failedCases} microF1=${scoreboard.microF1.toFixed(3)}`,
  );
  return { scoreboard, exitCode };
}
