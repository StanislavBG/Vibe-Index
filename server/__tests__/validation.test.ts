import { describe, it, expect } from 'vitest';
import {
  submitProjectSchema,
  createFeedbackSchema,
  subscribeSchema,
  submitSocialShareSchema,
  submitFeedbackRequestSchema,
  insertUserSchema,
  insertProjectSchema,
  insertCategorySchema,
  insertFeedbackSchema,
  insertCanonicalTagSchema,
  insertSystemConfigSchema,
} from '@shared/schema';

describe('submitProjectSchema', () => {
  it('accepts a valid URL', () => {
    const result = submitProjectSchema.safeParse({ url: 'https://example.com' });
    expect(result.success).toBe(true);
  });

  it('accepts URL with path', () => {
    const result = submitProjectSchema.safeParse({ url: 'https://github.com/user/repo' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid URL', () => {
    const result = submitProjectSchema.safeParse({ url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = submitProjectSchema.safeParse({ url: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing url field', () => {
    const result = submitProjectSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects non-string url', () => {
    const result = submitProjectSchema.safeParse({ url: 123 });
    expect(result.success).toBe(false);
  });
});

describe('createFeedbackSchema', () => {
  it('accepts valid feedback with rating only', () => {
    const result = createFeedbackSchema.safeParse({ rating: 5 });
    expect(result.success).toBe(true);
  });

  it('accepts valid feedback with all fields', () => {
    const result = createFeedbackSchema.safeParse({
      rating: 8,
      answers: [{ question: 'How usable?', answer: 'Very usable' }],
      summary: 'Great project overall',
    });
    expect(result.success).toBe(true);
  });

  it('rejects rating below 1', () => {
    const result = createFeedbackSchema.safeParse({ rating: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects rating above 10', () => {
    const result = createFeedbackSchema.safeParse({ rating: 11 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer rating', () => {
    const result = createFeedbackSchema.safeParse({ rating: 5.5 });
    expect(result.success).toBe(false);
  });

  it('rejects missing rating', () => {
    const result = createFeedbackSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects summary over 5000 characters', () => {
    const result = createFeedbackSchema.safeParse({
      rating: 5,
      summary: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts summary exactly 5000 characters', () => {
    const result = createFeedbackSchema.safeParse({
      rating: 5,
      summary: 'x'.repeat(5000),
    });
    expect(result.success).toBe(true);
  });

  it('rejects malformed answers array', () => {
    const result = createFeedbackSchema.safeParse({
      rating: 5,
      answers: [{ question: 'Q1' }], // missing answer field
    });
    expect(result.success).toBe(false);
  });
});

describe('subscribeSchema', () => {
  it('accepts valid subscription with categoryIds only', () => {
    const result = subscribeSchema.safeParse({ categoryIds: [1, 2, 3] });
    expect(result.success).toBe(true);
  });

  it('accepts valid subscription with all optional fields', () => {
    const result = subscribeSchema.safeParse({
      categoryIds: [1],
      frequency: 'daily',
      interests: ['ai', 'tools'],
      pricingFilter: 'free',
      maxProjects: 20,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty categoryIds', () => {
    const result = subscribeSchema.safeParse({ categoryIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid frequency', () => {
    const result = subscribeSchema.safeParse({
      categoryIds: [1],
      frequency: 'biweekly',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid pricingFilter', () => {
    const result = subscribeSchema.safeParse({
      categoryIds: [1],
      pricingFilter: 'cheap',
    });
    expect(result.success).toBe(false);
  });

  it('rejects maxProjects below 1', () => {
    const result = subscribeSchema.safeParse({
      categoryIds: [1],
      maxProjects: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects maxProjects above 50', () => {
    const result = subscribeSchema.safeParse({
      categoryIds: [1],
      maxProjects: 51,
    });
    expect(result.success).toBe(false);
  });
});

describe('submitSocialShareSchema', () => {
  it('accepts valid social share', () => {
    const result = submitSocialShareSchema.safeParse({
      projectId: 1,
      platform: 'twitter',
      proofUrl: 'https://twitter.com/user/status/123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid platforms', () => {
    const platforms = ['twitter', 'linkedin', 'reddit', 'mastodon', 'facebook', 'other'] as const;
    for (const platform of platforms) {
      const result = submitSocialShareSchema.safeParse({
        projectId: 1,
        platform,
        proofUrl: 'https://example.com/proof',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid platform', () => {
    const result = submitSocialShareSchema.safeParse({
      projectId: 1,
      platform: 'myspace',
      proofUrl: 'https://example.com/proof',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid proofUrl', () => {
    const result = submitSocialShareSchema.safeParse({
      projectId: 1,
      platform: 'twitter',
      proofUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('submitFeedbackRequestSchema', () => {
  it('accepts valid URL', () => {
    const result = submitFeedbackRequestSchema.safeParse({
      url: 'https://example.com',
    });
    expect(result.success).toBe(true);
  });

  it('accepts URL with optional repoUrl', () => {
    const result = submitFeedbackRequestSchema.safeParse({
      url: 'https://example.com',
      repoUrl: 'https://github.com/user/repo',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid url', () => {
    const result = submitFeedbackRequestSchema.safeParse({
      url: 'bad-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid repoUrl', () => {
    const result = submitFeedbackRequestSchema.safeParse({
      url: 'https://example.com',
      repoUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('insertUserSchema', () => {
  it('accepts valid user data', () => {
    const result = insertUserSchema.safeParse({
      clerkId: 'clerk_abc',
      username: 'testuser',
      email: 'test@test.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = insertUserSchema.safeParse({ username: 'testuser' });
    expect(result.success).toBe(false);
  });
});

describe('insertProjectSchema', () => {
  it('accepts minimal project with just url', () => {
    const result = insertProjectSchema.safeParse({
      url: 'https://example.com',
    });
    expect(result.success).toBe(true);
  });

  it('accepts project with all optional fields', () => {
    const result = insertProjectSchema.safeParse({
      url: 'https://example.com',
      name: 'My Project',
      shortDescription: 'Short desc',
      longDescription: 'Long desc',
      pricingModel: 'free',
      tags: 'ai,tools',
      status: 'active',
    });
    expect(result.success).toBe(true);
  });
});

describe('insertCategorySchema', () => {
  it('accepts valid category', () => {
    const result = insertCategorySchema.safeParse({
      name: 'AI Tools',
      slug: 'ai-tools',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = insertCategorySchema.safeParse({ slug: 'ai-tools' });
    expect(result.success).toBe(false);
  });

  it('rejects missing slug', () => {
    const result = insertCategorySchema.safeParse({ name: 'AI Tools' });
    expect(result.success).toBe(false);
  });
});

describe('insertFeedbackSchema', () => {
  it('accepts valid feedback insert data', () => {
    const result = insertFeedbackSchema.safeParse({
      projectId: 1,
      rating: 8,
      fingerprint: 'fp123',
    });
    expect(result.success).toBe(true);
  });
});

describe('insertCanonicalTagSchema', () => {
  it('accepts valid canonical tag', () => {
    const result = insertCanonicalTagSchema.safeParse({
      name: 'User Experience',
      slug: 'user-experience',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = insertCanonicalTagSchema.safeParse({ slug: 'ux' });
    expect(result.success).toBe(false);
  });
});

describe('insertSystemConfigSchema', () => {
  it('accepts valid config entry', () => {
    const result = insertSystemConfigSchema.safeParse({
      key: 'site_name',
      value: 'Vibe Index',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing key', () => {
    const result = insertSystemConfigSchema.safeParse({ value: 'test' });
    expect(result.success).toBe(false);
  });
});
