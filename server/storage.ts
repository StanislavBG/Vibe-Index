import { db } from "./db";
import {
  users, projects, categories, projectCategories, likes,
  categorySubscriptions, anonymousSubmissions, jobs, newsletterPreferences,
  comments, projectFollows, socialShares, creditLedger, notifications,
  emailSends, unsubscribeTokens, canonicalTags, tagSynonyms, projectTags,
  type User, type InsertUser, type Project, type InsertProject,
  type Category, type InsertCategory, type Like, type CategorySubscription,
  type Job, type NewsletterPreference, type Comment, type ProjectFollow,
  type SocialShare, type CreditLedgerEntry, type Notification,
  type EmailSend, type UnsubscribeToken,
  type CanonicalTag, type InsertCanonicalTag, type TagSynonym, type ProjectTag,
} from "@shared/schema";
import { eq, and, ilike, or, sql, desc, asc, count } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByClerkId(clerkId: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUserFromClerk(clerkId: string, username: string, email: string): Promise<User>;
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

  // Jobs
  getJob(id: number): Promise<Job | undefined>;
  getJobByProject(projectId: number): Promise<Job | undefined>;
  getJobsByFingerprint(fingerprint: string): Promise<Job[]>;
  createJob(projectId: number): Promise<Job>;
  updateJob(id: number, updates: Partial<Pick<Job, "status" | "step" | "stepDetail" | "result" | "error">>): Promise<Job | undefined>;
  getActiveJobs(): Promise<Job[]>;

  // Category Subscriptions
  subscribe(userId: number, categoryId: number): Promise<CategorySubscription>;
  unsubscribe(userId: number, categoryId: number): Promise<boolean>;
  getSubscriptions(userId: number): Promise<CategorySubscription[]>;

  // Newsletter Preferences
  getNewsletterPreference(userId: number): Promise<NewsletterPreference | undefined>;
  upsertNewsletterPreference(userId: number, prefs: { frequency?: string; interests?: string; pricingFilter?: string; maxProjects?: number }): Promise<NewsletterPreference>;

  // Anonymous Submissions
  getAnonymousSubmissionCount(fingerprint: string): Promise<number>;
  createAnonymousSubmission(fingerprint: string, projectId: number): Promise<void>;

  // Comments
  getComments(projectId: number): Promise<(Comment & { username: string })[]>;
  createComment(projectId: number, userId: number, content: string): Promise<Comment>;
  deleteComment(id: number, userId: number): Promise<boolean>;

  // Project Follows
  getFollow(userId: number, projectId: number): Promise<ProjectFollow | undefined>;
  createFollow(userId: number, projectId: number): Promise<ProjectFollow>;
  deleteFollow(userId: number, projectId: number): Promise<boolean>;
  incrementFollowsCount(projectId: number, delta: number): Promise<void>;

  // Social Shares & Credits
  createSocialShare(userId: number, projectId: number, platform: string, proofUrl: string): Promise<SocialShare>;
  getSocialSharesByUser(userId: number): Promise<SocialShare[]>;
  getPendingSocialShares(): Promise<SocialShare[]>;
  updateSocialShare(id: number, updates: Partial<Pick<SocialShare, "status" | "verifiedAt">>): Promise<SocialShare | undefined>;
  addCreditLedgerEntry(userId: number, amount: number, type: string, description: string, sourceId?: number, sourceType?: string): Promise<CreditLedgerEntry>;
  getCreditLedger(userId: number): Promise<CreditLedgerEntry[]>;
  getEarnedCredits(userId: number): Promise<number>;
  updateEarnedCredits(userId: number, amount: number): Promise<void>;
  convertEarnedCredits(userId: number): Promise<number>;

  // Notifications
  createNotification(userId: number, type: string, title: string, message: string, linkUrl?: string): Promise<Notification>;
  getNotifications(userId: number, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: number): Promise<number>;
  markNotificationRead(id: number, userId: number): Promise<boolean>;
  markAllNotificationsRead(userId: number): Promise<number>;

  // Email Sends
  createEmailSend(userId: number, subject: string, frequency: string, projectIds: number[]): Promise<EmailSend>;
  updateEmailSend(id: number, updates: Partial<Pick<EmailSend, "status" | "error" | "sentAt">>): Promise<EmailSend | undefined>;
  getRecentEmailSend(userId: number, frequency: string): Promise<EmailSend | undefined>;
  getSentProjectIds(userId: number): Promise<number[]>;

  // Unsubscribe Tokens
  getOrCreateUnsubscribeToken(userId: number): Promise<string>;
  getUserByUnsubscribeToken(token: string): Promise<User | undefined>;
  deleteAllSubscriptions(userId: number): Promise<void>;

  // Digest queries
  getDigestEligibleUsers(frequency: string): Promise<(User & { prefs: NewsletterPreference; categoryIds: number[] })[]>;
  getProjectsForDigest(categoryIds: number[], pricingFilter: string | null, excludeProjectIds: number[], limit: number): Promise<Project[]>;

  // Canonical Tags
  getCanonicalTags(opts?: { search?: string; limit?: number }): Promise<CanonicalTag[]>;
  getCanonicalTag(id: number): Promise<CanonicalTag | undefined>;
  getCanonicalTagBySlug(slug: string): Promise<CanonicalTag | undefined>;
  createCanonicalTag(tag: InsertCanonicalTag): Promise<CanonicalTag>;
  incrementTagUsageCount(tagId: number, delta: number): Promise<void>;

  // Tag Synonyms
  getSynonymByValue(synonym: string): Promise<(TagSynonym & { canonicalTag: CanonicalTag }) | undefined>;
  getSynonymsForTag(canonicalTagId: number): Promise<TagSynonym[]>;
  createSynonym(synonym: string, canonicalTagId: number): Promise<TagSynonym>;

  // Project Tags (junction)
  getProjectTags(projectId: number): Promise<CanonicalTag[]>;
  setProjectTags(projectId: number, canonicalTagIds: number[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // === USERS ===
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByClerkId(clerkId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId));
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

  async upsertUserFromClerk(clerkId: string, username: string, email: string): Promise<User> {
    const existing = await this.getUserByClerkId(clerkId);
    if (existing) {
      const [updated] = await db.update(users)
        .set({ username, email })
        .where(eq(users.clerkId, clerkId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(users)
      .values({ clerkId, username, email })
      .returning();
    return created;
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

    // Only show active projects in public listing
    conditions.push(eq(projects.status, "active"));

    if (pricingModel) {
      conditions.push(eq(projects.pricingModel, pricingModel));
    }

    // Semantic search: use PostgreSQL full-text search with ts_vector/ts_query
    // plus ILIKE fallback for partial matches
    const hasSearch = search && search.trim().length > 0;
    const sanitizedSearch = hasSearch ? search.trim().replace(/[^\w\s-]/g, " ").trim() : "";

    if (hasSearch) {
      // Build a tsquery from the search terms (OR between words for broader matches)
      const words = sanitizedSearch.split(/\s+/).filter(Boolean);
      const tsQueryStr = words.map(w => `${w}:*`).join(" | ");

      // Full-text match OR substring fallback
      conditions.push(
        or(
          sql`(
            to_tsvector('english', coalesce(${projects.name}, '') || ' ' || coalesce(${projects.shortDescription}, '') || ' ' || coalesce(${projects.longDescription}, '') || ' ' || coalesce(${projects.tags}, ''))
            @@ to_tsquery('english', ${tsQueryStr})
          )`,
          ilike(projects.name, `%${sanitizedSearch}%`),
          ilike(projects.shortDescription, `%${sanitizedSearch}%`),
          ilike(projects.longDescription, `%${sanitizedSearch}%`),
          ilike(projects.tags, `%${sanitizedSearch}%`)
        )
      );
    }

    // Relevance ranking expression
    const relevanceExpr = hasSearch
      ? sql`(
          ts_rank_cd(
            to_tsvector('english', coalesce(${projects.name}, '') || ' ' || coalesce(${projects.shortDescription}, '') || ' ' || coalesce(${projects.longDescription}, '') || ' ' || coalesce(${projects.tags}, '')),
            to_tsquery('english', ${sanitizedSearch.split(/\s+/).filter(Boolean).map(w => `${w}:*`).join(" | ")})
          )
          + CASE WHEN lower(coalesce(${projects.name}, '')) LIKE ${`%${sanitizedSearch.toLowerCase()}%`} THEN 2.0 ELSE 0 END
          + CASE WHEN lower(coalesce(${projects.tags}, '')) LIKE ${`%${sanitizedSearch.toLowerCase()}%`} THEN 1.0 ELSE 0 END
        )`
      : sql`0`;

    let query;
    let countQuery;

    if (categoryId) {
      const baseWhere = and(eq(projectCategories.categoryId, categoryId), ...conditions);
      query = db.select({
        projects: projects,
        relevance: relevanceExpr,
      }).from(projects)
        .innerJoin(projectCategories, eq(projects.id, projectCategories.projectId))
        .where(baseWhere);
      countQuery = db.select({ value: count() }).from(projects)
        .innerJoin(projectCategories, eq(projects.id, projectCategories.projectId))
        .where(baseWhere);
    } else {
      const baseWhere = conditions.length > 0 ? and(...conditions) : undefined;
      query = db.select({
        projects: projects,
        relevance: relevanceExpr,
      }).from(projects)
        .where(baseWhere);
      countQuery = db.select({ value: count() }).from(projects)
        .where(baseWhere);
    }

    // Sort: relevance when searching, otherwise newest/popular
    let orderBy;
    if (hasSearch && (sortBy === "relevance" || sortBy === "newest")) {
      orderBy = sql`${relevanceExpr} DESC`;
    } else if (sortBy === "popular") {
      orderBy = desc(projects.likesCount);
    } else {
      orderBy = desc(projects.createdAt);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle dynamic query builder loses type info across branches
    const rows = await (query as any).orderBy(orderBy).limit(limit).offset(offset);
    const [totalRow] = await countQuery;

    const projectList: Project[] = rows.map((row: { projects?: Project }) => row.projects ?? row);
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

  // === JOBS ===
  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job;
  }

  async getJobByProject(projectId: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs)
      .where(eq(jobs.projectId, projectId))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    return job;
  }

  async getJobsByFingerprint(fingerprint: string): Promise<Job[]> {
    const subs = await db.select().from(anonymousSubmissions)
      .where(eq(anonymousSubmissions.fingerprint, fingerprint));
    if (subs.length === 0) return [];
    const projectIds = subs.map(s => s.projectId);

    // Single query using DISTINCT ON to get the latest job per project
    const result = await db.select().from(jobs)
      .where(sql`${jobs.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(jobs.projectId, desc(jobs.createdAt));

    // Keep only the most recent job per projectId
    const latestByProject = new Map<number, Job>();
    for (const job of result) {
      if (!latestByProject.has(job.projectId)) {
        latestByProject.set(job.projectId, job);
      }
    }
    return Array.from(latestByProject.values());
  }

  async createJob(projectId: number): Promise<Job> {
    const [job] = await db.insert(jobs).values({ projectId }).returning();
    return job;
  }

  async updateJob(id: number, updates: Partial<Pick<Job, "status" | "step" | "stepDetail" | "result" | "error">>): Promise<Job | undefined> {
    const [job] = await db.update(jobs).set({ ...updates, updatedAt: new Date() }).where(eq(jobs.id, id)).returning();
    return job;
  }

  async getActiveJobs(): Promise<Job[]> {
    return db.select().from(jobs)
      .where(or(eq(jobs.status, "queued"), eq(jobs.status, "running")))
      .orderBy(asc(jobs.createdAt));
  }

  // === CATEGORY SUBSCRIPTIONS ===
  async subscribe(userId: number, categoryId: number): Promise<CategorySubscription> {
    const [sub] = await db.insert(categorySubscriptions)
      .values({ userId, categoryId })
      .onConflictDoNothing()
      .returning();
    if (!sub) {
      const [existing] = await db.select().from(categorySubscriptions)
        .where(and(eq(categorySubscriptions.userId, userId), eq(categorySubscriptions.categoryId, categoryId)));
      return existing;
    }
    return sub;
  }

  async unsubscribe(userId: number, categoryId: number): Promise<boolean> {
    const result = await db.delete(categorySubscriptions)
      .where(and(eq(categorySubscriptions.userId, userId), eq(categorySubscriptions.categoryId, categoryId)))
      .returning();
    return result.length > 0;
  }

  async getSubscriptions(userId: number): Promise<CategorySubscription[]> {
    return db.select().from(categorySubscriptions).where(eq(categorySubscriptions.userId, userId));
  }

  // === NEWSLETTER PREFERENCES ===
  async getNewsletterPreference(userId: number): Promise<NewsletterPreference | undefined> {
    const [pref] = await db.select().from(newsletterPreferences).where(eq(newsletterPreferences.userId, userId));
    return pref;
  }

  async upsertNewsletterPreference(userId: number, prefs: { frequency?: string; interests?: string; pricingFilter?: string; maxProjects?: number }): Promise<NewsletterPreference> {
    const existing = await this.getNewsletterPreference(userId);
    if (existing) {
      const [updated] = await db.update(newsletterPreferences)
        .set({ ...prefs, updatedAt: new Date() })
        .where(eq(newsletterPreferences.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(newsletterPreferences)
      .values({ userId, ...prefs })
      .returning();
    return created;
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

  // === COMMENTS ===
  async getComments(projectId: number): Promise<(Comment & { username: string })[]> {
    const rows = await db.select({
      comment: comments,
      username: users.username,
    })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.projectId, projectId))
      .orderBy(desc(comments.createdAt));
    return rows.map(r => ({ ...r.comment, username: r.username }));
  }

  async createComment(projectId: number, userId: number, content: string): Promise<Comment> {
    const [comment] = await db.insert(comments).values({ projectId, userId, content }).returning();
    await db.update(projects).set({
      commentsCount: sql`${projects.commentsCount} + 1`,
    }).where(eq(projects.id, projectId));
    return comment;
  }

  async deleteComment(id: number, userId: number): Promise<boolean> {
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    if (!comment || comment.userId !== userId) return false;
    await db.delete(comments).where(eq(comments.id, id));
    await db.update(projects).set({
      commentsCount: sql`GREATEST(${projects.commentsCount} - 1, 0)`,
    }).where(eq(projects.id, comment.projectId));
    return true;
  }

  // === PROJECT FOLLOWS ===
  async getFollow(userId: number, projectId: number): Promise<ProjectFollow | undefined> {
    const [follow] = await db.select().from(projectFollows)
      .where(and(eq(projectFollows.userId, userId), eq(projectFollows.projectId, projectId)));
    return follow;
  }

  async createFollow(userId: number, projectId: number): Promise<ProjectFollow> {
    const [follow] = await db.insert(projectFollows).values({ userId, projectId }).returning();
    return follow;
  }

  async deleteFollow(userId: number, projectId: number): Promise<boolean> {
    const result = await db.delete(projectFollows)
      .where(and(eq(projectFollows.userId, userId), eq(projectFollows.projectId, projectId)))
      .returning();
    return result.length > 0;
  }

  async incrementFollowsCount(projectId: number, delta: number): Promise<void> {
    await db.update(projects).set({
      followsCount: sql`${projects.followsCount} + ${delta}`,
    }).where(eq(projects.id, projectId));
  }

  // === SOCIAL SHARES & CREDITS ===
  async createSocialShare(userId: number, projectId: number, platform: string, proofUrl: string): Promise<SocialShare> {
    const verifyAfter = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    const [share] = await db.insert(socialShares).values({
      userId, projectId, platform, proofUrl, verifyAfter,
      status: "pending", creditAmount: 20,
    }).returning();
    return share;
  }

  async getSocialSharesByUser(userId: number): Promise<SocialShare[]> {
    return db.select().from(socialShares)
      .where(eq(socialShares.userId, userId))
      .orderBy(desc(socialShares.createdAt));
  }

  async getPendingSocialShares(): Promise<SocialShare[]> {
    return db.select().from(socialShares)
      .where(and(
        eq(socialShares.status, "pending"),
        sql`${socialShares.verifyAfter} <= NOW()`
      ))
      .orderBy(asc(socialShares.createdAt));
  }

  async updateSocialShare(id: number, updates: Partial<Pick<SocialShare, "status" | "verifiedAt">>): Promise<SocialShare | undefined> {
    const [share] = await db.update(socialShares).set(updates).where(eq(socialShares.id, id)).returning();
    return share;
  }

  async addCreditLedgerEntry(userId: number, amount: number, type: string, description: string, sourceId?: number, sourceType?: string): Promise<CreditLedgerEntry> {
    const [entry] = await db.insert(creditLedger).values({
      userId, amount, type, description, sourceId, sourceType,
    }).returning();
    return entry;
  }

  async getCreditLedger(userId: number): Promise<CreditLedgerEntry[]> {
    return db.select().from(creditLedger)
      .where(eq(creditLedger.userId, userId))
      .orderBy(desc(creditLedger.createdAt));
  }

  async getEarnedCredits(userId: number): Promise<number> {
    const [user] = await db.select({ earnedCredits: users.earnedCredits }).from(users).where(eq(users.id, userId));
    return user?.earnedCredits ?? 0;
  }

  async updateEarnedCredits(userId: number, amount: number): Promise<void> {
    await db.update(users).set({
      earnedCredits: sql`${users.earnedCredits} + ${amount}`,
    }).where(eq(users.id, userId));
  }

  // Convert earned credits to listing credits when they reach 100
  async convertEarnedCredits(userId: number): Promise<number> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return 0;
    const fullCredits = Math.floor(user.earnedCredits / 100);
    if (fullCredits > 0) {
      const remainder = user.earnedCredits % 100;
      await db.update(users).set({
        earnedCredits: remainder,
        paidListingCredits: sql`${users.paidListingCredits} + ${fullCredits}`,
      }).where(eq(users.id, userId));
    }
    return fullCredits;
  }

  // === NOTIFICATIONS ===
  async createNotification(userId: number, type: string, title: string, message: string, linkUrl?: string): Promise<Notification> {
    const [notif] = await db.insert(notifications).values({
      userId, type, title, message, linkUrl,
    }).returning();
    return notif;
  }

  async getNotifications(userId: number, limit = 20): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadNotificationCount(userId: number): Promise<number> {
    const [result] = await db.select({ value: count() }).from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return result.value;
  }

  async markNotificationRead(id: number, userId: number): Promise<boolean> {
    const result = await db.update(notifications).set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async markAllNotificationsRead(userId: number): Promise<number> {
    const result = await db.update(notifications).set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
      .returning();
    return result.length;
  }

  // === EMAIL SENDS ===
  async createEmailSend(userId: number, subject: string, frequency: string, projectIds: number[]): Promise<EmailSend> {
    const [send] = await db.insert(emailSends).values({
      userId, subject, frequency, projectIds: JSON.stringify(projectIds), status: "queued",
    }).returning();
    return send;
  }

  async updateEmailSend(id: number, updates: Partial<Pick<EmailSend, "status" | "error" | "sentAt">>): Promise<EmailSend | undefined> {
    const [send] = await db.update(emailSends).set(updates).where(eq(emailSends.id, id)).returning();
    return send;
  }

  async getRecentEmailSend(userId: number, frequency: string): Promise<EmailSend | undefined> {
    const [send] = await db.select().from(emailSends)
      .where(and(
        eq(emailSends.userId, userId),
        eq(emailSends.frequency, frequency),
        eq(emailSends.status, "sent"),
      ))
      .orderBy(desc(emailSends.sentAt))
      .limit(1);
    return send;
  }

  async getSentProjectIds(userId: number): Promise<number[]> {
    const sends = await db.select({ projectIds: emailSends.projectIds })
      .from(emailSends)
      .where(and(eq(emailSends.userId, userId), eq(emailSends.status, "sent")));
    const allIds: number[] = [];
    for (const s of sends) {
      if (s.projectIds) {
        try { allIds.push(...JSON.parse(s.projectIds)); } catch { /* ignore */ }
      }
    }
    return Array.from(new Set(allIds));
  }

  // === UNSUBSCRIBE TOKENS ===
  async getOrCreateUnsubscribeToken(userId: number): Promise<string> {
    const [existing] = await db.select().from(unsubscribeTokens)
      .where(eq(unsubscribeTokens.userId, userId));
    if (existing) return existing.token;
    const { randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("hex");
    await db.insert(unsubscribeTokens).values({ userId, token });
    return token;
  }

  async getUserByUnsubscribeToken(token: string): Promise<User | undefined> {
    const [row] = await db.select({ user: users })
      .from(unsubscribeTokens)
      .innerJoin(users, eq(unsubscribeTokens.userId, users.id))
      .where(eq(unsubscribeTokens.token, token));
    return row?.user;
  }

  async deleteAllSubscriptions(userId: number): Promise<void> {
    await db.delete(categorySubscriptions).where(eq(categorySubscriptions.userId, userId));
    await db.delete(newsletterPreferences).where(eq(newsletterPreferences.userId, userId));
  }

  // === CANONICAL TAGS ===
  async getCanonicalTags(opts: { search?: string; limit?: number } = {}): Promise<CanonicalTag[]> {
    const { search, limit = 100 } = opts;
    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      return db.select().from(canonicalTags)
        .where(or(
          ilike(canonicalTags.name, term),
          ilike(canonicalTags.slug, term),
        ))
        .orderBy(desc(canonicalTags.usageCount))
        .limit(limit);
    }
    return db.select().from(canonicalTags)
      .orderBy(desc(canonicalTags.usageCount))
      .limit(limit);
  }

  async getCanonicalTag(id: number): Promise<CanonicalTag | undefined> {
    const [tag] = await db.select().from(canonicalTags).where(eq(canonicalTags.id, id));
    return tag;
  }

  async getCanonicalTagBySlug(slug: string): Promise<CanonicalTag | undefined> {
    const [tag] = await db.select().from(canonicalTags).where(eq(canonicalTags.slug, slug));
    return tag;
  }

  async createCanonicalTag(tag: InsertCanonicalTag): Promise<CanonicalTag> {
    const [created] = await db.insert(canonicalTags).values(tag).returning();
    return created;
  }

  async incrementTagUsageCount(tagId: number, delta: number): Promise<void> {
    await db.update(canonicalTags).set({
      usageCount: sql`GREATEST(${canonicalTags.usageCount} + ${delta}, 0)`,
    }).where(eq(canonicalTags.id, tagId));
  }

  // === TAG SYNONYMS ===
  async getSynonymByValue(synonym: string): Promise<(TagSynonym & { canonicalTag: CanonicalTag }) | undefined> {
    const [row] = await db.select({
      synonym: tagSynonyms,
      canonicalTag: canonicalTags,
    })
      .from(tagSynonyms)
      .innerJoin(canonicalTags, eq(tagSynonyms.canonicalTagId, canonicalTags.id))
      .where(eq(tagSynonyms.synonym, synonym));
    if (!row) return undefined;
    return { ...row.synonym, canonicalTag: row.canonicalTag };
  }

  async getSynonymsForTag(canonicalTagId: number): Promise<TagSynonym[]> {
    return db.select().from(tagSynonyms)
      .where(eq(tagSynonyms.canonicalTagId, canonicalTagId));
  }

  async createSynonym(synonym: string, canonicalTagId: number): Promise<TagSynonym> {
    const [created] = await db.insert(tagSynonyms)
      .values({ synonym, canonicalTagId })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const [existing] = await db.select().from(tagSynonyms)
        .where(eq(tagSynonyms.synonym, synonym));
      return existing;
    }
    return created;
  }

  // === PROJECT TAGS ===
  async getProjectTags(projectId: number): Promise<CanonicalTag[]> {
    const rows = await db.select({ tag: canonicalTags })
      .from(projectTags)
      .innerJoin(canonicalTags, eq(projectTags.canonicalTagId, canonicalTags.id))
      .where(eq(projectTags.projectId, projectId))
      .orderBy(desc(canonicalTags.usageCount));
    return rows.map(r => r.tag);
  }

  async setProjectTags(projectId: number, canonicalTagIds: number[]): Promise<void> {
    // Get existing tags to adjust usage counts
    const existing = await db.select().from(projectTags)
      .where(eq(projectTags.projectId, projectId));
    const existingIds = existing.map(e => e.canonicalTagId);

    // Decrement removed tags
    const removed = existingIds.filter(id => !canonicalTagIds.includes(id));
    for (const tagId of removed) {
      await this.incrementTagUsageCount(tagId, -1);
    }

    // Delete all and re-insert
    await db.delete(projectTags).where(eq(projectTags.projectId, projectId));
    if (canonicalTagIds.length > 0) {
      await db.insert(projectTags).values(
        canonicalTagIds.map(canonicalTagId => ({ projectId, canonicalTagId }))
      );
    }

    // Increment new tags
    const added = canonicalTagIds.filter(id => !existingIds.includes(id));
    for (const tagId of added) {
      await this.incrementTagUsageCount(tagId, 1);
    }
  }

  // === DIGEST QUERIES ===
  async getDigestEligibleUsers(frequency: string): Promise<(User & { prefs: NewsletterPreference; categoryIds: number[] })[]> {
    // Get all users who have this frequency preference and at least one category subscription
    const rows = await db.select({
      user: users,
      prefs: newsletterPreferences,
    })
      .from(newsletterPreferences)
      .innerJoin(users, eq(newsletterPreferences.userId, users.id))
      .where(eq(newsletterPreferences.frequency, frequency));

    const results: (User & { prefs: NewsletterPreference; categoryIds: number[] })[] = [];
    for (const row of rows) {
      const subs = await db.select({ categoryId: categorySubscriptions.categoryId })
        .from(categorySubscriptions)
        .where(eq(categorySubscriptions.userId, row.user.id));
      if (subs.length > 0) {
        results.push({
          ...row.user,
          prefs: row.prefs,
          categoryIds: subs.map(s => s.categoryId),
        });
      }
    }
    return results;
  }

  async getProjectsForDigest(categoryIds: number[], pricingFilter: string | null, excludeProjectIds: number[], limit: number): Promise<Project[]> {
    const conditions = [eq(projects.status, "active")];

    if (pricingFilter && pricingFilter !== "all") {
      conditions.push(eq(projects.pricingModel, pricingFilter));
    }

    if (excludeProjectIds.length > 0) {
      conditions.push(
        sql`${projects.id} NOT IN (${sql.join(excludeProjectIds.map(id => sql`${id}`), sql`, `)})`
      );
    }

    // Get projects that belong to any of the subscribed categories
    const rows = await db.selectDistinctOn([projects.id], { project: projects })
      .from(projects)
      .innerJoin(projectCategories, eq(projects.id, projectCategories.projectId))
      .where(and(
        ...conditions,
        sql`${projectCategories.categoryId} IN (${sql.join(categoryIds.map(id => sql`${id}`), sql`, `)})`
      ))
      .orderBy(projects.id, desc(projects.createdAt))
      .limit(limit);

    return rows.map(r => r.project);
  }
}

export const storage = new DatabaseStorage();
