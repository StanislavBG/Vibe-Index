/**
 * Feedback Engine — generates a structured assessment report from
 * website analysis (ScrapedData) + optional repo analysis (RepoAnalysis).
 *
 * This is the scoring and feedback-generation layer for the "Get Feedback"
 * workflow. It does NOT duplicate analyzeUrl — it consumes its output.
 */

import type { ScrapedData } from "./scraper";
import type { RepoAnalysis } from "./repoAnalyzer";

// === Public Types ===

export interface FeedbackScores {
  overall: number;        // 1–10
  presentation: number;   // Website quality: title, description, meta
  documentation: number;  // README + docs link presence and quality
  discoverability: number; // Tags, categories, SEO-relevant metadata
  completeness: number;   // Links (demo, docs, repo), pricing info
}

export interface FeedbackReport {
  site: ScrapedData;
  repo: RepoAnalysis | null;
  scores: FeedbackScores;
  strengths: string[];
  suggestions: string[];
  summary: string;
}

// === Scoring Helpers ===

function scorePresentation(site: ScrapedData): { score: number; strengths: string[]; suggestions: string[] } {
  let score = 5;
  const strengths: string[] = [];
  const suggestions: string[] = [];

  // Name quality
  if (site.name && site.name.length > 2 && !site.name.includes(".")) {
    score += 1;
    strengths.push("Clear project name that doesn't rely on the domain");
  } else if (!site.name || site.name.length <= 2) {
    score -= 1;
    suggestions.push("Add a clear project name (not just the domain)");
  }

  // Short description
  if (site.shortDescription && site.shortDescription.length >= 50) {
    score += 1;
    strengths.push("Good short description with enough detail");
  } else if (site.shortDescription && site.shortDescription.length > 0) {
    suggestions.push("Expand the short description to at least 50 characters for better discoverability");
  } else {
    score -= 1;
    suggestions.push("Add a meta description to your site — search engines and directories use it");
  }

  // Long description / page content
  if (site.longDescription && site.longDescription.length >= 200) {
    score += 1;
    strengths.push("Rich page content for visitors to understand the project");
  } else {
    suggestions.push("Add more content to your landing page explaining what the project does");
  }

  // OpenGraph / meta
  if (site.name && site.shortDescription) {
    score += 1;
  }

  return { score: clamp(score), strengths, suggestions };
}

function scoreDocumentation(site: ScrapedData, repo: RepoAnalysis | null): { score: number; strengths: string[]; suggestions: string[] } {
  let score = 4;
  const strengths: string[] = [];
  const suggestions: string[] = [];

  // Docs link
  if (site.docsUrl) {
    score += 2;
    strengths.push("Documentation link is accessible from the website");
  } else {
    suggestions.push("Add a link to documentation on your site (even a /docs page or wiki)");
  }

  // README from repo
  if (repo) {
    if (repo.hasReadme && repo.readmeLength >= 500) {
      score += 2;
      strengths.push("README is detailed and informative");
    } else if (repo.hasReadme && repo.readmeLength > 0) {
      score += 1;
      suggestions.push("Expand your README — aim for at least 500 characters covering setup, usage, and features");
    } else {
      score -= 1;
      suggestions.push("Add a README.md to your repository with project overview, setup instructions, and usage examples");
    }

    if (repo.hasLicense) {
      score += 1;
      strengths.push(`Licensed under ${repo.license || "an open-source license"}`);
    } else {
      suggestions.push("Add a LICENSE file to clarify how others can use your code");
    }
  } else {
    // No repo provided — neutral, but suggest it
    suggestions.push("Providing a Git repository URL lets us assess documentation and code health");
  }

  return { score: clamp(score), strengths, suggestions };
}

function scoreDiscoverability(site: ScrapedData, repo: RepoAnalysis | null): { score: number; strengths: string[]; suggestions: string[] } {
  let score = 4;
  const strengths: string[] = [];
  const suggestions: string[] = [];

  // Tags
  const tagCount = site.tags.length;
  if (tagCount >= 3) {
    score += 2;
    strengths.push(`${tagCount} tags make the project easy to find`);
  } else if (tagCount > 0) {
    score += 1;
    suggestions.push("Add more tags (at least 3) to improve discoverability in search results");
  } else {
    suggestions.push("Add keyword/meta tags to your site so directories and search engines can categorize it");
  }

  // Categories
  if (site.suggestedCategories.length > 0) {
    score += 1;
    strengths.push("Fits clearly into recognized project categories");
  } else {
    suggestions.push("The project doesn't clearly fit into common categories — consider adding category keywords to your content");
  }

  // Repo topics (GitHub topics, GitLab topics)
  if (repo && repo.topics.length >= 3) {
    score += 1;
    strengths.push("Repository topics help with GitHub/GitLab discoverability");
  } else if (repo && repo.topics.length === 0) {
    suggestions.push("Add topics to your GitHub/GitLab repository for better search visibility");
  }

  // SEO: short description exists
  if (site.shortDescription && site.shortDescription.length >= 20) {
    score += 1;
  }

  return { score: clamp(score), strengths, suggestions };
}

function scoreCompleteness(site: ScrapedData, repo: RepoAnalysis | null): { score: number; strengths: string[]; suggestions: string[] } {
  let score = 4;
  const strengths: string[] = [];
  const suggestions: string[] = [];

  // Demo link
  if (site.demoUrl) {
    score += 1;
    strengths.push("Live demo or playground available");
  } else {
    suggestions.push("Add a demo or playground link so visitors can try the project instantly");
  }

  // Docs link
  if (site.docsUrl) {
    score += 1;
  }

  // Repo link
  if (site.repoUrl || repo) {
    score += 1;
    strengths.push("Source code is publicly accessible");
  } else {
    suggestions.push("Link to your source code repository if the project is open source");
  }

  // Pricing info
  if (site.pricingModel && site.pricingModel !== "free") {
    if (site.pricingDetails) {
      score += 1;
      strengths.push("Clear pricing information available");
    } else {
      suggestions.push("Add specific pricing details (e.g., '$9/mo') so users know what to expect");
    }
  } else if (site.pricingModel === "free") {
    score += 1;
    strengths.push("Free to use — great for adoption");
  }

  // Repo activity
  if (repo && repo.lastPush) {
    const daysSinceLastPush = (Date.now() - new Date(repo.lastPush).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastPush < 30) {
      score += 1;
      strengths.push("Repository is actively maintained (pushed within the last 30 days)");
    } else if (daysSinceLastPush < 180) {
      suggestions.push("Last commit was over a month ago — regular updates signal an active project");
    } else {
      suggestions.push("Repository hasn't been updated in over 6 months — users may question if it's maintained");
    }
  }

  // Stars as social proof
  if (repo && repo.stars !== null && repo.stars >= 10) {
    score += 1;
    strengths.push(`${repo.stars} stars on the repository shows community interest`);
  }

  return { score: clamp(score), strengths, suggestions };
}

function clamp(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}

// === Main Export ===

/**
 * Generate a structured feedback report from site analysis and optional repo analysis.
 * DOES NOT call analyzeUrl — receives its output as input.
 */
export function generateFeedbackReport(site: ScrapedData, repo: RepoAnalysis | null): FeedbackReport {
  const pres = scorePresentation(site);
  const docs = scoreDocumentation(site, repo);
  const disc = scoreDiscoverability(site, repo);
  const comp = scoreCompleteness(site, repo);

  const overall = clamp(Math.round((pres.score + docs.score + disc.score + comp.score) / 4));

  const scores: FeedbackScores = {
    overall,
    presentation: pres.score,
    documentation: docs.score,
    discoverability: disc.score,
    completeness: comp.score,
  };

  const strengths = [...pres.strengths, ...docs.strengths, ...disc.strengths, ...comp.strengths];
  const suggestions = [...pres.suggestions, ...docs.suggestions, ...disc.suggestions, ...comp.suggestions];

  // Generate a natural-language summary
  const summaryParts: string[] = [];

  if (overall >= 8) {
    summaryParts.push(`"${site.name || "This project"}" is in great shape with a score of ${overall}/10.`);
  } else if (overall >= 5) {
    summaryParts.push(`"${site.name || "This project"}" has a solid foundation (${overall}/10) with room to improve.`);
  } else {
    summaryParts.push(`"${site.name || "This project"}" needs work across several areas (${overall}/10).`);
  }

  if (strengths.length > 0) {
    summaryParts.push(`Key strengths: ${strengths.slice(0, 2).join("; ").toLowerCase()}.`);
  }
  if (suggestions.length > 0) {
    summaryParts.push(`Top priorities: ${suggestions.slice(0, 2).join("; ").toLowerCase()}.`);
  }

  return {
    site,
    repo,
    scores,
    strengths,
    suggestions,
    summary: summaryParts.join(" "),
  };
}
