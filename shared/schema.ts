import { pgTable, text, serial, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  freeListingsRemaining: integer("free_listings_remaining").notNull().default(3),
  paidListingCredits: integer("paid_listing_credits").notNull().default(0),
  likesRemaining: integer("likes_remaining").notNull().default(10),
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
  status: text("status").notNull().default("queued"), // queued, running, completed, failed
  step: text("step").default("waiting"), // waiting, fetching, analyzing, categorizing, done, error
  stepDetail: text("step_detail"),
  result: text("result"), // JSON string of extracted data
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Enhanced subscriptions with preferences
export const categorySubscriptions = pgTable("category_subscriptions", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("sub_email_category_idx").on(table.email, table.categoryId),
]);

// Newsletter preferences (one per email)
export const newsletterPreferences = pgTable("newsletter_preferences", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  frequency: text("frequency").notNull().default("weekly"), // daily, weekly, monthly
  interests: text("interests"), // JSON array of keywords
  pricingFilter: text("pricing_filter"), // free, paid, all
  maxProjects: integer("max_projects").notNull().default(10), // how many projects per digest
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const anonymousSubmissions = pgTable("anonymous_submissions", {
  id: serial("id").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// === BASE SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, likesCount: true, createdAt: true, updatedAt: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, createdAt: true });
export const insertLikeSchema = createInsertSchema(likes).omit({ id: true, createdAt: true });
export const insertCategorySubscriptionSchema = createInsertSchema(categorySubscriptions).omit({ id: true, verified: true, createdAt: true });
export const insertAnonymousSubmissionSchema = createInsertSchema(anonymousSubmissions).omit({ id: true, createdAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNewsletterPreferencesSchema = createInsertSchema(newsletterPreferences).omit({ id: true, createdAt: true, updatedAt: true });

// === CUSTOM VALIDATION SCHEMAS ===

export const submitProjectSchema = z.object({
  url: z.string().url(),
});

export const subscribeSchema = z.object({
  email: z.string().email(),
  categoryIds: z.array(z.number()).min(1),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  interests: z.array(z.string()).optional(),
  pricingFilter: z.enum(["free", "paid", "all"]).optional(),
  maxProjects: z.number().min(1).max(50).optional(),
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
