import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, hashPassword, comparePasswords, requireAuth } from "./auth";
import { registerUserSchema, loginUserSchema, submitProjectSchema, subscribeSchema } from "@shared/schema";
import { processJob, approveAndPublish, refineDraft, type ScrapedData } from "./scraper";
import crypto from "crypto";
import multer from "multer";

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

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  setupAuth(app);
  await seedCategories();

  // ==========================================
  // AUTH ROUTES
  // ==========================================
  app.post("/api/auth/register", async (req, res) => {
    try {
      const input = registerUserSchema.parse(req.body);
      const existingUser = await storage.getUserByUsername(input.username);
      if (existingUser) return res.status(400).json({ message: "Username already taken" });
      const existingEmail = await storage.getUserByEmail(input.email);
      if (existingEmail) return res.status(400).json({ message: "Email already registered" });
      const hashedPassword = await hashPassword(input.password);
      const user = await storage.createUser({ username: input.username, email: input.email, password: hashedPassword });
      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed after registration" });
        const { password, ...safeUser } = user;
        return res.status(201).json(safeUser);
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      throw err;
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    try { loginUserSchema.parse(req.body); } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
    }
    const passport = require("passport");
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.login(user, (err: any) => {
        if (err) return next(err);
        const { password, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { password, ...safeUser } = req.user!;
    res.json(safeUser);
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
    } catch (err: any) {
      return res.status(500).json({ message: "Voice search failed", detail: err.message });
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
    if (req.isAuthenticated()) {
      const like = await storage.getLike(req.user!.id, id);
      liked = !!like;
    }
    res.json({ ...project, categories: cats, liked, job: job || null });
  });

  // Submit project: creates project + kicks off scraper agent
  app.post("/api/projects", async (req, res) => {
    try {
      const input = submitProjectSchema.parse(req.body);
      const fingerprint = req.ip || req.headers["x-forwarded-for"] as string || "unknown";

      if (req.isAuthenticated()) {
        const user = req.user!;
        if (user.freeListingsRemaining <= 0 && user.paidListingCredits <= 0) {
          return res.status(403).json({ message: "No listing credits remaining. Purchase more to continue." });
        }
        const project = await storage.createProject({
          url: input.url,
          ownerId: user.id,
          claimed: true,
          status: "pending",
        });
        // Deduct credit
        if (user.freeListingsRemaining > 0) {
          await storage.updateUserCredits(user.id, { freeListingsRemaining: user.freeListingsRemaining - 1 });
        } else {
          await storage.updateUserCredits(user.id, { paidListingCredits: user.paidListingCredits - 1 });
        }
        // Create and start analysis job
        const job = await storage.createJob(project.id);
        processJob(job.id).catch(console.error); // fire and forget
        return res.status(201).json({ project, job });
      } else {
        // Anonymous submission
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

  app.put("/api/projects/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid project ID" });
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (project.ownerId !== req.user!.id) return res.status(403).json({ message: "Not authorized" });
    const { categoryIds, ...updates } = req.body;
    const updated = await storage.updateProject(id, updates);
    if (categoryIds && Array.isArray(categoryIds)) await storage.setProjectCategories(id, categoryIds);
    const user = req.user!;
    await storage.updateUserCredits(user.id, { likesRemaining: user.likesRemaining + 1 });
    const cats = await storage.getProjectCategories(id);
    res.json({ ...updated, categories: cats });
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid project ID" });
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (project.ownerId !== req.user!.id) return res.status(403).json({ message: "Not authorized" });
    await storage.deleteProject(id);
    const user = req.user!;
    if (user.freeListingsRemaining < 3) {
      await storage.updateUserCredits(user.id, { freeListingsRemaining: user.freeListingsRemaining + 1 });
    } else {
      await storage.updateUserCredits(user.id, { paidListingCredits: user.paidListingCredits + 1 });
    }
    res.json({ message: "Project deleted" });
  });

  app.get("/api/my-projects", requireAuth, async (req, res) => {
    const userProjects = await storage.getProjectsByOwner(req.user!.id);
    // Include job status for each project
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
    } catch (err: any) {
      return res.status(500).json({ message: "Voice processing failed", detail: err.message });
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
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to publish" });
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
  // LIKES
  // ==========================================
  app.post("/api/projects/:id/like", requireAuth, async (req, res) => {
    const projectId = parseInt(req.params.id as string);
    if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });
    const user = req.user!;
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

  app.delete("/api/projects/:id/like", requireAuth, async (req, res) => {
    const projectId = parseInt(req.params.id as string);
    if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });
    const user = req.user!;
    const deleted = await storage.deleteLike(user.id, projectId);
    if (!deleted) return res.status(400).json({ message: "Not liked" });
    await storage.incrementLikesCount(projectId, -1);
    await storage.updateUserCredits(user.id, { likesRemaining: user.likesRemaining + 1 });
    const project = await storage.getProject(projectId);
    res.json({ message: "Unliked", likesCount: project?.likesCount || 0 });
  });

  // ==========================================
  // SUBSCRIPTIONS — enhanced with preferences
  // ==========================================
  app.post("/api/subscribe", async (req, res) => {
    try {
      const input = subscribeSchema.parse(req.body);
      const results = [];
      for (const categoryId of input.categoryIds) {
        const sub = await storage.subscribe(input.email, categoryId);
        results.push(sub);
      }
      // Save newsletter preferences
      await storage.upsertNewsletterPreference(input.email, {
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

  app.delete("/api/subscribe", async (req, res) => {
    const { email, categoryId } = req.body;
    if (!email || !categoryId) return res.status(400).json({ message: "Email and categoryId required" });
    await storage.unsubscribe(email, parseInt(categoryId));
    res.json({ message: "Unsubscribed" });
  });

  // ==========================================
  // HEALTH CHECK
  // ==========================================
  app.get("/api/hello", (_req, res) => {
    res.json({ message: "Vibe Index API is running" });
  });

  return httpServer;
}
