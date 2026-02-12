/**
 * A2A Agent Communication Service
 *
 * This module provides the complete A2A (Agent-to-Agent) protocol
 * implementation for Vibe-Index. It allows external AI agents to:
 *
 * 1. DISCOVER — what Vibe-Index can do via the Agent Card
 * 2. INVOKE   — skills like searching projects, publishing, subscribing
 * 3. TRACK    — task status and retrieve results
 *
 * Protocol: JSON-RPC 2.0 over HTTPS
 * Discovery: GET  /.well-known/agent.json
 * Endpoint:  POST /a2a
 *
 * Usage in Express app:
 *
 *   import { a2aRouter } from "./a2a";
 *   app.use(a2aRouter);
 *
 * Example client interaction (from an external agent):
 *
 *   // 1. Discover the agent
 *   GET https://vibe-index.com/.well-known/agent.json
 *
 *   // 2. Search for AI projects
 *   POST https://vibe-index.com/a2a
 *   {
 *     "jsonrpc": "2.0",
 *     "id": "1",
 *     "method": "tasks/send",
 *     "params": {
 *       "skillId": "discover-projects",
 *       "input": { "search": "AI code generator", "sort": "popular" }
 *     }
 *   }
 *
 *   // 3. Get project details
 *   POST https://vibe-index.com/a2a
 *   {
 *     "jsonrpc": "2.0",
 *     "id": "2",
 *     "method": "tasks/send",
 *     "params": {
 *       "skillId": "get-project",
 *       "input": { "projectId": 42 }
 *     }
 *   }
 *
 *   // 4. Submit a project
 *   POST https://vibe-index.com/a2a
 *   Authorization: Bearer <clerk-token>
 *   {
 *     "jsonrpc": "2.0",
 *     "id": "3",
 *     "method": "tasks/send",
 *     "params": {
 *       "skillId": "publish-project",
 *       "input": { "url": "https://github.com/user/cool-project" }
 *     }
 *   }
 *
 *   // 5. Subscribe to updates
 *   POST https://vibe-index.com/a2a
 *   Authorization: Bearer <clerk-token>
 *   {
 *     "jsonrpc": "2.0",
 *     "id": "4",
 *     "method": "tasks/send",
 *     "params": {
 *       "skillId": "subscribe-updates",
 *       "input": { "categoryIds": [1, 3], "frequency": "weekly" }
 *     }
 *   }
 *
 *   // 6. Register a new user (A2A agent onboarding)
 *   POST https://vibe-index.com/a2a
 *   {
 *     "jsonrpc": "2.0",
 *     "id": "5",
 *     "method": "tasks/send",
 *     "params": {
 *       "skillId": "register-user",
 *       "input": {
 *         "email": "agent-user@example.com",
 *         "username": "agent_user_1",
 *         "password": "securePass123!",
 *         "firstName": "Agent",
 *         "lastName": "User"
 *       }
 *     }
 *   }
 */

export { a2aRouter } from "./router";
export { buildAgentCard, getSkillById, getSkillIds } from "./agentCard";
export { getSkillExecutor, getRegisteredSkillIds } from "./skills";
export type {
  AgentCard,
  AgentSkill,
  Task,
  TaskStatus,
  Message,
  Part,
  TextPart,
  DataPart,
  FilePart,
  Artifact,
  SkillExecutor,
  SkillResult,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./types";
