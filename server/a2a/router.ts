/**
 * A2A Protocol Router
 *
 * Handles JSON-RPC 2.0 requests at POST /a2a and serves the Agent Card
 * at GET /.well-known/agent.json.
 *
 * Methods:
 * - tasks/send      — Create and execute a new task
 * - tasks/get       — Retrieve a task by ID
 * - tasks/cancel    — Cancel a running task
 * - tasks/list      — List recent tasks
 *
 * Authentication:
 * - Bearer token in Authorization header (optional, maps to Clerk user)
 * - Unauthenticated requests can still use read-only skills
 */

import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { storage } from "../storage";
import { buildAgentCard } from "./agentCard";
import { getSkillExecutor } from "./skills";
import { getSkillById, getSkillIds } from "./agentCard";
import * as taskStore from "./taskStore";
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  Message,
  Task,
} from "./types";
import { A2A_METHODS, JSON_RPC_ERRORS } from "./types";

export const a2aRouter = Router();

// ============================================================
// GET /.well-known/agent.json — Agent Card Discovery
// ============================================================

a2aRouter.get("/.well-known/agent.json", (req: Request, res: Response) => {
  const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("host") || "localhost";
  const baseUrl = `${protocol}://${host}`;
  res.json(buildAgentCard(baseUrl));
});

// ============================================================
// POST /a2a — JSON-RPC 2.0 Endpoint
// ============================================================

a2aRouter.post("/a2a", async (req: Request, res: Response) => {
  const body = req.body;

  // Validate JSON-RPC envelope
  if (!body || body.jsonrpc !== "2.0" || !body.method || (body.id === undefined && body.id === null)) {
    return res.json(makeErrorResponse(null, JSON_RPC_ERRORS.INVALID_REQUEST));
  }

  const rpcReq = body as JsonRpcRequest;

  // Resolve authenticated user if present
  let userId: number | undefined;
  try {
    const auth = getAuth(req);
    if (auth?.userId) {
      const dbUser = await storage.getUserByClerkId(auth.userId);
      userId = dbUser?.id;
    }
  } catch {
    // No auth — continue as anonymous
  }

  const metadata: Record<string, unknown> = {
    userId,
    fingerprint: req.ip || req.headers["x-forwarded-for"] || "a2a-unknown",
    userAgent: req.headers["user-agent"],
  };

  try {
    const result = await handleMethod(rpcReq, metadata);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error(`[a2a] Error handling ${rpcReq.method}:`, message);
    return res.json(makeErrorResponse(rpcReq.id, { ...JSON_RPC_ERRORS.INTERNAL_ERROR, data: message }));
  }
});

// ============================================================
// Method Dispatcher
// ============================================================

async function handleMethod(req: JsonRpcRequest, metadata: Record<string, unknown>): Promise<JsonRpcResponse> {
  switch (req.method) {
    case A2A_METHODS.TASKS_SEND:
      return handleTasksSend(req, metadata);
    case A2A_METHODS.TASKS_GET:
      return handleTasksGet(req);
    case A2A_METHODS.TASKS_CANCEL:
      return handleTasksCancel(req);
    case A2A_METHODS.TASKS_LIST:
      return handleTasksList(req);
    default:
      return makeErrorResponse(req.id, JSON_RPC_ERRORS.METHOD_NOT_FOUND);
  }
}

// ============================================================
// tasks/send — Create and Execute a Task
// ============================================================

async function handleTasksSend(req: JsonRpcRequest, metadata: Record<string, unknown>): Promise<JsonRpcResponse> {
  const params = req.params || {};
  const skillId = params.skillId as string;
  const message = params.message as Message | undefined;

  if (!skillId) {
    return makeErrorResponse(req.id, {
      ...JSON_RPC_ERRORS.INVALID_PARAMS,
      data: `Missing required param: skillId. Available skills: ${getSkillIds().join(", ")}`,
    });
  }

  // Validate skill exists
  const skill = getSkillById(skillId);
  if (!skill) {
    return makeErrorResponse(req.id, {
      ...JSON_RPC_ERRORS.SKILL_NOT_FOUND,
      data: `Unknown skill: "${skillId}". Available skills: ${getSkillIds().join(", ")}`,
    });
  }

  // Build input message from params
  const inputMessage: Message = message || {
    role: "user" as const,
    parts: params.input
      ? [{ type: "data" as const, mimeType: "application/json", data: params.input as Record<string, unknown> }]
      : [{ type: "text" as const, text: (params.query as string) || "" }],
  };

  // Ensure role is set
  if (!inputMessage.role) inputMessage.role = "user";

  // Get executor
  const executor = getSkillExecutor(skillId);
  if (!executor) {
    return makeErrorResponse(req.id, {
      ...JSON_RPC_ERRORS.SKILL_NOT_FOUND,
      data: `Skill "${skillId}" has no registered executor.`,
    });
  }

  // Create task
  const task = taskStore.createTask(skillId, inputMessage, metadata);

  // Execute synchronously (no streaming in MVP)
  taskStore.updateTask(task.id, { status: "working" });

  const result = await executor.execute(inputMessage, task.id, metadata);

  taskStore.updateTask(task.id, {
    status: result.status,
    messages: result.messages,
    artifacts: result.artifacts,
    metadata: result.metadata,
  });

  const finalTask = taskStore.getTask(task.id)!;
  return makeSuccessResponse(req.id, sanitizeTask(finalTask));
}

// ============================================================
// tasks/get — Retrieve Task by ID
// ============================================================

async function handleTasksGet(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const taskId = req.params?.taskId as string;
  if (!taskId) {
    return makeErrorResponse(req.id, {
      ...JSON_RPC_ERRORS.INVALID_PARAMS,
      data: "Missing required param: taskId",
    });
  }

  const task = taskStore.getTask(taskId);
  if (!task) {
    return makeErrorResponse(req.id, JSON_RPC_ERRORS.TASK_NOT_FOUND);
  }

  return makeSuccessResponse(req.id, sanitizeTask(task));
}

// ============================================================
// tasks/cancel — Cancel a Running Task
// ============================================================

async function handleTasksCancel(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const taskId = req.params?.taskId as string;
  if (!taskId) {
    return makeErrorResponse(req.id, {
      ...JSON_RPC_ERRORS.INVALID_PARAMS,
      data: "Missing required param: taskId",
    });
  }

  const task = taskStore.cancelTask(taskId);
  if (!task) {
    return makeErrorResponse(req.id, JSON_RPC_ERRORS.TASK_NOT_FOUND);
  }

  return makeSuccessResponse(req.id, sanitizeTask(task));
}

// ============================================================
// tasks/list — List Recent Tasks
// ============================================================

async function handleTasksList(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const limit = Math.min(Number(req.params?.limit) || 20, 100);
  const offset = Number(req.params?.offset) || 0;
  const tasks = taskStore.listTasks(limit, offset);
  return makeSuccessResponse(req.id, { tasks });
}

// ============================================================
// Response Helpers
// ============================================================

function makeSuccessResponse(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? 0, result };
}

function makeErrorResponse(id: string | number | null, error: JsonRpcError): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? 0, error };
}

/** Strip internal metadata from task before sending to client. */
function sanitizeTask(task: Task): Record<string, unknown> {
  const { metadata, ...rest } = task;
  return rest;
}

// ============================================================
// Periodic Cleanup
// ============================================================

setInterval(() => {
  const pruned = taskStore.pruneExpiredTasks();
  if (pruned > 0) {
    console.log(`[a2a] Pruned ${pruned} expired tasks`);
  }
}, 10 * 60 * 1000); // Every 10 minutes
