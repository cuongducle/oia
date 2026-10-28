import type { TaskType } from "@pixforge/schema";

/** M0: in-process queue — swapped for BullMQ (Redis) when scaling workers. */
export interface TaskJob {
  taskId: string;
  sessionId: number;
  type: TaskType;
  params: Record<string, unknown>;
}

export type TaskHandler = (job: TaskJob) => Promise<void>;

export class InProcessQueue {
  private handlers: Partial<Record<TaskType, TaskHandler[]>> = {};
  on(type: TaskType, handler: TaskHandler) {
    this.handlers[type] = [...(this.handlers[type] ?? []), handler];
  }
  async submit(job: TaskJob) {
    for (const h of this.handlers[job.type] ?? []) await h(job);
  }
}
