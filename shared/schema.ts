import { pgTable, text, serial, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
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
  status: text("status").notNull().default("active"),
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

export const categorySubscriptions = pgTable("category_subscriptions", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("sub_email_category_idx").on(table.email, table.categoryId),
]);

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

// === CUSTOM VALIDATION SCHEMAS ===
export const registerUserSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(6),
});

export const loginUserSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const submitProjectSchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
  shortDescription: z.string().max(300).optional(),
  categoryIds: z.array(z.number()).optional(),
});

export const subscribeSchema = z.object({
  email: z.string().email(),
  categoryIds: z.array(z.number()).min(1),
});

// === EXPLICIT API CONTRACT TYPES ===
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Like = typeof likes.$inferSelect;
export type CategorySubscription = typeof categorySubscriptions.$inferSelect;
export type AnonymousSubmission = typeof anonymousSubmissions.$inferSelect;
