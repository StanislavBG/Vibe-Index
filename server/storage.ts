import { db } from "./db";
import {
  users, projects, categories, projectCategories, likes,
  categorySubscriptions, anonymousSubmissions, jobs, newsletterPreferences,
  projectFollows, socialShares, creditLedger, notifications,
  emailSends, unsubscribeTokens, canonicalTags, tagSynonyms, projectTags,
  feedback, systemConfig, creditEarningWindows, projectContributors,
  humanFeedback,
  type User, type InsertUser, type Project, type InsertProject,
  type Category, type InsertCategory, type Like, type CategorySubscription,
  type Job, type NewsletterPreference, type ProjectFollow,
  type SocialShare, type CreditLedgerEntry, type Notification,
  type EmailSend, type UnsubscribeToken,
  type CanonicalTag, type InsertCanonicalTag, type TagSynonym, type ProjectTag,
  type Feedback, type SystemConfig, type CreditEarningWindow,
  type ProjectContributor, type ContributorRole,
} from "@shared/schema";
import { eq, and, ilike, or, sql, desc, asc, count, gt, lt, isNotNull } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByClerkId(clerkId: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUserFromClerk(clerkId: string, username: string, email: string): Promise<User>;
  updateUserCredits(id: number, updates: Partial<Pick<User, "freeListingsRemaining" | "paidListingCredits" | "likesRemaining">>): Promise<User | undefined>;
  promoteUserToAdmin(email: string, freeListings?: number): Promise<void>;

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
  createJob(projectId: number, opts?: { type?: string; repoUrl?: string }): Promise<Job>;
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

  // Credit Earning Cap
  getCurrentEarningWindow(userId: number): Promise<CreditEarningWindow>;
  checkCreditCap(userId: number, capAmount?: number): Promise<{ canEarn: boolean; remaining: number; windowEnd: Date }>;
  incrementCreditEarning(userId: number, amount: number): Promise<number>;
  pruneExpiredEarningWindows(): Promise<number>;

  // Admin
  getAdminUsers(): Promise<User[]>;

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
  getTrendingProjects(days?: number, limit?: number): Promise<Project[]>;
  getProjectsGettingTraction(days?: number, limit?: number): Promise<Project[]>;

  // Bounce handling
  markUserBounced(userId: number): Promise<void>;
  unmarkUserBounced(userId: number): Promise<void>;

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

  // Feedback
  getFeedback(projectId: number): Promise<Feedback[]>;
  createFeedback(projectId: number, rating: number, fingerprint: string, answers?: string, summary?: string): Promise<Feedback>;
  getFeedbackCount(projectId: number): Promise<number>;
  getAverageRating(projectId: number): Promise<number | null>;

  // Project Contributors
  addProjectContributor(projectId: number, userId: number, role: ContributorRole): Promise<ProjectContributor>;
  getProjectContributors(projectId: number): Promise<(ProjectContributor & { user: { id: number; username: string | null } })[]>;
  getProjectsByContributor(userId: number, role?: ContributorRole): Promise<(Project & { contributorRole: string })[]>;
  isProjectContributor(projectId: number, userId: number): Promise<boolean>;
  removeProjectContributor(projectId: number, userId: number, role: ContributorRole): Promise<void>;
  setProjectDeveloper(projectId: number, userId: number): Promise<void>;

  // System Config
  getConfig(key: string): Promise<any>;
  setConfig(key: string, value: any, description?: string, updatedBy?: number): Promise<void>;
  getAllConfig(): Promise<SystemConfig[]>;
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

  async promoteUserToAdmin(email: string, freeListings?: number): Promise<void> {
    const setFields: Record<string, unknown> = { role: "admin" };
    if (freeListings !== undefined) {
      setFields.freeListingsRemaining = freeListings;
    }
    await db.update(users)
      .set(setFields)
      .where(eq(users.email, email));
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

  async createJob(projectId: number, opts?: { type?: string; repoUrl?: string }): Promise<Job> {
    const [job] = await db.insert(jobs).values({
      projectId,
      ...(opts?.type && { type: opts.type }),
      ...(opts?.repoUrl && { repoUrl: opts.repoUrl }),
    }).returning();
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

  // === CREDIT EARNING CAP ===

  // Get or create the current earning window for a user.
  // Window is 24h from the first earn in the period.
  async getCurrentEarningWindow(userId: number): Promise<CreditEarningWindow> {
    // Find an active window (where windowEnd > now)
    const [existing] = await db.select().from(creditEarningWindows)
      .where(and(
        eq(creditEarningWindows.userId, userId),
        gt(creditEarningWindows.windowEnd, new Date()),
      ))
      .orderBy(desc(creditEarningWindows.windowEnd))
      .limit(1);

    if (existing) return existing;

    // Create a new window: 24h from now
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const [created] = await db.insert(creditEarningWindows).values({
      userId,
      windowStart: now,
      windowEnd,
      earnedInWindow: 0,
    }).returning();
    return created;
  }

  // Check if user can still earn credits within the current window.
  // Returns { canEarn, remaining, windowEnd }.
  async checkCreditCap(userId: number, capAmount: number = 200): Promise<{ canEarn: boolean; remaining: number; windowEnd: Date }> {
    const window = await this.getCurrentEarningWindow(userId);
    const remaining = Math.max(0, capAmount - window.earnedInWindow);
    return {
      canEarn: remaining > 0,
      remaining,
      windowEnd: window.windowEnd,
    };
  }

  // Increment earned amount in current window.
  // Returns the actual amount credited (may be less than requested if cap hit).
  // Uses a transaction to prevent race conditions.
  async incrementCreditEarning(userId: number, amount: number): Promise<number> {
    const DEFAULT_CAP = 200;

    // Use a transaction to atomically check and update
    const result = await db.transaction(async (tx) => {
      // Get or create current window within the transaction
      const [existing] = await tx.select().from(creditEarningWindows)
        .where(and(
          eq(creditEarningWindows.userId, userId),
          gt(creditEarningWindows.windowEnd, new Date()),
        ))
        .orderBy(desc(creditEarningWindows.windowEnd))
        .limit(1);

      let window: CreditEarningWindow;
      if (existing) {
        window = existing;
      } else {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const [created] = await tx.insert(creditEarningWindows).values({
          userId,
          windowStart: now,
          windowEnd,
          earnedInWindow: 0,
        }).returning();
        window = created;
      }

      const remaining = Math.max(0, DEFAULT_CAP - window.earnedInWindow);
      if (remaining <= 0) return 0;

      const actualAmount = Math.min(amount, remaining);

      await tx.update(creditEarningWindows).set({
        earnedInWindow: sql`${creditEarningWindows.earnedInWindow} + ${actualAmount}`,
      }).where(eq(creditEarningWindows.id, window.id));

      return actualAmount;
    });

    return result;
  }

  // Prune expired earning windows (older than 7 days) to prevent table bloat.
  async pruneExpiredEarningWindows(): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const deleted = await db.delete(creditEarningWindows)
      .where(lt(creditEarningWindows.windowEnd, cutoff))
      .returning();
    return deleted.length;
  }

  // === ADMIN ===
  async getAdminUsers(): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, "admin"));
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

  // === FEEDBACK ===
  async getFeedback(projectId: number): Promise<Feedback[]> {
    return db.select().from(feedback)
      .where(eq(feedback.projectId, projectId))
      .orderBy(desc(feedback.createdAt));
  }

  async createFeedback(projectId: number, rating: number, fingerprint: string, answers?: string, summary?: string): Promise<Feedback> {
    const [entry] = await db.insert(feedback).values({
      projectId, rating, fingerprint,
      answers: answers || null,
      summary: summary || null,
    }).returning();
    return entry;
  }

  async getFeedbackCount(projectId: number): Promise<number> {
    const [result] = await db.select({ value: count() }).from(feedback)
      .where(eq(feedback.projectId, projectId));
    return result.value;
  }

  async getAverageRating(projectId: number): Promise<number | null> {
    const [result] = await db.select({
      avg: sql<string>`ROUND(AVG(${feedback.rating})::numeric, 1)`,
    }).from(feedback).where(eq(feedback.projectId, projectId));
    return result.avg ? parseFloat(result.avg) : null;
  }

  // === PROJECT CONTRIBUTORS ===
  async addProjectContributor(projectId: number, userId: number, role: ContributorRole): Promise<ProjectContributor> {
    const [created] = await db.insert(projectContributors)
      .values({ projectId, userId, role })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      // Already exists — return the existing record
      const [existing] = await db.select().from(projectContributors)
        .where(and(
          eq(projectContributors.projectId, projectId),
          eq(projectContributors.userId, userId),
          eq(projectContributors.role, role),
        ));
      return existing;
    }
    return created;
  }

  async getProjectContributors(projectId: number): Promise<(ProjectContributor & { user: { id: number; username: string | null } })[]> {
    const rows = await db.select({
      contributor: projectContributors,
      user: { id: users.id, username: users.username },
    })
      .from(projectContributors)
      .innerJoin(users, eq(projectContributors.userId, users.id))
      .where(eq(projectContributors.projectId, projectId))
      .orderBy(asc(projectContributors.createdAt));
    return rows.map(r => ({ ...r.contributor, user: r.user }));
  }

  async getProjectsByContributor(userId: number, role?: ContributorRole): Promise<(Project & { contributorRole: string })[]> {
    const conditions = [eq(projectContributors.userId, userId)];
    if (role) {
      conditions.push(eq(projectContributors.role, role));
    }
    const rows = await db.select({
      project: projects,
      contributorRole: projectContributors.role,
    })
      .from(projectContributors)
      .innerJoin(projects, eq(projectContributors.projectId, projects.id))
      .where(and(...conditions))
      .orderBy(desc(projects.createdAt));
    return rows.map(r => ({ ...r.project, contributorRole: r.contributorRole }));
  }

  async isProjectContributor(projectId: number, userId: number): Promise<boolean> {
    const [row] = await db.select({ id: projectContributors.id }).from(projectContributors)
      .where(and(
        eq(projectContributors.projectId, projectId),
        eq(projectContributors.userId, userId),
      ))
      .limit(1);
    return !!row;
  }

  async removeProjectContributor(projectId: number, userId: number, role: ContributorRole): Promise<void> {
    await db.delete(projectContributors)
      .where(and(
        eq(projectContributors.projectId, projectId),
        eq(projectContributors.userId, userId),
        eq(projectContributors.role, role),
      ));
  }

  async setProjectDeveloper(projectId: number, userId: number): Promise<void> {
    // Check if there's already a verified developer
    const [existingDev] = await db.select().from(projectContributors)
      .where(and(
        eq(projectContributors.projectId, projectId),
        eq(projectContributors.role, "developer"),
      ));
    if (existingDev && existingDev.userId !== userId) {
      throw new Error("Project already has a developer. Only one developer is allowed per project.");
    }
    if (existingDev && existingDev.userId === userId) {
      return; // already the developer
    }
    await db.insert(projectContributors)
      .values({ projectId, userId, role: "developer" })
      .onConflictDoNothing();
  }

  // === SYSTEM CONFIG (with in-memory cache) ===
  private configCache: Map<string, any> = new Map();
  private configCacheLoaded = false;
  private configCacheTimer: ReturnType<typeof setInterval> | null = null;

  private async ensureConfigCache(): Promise<void> {
    if (this.configCacheLoaded) return;
    try {
      const rows = await db.select().from(systemConfig);
      this.configCache.clear();
      for (const row of rows) {
        this.configCache.set(row.key, row.value);
      }
      this.configCacheLoaded = true;

      if (!this.configCacheTimer) {
        this.configCacheTimer = setInterval(() => {
          this.configCacheLoaded = false;
        }, 5 * 60 * 1000);
      }
    } catch (err) {
      console.warn('[config] Failed to load system_config (non-fatal):', err instanceof Error ? err.message : err);
      this.configCacheLoaded = true;
    }
  }

  private invalidateConfigCache(): void {
    this.configCacheLoaded = false;
  }

  async getConfig(key: string): Promise<any> {
    await this.ensureConfigCache();
    return this.configCache.get(key) ?? null;
  }

  async setConfig(key: string, value: any, description?: string, updatedBy?: number): Promise<void> {
    await db.insert(systemConfig)
      .values({
        key,
        value,
        description: description ?? null,
        updatedBy: updatedBy ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: {
          value,
          ...(description !== undefined && { description }),
          updatedBy: updatedBy ?? null,
          updatedAt: new Date(),
        },
      });
    this.invalidateConfigCache();
  }

  async getAllConfig(): Promise<SystemConfig[]> {
    return db.select().from(systemConfig).orderBy(asc(systemConfig.key));
  }

  // === DIGEST QUERIES ===
  async getDigestEligibleUsers(frequency: string): Promise<(User & { prefs: NewsletterPreference; categoryIds: number[] })[]> {
    // Get all users who have this frequency preference, are not bounced, and have at least one category subscription
    const rows = await db.select({
      user: users,
      prefs: newsletterPreferences,
    })
      .from(newsletterPreferences)
      .innerJoin(users, eq(newsletterPreferences.userId, users.id))
      .where(and(
        eq(newsletterPreferences.frequency, frequency),
        eq(newsletterPreferences.bounced, false),
      ));

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

  // === TRENDING PROJECTS ===
  async getTrendingProjects(days: number = 7, limit: number = 5): Promise<Project[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Projects created in the last N days with the highest combined likesCount + followsCount
    return db.select().from(projects)
      .where(and(
        eq(projects.status, "active"),
        gt(projects.createdAt, cutoff),
      ))
      .orderBy(sql`(${projects.likesCount} + ${projects.followsCount}) DESC`)
      .limit(limit);
  }

  // === PROJECTS GETTING TRACTION ===
  async getProjectsGettingTraction(days: number = 14, limit: number = 5): Promise<Project[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Projects that received human feedback or social shares in the last N days
    // with at least 2 interactions total, focusing on feedback activity
    const result = await db.execute(sql`
      SELECT DISTINCT p.* FROM projects p
      LEFT JOIN (
        SELECT project_id, COUNT(*) as cnt FROM human_feedback
        WHERE created_at > ${cutoff}
        GROUP BY project_id
      ) hf ON hf.project_id = p.id
      LEFT JOIN (
        SELECT project_id, COUNT(*) as cnt FROM social_shares
        WHERE created_at > ${cutoff} AND status = 'verified'
        GROUP BY project_id
      ) ss ON ss.project_id = p.id
      LEFT JOIN (
        SELECT project_id, COUNT(*) as cnt FROM feedback
        WHERE created_at > ${cutoff}
        GROUP BY project_id
      ) fb ON fb.project_id = p.id
      WHERE p.status = 'active'
        AND (COALESCE(hf.cnt, 0) + COALESCE(ss.cnt, 0) + COALESCE(fb.cnt, 0)) >= 2
      ORDER BY (COALESCE(hf.cnt, 0) + COALESCE(ss.cnt, 0) + COALESCE(fb.cnt, 0)) DESC
      LIMIT ${limit}
    `);
    return result.rows as unknown as Project[];
  }

  // === BOUNCE HANDLING ===
  async markUserBounced(userId: number): Promise<void> {
    await db.update(newsletterPreferences)
      .set({ bounced: true, updatedAt: new Date() })
      .where(eq(newsletterPreferences.userId, userId));
  }

  async unmarkUserBounced(userId: number): Promise<void> {
    await db.update(newsletterPreferences)
      .set({ bounced: false, updatedAt: new Date() })
      .where(eq(newsletterPreferences.userId, userId));
  }
}

export const storage = new DatabaseStorage();

// === SYSTEM CONFIG SEEDING ===

const DEFAULT_CONFIG: Record<string, { value: any; description: string }> = {
  'credit.earn.human_feedback': { value: { value: 25, unit: 'hundredths' }, description: 'Credits earned per human feedback submission' },
  'credit.earn.social_share': { value: { value: 20, unit: 'hundredths' }, description: 'Credits earned per verified social share' },
  'credit.earn.daily_cap': { value: { value: 200, unit: 'hundredths' }, description: 'Maximum credits earnable per 24h window' },
  'credit.spend.feedback_standard': { value: { value: 50, unit: 'credits' }, description: 'Cost for Standard AI feedback tier' },
  'credit.spend.feedback_deep': { value: { value: 100, unit: 'credits' }, description: 'Cost for Deep AI feedback tier' },
  'credit.spend.extra_slot': { value: { value: 25, unit: 'credits' }, description: 'Cost to unlock one additional listing slot' },
  'agent.tier.starter.rate_limit': { value: { value: 10, unit: 'per_hour' }, description: 'Submissions per hour for Starter agents' },
  'agent.tier.verified.rate_limit': { value: { value: 50, unit: 'per_hour' }, description: 'Submissions per hour for Verified agents' },
  'agent.tier.trusted.rate_limit': { value: { value: 200, unit: 'per_hour' }, description: 'Submissions per hour for Trusted agents' },
  'agent.reputation.auto_approve_threshold': { value: { value: 750, unit: 'score' }, description: 'Reputation score needed for auto-approve' },
  'agent.reputation.demotion_threshold': { value: { value: 30, unit: 'percent' }, description: 'Acceptance rate below which agents are demoted' },
};

/**
 * Seeds default system configuration values on startup.
 * Only inserts keys that don't already exist — never overwrites admin changes.
 */
export async function seedSystemConfig(): Promise<void> {
  for (const [key, { value, description }] of Object.entries(DEFAULT_CONFIG)) {
    const existing = await storage.getConfig(key);
    if (existing === null) {
      await storage.setConfig(key, value, description);
    }
  }
  console.log("[config] System config seeded");
}

// === BACKFILL: Project Contributors ===

/**
 * Backfill projectContributors for existing projects that have an ownerId
 * but no contributor records. Adds a 'registerer' role for each.
 * Safe to run multiple times (idempotent via onConflictDoNothing).
 */
export async function backfillProjectContributors(): Promise<void> {
  // Check if any projects with ownerId lack contributor records
  const projectsWithOwner = await db.select({ id: projects.id, ownerId: projects.ownerId })
    .from(projects)
    .where(isNotNull(projects.ownerId));

  if (projectsWithOwner.length === 0) {
    console.log("[backfill] No projects with owners to backfill");
    return;
  }

  // Check which ones already have contributor records
  let backfilled = 0;
  for (const p of projectsWithOwner) {
    if (!p.ownerId) continue;
    const existing = await db.select({ id: projectContributors.id })
      .from(projectContributors)
      .where(and(
        eq(projectContributors.projectId, p.id),
        eq(projectContributors.userId, p.ownerId),
      ))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(projectContributors)
        .values({ projectId: p.id, userId: p.ownerId, role: "registerer" })
        .onConflictDoNothing();
      backfilled++;
    }
  }

  if (backfilled > 0) {
    console.log(`[backfill] Added contributor records for ${backfilled} projects`);
  } else {
    console.log("[backfill] All projects already have contributor records");
  }
}
