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
 * - register-user: Register a new user account via A2A
 * - get-profile: Get authenticated user's profile
 * - get-my-projects: List user's own projects
 * - update-project: Update own project
 * - delete-project: Delete own project
 * - get-job-status: Poll scraping/analysis job status
 * - edit-draft: Edit or refine a project draft
 * - approve-draft: Approve and publish a draft
 * - like-project: Like or unlike a project
 * - follow-project: Follow or unfollow a project
 * - post-comment: Post a comment on a project
 * - delete-comment: Delete own comment
 * - submit-feedback: Submit anonymous feedback
 * - get-balance: Get credit balance
 * - get-notifications: Get notifications
 */

import type { SkillExecutor, SkillResult, Message, Part, DataPart, TextPart, Artifact } from "./types";
import { storage } from "../storage";
import { processJob, approveAndPublish, refineDraft, type ScrapedData } from "../scraper";
import { clerkClient } from "@clerk/express";
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
// Skill: get-profile
// ============================================================

const getProfile: SkillExecutor = {
  skillId: "get-profile",

  async execute(_input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const userId = metadata?.userId as number | undefined;
    if (!userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Authentication required. Provide a valid Bearer token."))],
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

    return {
      status: "completed",
      messages: [agentMessage(textPart(`Profile for "${user.username}".`))],
      artifacts: [
        artifact("user-profile", "User Profile", {
          id: user.id,
          clerkId: user.clerkId,
          username: user.username,
          email: user.email,
          role: user.role,
          freeListingsRemaining: user.freeListingsRemaining,
          paidListingCredits: user.paidListingCredits,
          likesRemaining: user.likesRemaining,
          createdAt: user.createdAt,
        }),
      ],
    };
  },
};

// ============================================================
// Skill: get-my-projects
// ============================================================

const getMyProjects: SkillExecutor = {
  skillId: "get-my-projects",

  async execute(_input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const userId = metadata?.userId as number | undefined;
    if (!userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Authentication required."))],
        artifacts: [],
      };
    }

    const projects = await storage.getProjectsByOwner(userId);
    const withJobs = await Promise.all(
      projects.map(async (p) => {
        const job = await storage.getJobByProject(p.id);
        return {
          id: p.id,
          name: p.name,
          url: p.url,
          shortDescription: p.shortDescription,
          pricingModel: p.pricingModel,
          status: p.status,
          likesCount: p.likesCount,
          followsCount: p.followsCount,
          commentsCount: p.commentsCount,
          createdAt: p.createdAt,
          job: job ? { id: job.id, status: job.status, step: job.step } : null,
        };
      }),
    );

    return {
      status: "completed",
      messages: [agentMessage(textPart(`You have ${withJobs.length} project${withJobs.length !== 1 ? "s" : ""}.`))],
      artifacts: [artifact("my-projects", "My Projects", withJobs)],
    };
  },
};

// ============================================================
// Skill: update-project
// ============================================================

const updateProject: SkillExecutor = {
  skillId: "update-project",

  async execute(input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const userId = metadata?.userId as number | undefined;
    if (!userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Authentication required."))],
        artifacts: [],
      };
    }

    const params = extractInput(input);
    const projectId = Number(params.projectId);
    if (!projectId || isNaN(projectId)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing or invalid projectId."))],
        artifacts: [],
      };
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Project ${projectId} not found.`))],
        artifacts: [],
      };
    }

    if (project.ownerId !== userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Not authorized. You can only update your own projects."))],
        artifacts: [],
      };
    }

    const updates: Record<string, unknown> = {};
    for (const field of ["name", "shortDescription", "longDescription", "pricingModel", "pricingDetails", "demoUrl", "docsUrl", "repoUrl", "tags"]) {
      if (params[field] !== undefined) updates[field] = params[field];
    }

    const categoryIds = params.categoryIds as number[] | undefined;

    const updated = await storage.updateProject(projectId, updates);
    if (categoryIds && Array.isArray(categoryIds)) {
      await storage.setProjectCategories(projectId, categoryIds);
    }

    const cats = await storage.getProjectCategories(projectId);

    return {
      status: "completed",
      messages: [agentMessage(textPart(`Project "${updated?.name || project.name}" updated.`))],
      artifacts: [
        artifact("updated-project", "Updated Project", {
          ...updated,
          categories: cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
        }),
      ],
    };
  },
};

// ============================================================
// Skill: delete-project
// ============================================================

const deleteProject: SkillExecutor = {
  skillId: "delete-project",

  async execute(input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const userId = metadata?.userId as number | undefined;
    if (!userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Authentication required."))],
        artifacts: [],
      };
    }

    const params = extractInput(input);
    const projectId = Number(params.projectId);
    if (!projectId || isNaN(projectId)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing or invalid projectId."))],
        artifacts: [],
      };
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Project ${projectId} not found.`))],
        artifacts: [],
      };
    }

    if (project.ownerId !== userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Not authorized. You can only delete your own projects."))],
        artifacts: [],
      };
    }

    await storage.deleteProject(projectId);

    // Refund credit (same logic as REST)
    const user = await storage.getUser(userId);
    if (user) {
      if (user.freeListingsRemaining < 3) {
        await storage.updateUserCredits(user.id, { freeListingsRemaining: user.freeListingsRemaining + 1 });
      } else {
        await storage.updateUserCredits(user.id, { paidListingCredits: user.paidListingCredits + 1 });
      }
    }

    return {
      status: "completed",
      messages: [agentMessage(textPart(`Project "${project.name || projectId}" deleted. Listing credit refunded.`))],
      artifacts: [],
    };
  },
};

// ============================================================
// Skill: get-job-status
// ============================================================

const getJobStatus: SkillExecutor = {
  skillId: "get-job-status",

  async execute(input: Message): Promise<SkillResult> {
    const params = extractInput(input);
    const jobId = Number(params.jobId);

    if (!jobId || isNaN(jobId)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing or invalid jobId."))],
        artifacts: [],
      };
    }

    const job = await storage.getJob(jobId);
    if (!job) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Job ${jobId} not found.`))],
        artifacts: [],
      };
    }

    const result: Record<string, unknown> = {
      id: job.id,
      projectId: job.projectId,
      status: job.status,
      step: job.step,
      stepDetail: job.stepDetail,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };

    // Include draft data if in review
    if (job.status === "review" && job.result) {
      try {
        result.draft = JSON.parse(job.result);
      } catch {
        // ignore parse errors
      }
    }

    return {
      status: "completed",
      messages: [agentMessage(textPart(`Job #${jobId}: ${job.status} (step: ${job.step}).`))],
      artifacts: [artifact("job-status", "Job Status", result)],
    };
  },
};

// ============================================================
// Skill: edit-draft
// ============================================================

const editDraft: SkillExecutor = {
  skillId: "edit-draft",

  async execute(input: Message): Promise<SkillResult> {
    const params = extractInput(input);
    const jobId = Number(params.jobId);

    if (!jobId || isNaN(jobId)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing or invalid jobId."))],
        artifacts: [],
      };
    }

    const job = await storage.getJob(jobId);
    if (!job) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Job ${jobId} not found.`))],
        artifacts: [],
      };
    }

    if (job.status !== "review") {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Job is not in review state (current: ${job.status}). Only drafts in review can be edited.`))],
        artifacts: [],
      };
    }

    if (!job.result) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("No draft data available to edit."))],
        artifacts: [],
      };
    }

    const current: ScrapedData = JSON.parse(job.result);

    // Check if text feedback is provided (refine mode)
    const feedback = params.feedback as string | undefined;
    if (feedback) {
      const refined = refineDraft(current, feedback);
      await storage.updateJob(jobId, { result: JSON.stringify(refined) });
      return {
        status: "completed",
        messages: [agentMessage(textPart("Draft refined with your feedback."))],
        artifacts: [artifact("draft", "Refined Draft", refined as unknown as Record<string, unknown>)],
      };
    }

    // Otherwise apply direct field edits
    const updated: ScrapedData = { ...current };
    for (const field of ["name", "shortDescription", "longDescription", "pricingModel", "pricingDetails", "tags", "suggestedCategories", "demoUrl", "docsUrl", "repoUrl"] as const) {
      if (params[field] !== undefined) {
        (updated as Record<string, unknown>)[field] = params[field];
      }
    }

    await storage.updateJob(jobId, { result: JSON.stringify(updated) });

    return {
      status: "completed",
      messages: [agentMessage(textPart("Draft updated."))],
      artifacts: [artifact("draft", "Updated Draft", updated as unknown as Record<string, unknown>)],
    };
  },
};

// ============================================================
// Skill: approve-draft
// ============================================================

const approveDraft: SkillExecutor = {
  skillId: "approve-draft",

  async execute(input: Message): Promise<SkillResult> {
    const params = extractInput(input);
    const jobId = Number(params.jobId);

    if (!jobId || isNaN(jobId)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing or invalid jobId."))],
        artifacts: [],
      };
    }

    const job = await storage.getJob(jobId);
    if (!job) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Job ${jobId} not found.`))],
        artifacts: [],
      };
    }

    if (job.status !== "review") {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Job is not in review state (current: ${job.status}).`))],
        artifacts: [],
      };
    }

    try {
      await approveAndPublish(jobId);
      const project = await storage.getProject(job.projectId);

      return {
        status: "completed",
        messages: [agentMessage(textPart(`Project "${project?.name}" approved and published!`))],
        artifacts: [
          artifact("published-project", "Published Project", {
            projectId: job.projectId,
            name: project?.name,
            url: project?.url,
            status: project?.status,
          }),
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to publish";
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Approval failed: ${message}`))],
        artifacts: [],
      };
    }
  },
};

// ============================================================
// Skill: like-project
// ============================================================

const likeProject: SkillExecutor = {
  skillId: "like-project",

  async execute(input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const userId = metadata?.userId as number | undefined;
    if (!userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Authentication required."))],
        artifacts: [],
      };
    }

    const params = extractInput(input);
    const projectId = Number(params.projectId);
    const action = (params.action as string) || "like";

    if (!projectId || isNaN(projectId)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing or invalid projectId."))],
        artifacts: [],
      };
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Project ${projectId} not found.`))],
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

    if (action === "unlike") {
      const deleted = await storage.deleteLike(userId, projectId);
      if (!deleted) {
        return {
          status: "failed",
          messages: [agentMessage(textPart("You haven't liked this project."))],
          artifacts: [],
        };
      }
      await storage.incrementLikesCount(projectId, -1);
      await storage.updateUserCredits(userId, { likesRemaining: user.likesRemaining + 1 });
      return {
        status: "completed",
        messages: [agentMessage(textPart(`Unliked "${project.name}".`))],
        artifacts: [artifact("like-result", "Unlike Result", { projectId, liked: false, likesCount: project.likesCount - 1 })],
      };
    }

    // Like
    if (user.likesRemaining <= 0) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("No likes remaining."))],
        artifacts: [],
      };
    }

    const existing = await storage.getLike(userId, projectId);
    if (existing) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Already liked this project."))],
        artifacts: [],
      };
    }

    await storage.createLike(userId, projectId);
    await storage.incrementLikesCount(projectId, 1);
    await storage.updateUserCredits(userId, { likesRemaining: user.likesRemaining - 1 });

    return {
      status: "completed",
      messages: [agentMessage(textPart(`Liked "${project.name}".`))],
      artifacts: [artifact("like-result", "Like Result", { projectId, liked: true, likesCount: project.likesCount + 1 })],
    };
  },
};

// ============================================================
// Skill: follow-project
// ============================================================

const followProject: SkillExecutor = {
  skillId: "follow-project",

  async execute(input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const userId = metadata?.userId as number | undefined;
    if (!userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Authentication required."))],
        artifacts: [],
      };
    }

    const params = extractInput(input);
    const projectId = Number(params.projectId);
    const action = (params.action as string) || "follow";

    if (!projectId || isNaN(projectId)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing or invalid projectId."))],
        artifacts: [],
      };
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Project ${projectId} not found.`))],
        artifacts: [],
      };
    }

    if (action === "unfollow") {
      const deleted = await storage.deleteFollow(userId, projectId);
      if (!deleted) {
        return {
          status: "failed",
          messages: [agentMessage(textPart("You're not following this project."))],
          artifacts: [],
        };
      }
      await storage.incrementFollowsCount(projectId, -1);
      return {
        status: "completed",
        messages: [agentMessage(textPart(`Unfollowed "${project.name}".`))],
        artifacts: [artifact("follow-result", "Unfollow Result", { projectId, following: false, followsCount: project.followsCount - 1 })],
      };
    }

    // Follow
    const existing = await storage.getFollow(userId, projectId);
    if (existing) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Already following this project."))],
        artifacts: [],
      };
    }

    await storage.createFollow(userId, projectId);
    await storage.incrementFollowsCount(projectId, 1);

    return {
      status: "completed",
      messages: [agentMessage(textPart(`Now following "${project.name}".`))],
      artifacts: [artifact("follow-result", "Follow Result", { projectId, following: true, followsCount: project.followsCount + 1 })],
    };
  },
};

// ============================================================
// Skill: post-comment
// ============================================================

const postComment: SkillExecutor = {
  skillId: "post-comment",

  async execute(input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const userId = metadata?.userId as number | undefined;
    if (!userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Authentication required."))],
        artifacts: [],
      };
    }

    const params = extractInput(input);
    const projectId = Number(params.projectId);
    const content = (params.content as string || "").trim();

    if (!projectId || isNaN(projectId)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing or invalid projectId."))],
        artifacts: [],
      };
    }

    if (!content || content.length > 2000) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Comment content is required (max 2000 characters)."))],
        artifacts: [],
      };
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Project ${projectId} not found.`))],
        artifacts: [],
      };
    }

    const user = await storage.getUser(userId);
    const comment = await storage.createComment(projectId, userId, content);

    return {
      status: "completed",
      messages: [agentMessage(textPart(`Comment posted on "${project.name}".`))],
      artifacts: [
        artifact("comment", "Posted Comment", {
          id: comment.id,
          projectId: comment.projectId,
          content: comment.content,
          username: user?.username,
          createdAt: comment.createdAt,
        }),
      ],
    };
  },
};

// ============================================================
// Skill: delete-comment
// ============================================================

const deleteComment: SkillExecutor = {
  skillId: "delete-comment",

  async execute(input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const userId = metadata?.userId as number | undefined;
    if (!userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Authentication required."))],
        artifacts: [],
      };
    }

    const params = extractInput(input);
    const commentId = Number(params.commentId);

    if (!commentId || isNaN(commentId)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing or invalid commentId."))],
        artifacts: [],
      };
    }

    const deleted = await storage.deleteComment(commentId, userId);
    if (!deleted) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Comment not found or you don't have permission to delete it."))],
        artifacts: [],
      };
    }

    return {
      status: "completed",
      messages: [agentMessage(textPart(`Comment #${commentId} deleted.`))],
      artifacts: [],
    };
  },
};

// ============================================================
// Skill: submit-feedback
// ============================================================

const submitFeedback: SkillExecutor = {
  skillId: "submit-feedback",

  async execute(input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const params = extractInput(input);
    const projectId = Number(params.projectId);
    const rating = Number(params.rating);
    const answers = params.answers as Array<{ question: string; answer: string }> | undefined;
    const summary = params.summary as string | undefined;

    if (!projectId || isNaN(projectId)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing or invalid projectId."))],
        artifacts: [],
      };
    }

    if (!rating || isNaN(rating) || rating < 1 || rating > 10) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Rating is required (integer 1-10)."))],
        artifacts: [],
      };
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Project ${projectId} not found.`))],
        artifacts: [],
      };
    }

    // Generate fingerprint from metadata
    const rawFp = (metadata?.fingerprint as string) || "a2a-feedback-" + crypto.randomBytes(8).toString("hex");
    const fingerprint = crypto.createHash("sha256").update(rawFp + "vibe-feedback-salt").digest("hex").slice(0, 16);

    const entry = await storage.createFeedback(
      projectId,
      Math.round(rating),
      fingerprint,
      answers ? JSON.stringify(answers) : undefined,
      summary || undefined,
    );

    return {
      status: "completed",
      messages: [agentMessage(textPart(`Feedback submitted for "${project.name}" (rating: ${rating}/10).`))],
      artifacts: [
        artifact("feedback", "Submitted Feedback", {
          id: entry.id,
          projectId: entry.projectId,
          rating: entry.rating,
          createdAt: entry.createdAt,
        }),
      ],
    };
  },
};

// ============================================================
// Skill: get-balance
// ============================================================

const getBalance: SkillExecutor = {
  skillId: "get-balance",

  async execute(_input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const userId = metadata?.userId as number | undefined;
    if (!userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Authentication required."))],
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

    const ledger = await storage.getCreditLedger(userId);

    return {
      status: "completed",
      messages: [
        agentMessage(
          textPart(`Balance: ${user.freeListingsRemaining + user.paidListingCredits} listing credits, ${user.likesRemaining} likes remaining.`),
        ),
      ],
      artifacts: [
        artifact("balance", "Credit Balance", {
          freeListingsRemaining: user.freeListingsRemaining,
          paidListingCredits: user.paidListingCredits,
          earnedCredits: user.earnedCredits,
          earnedCreditsNeeded: 100,
          totalListingCredits: user.freeListingsRemaining + user.paidListingCredits,
          likesRemaining: user.likesRemaining,
          ledger: ledger.map((e) => ({
            id: e.id,
            amount: e.amount,
            type: e.type,
            description: e.description,
            createdAt: e.createdAt,
          })),
        }),
      ],
    };
  },
};

// ============================================================
// Skill: get-notifications
// ============================================================

const getNotifications: SkillExecutor = {
  skillId: "get-notifications",

  async execute(input: Message, _taskId: string, metadata?: Record<string, unknown>): Promise<SkillResult> {
    const userId = metadata?.userId as number | undefined;
    if (!userId) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Authentication required."))],
        artifacts: [],
      };
    }

    const params = extractInput(input);
    const limit = Math.min(Number(params.limit) || 20, 100);
    const markRead = params.markRead as boolean | undefined;

    const notifs = await storage.getNotifications(userId, limit);
    const unreadCount = await storage.getUnreadNotificationCount(userId);

    // Optionally mark all as read
    if (markRead) {
      await storage.markAllNotificationsRead(userId);
    }

    return {
      status: "completed",
      messages: [agentMessage(textPart(`${notifs.length} notifications (${unreadCount} unread).`))],
      artifacts: [
        artifact("notifications", "Notifications", {
          notifications: notifs.map((n) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            read: n.read,
            linkUrl: n.linkUrl,
            createdAt: n.createdAt,
          })),
          unreadCount,
        }),
      ],
    };
  },
};

// ============================================================
// Skill: register-user
// ============================================================

const registerUser: SkillExecutor = {
  skillId: "register-user",

  async execute(input: Message): Promise<SkillResult> {
    const params = extractInput(input);

    const email = (params.email as string || "").trim().toLowerCase();
    const username = (params.username as string || "").trim();
    const password = params.password as string || "";
    const firstName = params.firstName as string | undefined;
    const lastName = params.lastName as string | undefined;

    // --- Validate required fields ---
    if (!email || !username || !password) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Missing required fields: email, username, and password are all required."))],
        artifacts: [],
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Invalid email format: "${email}".`))],
        artifacts: [],
      };
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!usernameRegex.test(username)) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Invalid username. Must be 3-30 characters, alphanumeric and underscores only."))],
        artifacts: [],
      };
    }

    // Validate password length
    if (password.length < 8) {
      return {
        status: "failed",
        messages: [agentMessage(textPart("Password must be at least 8 characters."))],
        artifacts: [],
      };
    }

    // --- Check for existing user in local DB ---
    const existingByEmail = await storage.getUserByEmail(email);
    if (existingByEmail) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`A user with email "${email}" already exists.`))],
        artifacts: [],
      };
    }

    const existingByUsername = await storage.getUserByUsername(username);
    if (existingByUsername) {
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Username "${username}" is already taken.`))],
        artifacts: [],
      };
    }

    // --- Create user in Clerk ---
    let clerkUser;
    try {
      clerkUser = await clerkClient.users.createUser({
        emailAddress: [email],
        username,
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      // Clerk returns structured errors for duplicates, weak passwords, etc.
      if (message.includes("already exists") || message.includes("taken") || message.includes("unique")) {
        return {
          status: "failed",
          messages: [agentMessage(textPart(`Registration failed: ${message}`))],
          artifacts: [],
        };
      }

      console.error("[a2a] Clerk user creation failed:", message);
      return {
        status: "failed",
        messages: [agentMessage(textPart(`Registration failed: ${message}`))],
        artifacts: [],
      };
    }

    // --- Sync to local database ---
    let dbUser;
    try {
      dbUser = await storage.upsertUserFromClerk(clerkUser.id, username, email);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[a2a] DB user sync failed after Clerk creation:", message);
      return {
        status: "failed",
        messages: [agentMessage(textPart("User was created in auth provider but failed to sync to database. The user can still sign in normally and will be synced automatically."))],
        artifacts: [],
      };
    }

    return {
      status: "completed",
      messages: [
        agentMessage(
          textPart(`User "${username}" registered successfully. The account is ready to use.`),
        ),
      ],
      artifacts: [
        artifact("registered-user", "Registered User", {
          userId: dbUser.id,
          clerkId: clerkUser.id,
          username: dbUser.username,
          email: dbUser.email,
          freeListingsRemaining: dbUser.freeListingsRemaining,
          likesRemaining: dbUser.likesRemaining,
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
  registerUser,
  getProfile,
  getMyProjects,
  updateProject,
  deleteProject,
  getJobStatus,
  editDraft,
  approveDraft,
  likeProject,
  followProject,
  postComment,
  deleteComment,
  submitFeedback,
  getBalance,
  getNotifications,
];

const executorMap = new Map(executors.map((e) => [e.skillId, e]));

export function getSkillExecutor(skillId: string): SkillExecutor | undefined {
  return executorMap.get(skillId);
}

export function getRegisteredSkillIds(): string[] {
  return Array.from(executorMap.keys());
}
