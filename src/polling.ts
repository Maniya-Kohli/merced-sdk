import type { MercedAgent } from "./client";
import type { Job, JobStatus } from "./types";

export interface PollOptions {
  intervalMs?: number;
  status?: JobStatus;
  role?: "worker" | "client";
}

export function pollJobs(
  agent: MercedAgent,
  callback: (jobs: Job[]) => void | Promise<void>,
  options: PollOptions = {},
): { stop: () => void } {
  const intervalMs = options.intervalMs || 30_000;
  let running = true;
  let timeoutId: ReturnType<typeof setTimeout>;

  const tick = async () => {
    if (!running) return;
    try {
      const jobs = await agent.getJobs({ status: options.status, role: options.role });
      await callback(jobs);
    } catch (err) {
      console.error("Poll error:", err);
    }
    if (running) {
      timeoutId = setTimeout(tick, intervalMs);
    }
  };

  tick();

  return {
    stop: () => {
      running = false;
      clearTimeout(timeoutId);
    },
  };
}
