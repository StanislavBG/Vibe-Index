import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, requireAuth, syncClerkUser, requireAdmin, seedAdminUsers } from "./auth";
import { getAuth } from "@clerk/express";
import { submitProjectSchema, subscribeSchema, createFeedbackSchema, submitSocialShareSchema } from "@shared/schema";
import { runDigest, startDigestScheduler } from "./digest";
import { isEmailConfigured } from "./email";
import { processJob, approveAndPublish, refineDraft, type ScrapedData } from "./scraper";
import { seedCanonicalTags, resolveTag, suggestTags, createCanonicalTag, addSynonym, resolveAndAttachTags, normalizeTag } from "./tagService";
import { a2aRouter } from "./a2a";
import crypto from "crypto";
import multer from "multer";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { db } from "./db";
import { sql } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const DEFAULT_CATEGORIES = [
  { name: "AI & Machine Learning", slug: "ai-ml", description: "Projects using AI, ML, or LLMs", icon: "Brain" },
  { name: "Developer Tools", slug: "dev-tools", description: "CLIs, editors, and dev utilities", icon: "Wrench" },
  { name: "Web Apps", slug: "web-apps", description: "Full-stack web applications", icon: "Globe" },
  { name: "Mobile Apps", slug: "mobile-apps", description: "iOS and Android applications", icon: "Smartphone" },
  { name: "APIs & Backend", slug: "apis-backend", description: "Backend services and APIs", icon: "Server" },
  { name: "Games", slug: "games", description: "Games and interactive experiences", icon: "Gamepad2" },
  { name: "E-Commerce", slug: "ecommerce", description: "Online stores and marketplaces", icon: "ShoppingCart" },
  { name: "Productivity", slug: "productivity", description: "Task management and productivity tools", icon: "CheckSquare" },
  { name: "Social & Community", slug: "social", description: "Social platforms and community tools", icon: "Users" },
  { name: "Education", slug: "education", description: "Learning platforms and educational tools", icon: "GraduationCap" },
  { name: "Finance", slug: "finance", description: "Fintech and financial tools", icon: "DollarSign" },
  { name: "Design & Creative", slug: "design-creative", description: "Design tools and creative platforms", icon: "Palette" },
];

async function seedCategories() {
  const existing = await storage.getCategories();
  if (existing.length === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      await storage.createCategory(cat);
    }
  }
}

// Background job: verify pending social shares every 5 minutes
async function verifySocialShares() {
  const pending = await storage.getPendingSocialShares();
  if (pending.length === 0) return;

  for (const share of pending) {
    try {
      const response = await fetch(share.proofUrl, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });

      const project = await storage.getProject(share.projectId);
      const projectName = project?.name || "a project";

      if (response.ok) {
        await storage.updateSocialShare(share.id, { status: "verified", verifiedAt: new Date() });
        await storage.updateEarnedCredits(share.userId, share.creditAmount);
        await storage.addCreditLedgerEntry(
          share.userId, share.creditAmount, "social_share",
          `Shared ${projectName} on ${share.platform}`, share.id, "social_share"
        );

        // Check if this converts to a full listing credit
        const converted = await storage.convertEarnedCredits(share.userId);

        // Send verification success notification
        await storage.createNotification(
          share.userId,
          "share_verified",
          "Share verified!",
          `Your ${share.platform} share of "${projectName}" was verified. You earned ${share.creditAmount}% toward a new listing credit.${converted > 0 ? ` You unlocked ${converted} new listing credit${converted > 1 ? "s" : ""}!` : ""}`,
          "/dashboard"
        );

        if (converted > 0) {
          await storage.createNotification(
            share.userId,
            "credit_earned",
            "New listing credit earned!",
            `Congratulations! You've earned ${converted} new listing credit${converted > 1 ? "s" : ""} from social sharing. You can now submit more projects.`,
            "/submit"
          );
        }
      } else {
        await storage.updateSocialShare(share.id, { status: "expired" });
        await storage.createNotification(
          share.userId,
          "share_expired",
          "Share verification failed",
          `We couldn't verify your ${share.platform} share of "${projectName}". The post may have been removed or is no longer accessible. No credit was awarded.`,
          "/dashboard"
        );
      }
    } catch {
      await storage.updateSocialShare(share.id, { status: "expired" });

      const project = await storage.getProject(share.projectId);
      const projectName = project?.name || "a project";
      await storage.createNotification(
        share.userId,
        "share_expired",
        "Share verification failed",
        `We couldn't verify your ${share.platform} share of "${projectName}". The post may have been removed or is no longer accessible. No credit was awarded.`,
        "/dashboard"
      );
    }
  }

  console.log(`[verifier] Processed ${pending.length} pending shares`);
}

// Start the background verification loop (every 5 minutes)
let verificationInterval: ReturnType<typeof setInterval> | null = null;
function startVerificationScheduler() {
  if (verificationInterval) return;
  // Run immediately on startup, then every 5 minutes
  verifySocialShares().catch(console.error);
  verificationInterval = setInterval(() => {
    verifySocialShares().catch(console.error);
  }, 5 * 60 * 1000);
  console.log("[verifier] Background social share verification started (every 5m)");
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  setupAuth(app);
  await seedCategories();
  await seedCanonicalTags();
  await seedAdminUsers();
  startVerificationScheduler();
  startDigestScheduler();

  // ==========================================
  // A2A AGENT COMMUNICATION SERVICE
  // Agent Card at GET /.well-known/agent.json
  // JSON-RPC endpoint at POST /a2a
  // ==========================================
  app.use(a2aRouter);

  // ==========================================
  // AUTH ROUTES
  // ==========================================
  app.get("/api/auth/me", syncClerkUser, async (req, res) => {
    const user = req.dbUser!;
    res.json({
      id: user.id,
      clerkId: user.clerkId,
      username: user.username,
      email: user.email,
      role: user.role,
      freeListingsRemaining: user.freeListingsRemaining,
      paidListingCredits: user.paidListingCredits,
      likesRemaining: user.likesRemaining,
      createdAt: user.createdAt,
    });
  });

  // ==========================================
  // PROJECTS — Submit triggers agent job
  // ==========================================
  app.get("/api/projects", async (req, res) => {
    const { search, category, pricing, limit, offset, sort } = req.query;
    const result = await storage.getProjects({
      search: search as string | undefined,
      categoryId: category ? parseInt(category as string) : undefined,
      pricingModel: pricing as string | undefined,
      limit: limit ? parseInt(limit as string) : 20,
      offset: offset ? parseInt(offset as string) : 0,
      sortBy: (sort as string) || "newest",
    });
    res.json(result);
  });

  // Voice search: transcribe audio to text and return as search query
  app.post("/api/search/voice", upload.single("audio"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "Audio file is required" });

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return res.status(503).json({ message: "Voice search not configured. Set OPENAI_API_KEY." });
    }

    try {
      const formData = new FormData();
      formData.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname || "audio.webm");
      formData.append("model", "whisper-1");
      formData.append("response_format", "text");
      formData.append("prompt", "The user is searching for software projects. Transcribe their search query.");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: formData,
      });

      if (!whisperRes.ok) {
        const err = await whisperRes.text();
        return res.status(502).json({ message: "Transcription failed", detail: err });
      }

      const transcript = (await whisperRes.text()).trim();
      if (!transcript) {
        return res.status(400).json({ message: "Could not understand audio. Try again." });
      }

      res.json({ query: transcript });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message: "Voice search failed", detail: message });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid project ID" });
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const cats = await storage.getProjectCategories(id);
    const job = await storage.getJobByProject(id);
    let liked = false;
    let followed = false;
    const auth = getAuth(req);
    if (auth?.userId) {
      const dbUser = await storage.getUserByClerkId(auth.userId);
      if (dbUser) {
        const like = await storage.getLike(dbUser.id, id);
        liked = !!like;
        const follow = await storage.getFollow(dbUser.id, id);
        followed = !!follow;
      }
    }
    const canonicalTagList = await storage.getProjectTags(id);
    res.json({ ...project, categories: cats, canonicalTags: canonicalTagList, liked, followed, job: job || null });
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const input = submitProjectSchema.parse(req.body);
      const fingerprint = req.ip || req.headers["x-forwarded-for"] as string || "unknown";
      const auth = getAuth(req);

      if (auth?.userId) {
        const dbUser = await storage.getUserByClerkId(auth.userId);
        if (!dbUser) return res.status(401).json({ message: "User not found" });

        if (dbUser.freeListingsRemaining <= 0 && dbUser.paidListingCredits <= 0) {
          return res.status(403).json({ message: "No listing credits remaining. Purchase more to continue." });
        }
        const project = await storage.createProject({
          url: input.url,
          ownerId: dbUser.id,
          claimed: true,
          status: "pending",
        });
        if (dbUser.freeListingsRemaining > 0) {
          await storage.updateUserCredits(dbUser.id, { freeListingsRemaining: dbUser.freeListingsRemaining - 1 });
        } else {
          await storage.updateUserCredits(dbUser.id, { paidListingCredits: dbUser.paidListingCredits - 1 });
        }
        const job = await storage.createJob(project.id);
        processJob(job.id).catch(console.error);
        return res.status(201).json({ project, job });
      } else {
        const anonCount = await storage.getAnonymousSubmissionCount(fingerprint);
        if (anonCount >= 3) {
          return res.status(403).json({ message: "Anonymous submission limit reached. Create an account to submit more projects." });
        }
        const token = crypto.randomBytes(16).toString("hex");
        const project = await storage.createProject({
          url: input.url,
          anonymousToken: token,
          claimed: false,
          status: "pending",
        });
        await storage.createAnonymousSubmission(fingerprint, project.id);
        const job = await storage.createJob(project.id);
        processJob(job.id).catch(console.error);
        return res.status(201).json({ project, job, anonymousToken: token });
      }
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      throw err;
    }
  });

  app.put("/api/projects/:id", requireAuth, syncClerkUser, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid project ID" });
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const user = req.dbUser!;
    if (project.ownerId !== user.id) return res.status(403).json({ message: "Not authorized" });
    const { categoryIds, ...updates } = req.body;
    const updated = await storage.updateProject(id, updates);
    if (categoryIds && Array.isArray(categoryIds)) await storage.setProjectCategories(id, categoryIds);
    const cats = await storage.getProjectCategories(id);
    res.json({ ...updated, categories: cats });
  });

  app.delete("/api/projects/:id", requireAuth, syncClerkUser, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid project ID" });
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const user = req.dbUser!;
    if (project.ownerId !== user.id) return res.status(403).json({ message: "Not authorized" });
    await storage.deleteProject(id);
    if (user.freeListingsRemaining < 3) {
      await storage.updateUserCredits(user.id, { freeListingsRemaining: user.freeListingsRemaining + 1 });
    } else {
      await storage.updateUserCredits(user.id, { paidListingCredits: user.paidListingCredits + 1 });
    }
    res.json({ message: "Project deleted" });
  });

  app.get("/api/my-projects", requireAuth, syncClerkUser, async (req, res) => {
    const user = req.dbUser!;
    const userProjects = await storage.getProjectsByOwner(user.id);
    const withJobs = await Promise.all(
      userProjects.map(async (p) => {
        const job = await storage.getJobByProject(p.id);
        return { ...p, job: job || null };
      })
    );
    res.json(withJobs);
  });

  // ==========================================
  // JOBS — poll for status
  // ==========================================
  app.get("/api/jobs/:id", async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid job ID" });
    const job = await storage.getJob(id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json(job);
  });

  // ==========================================
  // DRAFT REVIEW — agentic editing flow
  // ==========================================

  // Update draft directly (typing edit)
  app.patch("/api/jobs/:id/draft", async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid job ID" });
    const job = await storage.getJob(id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.status !== "review") return res.status(400).json({ message: "Job is not in review state" });
    if (!job.result) return res.status(400).json({ message: "No draft to update" });

    const current: ScrapedData = JSON.parse(job.result);
    const updates = req.body as Partial<ScrapedData>;

    // Merge user edits into draft
    const updated: ScrapedData = {
      ...current,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.shortDescription !== undefined && { shortDescription: updates.shortDescription }),
      ...(updates.longDescription !== undefined && { longDescription: updates.longDescription }),
      ...(updates.pricingModel !== undefined && { pricingModel: updates.pricingModel }),
      ...(updates.pricingDetails !== undefined && { pricingDetails: updates.pricingDetails }),
      ...(updates.tags !== undefined && { tags: updates.tags }),
      ...(updates.suggestedCategories !== undefined && { suggestedCategories: updates.suggestedCategories }),
      ...(updates.demoUrl !== undefined && { demoUrl: updates.demoUrl }),
      ...(updates.docsUrl !== undefined && { docsUrl: updates.docsUrl }),
      ...(updates.repoUrl !== undefined && { repoUrl: updates.repoUrl }),
    };

    await storage.updateJob(id, { result: JSON.stringify(updated) });
    res.json(updated);
  });

  // Refine draft with text feedback (typing or transcribed voice)
  app.post("/api/jobs/:id/refine", async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid job ID" });
    const job = await storage.getJob(id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.status !== "review") return res.status(400).json({ message: "Job is not in review state" });
    if (!job.result) return res.status(400).json({ message: "No draft to refine" });

    const { feedback } = req.body;
    if (!feedback || typeof feedback !== "string") {
      return res.status(400).json({ message: "Feedback text is required" });
    }

    const current: ScrapedData = JSON.parse(job.result);
    const refined = refineDraft(current, feedback);

    await storage.updateJob(id, { result: JSON.stringify(refined) });
    res.json(refined);
  });

  // Voice feedback: accept audio, transcribe via OpenAI Whisper, then refine
  app.post("/api/jobs/:id/voice", upload.single("audio"), async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid job ID" });
    const job = await storage.getJob(id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.status !== "review") return res.status(400).json({ message: "Job is not in review state" });
    if (!job.result) return res.status(400).json({ message: "No draft to refine" });

    const file = req.file;
    if (!file) return res.status(400).json({ message: "Audio file is required" });

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return res.status(503).json({ message: "Voice transcription not configured. Set OPENAI_API_KEY." });
    }

    try {
      // Send to OpenAI Whisper for transcription
      const formData = new FormData();
      formData.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname || "audio.webm");
      formData.append("model", "whisper-1");
      formData.append("response_format", "text");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: formData,
      });

      if (!whisperRes.ok) {
        const err = await whisperRes.text();
        return res.status(502).json({ message: "Transcription failed", detail: err });
      }

      const transcript = (await whisperRes.text()).trim();
      if (!transcript) {
        return res.status(400).json({ message: "Could not transcribe audio. Try again or use text instead." });
      }

      // Now refine the draft with the transcript
      const current: ScrapedData = JSON.parse(job.result);
      const refined = refineDraft(current, transcript);

      await storage.updateJob(id, { result: JSON.stringify(refined) });
      res.json({ transcript, draft: refined });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message: "Voice processing failed", detail: message });
    }
  });

  // Approve draft and publish project
  app.post("/api/jobs/:id/approve", async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid job ID" });
    const job = await storage.getJob(id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.status !== "review") return res.status(400).json({ message: "Job is not in review state" });

    try {
      await approveAndPublish(id);
      const project = await storage.getProject(job.projectId);
      res.json({ message: "Project published", project });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to publish";
      res.status(500).json({ message });
    }
  });

  // ==========================================
  // CATEGORIES
  // ==========================================
  app.get("/api/categories", async (_req, res) => {
    const cats = await storage.getCategories();
    res.json(cats);
  });

  app.get("/api/categories/:slug", async (req, res) => {
    const category = await storage.getCategoryBySlug(req.params.slug as string);
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.json(category);
  });

  // ==========================================
  // TAGS — Controlled Vocabulary Service
  // ==========================================

  // List all canonical tags (with optional search)
  app.get("/api/tags", async (req, res) => {
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const tags = await storage.getCanonicalTags({ search, limit });
    res.json(tags);
  });

  // Suggest canonical tags for partial input (autocomplete)
  app.get("/api/tags/suggest", async (req, res) => {
    const q = req.query.q as string;
    if (!q || !q.trim()) return res.json([]);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const suggestions = await suggestTags(q, limit);
    res.json(suggestions);
  });

  // Resolve raw tags to canonical tags (batch)
  app.post("/api/tags/resolve", async (req, res) => {
    const { tags: rawTags } = req.body;
    if (!Array.isArray(rawTags)) return res.status(400).json({ message: "tags must be an array of strings" });

    const results = [];
    for (const raw of rawTags) {
      if (typeof raw !== "string") continue;
      const result = await resolveTag(raw);
      results.push({
        input: raw,
        normalized: normalizeTag(raw),
        canonical: result.canonical,
        isNew: result.isNew,
        suggestions: result.suggestions,
      });
    }
    res.json(results);
  });

  // Create a new canonical tag (with optional synonyms)
  app.post("/api/tags", async (req, res) => {
    const { name, synonyms } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "name is required" });
    }

    try {
      const tag = await createCanonicalTag(name.trim());

      // Optionally register synonyms
      if (Array.isArray(synonyms)) {
        for (const syn of synonyms) {
          if (typeof syn === "string" && syn.trim()) {
            await addSynonym(syn.trim(), tag.id);
          }
        }
      }

      const tagSynonyms = await storage.getSynonymsForTag(tag.id);
      res.status(201).json({ ...tag, synonyms: tagSynonyms });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create tag";
      res.status(400).json({ message });
    }
  });

  // Add a synonym to a canonical tag
  app.post("/api/tags/:id/synonyms", async (req, res) => {
    const tagId = parseInt(req.params.id as string);
    if (isNaN(tagId)) return res.status(400).json({ message: "Invalid tag ID" });
    const { synonym } = req.body;
    if (!synonym || typeof synonym !== "string" || !synonym.trim()) {
      return res.status(400).json({ message: "synonym is required" });
    }

    try {
      await addSynonym(synonym.trim(), tagId);
      const synonyms = await storage.getSynonymsForTag(tagId);
      res.json(synonyms);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add synonym";
      res.status(400).json({ message });
    }
  });

  // Get canonical tags for a specific project
  app.get("/api/projects/:id/tags", async (req, res) => {
    const projectId = parseInt(req.params.id as string);
    if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });
    const tags = await storage.getProjectTags(projectId);
    res.json(tags);
  });

  // ==========================================
  // LIKES
  // ==========================================
  app.post("/api/projects/:id/like", requireAuth, syncClerkUser, async (req, res) => {
    const projectId = parseInt(req.params.id as string);
    if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });
    const user = req.dbUser!;
    if (user.likesRemaining <= 0) return res.status(403).json({ message: "No likes remaining. Purchase more to continue." });
    const existing = await storage.getLike(user.id, projectId);
    if (existing) return res.status(400).json({ message: "Already liked this project" });
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    await storage.createLike(user.id, projectId);
    await storage.incrementLikesCount(projectId, 1);
    await storage.updateUserCredits(user.id, { likesRemaining: user.likesRemaining - 1 });
    res.json({ message: "Liked", likesCount: project.likesCount + 1 });
  });

  app.delete("/api/projects/:id/like", requireAuth, syncClerkUser, async (req, res) => {
    const projectId = parseInt(req.params.id as string);
    if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });
    const user = req.dbUser!;
    const deleted = await storage.deleteLike(user.id, projectId);
    if (!deleted) return res.status(400).json({ message: "Not liked" });
    await storage.incrementLikesCount(projectId, -1);
    await storage.updateUserCredits(user.id, { likesRemaining: user.likesRemaining + 1 });
    const project = await storage.getProject(projectId);
    res.json({ message: "Unliked", likesCount: project?.likesCount || 0 });
  });

  // ==========================================
  // SUBSCRIPTIONS — user-based digest preferences
  // ==========================================
  app.post("/api/subscribe", requireAuth, syncClerkUser, async (req, res) => {
    try {
      const input = subscribeSchema.parse(req.body);
      const user = req.dbUser!;

      // Sync category subscriptions: remove old ones not in the new list, add new ones
      const existing = await storage.getSubscriptions(user.id);
      const existingCatIds = existing.map(s => s.categoryId);

      // Remove categories no longer selected
      for (const sub of existing) {
        if (!input.categoryIds.includes(sub.categoryId)) {
          await storage.unsubscribe(user.id, sub.categoryId);
        }
      }
      // Add newly selected categories
      const results = [];
      for (const categoryId of input.categoryIds) {
        if (!existingCatIds.includes(categoryId)) {
          const sub = await storage.subscribe(user.id, categoryId);
          results.push(sub);
        }
      }

      await storage.upsertNewsletterPreference(user.id, {
        frequency: input.frequency || "weekly",
        interests: input.interests ? JSON.stringify(input.interests) : undefined,
        pricingFilter: input.pricingFilter || "all",
        maxProjects: input.maxProjects || 10,
      });
      res.status(201).json({ message: "Subscribed successfully", subscriptions: results });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/subscribe", requireAuth, syncClerkUser, async (req, res) => {
    const { categoryId } = req.body;
    if (!categoryId) return res.status(400).json({ message: "categoryId required" });
    await storage.unsubscribe(req.dbUser!.id, parseInt(categoryId));
    res.json({ message: "Unsubscribed" });
  });

  // Get current user's subscription preferences
  app.get("/api/subscribe", requireAuth, syncClerkUser, async (req, res) => {
    const user = req.dbUser!;
    const subscriptions = await storage.getSubscriptions(user.id);
    const preferences = await storage.getNewsletterPreference(user.id);
    res.json({ subscriptions, preferences: preferences || null });
  });

  // ==========================================
  // EMAIL / DIGEST
  // ==========================================

  // One-click unsubscribe (no auth needed — uses token)
  app.get("/api/unsubscribe/:token", async (req, res) => {
    const { token } = req.params;
    const user = await storage.getUserByUnsubscribeToken(token as string);
    if (!user) {
      return res.status(404).send(`
        <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2>Invalid or expired link</h2>
          <p>This unsubscribe link is no longer valid.</p>
        </body></html>
      `);
    }
    await storage.deleteAllSubscriptions(user.id);
    res.send(`
      <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
        <h2>You've been unsubscribed</h2>
        <p>You won't receive any more digest emails from Vibe Index.</p>
        <p style="margin-top: 20px;"><a href="/">Back to Vibe Index</a></p>
      </body></html>
    `);
  });

  // Manual digest trigger (for testing — no auth for now, can lock down later)
  app.post("/api/digest/trigger", async (req, res) => {
    const { frequency } = req.body;
    if (!frequency || !["daily", "weekly", "monthly"].includes(frequency)) {
      return res.status(400).json({ message: "frequency must be daily, weekly, or monthly" });
    }
    if (!isEmailConfigured()) {
      return res.status(503).json({
        message: "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in environment.",
      });
    }
    try {
      const result = await runDigest(frequency);
      res.json({ message: `${frequency} digest completed`, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ message: `Digest failed: ${message}` });
    }
  });

  // Check email system status
  app.get("/api/digest/status", async (_req, res) => {
    res.json({
      smtpConfigured: isEmailConfigured(),
      smtpHost: process.env.SMTP_HOST || null,
      smtpFrom: process.env.SMTP_FROM || process.env.SMTP_USER || null,
    });
  });

  // ==========================================
  // FOLLOWS
  // ==========================================
  app.post("/api/projects/:id/follow", requireAuth, syncClerkUser, async (req, res) => {
    const projectId = parseInt(req.params.id as string);
    if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });
    const user = req.dbUser!;
    const existing = await storage.getFollow(user.id, projectId);
    if (existing) return res.status(400).json({ message: "Already following this project" });
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    await storage.createFollow(user.id, projectId);
    await storage.incrementFollowsCount(projectId, 1);
    res.json({ message: "Following", followsCount: project.followsCount + 1 });
  });

  app.delete("/api/projects/:id/follow", requireAuth, syncClerkUser, async (req, res) => {
    const projectId = parseInt(req.params.id as string);
    if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });
    const user = req.dbUser!;
    const deleted = await storage.deleteFollow(user.id, projectId);
    if (!deleted) return res.status(400).json({ message: "Not following" });
    await storage.incrementFollowsCount(projectId, -1);
    const project = await storage.getProject(projectId);
    res.json({ message: "Unfollowed", followsCount: project?.followsCount || 0 });
  });

  // ==========================================
  // FEEDBACK (Anonymous)
  // ==========================================
  app.get("/api/projects/:id/feedback", async (req, res) => {
    const projectId = parseInt(req.params.id as string);
    if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });
    const feedbackList = await storage.getFeedback(projectId);
    const feedbackCount = await storage.getFeedbackCount(projectId);
    const averageRating = await storage.getAverageRating(projectId);
    res.json({ feedback: feedbackList, count: feedbackCount, averageRating });
  });

  app.post("/api/projects/:id/feedback", async (req, res) => {
    const projectId = parseInt(req.params.id as string);
    if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });
    try {
      const input = createFeedbackSchema.parse(req.body);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      // Anonymize: use hashed IP as fingerprint
      const rawIp = req.ip || req.headers["x-forwarded-for"] as string || "unknown";
      const fingerprint = crypto.createHash("sha256").update(rawIp + "vibe-feedback-salt").digest("hex").slice(0, 16);
      const entry = await storage.createFeedback(
        projectId,
        input.rating,
        fingerprint,
        input.answers ? JSON.stringify(input.answers) : undefined,
        input.summary || undefined,
      );
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.post("/api/feedback/summarize", async (req, res) => {
    const { rating, answers } = req.body;
    if (!rating || !Array.isArray(answers)) {
      return res.status(400).json({ message: "rating and answers are required" });
    }

    const ratingLabels: Record<number, string> = {
      1: "This is a vibe",
      2: "AI slop",
      3: "AI slop with a spark",
      4: "Has potential, needs work",
      5: "Not production-quality yet",
      6: "Getting somewhere",
      7: "Almost there",
      8: "Could ship this one day",
      9: "Nearly production-ready",
      10: "Super Bowl commercial ready",
    };

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const prompt = `Summarize this anonymous product feedback into 2-3 concise sentences. Be direct and constructive.\n\nRating: ${rating}/10 ("${ratingLabels[rating] || ""}")\n\nQ&A:\n${answers.map((a: { question: string; answer: string }) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")}`;

        const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a concise feedback summarizer. Produce a short, anonymous summary of product feedback. Never mention or identify the reviewer." },
              { role: "user", content: prompt },
            ],
            max_tokens: 200,
            temperature: 0.5,
          }),
        });

        if (openaiRes.ok) {
          const data = await openaiRes.json() as { choices: { message: { content: string } }[] };
          const summary = data.choices?.[0]?.message?.content?.trim();
          if (summary) return res.json({ summary });
        }
      } catch {
        // Fall through to manual summary
      }
    }

    // Fallback: build a simple summary without AI
    const label = ratingLabels[rating] || `${rating}/10`;
    const answerTexts = answers
      .filter((a: { answer: string }) => a.answer?.trim())
      .map((a: { answer: string }) => a.answer.trim());
    const summary = `Rated ${rating}/10 ("${label}"). ${answerTexts.join(" ")}`.trim();
    res.json({ summary });
  });

  // ==========================================
  // SOCIAL SHARES & CREDIT EARNING
  // ==========================================
  app.post("/api/social-shares", requireAuth, syncClerkUser, async (req, res) => {
    try {
      const input = submitSocialShareSchema.parse(req.body);
      const user = req.dbUser!;
      const project = await storage.getProject(input.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (project.status !== "active") return res.status(400).json({ message: "Can only share active projects" });
      if (project.ownerId === user.id) {
        return res.status(400).json({ message: "Cannot earn credits by sharing your own projects" });
      }
      const share = await storage.createSocialShare(user.id, input.projectId, input.platform, input.proofUrl);
      res.status(201).json(share);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.get("/api/social-shares", requireAuth, syncClerkUser, async (req, res) => {
    const shares = await storage.getSocialSharesByUser(req.dbUser!.id);
    res.json(shares);
  });

  // Balance endpoint: current listing balance + earned credit progress
  app.get("/api/balance", requireAuth, syncClerkUser, async (req, res) => {
    const user = req.dbUser!;
    const freshUser = await storage.getUser(user.id);
    if (!freshUser) return res.status(404).json({ message: "User not found" });
    const ledger = await storage.getCreditLedger(user.id);
    res.json({
      freeListingsRemaining: freshUser.freeListingsRemaining,
      paidListingCredits: freshUser.paidListingCredits,
      earnedCredits: freshUser.earnedCredits,
      earnedCreditsNeeded: 100,
      totalListingCredits: freshUser.freeListingsRemaining + freshUser.paidListingCredits,
      ledger,
    });
  });

  // Trigger on-demand verification (also runs automatically every 5 minutes)
  app.post("/api/social-shares/verify", async (_req, res) => {
    try {
      await verifySocialShares();
      res.json({ message: "Verification cycle completed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed";
      res.status(500).json({ message });
    }
  });

  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  app.get("/api/notifications", requireAuth, syncClerkUser, async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const userId = req.dbUser!.id;
    const notifs = await storage.getNotifications(userId, limit);
    const unreadCount = await storage.getUnreadNotificationCount(userId);
    res.json({ notifications: notifs, unreadCount });
  });

  app.post("/api/notifications/:id/read", requireAuth, syncClerkUser, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid notification ID" });
    const success = await storage.markNotificationRead(id, req.dbUser!.id);
    if (!success) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Marked as read" });
  });

  app.post("/api/notifications/read-all", requireAuth, syncClerkUser, async (req, res) => {
    const count = await storage.markAllNotificationsRead(req.dbUser!.id);
    res.json({ message: `Marked ${count} notifications as read`, count });
  });

  // ==========================================
  // STRIPE — Buy Listing Credits
  // ==========================================
  const PRICE_CREDIT_MAP: Record<string, number> = {
    "price_1SyevyJNQ49zVK9WlFpLkg0m": 1,   // $1 → 1 listing credit
    "price_1SyewIJNQ49zVK9W1zUjHvTW": 10,  // $5 → 10 listing credits
  };

  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error) {
      console.error("Error getting Stripe publishable key:", error);
      res.status(500).json({ message: "Stripe not configured" });
    }
  });

  app.get("/api/stripe/products", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency
        FROM stripe.products p
        JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount ASC
      `);
      res.json({ products: result.rows });
    } catch (error) {
      console.error("Error listing Stripe products:", error);
      res.status(500).json({ message: "Failed to load products" });
    }
  });

  app.post("/api/stripe/checkout", requireAuth, syncClerkUser, async (req, res) => {
    try {
      const { priceId } = req.body;
      if (!priceId || !PRICE_CREDIT_MAP[priceId]) {
        return res.status(400).json({ message: "Invalid price selected" });
      }

      const user = req.dbUser!;
      const stripe = await getUncachableStripeClient();
      if (!stripe) {
        return res.status(503).json({ message: "Stripe is not configured" });
      }
      const credits = PRICE_CREDIT_MAP[priceId];

      const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
      const host = req.get("host");
      const baseUrl = `${protocol}://${host}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "payment",
        success_url: `${baseUrl}/dashboard?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/dashboard?purchase=cancelled`,
        metadata: {
          userId: String(user.id),
          credits: String(credits),
          priceId,
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Checkout error:", error?.message || error);
      console.error("Checkout error stack:", error?.stack);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  const fulfilledSessions = new Set<string>();

  app.post("/api/stripe/fulfill", requireAuth, syncClerkUser, async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ message: "Session ID required" });

      if (fulfilledSessions.has(sessionId)) {
        return res.json({ message: "Already fulfilled", credits: 0 });
      }

      const stripe = await getUncachableStripeClient();
      if (!stripe) {
        return res.status(503).json({ message: "Stripe is not configured" });
      }
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== "paid") {
        return res.status(400).json({ message: "Payment not completed" });
      }

      const userId = parseInt(session.metadata?.userId || "0");
      const credits = parseInt(session.metadata?.credits || "0");
      if (!userId || !credits) {
        return res.status(400).json({ message: "Invalid session metadata" });
      }

      if (userId !== req.dbUser!.id) {
        return res.status(403).json({ message: "Session does not belong to this user" });
      }

      const existingLedger = await storage.getCreditLedger(userId);
      const alreadyFulfilled = existingLedger.some(
        (entry) => entry.type === "purchase" && entry.description?.includes(sessionId)
      );
      if (alreadyFulfilled) {
        fulfilledSessions.add(sessionId);
        return res.json({ message: "Already fulfilled", credits: 0 });
      }

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      await storage.updateUserCredits(userId, {
        paidListingCredits: user.paidListingCredits + credits,
      });

      await storage.addCreditLedgerEntry(
        userId, credits * 100, "purchase",
        `Purchased ${credits} listing credit${credits > 1 ? "s" : ""} via Stripe (${sessionId})`
      );

      await storage.createNotification(
        userId,
        "credit_earned",
        "Credits purchased!",
        `You purchased ${credits} listing credit${credits > 1 ? "s" : ""}. You can now submit more projects!`,
        "/submit"
      );

      fulfilledSessions.add(sessionId);
      res.json({ message: "Credits added", credits });
    } catch (error) {
      console.error("Fulfillment error:", error);
      res.status(500).json({ message: "Failed to fulfill purchase" });
    }
  });

  // ==========================================
  // ADMIN — maintenance & testing tools
  // ==========================================

  // Re-analyze an existing project (admin only)
  app.post("/api/admin/projects/:id/analyze", syncClerkUser, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid project ID" });
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: "Project not found" });

    // Prevent duplicate analysis — check if there's already an active job
    const existingJob = await storage.getJobByProject(project.id);
    if (existingJob && (existingJob.status === "queued" || existingJob.status === "running")) {
      return res.status(409).json({ message: "Analysis already in progress", job: existingJob });
    }

    // Create a new analysis job for this project
    const job = await storage.createJob(project.id);
    processJob(job.id).catch(console.error);
    res.json({ message: "Analysis started", job });
  });

  // ==========================================
  // HEALTH CHECK
  // ==========================================
  app.get("/api/hello", (_req, res) => {
    res.json({ message: "Vibe Index API is running" });
  });

  return httpServer;
}
