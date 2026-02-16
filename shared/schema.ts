import { pgTable, text, serial, integer, boolean, timestamp, uniqueIndex, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===

export const userRoleEnum = ["user", "admin"] as const;
export type UserRole = (typeof userRoleEnum)[number];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("user"), // "user" | "admin"
  freeListingsRemaining: integer("free_listings_remaining").notNull().default(3),
  paidListingCredits: integer("paid_listing_credits").notNull().default(0),
  likesRemaining: integer("likes_remaining").notNull().default(10),
  earnedCredits: integer("earned_credits").notNull().default(0), // hundredths; 100 = 1 listing credit
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  icon: text("icon"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  name: text("name"),
  shortDescription: text("short_description"),
  longDescription: text("long_description"),
  pricingModel: text("pricing_model").default("free"),
  pricingDetails: text("pricing_details"),
  demoUrl: text("demo_url"),
  docsUrl: text("docs_url"),
  repoUrl: text("repo_url"),
  tags: text("tags"),
  imageUrl: text("image_url"),
  ownerId: integer("owner_id").references(() => users.id),
  anonymousToken: text("anonymous_token"),
  likesCount: integer("likes_count").notNull().default(0),
  followsCount: integer("follows_count").notNull().default(0),

  status: text("status").notNull().default("pending"), // pending (being analyzed), active, low_priority, archived
  claimed: boolean("claimed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectCategories = pgTable("project_categories", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
});

export const likes = pgTable("likes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("likes_user_project_idx").on(table.userId, table.projectId),
]);

// Scraping / analysis jobs
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("analyze"), // analyze, feedback
  status: text("status").notNull().default("queued"), // queued, running, completed, failed
  step: text("step").default("waiting"), // waiting, fetching, analyzing, categorizing, done, error
  stepDetail: text("step_detail"),
  result: text("result"), // JSON string of extracted data
  error: text("error"),
  repoUrl: text("repo_url"), // Optional Git repo URL (used by feedback jobs)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// User category subscriptions (which categories a user wants in their digest)
export const categorySubscriptions = pgTable("category_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("sub_user_category_idx").on(table.userId, table.categoryId),
]);

// Newsletter / digest preferences (one per user)
export const newsletterPreferences = pgTable("newsletter_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  frequency: text("frequency").notNull().default("weekly"), // daily, weekly, monthly
  interests: text("interests"), // JSON array of keywords
  pricingFilter: text("pricing_filter"), // free, paid, all
  maxProjects: integer("max_projects").notNull().default(10), // how many projects per digest
  bounced: boolean("bounced").notNull().default(false), // true if email permanently bounced (5xx)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const anonymousSubmissions = pgTable("anonymous_submissions", {
  id: serial("id").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Anonymous feedback on projects
export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  answers: text("answers"), // JSON string of { question: string; answer: string }[]
  summary: text("summary"),
  fingerprint: text("fingerprint").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Project follows
export const projectFollows = pgTable("project_follows", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("follows_user_project_idx").on(table.userId, table.projectId),
]);

// Social share proofs for earning listing credits
export const socialShares = pgTable("social_shares", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // twitter, linkedin, reddit, mastodon, etc.
  proofUrl: text("proof_url").notNull(),
  status: text("status").notNull().default("pending"), // pending, verified, rejected, expired
  creditAmount: integer("credit_amount").notNull().default(20), // hundredths of a listing credit (20 = 0.20)
  verifyAfter: timestamp("verify_after").notNull(), // 24h after submission
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Generic credit ledger — audit trail for all credit-earning events
export const creditLedger = pgTable("credit_ledger", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(), // hundredths of a listing credit (20 = 0.20)
  type: text("type").notNull(), // social_share, referral, purchase, bonus, admin_grant
  description: text("description"),
  sourceId: integer("source_id"), // FK to source table (e.g., socialShares.id)
  sourceType: text("source_type"), // "social_share", "referral", etc.
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// In-app notifications from the system to users
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // share_verified, share_expired, credit_earned, system
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  linkUrl: text("link_url"), // optional deep link (e.g., /dashboard, /project/42)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Email send log — one row per recipient per digest
export const emailSends = pgTable("email_sends", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("queued"), // queued, sent, failed
  frequency: text("frequency"), // daily, weekly, monthly — which trigger sent this
  projectIds: text("project_ids"), // JSON array of project IDs included
  error: text("error"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One-click unsubscribe tokens (one per user)
export const unsubscribeTokens = pgTable("unsubscribe_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// === TAGGING SYSTEM (Controlled Vocabulary) ===

export const canonicalTags = pgTable("canonical_tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),          // Display name, e.g. "User Experience"
  slug: text("slug").notNull().unique(),  // Normalized form, e.g. "user experience"
  description: text("description"),
  usageCount: integer("usage_count").notNull().default(0), // Denormalized count for sorting
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tagSynonyms = pgTable("tag_synonyms", {
  id: serial("id").primaryKey(),
  synonym: text("synonym").notNull().unique(), // Normalized synonym, e.g. "ux"
  canonicalTagId: integer("canonical_tag_id").notNull().references(() => canonicalTags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projectTags = pgTable("project_tags", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  canonicalTagId: integer("canonical_tag_id").notNull().references(() => canonicalTags.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("project_tag_idx").on(table.projectId, table.canonicalTagId),
]);

// === PROJECT CONTRIBUTORS (Multi-Role Ownership) ===

export const contributorRoles = ['developer', 'registerer', 'discoverer'] as const;
export type ContributorRole = typeof contributorRoles[number];

export const projectContributors = pgTable("project_contributors", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'developer', 'registerer', 'discoverer'
  verifiedAt: timestamp("verified_at"), // nullable — for developer claims that are verified
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("contributor_project_user_role_idx").on(table.projectId, table.userId, table.role),
]);

// === SYSTEM CONFIG (Admin-tunable key-value store) ===

export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id),
});

// === HUMAN FEEDBACK (Authenticated community reviews) ===

export const humanFeedback = pgTable("human_feedback", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  authorUserId: integer("author_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sections: jsonb("sections").notNull(), // { usability, marketFit, strengths, improvements, additionalNotes? }
  overallRating: integer("overall_rating").notNull(), // 1-10
  status: text("status").notNull().default("published"), // published | flagged | removed
  creditAwarded: boolean("credit_awarded").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("human_feedback_author_project_idx").on(table.authorUserId, table.projectId),
]);

// === CREDIT EARNING CAP (Rolling 24h window) ===

export const creditEarningWindows = pgTable("credit_earning_windows", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  windowStart: timestamp("window_start").notNull(),
  windowEnd: timestamp("window_end").notNull(),
  earnedInWindow: integer("earned_in_window").notNull().default(0), // hundredths of a listing credit
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("credit_earning_windows_user_end_idx").on(table.userId, table.windowEnd),
]);

// === BASE SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, likesCount: true, createdAt: true, updatedAt: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, createdAt: true });
export const insertLikeSchema = createInsertSchema(likes).omit({ id: true, createdAt: true });
export const insertCategorySubscriptionSchema = createInsertSchema(categorySubscriptions).omit({ id: true, createdAt: true });
export const insertAnonymousSubmissionSchema = createInsertSchema(anonymousSubmissions).omit({ id: true, createdAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNewsletterPreferencesSchema = createInsertSchema(newsletterPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFeedbackSchema = createInsertSchema(feedback).omit({ id: true, createdAt: true });
export const insertSocialShareSchema = createInsertSchema(socialShares).omit({ id: true, createdAt: true, verifiedAt: true });
export const insertCanonicalTagSchema = createInsertSchema(canonicalTags).omit({ id: true, usageCount: true, createdAt: true });
export const insertTagSynonymSchema = createInsertSchema(tagSynonyms).omit({ id: true, createdAt: true });
export const insertHumanFeedbackSchema = createInsertSchema(humanFeedback).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCreditEarningWindowSchema = createInsertSchema(creditEarningWindows).omit({ id: true, createdAt: true });
export const insertProjectContributorSchema = createInsertSchema(projectContributors).omit({ id: true, createdAt: true });
export const insertSystemConfigSchema = createInsertSchema(systemConfig).omit({ updatedAt: true });
export const selectSystemConfigSchema = z.object({
  key: z.string(),
  value: z.any(),
  description: z.string().nullable(),
  updatedAt: z.date(),
  updatedBy: z.number().nullable(),
});

// === CUSTOM VALIDATION SCHEMAS ===

export const submitProjectSchema = z.object({
  url: z.string().url(),
});

export const subscribeSchema = z.object({
  categoryIds: z.array(z.number()).min(1),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  interests: z.array(z.string()).optional(),
  pricingFilter: z.enum(["free", "paid", "all"]).optional(),
  maxProjects: z.number().min(1).max(50).optional(),
});

export const createFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(10),
  answers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).optional(),
  summary: z.string().max(5000).optional(),
});

export const submitFeedbackRequestSchema = z.object({
  url: z.string().url(),
  repoUrl: z.string().url().optional(),
});

export const humanFeedbackSectionsSchema = z.object({
  usability: z.string().min(10).max(2000),
  marketFit: z.string().min(10).max(2000),
  strengths: z.string().min(10).max(2000),
  improvements: z.string().min(10).max(2000),
  additionalNotes: z.string().max(2000).optional(),
});

export const submitHumanFeedbackSchema = z.object({
  sections: humanFeedbackSectionsSchema,
  overallRating: z.number().int().min(1).max(10),
});

export const submitSocialShareSchema = z.object({
  projectId: z.number(),
  platform: z.enum(["twitter", "linkedin", "reddit", "mastodon", "facebook", "other"]),
  proofUrl: z.string().url(),
});

// === EXPLICIT API CONTRACT TYPES ===
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Like = typeof likes.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type CategorySubscription = typeof categorySubscriptions.$inferSelect;
export type NewsletterPreference = typeof newsletterPreferences.$inferSelect;
export type AnonymousSubmission = typeof anonymousSubmissions.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type ProjectFollow = typeof projectFollows.$inferSelect;
export type SocialShare = typeof socialShares.$inferSelect;
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type EmailSend = typeof emailSends.$inferSelect;
export type UnsubscribeToken = typeof unsubscribeTokens.$inferSelect;
export type CanonicalTag = typeof canonicalTags.$inferSelect;
export type InsertCanonicalTag = z.infer<typeof insertCanonicalTagSchema>;
export type TagSynonym = typeof tagSynonyms.$inferSelect;
export type InsertTagSynonym = z.infer<typeof insertTagSynonymSchema>;
export type ProjectTag = typeof projectTags.$inferSelect;
export type HumanFeedback = typeof humanFeedback.$inferSelect;
export type InsertHumanFeedback = z.infer<typeof insertHumanFeedbackSchema>;
export type CreditEarningWindow = typeof creditEarningWindows.$inferSelect;
export type InsertCreditEarningWindow = z.infer<typeof insertCreditEarningWindowSchema>;
export type ProjectContributor = typeof projectContributors.$inferSelect;
export type InsertProjectContributor = z.infer<typeof insertProjectContributorSchema>;
export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;
