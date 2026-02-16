import { describe, it, expect } from 'vitest';
import {
  // Table definitions
  users, projects, categories, projectCategories, likes,
  categorySubscriptions, anonymousSubmissions, jobs, newsletterPreferences,
  projectFollows, socialShares, creditLedger, notifications,
  emailSends, unsubscribeTokens, canonicalTags, tagSynonyms, projectTags,
  feedback, systemConfig,

  // Enum / constants
  userRoleEnum,

  // Insert schemas
  insertUserSchema,
  insertProjectSchema,
  insertCategorySchema,
  insertLikeSchema,
  insertCategorySubscriptionSchema,
  insertAnonymousSubmissionSchema,
  insertJobSchema,
  insertNewsletterPreferencesSchema,
  insertFeedbackSchema,
  insertSocialShareSchema,
  insertCanonicalTagSchema,
  insertTagSynonymSchema,
  insertSystemConfigSchema,
  selectSystemConfigSchema,

  // Custom validation schemas
  submitProjectSchema,
  subscribeSchema,
  createFeedbackSchema,
  submitFeedbackRequestSchema,
  submitSocialShareSchema,
} from '@shared/schema';

describe('Table exports', () => {
  it('exports all table definitions', () => {
    // Verify that each table export is defined (Drizzle table objects)
    const tables = [
      users, projects, categories, projectCategories, likes,
      categorySubscriptions, anonymousSubmissions, jobs, newsletterPreferences,
      projectFollows, socialShares, creditLedger, notifications,
      emailSends, unsubscribeTokens, canonicalTags, tagSynonyms, projectTags,
      feedback, systemConfig,
    ];

    for (const table of tables) {
      expect(table).toBeDefined();
    }
  });

  it('all tables have a defined structure (columns)', () => {
    // Drizzle pgTable objects have a special symbol for columns
    // We check they are objects with expected column-like properties
    expect(users.id).toBeDefined();
    expect(users.clerkId).toBeDefined();
    expect(users.username).toBeDefined();
    expect(users.email).toBeDefined();
    expect(users.role).toBeDefined();
    expect(users.freeListingsRemaining).toBeDefined();
    expect(users.paidListingCredits).toBeDefined();
    expect(users.likesRemaining).toBeDefined();
    expect(users.earnedCredits).toBeDefined();
    expect(users.createdAt).toBeDefined();
  });

  it('projects table has expected columns', () => {
    expect(projects.id).toBeDefined();
    expect(projects.url).toBeDefined();
    expect(projects.name).toBeDefined();
    expect(projects.shortDescription).toBeDefined();
    expect(projects.longDescription).toBeDefined();
    expect(projects.pricingModel).toBeDefined();
    expect(projects.tags).toBeDefined();
    expect(projects.status).toBeDefined();
    expect(projects.likesCount).toBeDefined();
    expect(projects.followsCount).toBeDefined();
    expect(projects.ownerId).toBeDefined();
    expect(projects.createdAt).toBeDefined();
    expect(projects.updatedAt).toBeDefined();
  });

  it('feedback table has expected columns', () => {
    expect(feedback.id).toBeDefined();
    expect(feedback.projectId).toBeDefined();
    expect(feedback.rating).toBeDefined();
    expect(feedback.answers).toBeDefined();
    expect(feedback.summary).toBeDefined();
    expect(feedback.fingerprint).toBeDefined();
    expect(feedback.createdAt).toBeDefined();
  });

  it('canonicalTags table has expected columns', () => {
    expect(canonicalTags.id).toBeDefined();
    expect(canonicalTags.name).toBeDefined();
    expect(canonicalTags.slug).toBeDefined();
    expect(canonicalTags.description).toBeDefined();
    expect(canonicalTags.usageCount).toBeDefined();
    expect(canonicalTags.createdAt).toBeDefined();
  });
});

describe('Enum values', () => {
  it('userRoleEnum contains expected values', () => {
    expect(userRoleEnum).toEqual(['user', 'admin']);
  });

  it('userRoleEnum has exactly 2 values', () => {
    expect(userRoleEnum.length).toBe(2);
  });
});

describe('Insert schema defaults', () => {
  it('insertUserSchema allows optional role (defaults in DB to "user")', () => {
    const result = insertUserSchema.safeParse({
      clerkId: 'clerk_test',
      username: 'test',
      email: 'test@test.com',
    });
    expect(result.success).toBe(true);
    // role should be optional in the insert schema
    if (result.success) {
      // role may be undefined since it has a DB default
      expect(result.data.role === undefined || result.data.role === 'user').toBe(true);
    }
  });

  it('insertUserSchema allows optional freeListingsRemaining (defaults in DB to 3)', () => {
    const result = insertUserSchema.safeParse({
      clerkId: 'clerk_test',
      username: 'test',
      email: 'test@test.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.freeListingsRemaining === undefined || result.data.freeListingsRemaining === 3).toBe(true);
    }
  });

  it('insertProjectSchema allows optional status (defaults in DB to "pending")', () => {
    const result = insertProjectSchema.safeParse({
      url: 'https://example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status === undefined || result.data.status === 'pending').toBe(true);
    }
  });

  it('insertProjectSchema allows optional pricingModel (defaults in DB to "free")', () => {
    const result = insertProjectSchema.safeParse({
      url: 'https://example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pricingModel === undefined || result.data.pricingModel === 'free').toBe(true);
    }
  });
});

describe('Schema exports (insert schemas)', () => {
  it('all insert schemas are Zod schemas with safeParse', () => {
    const schemas = [
      insertUserSchema,
      insertProjectSchema,
      insertCategorySchema,
      insertLikeSchema,
      insertCategorySubscriptionSchema,
      insertAnonymousSubmissionSchema,
      insertJobSchema,
      insertNewsletterPreferencesSchema,
      insertFeedbackSchema,
      insertSocialShareSchema,
      insertCanonicalTagSchema,
      insertTagSynonymSchema,
      insertSystemConfigSchema,
      selectSystemConfigSchema,
    ];

    for (const schema of schemas) {
      expect(schema).toBeDefined();
      expect(typeof schema.safeParse).toBe('function');
    }
  });
});

describe('Custom validation schemas exports', () => {
  it('all custom validation schemas are Zod schemas with safeParse', () => {
    const schemas = [
      submitProjectSchema,
      subscribeSchema,
      createFeedbackSchema,
      submitFeedbackRequestSchema,
      submitSocialShareSchema,
    ];

    for (const schema of schemas) {
      expect(schema).toBeDefined();
      expect(typeof schema.safeParse).toBe('function');
    }
  });
});

describe('subscribeSchema frequency enum values', () => {
  it('accepts daily, weekly, monthly', () => {
    for (const freq of ['daily', 'weekly', 'monthly']) {
      const result = subscribeSchema.safeParse({
        categoryIds: [1],
        frequency: freq,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid frequency values', () => {
    for (const freq of ['hourly', 'yearly', 'biweekly', '']) {
      const result = subscribeSchema.safeParse({
        categoryIds: [1],
        frequency: freq,
      });
      expect(result.success).toBe(false);
    }
  });
});

describe('submitSocialShareSchema platform enum values', () => {
  it('accepts all defined platforms', () => {
    const validPlatforms = ['twitter', 'linkedin', 'reddit', 'mastodon', 'facebook', 'other'];
    for (const platform of validPlatforms) {
      const result = submitSocialShareSchema.safeParse({
        projectId: 1,
        platform,
        proofUrl: 'https://example.com/proof',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown platforms', () => {
    const invalidPlatforms = ['instagram', 'tiktok', 'youtube', 'myspace'];
    for (const platform of invalidPlatforms) {
      const result = submitSocialShareSchema.safeParse({
        projectId: 1,
        platform,
        proofUrl: 'https://example.com/proof',
      });
      expect(result.success).toBe(false);
    }
  });
});

describe('createFeedbackSchema rating range', () => {
  it('accepts ratings 1 through 10', () => {
    for (let i = 1; i <= 10; i++) {
      const result = createFeedbackSchema.safeParse({ rating: i });
      expect(result.success).toBe(true);
    }
  });

  it('rejects ratings outside 1-10', () => {
    for (const rating of [-1, 0, 11, 100]) {
      const result = createFeedbackSchema.safeParse({ rating });
      expect(result.success).toBe(false);
    }
  });
});
