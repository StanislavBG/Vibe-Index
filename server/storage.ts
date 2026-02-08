import { db } from "./db";
import {
  users, projects, categories, projectCategories, likes,
  categorySubscriptions, anonymousSubmissions,
  type User, type InsertUser, type Project, type InsertProject,
  type Category, type InsertCategory, type Like, type CategorySubscription,
} from "@shared/schema";
import { eq, and, ilike, or, sql, desc, asc, count } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserCredits(id: number, updates: Partial<Pick<User, "freeListingsRemaining" | "paidListingCredits" | "likesRemaining">>): Promise<User | undefined>;

  // Projects
  getProject(id: number): Promise<Project | undefined>;
  getProjects(opts: { search?: string; categoryId?: number; pricingModel?: string; limit?: number; offset?: number; sortBy?: string }): Promise<{ projects: Project[]; total: number }>;
  getProjectsByOwner(ownerId: number): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, updates: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: number): Promise<boolean>;
  incrementLikesCount(projectId: number, delta: number): Promise<void>;

  // Categories
  getCategories(): Promise<Category[]>;
  getCategory(id: number): Promise<Category | undefined>;
  getCategoryBySlug(slug: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  getProjectCategories(projectId: number): Promise<Category[]>;
  setProjectCategories(projectId: number, categoryIds: number[]): Promise<void>;

  // Likes
  getLike(userId: number, projectId: number): Promise<Like | undefined>;
  createLike(userId: number, projectId: number): Promise<Like>;
  deleteLike(userId: number, projectId: number): Promise<boolean>;
  getUserLikes(userId: number): Promise<Like[]>;

  // Category Subscriptions
  subscribe(email: string, categoryId: number): Promise<CategorySubscription>;
  unsubscribe(email: string, categoryId: number): Promise<boolean>;
  getSubscriptions(email: string): Promise<CategorySubscription[]>;

  // Anonymous Submissions
  getAnonymousSubmissionCount(fingerprint: string): Promise<number>;
  createAnonymousSubmission(fingerprint: string, projectId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // === USERS ===
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserCredits(id: number, updates: Partial<Pick<User, "freeListingsRemaining" | "paidListingCredits" | "likesRemaining">>): Promise<User | undefined> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  // === PROJECTS ===
  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjects(opts: { search?: string; categoryId?: number; pricingModel?: string; limit?: number; offset?: number; sortBy?: string }): Promise<{ projects: Project[]; total: number }> {
    const { search, categoryId, pricingModel, limit = 20, offset = 0, sortBy = "newest" } = opts;
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(projects.name, `%${search}%`),
          ilike(projects.shortDescription, `%${search}%`),
          ilike(projects.tags, `%${search}%`)
        )
      );
    }

    if (pricingModel) {
      conditions.push(eq(projects.pricingModel, pricingModel));
    }

    let query = db.select().from(projects);
    let countQuery = db.select({ value: count() }).from(projects);

    if (categoryId) {
      query = db.select().from(projects)
        .innerJoin(projectCategories, eq(projects.id, projectCategories.projectId))
        .where(and(eq(projectCategories.categoryId, categoryId), ...conditions)) as any;
      countQuery = db.select({ value: count() }).from(projects)
        .innerJoin(projectCategories, eq(projects.id, projectCategories.projectId))
        .where(and(eq(projectCategories.categoryId, categoryId), ...conditions)) as any;
    } else if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
      countQuery = countQuery.where(and(...conditions)) as any;
    }

    const orderBy = sortBy === "popular" ? desc(projects.likesCount) : desc(projects.createdAt);
    const rows = await (query as any).orderBy(orderBy).limit(limit).offset(offset);
    const [totalRow] = await countQuery;

    // Handle joined results - extract project data
    const projectList = rows.map((row: any) => row.projects || row);
    return { projects: projectList, total: totalRow.value };
  }

  async getProjectsByOwner(ownerId: number): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.ownerId, ownerId)).orderBy(desc(projects.createdAt));
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async updateProject(id: number, updates: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db.update(projects).set({ ...updates, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    return updated;
  }

  async deleteProject(id: number): Promise<boolean> {
    const result = await db.delete(projects).where(eq(projects.id, id)).returning();
    return result.length > 0;
  }

  async incrementLikesCount(projectId: number, delta: number): Promise<void> {
    await db.update(projects).set({
      likesCount: sql`${projects.likesCount} + ${delta}`,
    }).where(eq(projects.id, projectId));
  }

  // === CATEGORIES ===
  async getCategories(): Promise<Category[]> {
    return db.select().from(categories).orderBy(asc(categories.name));
  }

  async getCategory(id: number): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category;
  }

  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.slug, slug));
    return category;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [created] = await db.insert(categories).values(category).returning();
    return created;
  }

  async getProjectCategories(projectId: number): Promise<Category[]> {
    const rows = await db.select({ category: categories })
      .from(projectCategories)
      .innerJoin(categories, eq(projectCategories.categoryId, categories.id))
      .where(eq(projectCategories.projectId, projectId));
    return rows.map(r => r.category);
  }

  async setProjectCategories(projectId: number, categoryIds: number[]): Promise<void> {
    await db.delete(projectCategories).where(eq(projectCategories.projectId, projectId));
    if (categoryIds.length > 0) {
      await db.insert(projectCategories).values(
        categoryIds.map(categoryId => ({ projectId, categoryId }))
      );
    }
  }

  // === LIKES ===
  async getLike(userId: number, projectId: number): Promise<Like | undefined> {
    const [like] = await db.select().from(likes)
      .where(and(eq(likes.userId, userId), eq(likes.projectId, projectId)));
    return like;
  }

  async createLike(userId: number, projectId: number): Promise<Like> {
    const [like] = await db.insert(likes).values({ userId, projectId }).returning();
    return like;
  }

  async deleteLike(userId: number, projectId: number): Promise<boolean> {
    const result = await db.delete(likes)
      .where(and(eq(likes.userId, userId), eq(likes.projectId, projectId)))
      .returning();
    return result.length > 0;
  }

  async getUserLikes(userId: number): Promise<Like[]> {
    return db.select().from(likes).where(eq(likes.userId, userId));
  }

  // === CATEGORY SUBSCRIPTIONS ===
  async subscribe(email: string, categoryId: number): Promise<CategorySubscription> {
    const [sub] = await db.insert(categorySubscriptions)
      .values({ email, categoryId })
      .onConflictDoNothing()
      .returning();
    if (!sub) {
      const [existing] = await db.select().from(categorySubscriptions)
        .where(and(eq(categorySubscriptions.email, email), eq(categorySubscriptions.categoryId, categoryId)));
      return existing;
    }
    return sub;
  }

  async unsubscribe(email: string, categoryId: number): Promise<boolean> {
    const result = await db.delete(categorySubscriptions)
      .where(and(eq(categorySubscriptions.email, email), eq(categorySubscriptions.categoryId, categoryId)))
      .returning();
    return result.length > 0;
  }

  async getSubscriptions(email: string): Promise<CategorySubscription[]> {
    return db.select().from(categorySubscriptions).where(eq(categorySubscriptions.email, email));
  }

  // === ANONYMOUS SUBMISSIONS ===
  async getAnonymousSubmissionCount(fingerprint: string): Promise<number> {
    const [result] = await db.select({ value: count() }).from(anonymousSubmissions)
      .where(eq(anonymousSubmissions.fingerprint, fingerprint));
    return result.value;
  }

  async createAnonymousSubmission(fingerprint: string, projectId: number): Promise<void> {
    await db.insert(anonymousSubmissions).values({ fingerprint, projectId });
  }
}

export const storage = new DatabaseStorage();
