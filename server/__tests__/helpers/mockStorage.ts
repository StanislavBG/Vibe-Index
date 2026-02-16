import type { IStorage } from '../../storage';
import type {
  User, InsertUser, Project, InsertProject,
  Category, InsertCategory, Like, CategorySubscription,
  Job, NewsletterPreference, ProjectFollow,
  SocialShare, CreditLedgerEntry, Notification,
  EmailSend, UnsubscribeToken,
  CanonicalTag, InsertCanonicalTag, TagSynonym, ProjectTag,
  Feedback, SystemConfig,
} from '@shared/schema';

/** Auto-incrementing ID generator */
function makeIdGen(start = 1) {
  let id = start;
  return () => id++;
}

/**
 * Creates an in-memory mock implementation of IStorage.
 * Only the methods exercised by current smoke tests are fully implemented;
 * the rest throw "Not implemented in mock" so missing coverage is obvious.
 */
export function createMockStorage(): IStorage {
  // In-memory stores
  const usersStore: User[] = [];
  const projectsStore: Project[] = [];
  const categoriesStore: Category[] = [];
  const likesStore: Like[] = [];
  const feedbackStore: Feedback[] = [];
  const creditLedgerStore: CreditLedgerEntry[] = [];
  const notificationsStore: Notification[] = [];
  const configStore: Map<string, any> = new Map();

  const nextUserId = makeIdGen();
  const nextProjectId = makeIdGen();
  const nextCategoryId = makeIdGen();
  const nextLikeId = makeIdGen();
  const nextFeedbackId = makeIdGen();
  const nextCreditLedgerId = makeIdGen();
  const nextNotificationId = makeIdGen();

  function notImplemented(name: string): never {
    throw new Error(`Not implemented in mock: ${name}`);
  }

  const storage: IStorage = {
    // === USERS ===
    async getUser(id: number): Promise<User | undefined> {
      return usersStore.find(u => u.id === id);
    },

    async getUserByClerkId(clerkId: string): Promise<User | undefined> {
      return usersStore.find(u => u.clerkId === clerkId);
    },

    async getUserByUsername(username: string): Promise<User | undefined> {
      return usersStore.find(u => u.username === username);
    },

    async getUserByEmail(email: string): Promise<User | undefined> {
      return usersStore.find(u => u.email === email);
    },

    async createUser(insertUser: InsertUser): Promise<User> {
      const user: User = {
        id: nextUserId(),
        clerkId: insertUser.clerkId,
        username: insertUser.username,
        email: insertUser.email,
        role: insertUser.role ?? 'user',
        freeListingsRemaining: insertUser.freeListingsRemaining ?? 3,
        paidListingCredits: insertUser.paidListingCredits ?? 0,
        likesRemaining: insertUser.likesRemaining ?? 10,
        earnedCredits: insertUser.earnedCredits ?? 0,
        createdAt: new Date(),
      };
      usersStore.push(user);
      return user;
    },

    async upsertUserFromClerk(clerkId: string, username: string, email: string): Promise<User> {
      const existing = usersStore.find(u => u.clerkId === clerkId);
      if (existing) {
        existing.username = username;
        existing.email = email;
        return existing;
      }
      return storage.createUser({ clerkId, username, email });
    },

    async updateUserCredits(id: number, updates: Partial<Pick<User, 'freeListingsRemaining' | 'paidListingCredits' | 'likesRemaining'>>): Promise<User | undefined> {
      const user = usersStore.find(u => u.id === id);
      if (!user) return undefined;
      if (updates.freeListingsRemaining !== undefined) user.freeListingsRemaining = updates.freeListingsRemaining;
      if (updates.paidListingCredits !== undefined) user.paidListingCredits = updates.paidListingCredits;
      if (updates.likesRemaining !== undefined) user.likesRemaining = updates.likesRemaining;
      return user;
    },

    async promoteUserToAdmin(email: string): Promise<void> {
      const user = usersStore.find(u => u.email === email);
      if (user && user.role !== 'admin') {
        user.role = 'admin';
      }
    },

    // === PROJECTS ===
    async getProject(id: number): Promise<Project | undefined> {
      return projectsStore.find(p => p.id === id);
    },

    async getProjects(opts: { search?: string; categoryId?: number; pricingModel?: string; limit?: number; offset?: number; sortBy?: string }): Promise<{ projects: Project[]; total: number }> {
      let result = projectsStore.filter(p => p.status === 'active');

      if (opts.pricingModel) {
        result = result.filter(p => p.pricingModel === opts.pricingModel);
      }

      if (opts.search) {
        const term = opts.search.toLowerCase();
        result = result.filter(p =>
          (p.name?.toLowerCase().includes(term)) ||
          (p.shortDescription?.toLowerCase().includes(term)) ||
          (p.tags?.toLowerCase().includes(term))
        );
      }

      const total = result.length;
      const offset = opts.offset ?? 0;
      const limit = opts.limit ?? 20;
      result = result.slice(offset, offset + limit);

      return { projects: result, total };
    },

    async getProjectsByOwner(ownerId: number): Promise<Project[]> {
      return projectsStore.filter(p => p.ownerId === ownerId);
    },

    async createProject(project: InsertProject): Promise<Project> {
      const created: Project = {
        id: nextProjectId(),
        url: project.url,
        name: project.name ?? null,
        shortDescription: project.shortDescription ?? null,
        longDescription: project.longDescription ?? null,
        pricingModel: project.pricingModel ?? 'free',
        pricingDetails: project.pricingDetails ?? null,
        demoUrl: project.demoUrl ?? null,
        docsUrl: project.docsUrl ?? null,
        repoUrl: project.repoUrl ?? null,
        tags: project.tags ?? null,
        imageUrl: project.imageUrl ?? null,
        ownerId: project.ownerId ?? null,
        anonymousToken: project.anonymousToken ?? null,
        likesCount: 0,
        followsCount: project.followsCount ?? 0,
        status: project.status ?? 'pending',
        claimed: project.claimed ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      projectsStore.push(created);
      return created;
    },

    async updateProject(id: number, updates: Partial<InsertProject>): Promise<Project | undefined> {
      const project = projectsStore.find(p => p.id === id);
      if (!project) return undefined;
      Object.assign(project, updates, { updatedAt: new Date() });
      return project;
    },

    async deleteProject(id: number): Promise<boolean> {
      const idx = projectsStore.findIndex(p => p.id === id);
      if (idx === -1) return false;
      projectsStore.splice(idx, 1);
      return true;
    },

    async incrementLikesCount(projectId: number, delta: number): Promise<void> {
      const project = projectsStore.find(p => p.id === projectId);
      if (project) {
        project.likesCount += delta;
      }
    },

    // === CATEGORIES ===
    async getCategories(): Promise<Category[]> {
      return [...categoriesStore].sort((a, b) => a.name.localeCompare(b.name));
    },

    async getCategory(id: number): Promise<Category | undefined> {
      return categoriesStore.find(c => c.id === id);
    },

    async getCategoryBySlug(slug: string): Promise<Category | undefined> {
      return categoriesStore.find(c => c.slug === slug);
    },

    async createCategory(category: InsertCategory): Promise<Category> {
      const created: Category = {
        id: nextCategoryId(),
        name: category.name,
        slug: category.slug,
        description: category.description ?? null,
        icon: category.icon ?? null,
        createdAt: new Date(),
      };
      categoriesStore.push(created);
      return created;
    },

    async getProjectCategories(_projectId: number): Promise<Category[]> {
      return [];
    },

    async setProjectCategories(_projectId: number, _categoryIds: number[]): Promise<void> {},

    // === LIKES ===
    async getLike(userId: number, projectId: number): Promise<Like | undefined> {
      return likesStore.find(l => l.userId === userId && l.projectId === projectId);
    },

    async createLike(userId: number, projectId: number): Promise<Like> {
      const like: Like = { id: nextLikeId(), userId, projectId, createdAt: new Date() };
      likesStore.push(like);
      return like;
    },

    async deleteLike(userId: number, projectId: number): Promise<boolean> {
      const idx = likesStore.findIndex(l => l.userId === userId && l.projectId === projectId);
      if (idx === -1) return false;
      likesStore.splice(idx, 1);
      return true;
    },

    async getUserLikes(userId: number): Promise<Like[]> {
      return likesStore.filter(l => l.userId === userId);
    },

    // === FEEDBACK ===
    async getFeedback(projectId: number): Promise<Feedback[]> {
      return feedbackStore.filter(f => f.projectId === projectId);
    },

    async createFeedback(projectId: number, rating: number, fingerprint: string, answers?: string, summary?: string): Promise<Feedback> {
      const entry: Feedback = {
        id: nextFeedbackId(),
        projectId,
        rating,
        fingerprint,
        answers: answers ?? null,
        summary: summary ?? null,
        createdAt: new Date(),
      };
      feedbackStore.push(entry);
      return entry;
    },

    async getFeedbackCount(projectId: number): Promise<number> {
      return feedbackStore.filter(f => f.projectId === projectId).length;
    },

    async getAverageRating(projectId: number): Promise<number | null> {
      const entries = feedbackStore.filter(f => f.projectId === projectId);
      if (entries.length === 0) return null;
      const sum = entries.reduce((acc, f) => acc + f.rating, 0);
      return Math.round((sum / entries.length) * 10) / 10;
    },

    // === CREDITS ===
    async addCreditLedgerEntry(userId: number, amount: number, type: string, description: string, sourceId?: number, sourceType?: string): Promise<CreditLedgerEntry> {
      const entry: CreditLedgerEntry = {
        id: nextCreditLedgerId(),
        userId,
        amount,
        type,
        description,
        sourceId: sourceId ?? null,
        sourceType: sourceType ?? null,
        createdAt: new Date(),
      };
      creditLedgerStore.push(entry);
      return entry;
    },

    async getCreditLedger(userId: number): Promise<CreditLedgerEntry[]> {
      return creditLedgerStore.filter(e => e.userId === userId);
    },

    async getEarnedCredits(userId: number): Promise<number> {
      const user = usersStore.find(u => u.id === userId);
      return user?.earnedCredits ?? 0;
    },

    async updateEarnedCredits(userId: number, amount: number): Promise<void> {
      const user = usersStore.find(u => u.id === userId);
      if (user) {
        user.earnedCredits += amount;
      }
    },

    async convertEarnedCredits(userId: number): Promise<number> {
      const user = usersStore.find(u => u.id === userId);
      if (!user) return 0;
      const fullCredits = Math.floor(user.earnedCredits / 100);
      if (fullCredits > 0) {
        user.earnedCredits = user.earnedCredits % 100;
        user.paidListingCredits += fullCredits;
      }
      return fullCredits;
    },

    // === NOTIFICATIONS ===
    async createNotification(userId: number, type: string, title: string, message: string, linkUrl?: string): Promise<Notification> {
      const notif: Notification = {
        id: nextNotificationId(),
        userId,
        type,
        title,
        message,
        read: false,
        linkUrl: linkUrl ?? null,
        createdAt: new Date(),
      };
      notificationsStore.push(notif);
      return notif;
    },

    async getNotifications(userId: number, limit = 20): Promise<Notification[]> {
      return notificationsStore
        .filter(n => n.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },

    async getUnreadNotificationCount(userId: number): Promise<number> {
      return notificationsStore.filter(n => n.userId === userId && !n.read).length;
    },

    async markNotificationRead(id: number, userId: number): Promise<boolean> {
      const notif = notificationsStore.find(n => n.id === id && n.userId === userId);
      if (!notif) return false;
      notif.read = true;
      return true;
    },

    async markAllNotificationsRead(userId: number): Promise<number> {
      let count = 0;
      for (const n of notificationsStore) {
        if (n.userId === userId && !n.read) {
          n.read = true;
          count++;
        }
      }
      return count;
    },

    // === SYSTEM CONFIG ===
    async getConfig(key: string): Promise<any> {
      return configStore.get(key) ?? null;
    },

    async setConfig(key: string, value: any, _description?: string, _updatedBy?: number): Promise<void> {
      configStore.set(key, value);
    },

    async getAllConfig(): Promise<SystemConfig[]> {
      const result: SystemConfig[] = [];
      for (const [key, value] of configStore) {
        result.push({
          key,
          value,
          description: null,
          updatedAt: new Date(),
          updatedBy: null,
        });
      }
      return result;
    },

    // === Not implemented stubs ===
    async getJob(_id: number) { return notImplemented('getJob'); },
    async getJobByProject(_projectId: number) { return notImplemented('getJobByProject'); },
    async getJobsByFingerprint(_fingerprint: string) { return notImplemented('getJobsByFingerprint'); },
    async createJob(_projectId: number, _opts?: { type?: string; repoUrl?: string }) { return notImplemented('createJob'); },
    async updateJob(_id: number, _updates: any) { return notImplemented('updateJob'); },
    async getActiveJobs() { return notImplemented('getActiveJobs'); },

    async subscribe(_userId: number, _categoryId: number) { return notImplemented('subscribe'); },
    async unsubscribe(_userId: number, _categoryId: number) { return notImplemented('unsubscribe'); },
    async getSubscriptions(_userId: number) { return notImplemented('getSubscriptions'); },

    async getNewsletterPreference(_userId: number) { return notImplemented('getNewsletterPreference'); },
    async upsertNewsletterPreference(_userId: number, _prefs: any) { return notImplemented('upsertNewsletterPreference'); },

    async getAnonymousSubmissionCount(_fingerprint: string) { return notImplemented('getAnonymousSubmissionCount'); },
    async createAnonymousSubmission(_fingerprint: string, _projectId: number) { return notImplemented('createAnonymousSubmission'); },

    async getFollow(_userId: number, _projectId: number) { return notImplemented('getFollow'); },
    async createFollow(_userId: number, _projectId: number) { return notImplemented('createFollow'); },
    async deleteFollow(_userId: number, _projectId: number) { return notImplemented('deleteFollow'); },
    async incrementFollowsCount(_projectId: number, _delta: number) { return notImplemented('incrementFollowsCount'); },

    async createSocialShare(_userId: number, _projectId: number, _platform: string, _proofUrl: string) { return notImplemented('createSocialShare'); },
    async getSocialSharesByUser(_userId: number) { return notImplemented('getSocialSharesByUser'); },
    async getPendingSocialShares() { return notImplemented('getPendingSocialShares'); },
    async updateSocialShare(_id: number, _updates: any) { return notImplemented('updateSocialShare'); },

    async getAdminUsers() { return notImplemented('getAdminUsers'); },

    async createEmailSend(_userId: number, _subject: string, _frequency: string, _projectIds: number[]) { return notImplemented('createEmailSend'); },
    async updateEmailSend(_id: number, _updates: any) { return notImplemented('updateEmailSend'); },
    async getRecentEmailSend(_userId: number, _frequency: string) { return notImplemented('getRecentEmailSend'); },
    async getSentProjectIds(_userId: number) { return notImplemented('getSentProjectIds'); },

    async getOrCreateUnsubscribeToken(_userId: number) { return notImplemented('getOrCreateUnsubscribeToken'); },
    async getUserByUnsubscribeToken(_token: string) { return notImplemented('getUserByUnsubscribeToken'); },
    async deleteAllSubscriptions(_userId: number) { return notImplemented('deleteAllSubscriptions'); },

    async getDigestEligibleUsers(_frequency: string) { return notImplemented('getDigestEligibleUsers'); },
    async getProjectsForDigest(_categoryIds: number[], _pricingFilter: string | null, _excludeProjectIds: number[], _limit: number) { return notImplemented('getProjectsForDigest'); },

    async getCanonicalTags(_opts?: { search?: string; limit?: number }) { return notImplemented('getCanonicalTags'); },
    async getCanonicalTag(_id: number) { return notImplemented('getCanonicalTag'); },
    async getCanonicalTagBySlug(_slug: string) { return notImplemented('getCanonicalTagBySlug'); },
    async createCanonicalTag(_tag: InsertCanonicalTag) { return notImplemented('createCanonicalTag'); },
    async incrementTagUsageCount(_tagId: number, _delta: number) { return notImplemented('incrementTagUsageCount'); },

    async getSynonymByValue(_synonym: string) { return notImplemented('getSynonymByValue'); },
    async getSynonymsForTag(_canonicalTagId: number) { return notImplemented('getSynonymsForTag'); },
    async createSynonym(_synonym: string, _canonicalTagId: number) { return notImplemented('createSynonym'); },

    async getProjectTags(_projectId: number) { return notImplemented('getProjectTags'); },
    async setProjectTags(_projectId: number, _canonicalTagIds: number[]) { return notImplemented('setProjectTags'); },
  };

  return storage;
}
