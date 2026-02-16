import { storage } from "./storage";
import type { CanonicalTag } from "@shared/schema";

// ─── Normalization ──────────────────────────────────────────────────
// Collapses case, whitespace, and separators (hyphens, underscores)
// so "User-Experience", "user_experience", "USER EXPERIENCE" all become "user experience"
export function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[-_]/g, " ")       // hyphens/underscores → spaces
    .replace(/\s+/g, " ")        // collapse multiple spaces
    .trim();
}

// Display-friendly name: capitalize first letter of each word
export function displayName(slug: string): string {
  return slug
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Resolution ─────────────────────────────────────────────────────
// Given a raw tag string, resolve it to a canonical tag.
// Returns: { canonical, isNew, suggestions }
export interface ResolvedTag {
  canonical: CanonicalTag | null;
  isNew: boolean;
  suggestions: CanonicalTag[];
}

export async function resolveTag(raw: string): Promise<ResolvedTag> {
  const slug = normalizeTag(raw);
  if (!slug) return { canonical: null, isNew: false, suggestions: [] };

  // 1. Exact match on canonical slug
  const exact = await storage.getCanonicalTagBySlug(slug);
  if (exact) return { canonical: exact, isNew: false, suggestions: [] };

  // 2. Synonym lookup
  const synMatch = await storage.getSynonymByValue(slug);
  if (synMatch) return { canonical: synMatch.canonicalTag, isNew: false, suggestions: [] };

  // 3. Fuzzy suggestions: prefix match, substring match
  const suggestions = await suggestTags(slug, 5);

  return { canonical: null, isNew: true, suggestions };
}

// ─── Suggestions ────────────────────────────────────────────────────
// Return canonical tags whose slug or name contains the query
export async function suggestTags(query: string, limit = 10): Promise<CanonicalTag[]> {
  const normalized = normalizeTag(query);
  if (!normalized) return [];
  return storage.getCanonicalTags({ search: normalized, limit });
}

// ─── Batch Resolution ───────────────────────────────────────────────
// Resolve an array of raw tags. Auto-create canonical tags when no match exists.
// Returns the array of canonical tag IDs.
export async function resolveTagBatch(rawTags: string[]): Promise<CanonicalTag[]> {
  const resolved: CanonicalTag[] = [];
  const seen = new Set<number>();

  for (const raw of rawTags) {
    const slug = normalizeTag(raw);
    if (!slug) continue;

    const result = await resolveTag(raw);

    if (result.canonical) {
      if (!seen.has(result.canonical.id)) {
        resolved.push(result.canonical);
        seen.add(result.canonical.id);
      }
    } else {
      // Auto-create: during machine-generated tag resolution we create new canonical tags
      const created = await createCanonicalTag(raw);
      if (!seen.has(created.id)) {
        resolved.push(created);
        seen.add(created.id);
      }
    }
  }

  return resolved;
}

// ─── Create Canonical Tag ───────────────────────────────────────────
// Creates a new canonical tag and records the original input as a synonym
// if it differs from the slug.
export async function createCanonicalTag(raw: string): Promise<CanonicalTag> {
  const slug = normalizeTag(raw);
  if (!slug) throw new Error("Tag cannot be empty");

  // Check if it already exists (race condition guard)
  const existing = await storage.getCanonicalTagBySlug(slug);
  if (existing) return existing;

  const name = displayName(slug);
  const tag = await storage.createCanonicalTag({ name, slug });

  // If the original raw form (normalized) differs from the slug, store as synonym
  // This shouldn't happen with current normalization but is a safety net
  const rawNormalized = normalizeTag(raw);
  if (rawNormalized !== slug) {
    await storage.createSynonym(rawNormalized, tag.id);
  }

  return tag;
}

// ─── Add Synonym ────────────────────────────────────────────────────
export async function addSynonym(raw: string, canonicalTagId: number): Promise<void> {
  const normalized = normalizeTag(raw);
  if (!normalized) throw new Error("Synonym cannot be empty");

  // Ensure the canonical tag exists
  const tag = await storage.getCanonicalTag(canonicalTagId);
  if (!tag) throw new Error("Canonical tag not found");

  // Don't add the slug itself as a synonym
  if (normalized === tag.slug) return;

  await storage.createSynonym(normalized, canonicalTagId);
}

// ─── Resolve and Attach to Project ──────────────────────────────────
// Full pipeline: resolve raw tags → get canonical IDs → set project_tags
export async function resolveAndAttachTags(rawTags: string[], projectId: number): Promise<CanonicalTag[]> {
  const resolved = await resolveTagBatch(rawTags);
  const tagIds = resolved.map(t => t.id);
  await storage.setProjectTags(projectId, tagIds);
  return resolved;
}

// ─── Initial Seed Data ──────────────────────────────────────────────
// Pre-populate canonical tags from common tech keywords + synonyms
const SEED_TAGS: Array<{ name: string; synonyms?: string[] }> = [
  { name: "React", synonyms: ["reactjs", "react.js"] },
  { name: "Vue", synonyms: ["vuejs", "vue.js"] },
  { name: "Angular", synonyms: ["angularjs"] },
  { name: "Next.js", synonyms: ["nextjs", "next"] },
  { name: "Svelte", synonyms: ["sveltejs"] },
  { name: "TypeScript", synonyms: ["ts"] },
  { name: "JavaScript", synonyms: ["js"] },
  { name: "Python", synonyms: ["py"] },
  { name: "Rust" },
  { name: "Go", synonyms: ["golang"] },
  { name: "Node.js", synonyms: ["nodejs", "node"] },
  { name: "Tailwind", synonyms: ["tailwindcss", "tailwind css"] },
  { name: "PostgreSQL", synonyms: ["postgres", "pg"] },
  { name: "MongoDB", synonyms: ["mongo"] },
  { name: "Redis" },
  { name: "Docker" },
  { name: "Kubernetes", synonyms: ["k8s"] },
  { name: "AWS", synonyms: ["amazon web services"] },
  { name: "Vercel" },
  { name: "Supabase" },
  { name: "Firebase" },
  { name: "AI", synonyms: ["artificial intelligence"] },
  { name: "Machine Learning", synonyms: ["ml"] },
  { name: "LLM", synonyms: ["large language model"] },
  { name: "GPT", synonyms: ["chatgpt"] },
  { name: "NLP", synonyms: ["natural language processing"] },
  { name: "Deep Learning" },
  { name: "API", synonyms: ["rest api", "restful"] },
  { name: "GraphQL", synonyms: ["gql"] },
  { name: "CLI", synonyms: ["command line"] },
  { name: "SaaS", synonyms: ["software as a service"] },
  { name: "Open Source", synonyms: ["oss", "foss"] },
  { name: "DevOps", synonyms: ["dev ops"] },
  { name: "CI/CD", synonyms: ["continuous integration", "continuous deployment"] },
  { name: "Testing", synonyms: ["tests", "test framework"] },
  { name: "Authentication", synonyms: ["auth", "oauth", "sso"] },
  { name: "Database", synonyms: ["db"] },
  { name: "Frontend", synonyms: ["front end", "front-end"] },
  { name: "Backend", synonyms: ["back end", "back-end"] },
  { name: "Full Stack", synonyms: ["fullstack", "full-stack"] },
  { name: "Mobile", synonyms: ["mobile app"] },
  { name: "iOS", synonyms: ["iphone"] },
  { name: "Android" },
  { name: "React Native" },
  { name: "Flutter" },
  { name: "Blockchain", synonyms: ["web3", "crypto"] },
  { name: "E-Commerce", synonyms: ["ecommerce"] },
  { name: "CMS", synonyms: ["content management"] },
  { name: "Analytics" },
  { name: "Monitoring", synonyms: ["observability"] },
  { name: "User Experience", synonyms: ["ux", "ui/ux", "ui ux"] },
  { name: "Design", synonyms: ["ui design"] },
];

export async function seedCanonicalTags(): Promise<void> {
  // Only seed if empty
  const existing = await storage.getCanonicalTags({ limit: 1 });
  if (existing.length > 0) return;

  for (const entry of SEED_TAGS) {
    const slug = normalizeTag(entry.name);
    const tag = await storage.createCanonicalTag({
      name: entry.name,
      slug,
    });

    if (entry.synonyms) {
      for (const syn of entry.synonyms) {
        const normalized = normalizeTag(syn);
        if (normalized !== slug) {
          await storage.createSynonym(normalized, tag.id);
        }
      }
    }
  }

  console.log(`[tags] Seeded ${SEED_TAGS.length} canonical tags`);
}
