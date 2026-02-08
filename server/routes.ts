import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { setupAuth, requireAuth, syncClerkUser } from "./auth";
import { getAuth } from "@clerk/express";
import { submitProjectSchema, subscribeSchema } from "@shared/schema";
import { processJob } from "./scraper";
import crypto from "crypto";

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
  app.get("/api/auth/me", syncClerkUser, async (req, res) => {
    const user = req.dbUser!;
    res.json({
      id: user.id,
      clerkId: user.clerkId,
      username: user.username,
      email: user.email,
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

  app.get("/api/projects/:id", async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid project ID" });
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const cats = await storage.getProjectCategories(id);
    const job = await storage.getJobByProject(id);
    let liked = false;
    const auth = getAuth(req);
    if (auth?.userId) {
      const dbUser = await storage.getUserByClerkId(auth.userId);
      if (dbUser) {
        const like = await storage.getLike(dbUser.id, id);
        liked = !!like;
      }
    }
    res.json({ ...project, categories: cats, liked, job: job || null });
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
