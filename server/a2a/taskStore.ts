/**
 * In-Memory Task Store
 *
 * Manages A2A task lifecycle. Tasks are ephemeral and stored in memory.
 * For production, this could be backed by PostgreSQL or Redis.
 */

import crypto from "crypto";
import type { Task, TaskStatus, TaskSummary, Message, Artifact } from "./types";

const tasks = new Map<string, Task>();

// Auto-cleanup tasks older than 1 hour
const TASK_TTL_MS = 60 * 60 * 1000;

export function generateTaskId(): string {
  return crypto.randomUUID();
}

export function createTask(skillId: string, inputMessage: Message, metadata?: Record<string, unknown>): Task {
  const now = new Date().toISOString();
  const task: Task = {
    id: generateTaskId(),
    status: "submitted",
    skillId,
    messages: [inputMessage],
    artifacts: [],
    metadata,
    createdAt: now,
    updatedAt: now,
  };
  tasks.set(task.id, task);
  return task;
}

export function getTask(taskId: string): Task | undefined {
  return tasks.get(taskId);
}

export function updateTask(
  taskId: string,
  updates: {
    status?: TaskStatus;
    messages?: Message[];
    artifacts?: Artifact[];
    metadata?: Record<string, unknown>;
  },
): Task | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;

  if (updates.status) task.status = updates.status;
  if (updates.messages) task.messages.push(...updates.messages);
  if (updates.artifacts) task.artifacts.push(...updates.artifacts);
  if (updates.metadata) task.metadata = { ...task.metadata, ...updates.metadata };
  task.updatedAt = new Date().toISOString();

  return task;
}

export function cancelTask(taskId: string): Task | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;
  if (task.status === "completed" || task.status === "failed" || task.status === "canceled") {
    return task;
  }
  task.status = "canceled";
  task.updatedAt = new Date().toISOString();
  return task;
}

export function listTasks(limit = 20, offset = 0): TaskSummary[] {
  const all = Array.from(tasks.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(offset, offset + limit);

  return all.map((t) => ({
    id: t.id,
    status: t.status,
    skillId: t.skillId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
}

/**
 * Prune tasks older than TTL. Called periodically.
 */
export function pruneExpiredTasks(): number {
  const cutoff = Date.now() - TASK_TTL_MS;
  let pruned = 0;
  for (const [id, task] of tasks) {
    if (new Date(task.updatedAt).getTime() < cutoff) {
      tasks.delete(id);
      pruned++;
    }
  }
  return pruned;
}
