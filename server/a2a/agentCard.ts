/**
 * Agent Card Generator for Vibe-Index
 *
 * Produces the A2A Agent Card that external agents use to discover
 * what Vibe-Index can do and how to interact with it.
 *
 * Served at: GET /.well-known/agent.json
 * A2A endpoint: POST /a2a
 */

import type { AgentCard, AgentSkill } from "./types";

const PROTOCOL_VERSION = "0.2.0";
const AGENT_VERSION = "1.0.0";

/**
 * Skills represent the operations an external agent can invoke.
 * Each skill maps to concrete application logic in the task handler.
 */
const skills: AgentSkill[] = [
  {
    id: "discover-projects",
    name: "Discover Projects",
    description:
      "Search and browse vibe-coded projects by keyword, category, pricing model, or tag. Returns paginated project listings with metadata.",
    tags: ["search", "browse", "discovery"],
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Free-text search query" },
        category: { type: "string", description: "Category slug (e.g. 'ai-ml', 'dev-tools', 'web-apps')" },
        pricing: { type: "string", enum: ["free", "paid", "freemium"], description: "Filter by pricing model" },
        sort: { type: "string", enum: ["newest", "popular", "relevance"], description: "Sort order" },
        limit: { type: "number", description: "Max results (default 20, max 100)" },
        offset: { type: "number", description: "Pagination offset" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        projects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "number" },
              name: { type: "string" },
              url: { type: "string" },
              shortDescription: { type: "string" },
              pricingModel: { type: "string" },
              tags: { type: "string" },
              likesCount: { type: "number" },
              followsCount: { type: "number" },
            },
          },
        },
        total: { type: "number" },
      },
    },
  },
  {
    id: "get-project",
    name: "Get Project Details",
    description:
      "Retrieve detailed information about a specific project including its categories, tags, description, and community stats.",
    tags: ["read", "details"],
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "number", description: "The project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    id: "list-categories",
    name: "List Categories",
    description:
      "Get all 12 project categories: AI/ML, Dev Tools, Web Apps, Mobile, APIs, Games, E-Commerce, Productivity, Social, Education, Finance, Design.",
    tags: ["categories", "browse"],
  },
  {
    id: "publish-project",
    name: "Publish Project",
    description:
      "Submit a project URL for AI-powered analysis and listing on Vibe-Index. The URL is scraped, analyzed, and a draft is created for review. Requires authentication.",
    tags: ["submit", "publish", "create"],
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri", description: "The project URL to analyze and list" },
      },
      required: ["url"],
    },
  },
  {
    id: "get-feedback",
    name: "Get Project Feedback",
    description:
      "Submit a project URL (and optionally a Git repository URL) for in-depth analysis. Returns a structured feedback report with scores for presentation, documentation, discoverability, and completeness, plus actionable strengths and suggestions.",
    tags: ["feedback", "analysis", "review", "assessment"],
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri", description: "The project URL to analyze" },
        repoUrl: { type: "string", format: "uri", description: "Optional Git repository URL (GitHub or GitLab) for deeper analysis" },
      },
      required: ["url"],
    },
    outputSchema: {
      type: "object",
      properties: {
        scores: {
          type: "object",
          properties: {
            overall: { type: "number", description: "Overall score 1-10" },
            presentation: { type: "number" },
            documentation: { type: "number" },
            discoverability: { type: "number" },
            completeness: { type: "number" },
          },
        },
        strengths: { type: "array", items: { type: "string" } },
        suggestions: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
      },
    },
  },
  {
    id: "subscribe-updates",
    name: "Subscribe to Updates",
    description:
      "Subscribe a user to email digest notifications for specific project categories. Requires authentication.",
    tags: ["subscribe", "notifications", "digest"],
    inputSchema: {
      type: "object",
      properties: {
        categoryIds: {
          type: "array",
          items: { type: "number" },
          description: "Category IDs to subscribe to",
        },
        frequency: {
          type: "string",
          enum: ["daily", "weekly", "monthly"],
          description: "Digest frequency (default: weekly)",
        },
        pricingFilter: {
          type: "string",
          enum: ["free", "paid", "all"],
          description: "Filter projects by pricing (default: all)",
        },
        maxProjects: {
          type: "number",
          description: "Max projects per digest (default: 10, max: 50)",
        },
      },
      required: ["categoryIds"],
    },
  },
];

/**
 * Build the Agent Card for Vibe-Index.
 *
 * @param baseUrl - The base URL of the Vibe-Index instance (e.g. "https://vibe-index.com")
 */
export function buildAgentCard(baseUrl: string): AgentCard {
  return {
    name: "Vibe Index",
    description:
      "A project discovery and sharing platform where developers and creators submit, browse, and discuss vibe-coded software projects across 12 categories. External agents can discover projects, publish new listings, and subscribe users for digest updates.",
    url: `${baseUrl}/a2a`,
    protocolVersion: PROTOCOL_VERSION,
    version: AGENT_VERSION,
    provider: {
      organization: "Vibe-Index",
      url: baseUrl,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      multiTurn: false,
    },
    defaultInputModes: ["text", "application/json"],
    defaultOutputModes: ["application/json", "text"],
    skills,
    authentication: {
      schemes: ["bearer", "none"],
    },
  };
}

/**
 * Get a skill definition by ID.
 */
export function getSkillById(skillId: string): AgentSkill | undefined {
  return skills.find((s) => s.id === skillId);
}

/**
 * Get all skill IDs.
 */
export function getSkillIds(): string[] {
  return skills.map((s) => s.id);
}
