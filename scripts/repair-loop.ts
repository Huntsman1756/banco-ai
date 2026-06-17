import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

type RepairContext = {
  taskId: string;
  maxTries: number;
};

function runCheck(cmd: string): { code: number; output: string } {
  const [command, ...args] = cmd.split(" ");
  const result = spawnSync(command, args, { encoding: "utf8", shell: true });
  return {
    code: result.status ?? 1,
    output: (result.stdout ?? "") + (result.stderr ?? ""),
  };
}

async function run() {
  const logPath = process.argv[2] ?? ".agent/loop-log.jsonl";
  const taskId = process.argv[3] ?? "UNKNOWN";
  const context: RepairContext = { taskId, maxTries: 3 };

  const checks = ["npm run typecheck", "npm run lint", "npm test"];
  for (let attempt = 1; attempt <= context.maxTries; attempt++) {
    for (const cmd of checks) {
      const result = runCheck(cmd);
      if (result.code !== 0) {
        await writeFile(
          logPath,
          JSON.stringify({
            ts: new Date().toISOString(),
            event: "repair",
            task_id: context.taskId,
            attempt,
            command: cmd,
            output: result.output,
          }) + "\n",
          { flag: "a" },
        );
        continue;
      }
    }
    await writeFile(
      logPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        event: "repair",
        task_id: context.taskId,
        attempt,
        status: "passed",
      })}\n`,
      { flag: "a" },
    );
    return;
  }

  await writeFile(
    ".agent/failure-report.md",
    `# Failure Report\n\nTask ${context.taskId} exceeded repair loop retries.\n`,
    "utf8",
  );
  const log = await readFile(logPath, "utf8");
  console.error("repair failed", log);
}

run().catch((error) => {
  console.error(`repair-loop failed: ${(error as Error).message}`);
  process.exit(1);
});
