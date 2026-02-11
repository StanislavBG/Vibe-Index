/**
 * A2A (Agent-to-Agent) Protocol Type Definitions
 *
 * Implements the A2A specification for inter-agent communication.
 * Protocol: JSON-RPC 2.0 over HTTP/HTTPS
 * Spec reference: https://a2a-protocol.org/latest/
 *
 * This module defines the complete type system for:
 * - Agent Cards (discovery)
 * - Tasks (lifecycle management)
 * - Messages & Parts (content exchange)
 * - JSON-RPC request/response envelope
 */

// ============================================================
// Agent Card — Discovery & Capability Advertisement
// ============================================================

export interface AgentCard {
  /** Human-readable agent name */
  name: string;
  /** What this agent does */
  description: string;
  /** A2A JSON-RPC endpoint URL */
  url: string;
  /** Protocol version (semver) */
  protocolVersion: string;
  /** Agent implementation version */
  version: string;
  /** Organization that operates this agent */
  provider?: AgentProvider;
  /** Capabilities this agent supports */
  capabilities: AgentCapabilities;
  /** Accepted input content types */
  defaultInputModes: string[];
  /** Produced output content types */
  defaultOutputModes: string[];
  /** Declared skills (operations this agent can perform) */
  skills: AgentSkill[];
  /** Authentication requirements */
  authentication?: AgentAuthentication;
}

export interface AgentProvider {
  organization: string;
  url?: string;
}

export interface AgentCapabilities {
  /** Supports SSE streaming of task progress */
  streaming?: boolean;
  /** Supports webhook push notifications */
  pushNotifications?: boolean;
  /** Supports multi-turn conversations within a task */
  multiTurn?: boolean;
}

export interface AgentSkill {
  /** Unique skill identifier */
  id: string;
  /** Human-readable skill name */
  name: string;
  /** What this skill does */
  description: string;
  /** Input schema (JSON Schema) for structured invocation */
  inputSchema?: Record<string, unknown>;
  /** Output schema (JSON Schema) for structured results */
  outputSchema?: Record<string, unknown>;
  /** Tags for categorization */
  tags?: string[];
}

export interface AgentAuthentication {
  /** Supported auth schemes */
  schemes: ("bearer" | "api_key" | "oauth2" | "none")[];
  /** OAuth2 config if applicable */
  oauth2?: {
    authorizationUrl: string;
    tokenUrl: string;
    scopes?: string[];
  };
}

// ============================================================
// Tasks — Lifecycle Management
// ============================================================

export type TaskStatus =
  | "submitted"   // Task received, queued for processing
  | "working"     // Agent is actively processing
  | "input-required" // Agent needs more info from the client
  | "completed"   // Task finished successfully
  | "failed"      // Task failed
  | "canceled";   // Task was canceled

export interface Task {
  /** Unique task identifier */
  id: string;
  /** Current task status */
  status: TaskStatus;
  /** The skill being invoked */
  skillId: string;
  /** Conversation history (input messages + agent responses) */
  messages: Message[];
  /** Output artifacts produced by the agent */
  artifacts: Artifact[];
  /** Task metadata */
  metadata?: Record<string, unknown>;
  /** When the task was created */
  createdAt: string;
  /** When the task was last updated */
  updatedAt: string;
}

export interface TaskSummary {
  id: string;
  status: TaskStatus;
  skillId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Messages & Parts — Content Exchange
// ============================================================

export type MessageRole = "user" | "agent";

export interface Message {
  /** Who sent this message */
  role: MessageRole;
  /** Content parts (text, data, files) */
  parts: Part[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export type Part = TextPart | DataPart | FilePart;

export interface TextPart {
  type: "text";
  text: string;
}

export interface DataPart {
  type: "data";
  mimeType: string;
  data: Record<string, unknown> | unknown[];
}

export interface FilePart {
  type: "file";
  mimeType: string;
  /** Base64-encoded file content or a URI */
  uri?: string;
  data?: string;
  name?: string;
}

// ============================================================
// Artifacts — Task Output
// ============================================================

export interface Artifact {
  /** Artifact identifier (unique within a task) */
  id: string;
  /** Human-readable name */
  name?: string;
  /** Content parts */
  parts: Part[];
  /** Metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================
// JSON-RPC 2.0 Envelope
// ============================================================

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard JSON-RPC error codes
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: { code: -32700, message: "Parse error" },
  INVALID_REQUEST: { code: -32600, message: "Invalid request" },
  METHOD_NOT_FOUND: { code: -32601, message: "Method not found" },
  INVALID_PARAMS: { code: -32602, message: "Invalid params" },
  INTERNAL_ERROR: { code: -32603, message: "Internal error" },
  // A2A-specific error codes
  TASK_NOT_FOUND: { code: -32001, message: "Task not found" },
  SKILL_NOT_FOUND: { code: -32002, message: "Skill not found" },
  AUTH_REQUIRED: { code: -32003, message: "Authentication required" },
} as const;

// ============================================================
// A2A Method Names
// ============================================================

export const A2A_METHODS = {
  /** Send a task to the agent */
  TASKS_SEND: "tasks/send",
  /** Get task status and results */
  TASKS_GET: "tasks/get",
  /** Cancel a running task */
  TASKS_CANCEL: "tasks/cancel",
  /** List tasks */
  TASKS_LIST: "tasks/list",
  /** Send a message to an existing task (multi-turn) */
  TASKS_SEND_MESSAGE: "tasks/sendMessage",
} as const;

// ============================================================
// Skill Executor Interface
// ============================================================

/**
 * A SkillExecutor processes an incoming task for a specific skill.
 * Implementations translate A2A task requests into application logic.
 */
export interface SkillExecutor {
  /** The skill ID this executor handles */
  skillId: string;
  /** Execute the skill with the given input message */
  execute(input: Message, taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult>;
}

export interface SkillResult {
  status: TaskStatus;
  messages: Message[];
  artifacts: Artifact[];
  metadata?: Record<string, unknown>;
}
