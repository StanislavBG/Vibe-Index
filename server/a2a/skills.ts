/**
 * A2A Skill Executors for Vibe-Index
 *
 * Each executor maps an A2A skill invocation to existing Vibe-Index
 * storage/service operations. This is the bridge between the A2A
 * protocol layer and the application business logic.
 *
 * Skills:
 * - discover-projects: Search/browse projects
 * - get-project: Get detailed project info
 * - list-categories: List all categories
 * - publish-project: Submit a project URL
 * - subscribe-updates: Subscribe to digest notifications
 */

import type { SkillExecutor, SkillResult, Message, Part, DataPart, TextPart, Artifact } from "./types";
import { storage } from "../storage";
import { processJob } from "../scraper";
import crypto from "crypto";

// ============================================================
// Helpers
// ============================================================

/** Extract structured data from the first DataPart in a message, or parse text as JSON. */
function extractInput(message: Message): Record<string, unknown> {
  for (const part of message.parts) {
    if (part.type === "data") {
      return part.data as Record<string, unknown>;
    }
    if (part.type === "text") {
      try {
        return JSON.parse(part.text);
      } catch {
        // Treat plain text as a search query
        return { search: part.text };
      }
    }
  }
  return {};
}

function textPart(text: string): TextPart {
  return { type: "text", text };
}

function dataPart(data: Record<string, unknown> | unknown[]): DataPart {
  return { type: "data", mimeType: "application/json", data };
}

function agentMessage(...parts: Part[]): Message {
  return { role: "agent", parts };
}

function artifact(id: string, name: string, data: Record<string, unknown> | unknown[]): Artifact {
  return {
    id,
    name,
    parts: [dataPart(data)],
  };
}

// ============================================================
// Skill: discover-projects
// ============================================================

const discoverProjects: SkillExecutor = {
  skillId: "discover-projects",

  async execute(input: Message): Promise<SkillResult> {
    const params = extractInput(input);

    const search = params.search as string | undefined;
    const categorySlug = params.category as string | undefined;
    const pricing = params.pricing as string | undefined;
    const sort = (params.sort as string) || "newest";
    const limit = Math.min(Number(params.limit) || 20, 100);
    const offset = Number(params.offset) || 0;

    // Resolve category slug to ID
    let categoryId: number | undefined;
    if (categorySlug) {
      const category = await storage.getCategoryBySlug(categorySlug);
      if (category) {
        categoryId = category.id;
      } else {
        return {
          status: "failed",
          messages: [agentMessage(textPart(`Unknown category: "${categorySlug}". Use the list-categories skill to see available categories.`))],
          artifacts: [],
        };
      }
    }

    const result = await storage.getProjects({
      search,
      categoryId,
      pricingModel: pricing,
      limit,
      offset,
      sortBy: sort,
    });

    const projectSummaries = result.projects.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      shortDescription: p.shortDescription,
      pricingModel: p.pricingModel,
      tags: p.tags,
      likesCount: p.likesCount,
      followsCount: p.followsCount,
      commentsCount: p.commentsCount,
      createdAt: p.createdAt,
    }));

    return {
      status: "completed",
      messages: [
        agentMessage(
          textPart(`Found ${result.total} projects${search ? ` matching "${search}"` : ""}. Returning ${projectSummaries.length} results.`),
        ),
      ],
      artifacts: [
        artifact("projects-list", "Project Listings", {
          projects: projectSummaries,
          total: result.total,
          limit,
          offset,
        }),
      ],
    };
  },
};

// ============================================================
// Skill: get-project
// ============================================================

const getProject: SkillExecutor = {
  skillId: "get-project",

  async execute(input: Message): Promise<SkillResult> {
    const params = extractInput(input);
    const projectId = Number(params.projectId);

    if (!projectId || isNaN(projectId)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing or invalid projectId. Provide a numeric project ID."))],
        artifacts: [],
      };
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Project with ID ${projectId} not found.`))],
        artifacts: [],
      };
    }

    const cats = await storage.getProjectCategories(projectId);
    const tags = await storage.getProjectTags(projectId);
    const feedbackCount = await storage.getFeedbackCount(projectId);
    const avgRating = await storage.getAverageRating(projectId);

    return {
      status: "completed",
      messages: [agentMessage(textPart(`Project details for "${project.name}".`))],
      artifacts: [
        artifact("project-detail", project.name || "Project", {
          id: project.id,
          name: project.name,
          url: project.url,
          shortDescription: project.shortDescription,
          longDescription: project.longDescription,
          pricingModel: project.pricingModel,
          pricingDetails: project.pricingDetails,
          demoUrl: project.demoUrl,
          docsUrl: project.docsUrl,
          repoUrl: project.repoUrl,
          tags: project.tags,
          imageUrl: project.imageUrl,
          likesCount: project.likesCount,
          followsCount: project.followsCount,
          commentsCount: project.commentsCount,
          status: project.status,
          categories: cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
          canonicalTags: tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
          feedbackCount,
          averageRating: avgRating,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        }),
      ],
    };
  },
};

// ============================================================
// Skill: list-categories
// ============================================================

const listCategories: SkillExecutor = {
  skillId: "list-categories",

  async execute(): Promise<SkillResult> {
    const cats = await storage.getCategories();

    return {
      status: "completed",
      messages: [agentMessage(textPart(`${cats.length} categories available.`))],
      artifacts: [
        artifact(
          "categories",
          "Project Categories",
          cats.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            description: c.description,
          })),
        ),
      ],
    };
  },
};

// ============================================================
// Skill: publish-project
// ============================================================

const publishProject: SkillExecutor = {
  skillId: "publish-project",

  async execute(input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const params = extractInput(input);
    const url = params.url as string;

    if (!url) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing required field: url. Provide the project URL to submit."))],
        artifacts: [],
      };
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Invalid URL: "${url}". Provide a valid URL starting with http:// or https://.`))],
        artifacts: [],
      };
    }

    // Check for authenticated user context from metadata
    const userId = metadata?.userId as number | undefined;

    if (userId) {
      // Authenticated submission
      const user = await storage.getUser(userId);
      if (!user) {
        return {
          status: "failed",
          messages: [agentMessage(textPart("Authenticated user not found."))],
          artifacts: [],
        };
      }

      if (user.freeListingsRemaining <= 0 && user.paidListingCredits <= 0) {
        return {
          status: "failed",
          messages: [agentMessage(textPart("No listing credits remaining. Purchase more credits to submit projects."))],
          artifacts: [],
        };
      }

      const project = await storage.createProject({
        url,
        ownerId: user.id,
        claimed: true,
        status: "pending",
      });

      if (user.freeListingsRemaining > 0) {
        await storage.updateUserCredits(user.id, { freeListingsRemaining: user.freeListingsRemaining - 1 });
      } else {
        await storage.updateUserCredits(user.id, { paidListingCredits: user.paidListingCredits - 1 });
      }

      const job = await storage.createJob(project.id);
      processJob(job.id).catch(console.error);

      return {
        status: "completed",
        messages: [
          agentMessage(
            textPart(
              `Project submitted successfully. It is being analyzed (job #${job.id}). The project will appear in listings once analysis is complete and the draft is approved.`,
            ),
          ),
        ],
        artifacts: [
          artifact("submission", "Project Submission", {
            projectId: project.id,
            jobId: job.id,
            status: "pending",
            message: "Project is being analyzed. Poll the job status to track progress.",
          }),
        ],
      };
    } else {
      // Anonymous submission
      const fingerprint = metadata?.fingerprint as string || "a2a-agent-" + crypto.randomBytes(8).toString("hex");
      const anonCount = await storage.getAnonymousSubmissionCount(fingerprint);
      if (anonCount >= 3) {
        return {
          status: "failed",
          messages: [agentMessage(textPart("Anonymous submission limit reached (3 per agent). Authenticate to submit more projects."))],
          artifacts: [],
        };
      }

      const token = crypto.randomBytes(16).toString("hex");
      const project = await storage.createProject({
        url,
        anonymousToken: token,
        claimed: false,
        status: "pending",
      });
      await storage.createAnonymousSubmission(fingerprint, project.id);
      const job = await storage.createJob(project.id);
      processJob(job.id).catch(console.error);

      return {
        status: "completed",
        messages: [
          agentMessage(
            textPart(
              `Project submitted anonymously. It is being analyzed (job #${job.id}). Save the anonymousToken to claim ownership later.`,
            ),
          ),
        ],
        artifacts: [
          artifact("submission", "Project Submission", {
            projectId: project.id,
            jobId: job.id,
            anonymousToken: token,
            status: "pending",
            message: "Project is being analyzed. The draft must be approved before it appears in listings.",
          }),
        ],
      };
    }
  },
};

// ============================================================
// Skill: subscribe-updates
// ============================================================

const subscribeUpdates: SkillExecutor = {
  skillId: "subscribe-updates",

  async execute(input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const params = extractInput(input);

    const userId = metadata?.userId as number | undefined;
    if (!userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Authentication required. Subscribe requires a valid user context."))],
        artifacts: [],
      };
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("User not found."))],
        artifacts: [],
      };
    }

    const categoryIds = params.categoryIds as number[] | undefined;
    if (!categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0) {
      // Return available categories to help the agent
      const cats = await storage.getCategories();
      return {
        status: "input-required",
        messages: [
          agentMessage(
            textPart("Please provide categoryIds to subscribe to. Available categories:"),
            dataPart(
              cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
            ),
          ),
        ],
        artifacts: [],
      };
    }

    // Validate category IDs exist
    const allCats = await storage.getCategories();
    const validIds = new Set(allCats.map((c) => c.id));
    const invalid = categoryIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Invalid category IDs: ${invalid.join(", ")}. Use list-categories to see valid IDs.`))],
        artifacts: [],
      };
    }

    // Sync subscriptions
    const existing = await storage.getSubscriptions(userId);
    const existingCatIds = existing.map((s) => s.categoryId);

    for (const sub of existing) {
      if (!categoryIds.includes(sub.categoryId)) {
        await storage.unsubscribe(userId, sub.categoryId);
      }
    }

    for (const catId of categoryIds) {
      if (!existingCatIds.includes(catId)) {
        await storage.subscribe(userId, catId);
      }
    }

    const frequency = (params.frequency as string) || "weekly";
    const pricingFilter = (params.pricingFilter as string) || "all";
    const maxProjects = Math.min(Number(params.maxProjects) || 10, 50);

    await storage.upsertNewsletterPreference(userId, {
      frequency,
      pricingFilter,
      maxProjects,
    });

    const subscribedCats = allCats.filter((c) => categoryIds.includes(c.id));

    return {
      status: "completed",
      messages: [
        agentMessage(
          textPart(
            `Subscribed to ${subscribedCats.length} categories with ${frequency} digest. Projects filtered by: ${pricingFilter}.`,
          ),
        ),
      ],
      artifacts: [
        artifact("subscription", "Subscription Details", {
          userId,
          categories: subscribedCats.map((c) => ({ id: c.id, name: c.name })),
          frequency,
          pricingFilter,
          maxProjects,
        }),
      ],
    };
  },
};

// ============================================================
// Registry
// ============================================================

const executors: SkillExecutor[] = [
  discoverProjects,
  getProject,
  listCategories,
  publishProject,
  subscribeUpdates,
];

const executorMap = new Map(executors.map((e) => [e.skillId, e]));

export function getSkillExecutor(skillId: string): SkillExecutor | undefined {
  return executorMap.get(skillId);
}

export function getRegisteredSkillIds(): string[] {
  return Array.from(executorMap.keys());
}
