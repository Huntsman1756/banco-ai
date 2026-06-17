import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type AgentTask = {
  id: string;
  phase: string;
  title: string;
  status: "pending" | "running" | "done" | "blocked";
  depends_on: string[];
  files_expected: string[];
  acceptance: string[];
};

type Queue = AgentTask[];

type AgentState = {
  currentPhase: string;
  completedTasks: string[];
  inProgressTaskId: string | null;
  lastUpdateUtc: string;
  notes: string;
};

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

function selectNextTask(queue: Queue, state: AgentState): AgentTask | null {
  return (
    queue.find(
      (task) =>
        task.status === "pending" &&
        task.depends_on.every((dep) => state.completedTasks.includes(dep)),
    ) ?? null
  );
}

async function updateTaskState(queuePath: string, taskId: string, status: AgentTask["status"]): Promise<void> {
  const queue = await readJson<Queue>(queuePath);
  const index = queue.findIndex((item) => item.id === taskId);
  if (index < 0) {
    return;
  }
  queue[index].status = status;
  await writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}

async function appendLoopLog(entry: Record<string, unknown>): Promise<void> {
  const path = join(process.cwd(), ".agent", "loop-log.jsonl");
  await writeFile(path, `${JSON.stringify(entry)}\n`, { flag: "a" });
}

async function writeReviewPacket(task: AgentTask): Promise<void> {
  const content = `# Review Packet\n\n## Task\n\nTask id: ${task.id}\nPhase: ${task.phase}\nTitle: ${task.title}\n\n## Acceptance criteria\n\n${task.acceptance.map((a) => `- ${a}`).join("\n")}\n\n## Files changed\n\n${task.files_expected.map((f) => `- ${f}`).join("\n")}\n`;
  await writeFile(join(process.cwd(), ".agent", "review-packet.md"), content, "utf8");
}

async function run() {
  const root = process.cwd();
  const queuePath = join(root, ".agent", "queue.json");
  const statePath = join(root, ".agent", "state.json");

  const queue = await readJson<Queue>(queuePath);
  const state = await readJson<AgentState>(statePath);

  const next = selectNextTask(queue, state);
  if (!next) {
    console.log("No runnable tasks.");
    return;
  }

  await updateTaskState(queuePath, next.id, "running");
  await writeFile(statePath, `${JSON.stringify({ ...state, inProgressTaskId: next.id }, null, 2)}\n`, "utf8");
  await writeReviewPacket(next);
  await appendLoopLog({ ts: new Date().toISOString(), event: "task_selected", task_id: next.id, status: "running" });

  console.log(`Selected ${next.id}: ${next.title}`);
  console.log("Next step: implement task and execute checks.");
}

run().catch((error) => {
  console.error(`agent-loop failed: ${(error as Error).message}`);
  process.exit(1);
});
