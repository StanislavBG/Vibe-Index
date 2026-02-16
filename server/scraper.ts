import { storage } from "./storage";
import { resolveAndAttachTags } from "./tagService";
import { analyzeRepo } from "./repoAnalyzer";
import { generateFeedbackReport, type FeedbackReport } from "./feedbackEngine";

export interface ScrapedData {
  name: string;
  shortDescription: string;
  longDescription: string;
  pricingModel: string;
  pricingDetails: string | null;
  tags: string[];
  suggestedCategories: string[];
  demoUrl: string | null;
  docsUrl: string | null;
  repoUrl: string | null;
}

// Fetch HTML from a URL with timeout
async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "VibeIndex/1.0 (Project Directory Bot)",
        "Accept": "text/html,application/json,text/plain",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// Try to fetch vibe-index.json from the project site
async function fetchVibeIndexFile(baseUrl: string): Promise<ScrapedData | null> {
  try {
    const url = new URL("/vibe-index.json", baseUrl).toString();
    const text = await fetchPage(url);
    const data = JSON.parse(text);
    return {
      name: data.name || "",
      shortDescription: data.description || "",
      longDescription: data.longDescription || "",
      pricingModel: data.pricing || "free",
      pricingDetails: data.pricingDetails || null,
      tags: Array.isArray(data.tags) ? data.tags : [],
      suggestedCategories: Array.isArray(data.categories) ? data.categories : [],
      demoUrl: data.demo || null,
      docsUrl: data.docs || null,
      repoUrl: data.repo || null,
    };
  } catch {
    return null;
  }
}

// Strip HTML tags and extract text
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Extract metadata from HTML
function extractMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const ogRegex = /<meta\s+(?:property|name)=["'](og:|twitter:|description|keywords)([^"']*)["']\s+content=["']([^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = ogRegex.exec(html)) !== null) {
    meta[(m[1] + m[2]).toLowerCase()] = m[3];
  }
  // Also try reversed attribute order
  const ogRegex2 = /<meta\s+content=["']([^"']*)["']\s+(?:property|name)=["'](og:|twitter:|description|keywords)([^"']*)["']/gi;
  while ((m = ogRegex2.exec(html)) !== null) {
    meta[(m[2] + m[3]).toLowerCase()] = m[1];
  }
  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) meta.title = titleMatch[1].trim();
  return meta;
}

// Extract links from HTML
function extractLinks(html: string, baseUrl: string): { demo: string | null; docs: string | null; repo: string | null } {
  const result: { demo: string | null; docs: string | null; repo: string | null } = { demo: null, docs: null, repo: null };
  const linkRegex = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(html)) !== null) {
    const href = m[1].toLowerCase();
    if (href.includes("github.com") || href.includes("gitlab.com") || href.includes("bitbucket.org")) {
      if (!result.repo) result.repo = m[1];
    }
    if (href.includes("docs.") || href.includes("/docs") || href.includes("/documentation")) {
      if (!result.docs) result.docs = m[1];
    }
    if (href.includes("demo") || href.includes("/try") || href.includes("/playground")) {
      if (!result.demo) result.demo = m[1];
    }
  }
  return result;
}

// Detect pricing from page content
function detectPricing(text: string): { model: string; details: string | null } {
  const lower = text.toLowerCase();
  if (lower.includes("free") && (lower.includes("premium") || lower.includes("pro") || lower.includes("upgrade"))) {
    return { model: "mixed", details: "Free tier + paid upgrades" };
  }
  if (lower.includes("/month") || lower.includes("/mo") || lower.includes("subscription") || lower.includes("/year")) {
    const priceMatch = text.match(/\$[\d,.]+(?:\s*\/\s*(?:mo|month|year|yr))?/i);
    return { model: "subscription", details: priceMatch ? priceMatch[0] : null };
  }
  if (lower.includes("one-time") || lower.includes("buy now") || lower.includes("purchase")) {
    const priceMatch = text.match(/\$[\d,.]+/);
    return { model: "one-time", details: priceMatch ? priceMatch[0] : null };
  }
  if (lower.includes("open source") || lower.includes("free") || lower.includes("mit license") || lower.includes("apache license")) {
    return { model: "free", details: null };
  }
  return { model: "free", details: null };
}

// Detect categories from content
function detectCategories(text: string, tags: string[]): string[] {
  const lower = (text + " " + tags.join(" ")).toLowerCase();
  const detected: string[] = [];
  const patterns: Record<string, string[]> = {
    "ai-ml": ["ai", "machine learning", "llm", "gpt", "neural", "deep learning", "nlp", "chatbot", "openai", "claude"],
    "dev-tools": ["developer", "cli", "editor", "ide", "terminal", "debugging", "testing", "linter", "compiler"],
    "web-apps": ["web app", "webapp", "dashboard", "portal", "saas", "platform"],
    "mobile-apps": ["ios", "android", "mobile app", "react native", "flutter", "swift"],
    "apis-backend": ["api", "backend", "server", "rest", "graphql", "microservice", "database"],
    "games": ["game", "gaming", "play", "multiplayer", "puzzle", "arcade"],
    "ecommerce": ["e-commerce", "ecommerce", "shop", "store", "marketplace", "cart", "checkout", "payment"],
    "productivity": ["productivity", "task", "todo", "project management", "calendar", "notes", "workflow"],
    "social": ["social", "community", "chat", "forum", "messaging", "feed"],
    "education": ["education", "learn", "course", "tutorial", "teaching", "quiz", "study"],
    "finance": ["finance", "fintech", "banking", "crypto", "trading", "budget", "invoice", "accounting"],
    "design-creative": ["design", "creative", "art", "illustration", "photo", "video", "animation", "ui/ux"],
  };
  for (const [slug, keywords] of Object.entries(patterns)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      detected.push(slug);
    }
  }
  return detected.length > 0 ? detected.slice(0, 3) : ["web-apps"];
}

// Extract tags/keywords from content
function extractTags(meta: Record<string, string>, text: string): string[] {
  const tags: string[] = [];
  if (meta.keywords) {
    tags.push(...meta.keywords.split(",").map((t) => t.trim()).filter(Boolean));
  }
  const techKeywords = [
    "react", "vue", "angular", "next.js", "svelte", "typescript", "javascript",
    "python", "rust", "go", "node.js", "tailwind", "postgresql", "mongodb",
    "redis", "docker", "kubernetes", "aws", "vercel", "supabase", "firebase",
  ];
  const lower = text.toLowerCase();
  for (const kw of techKeywords) {
    if (lower.includes(kw) && !tags.includes(kw)) {
      tags.push(kw);
    }
  }
  return tags.slice(0, 10);
}

// Main analysis function — scrapes a URL and extracts structured project data
export async function analyzeUrl(url: string): Promise<ScrapedData> {
  // First try vibe-index.json
  const vibeData = await fetchVibeIndexFile(url);
  if (vibeData && vibeData.name) {
    return vibeData;
  }

  // Otherwise, scrape the page
  const html = await fetchPage(url);
  const meta = extractMeta(html);
  const plainText = stripHtml(html).slice(0, 5000);
  const links = extractLinks(html, url);
  const tags = extractTags(meta, plainText);
  const pricing = detectPricing(plainText);
  const categorySlugs = detectCategories(plainText, tags);

  const name = meta["og:title"] || meta.title || new URL(url).hostname.replace("www.", "");
  const shortDesc = meta["og:description"] || meta.description || "";
  const longDesc = plainText.slice(0, 500);

  return {
    name: name.slice(0, 100),
    shortDescription: shortDesc.slice(0, 300),
    longDescription: longDesc,
    pricingModel: pricing.model,
    pricingDetails: pricing.details,
    tags,
    suggestedCategories: categorySlugs,
    demoUrl: links.demo,
    docsUrl: links.docs,
    repoUrl: links.repo,
  };
}

// Refine a draft using user feedback — merges current draft with feedback text
export function refineDraft(current: ScrapedData, feedback: string): ScrapedData {
  // Parse feedback for structured intent
  const lower = feedback.toLowerCase();

  const refined = { ...current };

  // Name override: "call it X" / "name should be X" / "rename to X"
  const nameMatch = feedback.match(/(?:call it|name (?:should be|it|is)|rename (?:to|it))\s+["']?([^"'\n.]+)["']?/i);
  if (nameMatch) {
    refined.name = nameMatch[1].trim();
  }

  // Description override: "description should be X" / "describe it as X"
  const descMatch = feedback.match(/(?:description (?:should be|is)|describe (?:it )?as)\s+["']?([^"'\n]+)["']?/i);
  if (descMatch) {
    refined.shortDescription = descMatch[1].trim().slice(0, 300);
  }

  // Tag additions: "add tag X" / "also tag with X"
  const tagAddMatch = feedback.match(/(?:add tags?|tag (?:it )?with|also include tags?)\s+(.+)/i);
  if (tagAddMatch) {
    const newTags = tagAddMatch[1].split(/[,\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
    const combined = refined.tags.concat(newTags);
    const unique: string[] = [];
    combined.forEach(t => { if (!unique.includes(t)) unique.push(t); });
    refined.tags = unique.slice(0, 10);
  }

  // Tag removals: "remove tag X"
  const tagRemoveMatch = feedback.match(/(?:remove tags?|drop tags?|delete tags?)\s+(.+)/i);
  if (tagRemoveMatch) {
    const removeTags = tagRemoveMatch[1].split(/[,\s]+/).map(t => t.trim().toLowerCase());
    refined.tags = refined.tags.filter(t => !removeTags.includes(t.toLowerCase()));
  }

  // Pricing override
  if (lower.includes("it's free") || lower.includes("this is free") || lower.includes("make it free")) {
    refined.pricingModel = "free";
    refined.pricingDetails = null;
  } else if (lower.includes("it's paid") || lower.includes("subscription")) {
    refined.pricingModel = "subscription";
  }

  // Category hints — will be re-evaluated during approval
  const catMatch = feedback.match(/(?:categor(?:y|ize)|put (?:it )?(?:in|under))\s+(.+)/i);
  if (catMatch) {
    const catHint = catMatch[1].trim().toLowerCase();
    // Map common terms to slugs
    const catMap: Record<string, string> = {
      "ai": "ai-ml", "machine learning": "ai-ml", "ml": "ai-ml",
      "developer": "dev-tools", "dev tools": "dev-tools", "tools": "dev-tools",
      "web": "web-apps", "webapp": "web-apps",
      "mobile": "mobile-apps",
      "api": "apis-backend", "backend": "apis-backend",
      "game": "games", "gaming": "games",
      "ecommerce": "ecommerce", "shop": "ecommerce",
      "productivity": "productivity",
      "social": "social",
      "education": "education",
      "finance": "finance",
      "design": "design-creative",
    };
    for (const [term, slug] of Object.entries(catMap)) {
      if (catHint.includes(term) && !refined.suggestedCategories.includes(slug)) {
        refined.suggestedCategories = [slug, ...refined.suggestedCategories].slice(0, 3);
      }
    }
  }

  // If none of the structured patterns matched, treat it as a general rewrite request
  // by appending the feedback context to the long description
  if (!nameMatch && !descMatch && !tagAddMatch && !tagRemoveMatch && !catMatch && feedback.trim().length > 10) {
    // Use feedback as the new short description if it's concise enough
    if (feedback.trim().length <= 300) {
      refined.shortDescription = feedback.trim();
    } else {
      refined.longDescription = feedback.trim().slice(0, 500);
    }
  }

  return refined;
}

// Process a job: scrape → produce draft → pause for user review
export async function processJob(jobId: number): Promise<void> {
  const job = await storage.getJob(jobId);
  if (!job) return;

  try {
    // Step 1: Fetching
    await storage.updateJob(jobId, { status: "running", step: "fetching", stepDetail: "Fetching website content..." });

    const project = await storage.getProject(job.projectId);
    if (!project) {
      await storage.updateJob(jobId, { status: "failed", step: "error", error: "Project not found" });
      return;
    }

    // Step 2: Analyze
    let scraped: ScrapedData;
    try {
      scraped = await analyzeUrl(project.url);
    } catch {
      await storage.updateJob(jobId, { step: "analyzing", stepDetail: "Could not fetch site, creating basic listing..." });
      const hostname = new URL(project.url).hostname.replace("www.", "");
      scraped = {
        name: hostname,
        shortDescription: `Visit ${hostname} to learn more about this project.`,
        longDescription: "",
        pricingModel: "free",
        pricingDetails: null,
        tags: [],
        suggestedCategories: ["web-apps"],
        demoUrl: null,
        docsUrl: null,
        repoUrl: null,
      };
    }

    await storage.updateJob(jobId, { step: "analyzing", stepDetail: "Extracting project details..." });

    // Step 3: Categorize
    await storage.updateJob(jobId, { step: "categorizing", stepDetail: "Assigning categories and tags..." });

    // Step 4: Draft ready — pause for user review instead of auto-publishing
    await storage.updateJob(jobId, {
      status: "review",
      step: "review",
      stepDetail: "Draft ready for your review",
      result: JSON.stringify(scraped),
    });

    // Notify all admins that analysis is complete
    const projectName = scraped.name || project.url;
    await notifyAdmins(
      "analysis_complete",
      `Analysis complete: ${projectName}`,
      `The analysis for "${projectName}" is ready for review.`,
      `/project/${project.id}`,
    );

    // Project stays "pending" until user approves
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await storage.updateJob(jobId, {
      status: "failed",
      step: "error",
      error: errorMessage,
      stepDetail: "Analysis failed",
    });

    // Notify admins about failure
    const project = await storage.getProject(job.projectId);
    const projectName = project?.name || project?.url || `#${job.projectId}`;
    await notifyAdmins(
      "analysis_complete",
      `Analysis failed: ${projectName}`,
      `The analysis for "${projectName}" failed: ${errorMessage}`,
      `/project/${job.projectId}`,
    );

    // Still mark project active so it's visible even if analysis failed
    try {
      await storage.updateProject(job.projectId, { status: "active" });
    } catch {
      // Silently ignore — project may have been deleted
    }
  }
}

// Process a feedback job: reuse analyzeUrl + optional analyzeRepo → generate assessment report
export async function processFeedbackJob(jobId: number): Promise<void> {
  const job = await storage.getJob(jobId);
  if (!job) return;

  try {
    // Step 1: Fetching website
    await storage.updateJob(jobId, { status: "running", step: "fetching", stepDetail: "Fetching website content..." });

    const project = await storage.getProject(job.projectId);
    if (!project) {
      await storage.updateJob(jobId, { status: "failed", step: "error", error: "Project not found" });
      return;
    }

    // Step 2: Analyze website (REUSES existing analyzeUrl — no duplication)
    let scraped: ScrapedData;
    try {
      scraped = await analyzeUrl(project.url);
    } catch {
      await storage.updateJob(jobId, { step: "analyzing", stepDetail: "Could not fetch site, creating basic listing..." });
      const hostname = new URL(project.url).hostname.replace("www.", "");
      scraped = {
        name: hostname,
        shortDescription: `Visit ${hostname} to learn more about this project.`,
        longDescription: "",
        pricingModel: "free",
        pricingDetails: null,
        tags: [],
        suggestedCategories: ["web-apps"],
        demoUrl: null,
        docsUrl: null,
        repoUrl: null,
      };
    }

    await storage.updateJob(jobId, { step: "analyzing", stepDetail: "Analyzing website..." });

    // Step 3: Analyze repo (if repoUrl provided on the job or discovered from the site)
    const repoUrl = job.repoUrl || scraped.repoUrl;
    let repoAnalysis = null;
    if (repoUrl) {
      await storage.updateJob(jobId, { step: "analyzing", stepDetail: "Analyzing repository..." });
      repoAnalysis = await analyzeRepo(repoUrl);
    }

    // Step 4: Generate assessment report
    await storage.updateJob(jobId, { step: "categorizing", stepDetail: "Generating feedback report..." });
    const report: FeedbackReport = generateFeedbackReport(scraped, repoAnalysis);

    // Step 5: Store report and mark completed
    await storage.updateJob(jobId, {
      status: "completed",
      step: "done",
      stepDetail: "Feedback report ready",
      result: JSON.stringify(report),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await storage.updateJob(jobId, {
      status: "failed",
      step: "error",
      error: errorMessage,
      stepDetail: "Feedback analysis failed",
    });
  }
}

// Approve and publish: apply draft to project and make it live
export async function approveAndPublish(jobId: number): Promise<void> {
  const job = await storage.getJob(jobId);
  if (!job || !job.result) throw new Error("No draft to approve");

  const scraped: ScrapedData = JSON.parse(job.result);

  // Map category slugs to IDs
  const allCategories = await storage.getCategories();
  const categoryIds = scraped.suggestedCategories
    .map((slug) => allCategories.find((c) => c.slug === slug)?.id)
    .filter((id): id is number => id !== undefined);

  // Update project with final data + mark active
  await storage.updateProject(job.projectId, {
    name: scraped.name,
    shortDescription: scraped.shortDescription,
    longDescription: scraped.longDescription || null,
    pricingModel: scraped.pricingModel,
    pricingDetails: scraped.pricingDetails,
    tags: scraped.tags.join(", "),
    demoUrl: scraped.demoUrl,
    docsUrl: scraped.docsUrl,
    repoUrl: scraped.repoUrl,
    status: "active",
  });

  if (categoryIds.length > 0) {
    await storage.setProjectCategories(job.projectId, categoryIds);
  }

  // Resolve tags through the tagging service (canonical vocabulary)
  if (scraped.tags.length > 0) {
    await resolveAndAttachTags(scraped.tags, job.projectId);
  }

  // Mark job completed
  await storage.updateJob(jobId, {
    status: "completed",
    step: "done",
    stepDetail: "Project published",
  });
}
