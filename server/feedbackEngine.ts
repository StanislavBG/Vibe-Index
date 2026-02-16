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

export type FeedbackTier = 'basic' | 'standard' | 'deep';

export interface FeedbackScores {
  overall: number;        // 1–10
  presentation: number;   // Website quality: title, description, meta
  documentation: number;  // README + docs link presence and quality
  discoverability: number; // Tags, categories, SEO-relevant metadata
  completeness: number;   // Links (demo, docs, repo), pricing info
}

export interface VCAnalysis {
  targetPersona: string;        // "Who is this product for?"
  primaryUseCases: string[];    // "What problems does it solve?"
  monetizationEval: string;     // "Is the pricing strategy viable?"
  marketFitAssessment: string;  // "Would this survive market scrutiny?"
  recommendations: { action: string; impact: 'high' | 'medium' | 'low'; effort: 'high' | 'medium' | 'low' }[];
  competitiveLandscape?: string; // Deep tier only
  growthStrategy?: string;       // Deep tier only
}

export interface FeedbackReport {
  site: ScrapedData;
  repo: RepoAnalysis | null;
  scores: FeedbackScores;
  strengths: string[];
  suggestions: string[];
  summary: string;
  tier: FeedbackTier;
  vcAnalysis?: VCAnalysis;
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
export function generateFeedbackReport(site: ScrapedData, repo: RepoAnalysis | null, tier: FeedbackTier = 'basic'): FeedbackReport {
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
    tier,
  };
}

// === VC Analysis (AI-powered) ===

/**
 * Build a VC analysis prompt from scraped data and optional repo analysis.
 */
function buildVCPrompt(scrapedData: ScrapedData, repoAnalysis: RepoAnalysis | null | undefined, tier: FeedbackTier): string {
  const parts: string[] = [];
  parts.push(`Product Name: ${scrapedData.name || "Unknown"}`);
  parts.push(`Description: ${scrapedData.shortDescription || "No description"}`);
  if (scrapedData.longDescription) {
    parts.push(`Details: ${scrapedData.longDescription.slice(0, 2000)}`);
  }
  parts.push(`Pricing Model: ${scrapedData.pricingModel || "free"}`);
  if (scrapedData.pricingDetails) {
    parts.push(`Pricing Details: ${scrapedData.pricingDetails}`);
  }
  if (scrapedData.tags.length > 0) {
    parts.push(`Tags/Tech Stack: ${scrapedData.tags.join(", ")}`);
  }
  if (scrapedData.suggestedCategories.length > 0) {
    parts.push(`Categories: ${scrapedData.suggestedCategories.join(", ")}`);
  }
  if (scrapedData.demoUrl) parts.push(`Demo URL: ${scrapedData.demoUrl}`);
  if (scrapedData.docsUrl) parts.push(`Docs URL: ${scrapedData.docsUrl}`);
  if (scrapedData.repoUrl) parts.push(`Repo URL: ${scrapedData.repoUrl}`);

  if (repoAnalysis) {
    parts.push(`\nRepository Analysis:`);
    parts.push(`- Stars: ${repoAnalysis.stars ?? "N/A"}`);
    parts.push(`- Language: ${repoAnalysis.language || "N/A"}`);
    parts.push(`- Topics: ${repoAnalysis.topics.join(", ") || "None"}`);
    parts.push(`- License: ${repoAnalysis.license || "None"}`);
    parts.push(`- Last Push: ${repoAnalysis.lastPush || "N/A"}`);
    parts.push(`- Open Issues: ${repoAnalysis.openIssues ?? "N/A"}`);
    parts.push(`- Has README: ${repoAnalysis.hasReadme} (${repoAnalysis.readmeLength} chars)`);
  }

  const productInfo = parts.join("\n");

  const deepFields = tier === 'deep' ? `
  "competitiveLandscape": "A detailed analysis of the competitive landscape, existing alternatives, and how this product differentiates itself",
  "growthStrategy": "A concrete growth strategy covering user acquisition channels, retention tactics, and scaling approach"` : '';

  return `You are an experienced venture capital analyst evaluating an early-stage software product. Analyze the following product and provide a structured VC-style assessment.

Product Information:
${productInfo}

Respond with valid JSON only (no markdown, no code blocks). Use exactly this schema:
{
  "targetPersona": "A clear description of the ideal user/customer for this product",
  "primaryUseCases": ["Use case 1", "Use case 2", "Use case 3"],
  "monetizationEval": "Assessment of the pricing strategy viability and revenue potential",
  "marketFitAssessment": "Would this product survive market scrutiny? Analysis of product-market fit",
  "recommendations": [
    {"action": "Specific actionable recommendation", "impact": "high|medium|low", "effort": "high|medium|low"}
  ]${deepFields ? ',' + deepFields : ''}
}

Provide 3-5 recommendations. Be direct, constructive, and specific. Focus on actionable insights rather than generic advice.`;
}

/**
 * Parse the VC analysis JSON response from OpenAI.
 * Falls back gracefully if the response is malformed.
 */
function parseVCResponse(text: string, tier: FeedbackTier): VCAnalysis | null {
  try {
    // Try to extract JSON from the response (handle possible markdown wrapping)
    let jsonStr = text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    // Also try to find a top-level JSON object
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      jsonStr = braceMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.targetPersona || !parsed.primaryUseCases || !parsed.monetizationEval || !parsed.marketFitAssessment) {
      return null;
    }

    const result: VCAnalysis = {
      targetPersona: String(parsed.targetPersona),
      primaryUseCases: Array.isArray(parsed.primaryUseCases) ? parsed.primaryUseCases.map(String) : [String(parsed.primaryUseCases)],
      monetizationEval: String(parsed.monetizationEval),
      marketFitAssessment: String(parsed.marketFitAssessment),
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map((r: { action?: string; impact?: string; effort?: string }) => ({
            action: String(r.action || "Review and improve"),
            impact: (['high', 'medium', 'low'].includes(r.impact || '') ? r.impact : 'medium') as 'high' | 'medium' | 'low',
            effort: (['high', 'medium', 'low'].includes(r.effort || '') ? r.effort : 'medium') as 'high' | 'medium' | 'low',
          }))
        : [],
    };

    // Include deep-tier fields if present
    if (tier === 'deep') {
      if (parsed.competitiveLandscape) {
        result.competitiveLandscape = String(parsed.competitiveLandscape);
      }
      if (parsed.growthStrategy) {
        result.growthStrategy = String(parsed.growthStrategy);
      }
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Generate a static (non-AI) VC analysis fallback.
 * Used when OPENAI_API_KEY is not set.
 */
function generateStaticVCAnalysis(scrapedData: ScrapedData, repoAnalysis: RepoAnalysis | null | undefined, tier: FeedbackTier): VCAnalysis {
  const name = scrapedData.name || "This product";
  const isPaid = scrapedData.pricingModel !== "free";
  const hasRepo = !!(scrapedData.repoUrl || repoAnalysis);
  const hasDocs = !!scrapedData.docsUrl;

  // Infer persona from categories
  const categoryMap: Record<string, string> = {
    "ai-ml": "developers and data scientists working with AI/ML",
    "dev-tools": "software developers and engineering teams",
    "web-apps": "end users and businesses needing web-based solutions",
    "mobile-apps": "mobile users and app consumers",
    "apis-backend": "backend developers and system architects",
    "games": "gamers and gaming enthusiasts",
    "ecommerce": "online merchants and e-commerce businesses",
    "productivity": "professionals and teams seeking productivity gains",
    "social": "community builders and social platform users",
    "education": "students, educators, and lifelong learners",
    "finance": "finance professionals and individuals managing money",
    "design-creative": "designers, artists, and creative professionals",
  };

  const primaryCategory = scrapedData.suggestedCategories[0] || "web-apps";
  const persona = categoryMap[primaryCategory] || "general software users";

  const useCases: string[] = [];
  if (scrapedData.shortDescription) {
    useCases.push(scrapedData.shortDescription);
  }
  if (scrapedData.suggestedCategories.length > 0) {
    useCases.push(`Serves the ${scrapedData.suggestedCategories.join(", ")} market`);
  }
  if (useCases.length === 0) {
    useCases.push("General-purpose software tool");
  }

  const monetization = isPaid
    ? `${name} uses a ${scrapedData.pricingModel} model${scrapedData.pricingDetails ? ` (${scrapedData.pricingDetails})` : ""}. Paid models can sustain development if the value proposition is clear.`
    : `${name} is free, which aids adoption but may need a monetization path for sustainability.`;

  const marketFit = repoAnalysis && repoAnalysis.stars && repoAnalysis.stars >= 50
    ? `With ${repoAnalysis.stars} stars, the project shows community traction. Market fit indicators are positive.`
    : `The project is early-stage. Market validation through user feedback and engagement metrics would strengthen the case for product-market fit.`;

  const recommendations: VCAnalysis['recommendations'] = [];
  if (!hasDocs) {
    recommendations.push({ action: "Add comprehensive documentation to reduce onboarding friction", impact: "high", effort: "medium" });
  }
  if (!hasRepo) {
    recommendations.push({ action: "Open-source or share the repository to build community trust", impact: "medium", effort: "low" });
  }
  if (!isPaid) {
    recommendations.push({ action: "Consider a freemium model to create a revenue path while maintaining adoption", impact: "high", effort: "high" });
  }
  if (scrapedData.tags.length < 3) {
    recommendations.push({ action: "Improve SEO and discoverability with more tags and keywords", impact: "medium", effort: "low" });
  }
  recommendations.push({ action: "Collect and showcase user testimonials or case studies", impact: "high", effort: "medium" });

  const result: VCAnalysis = {
    targetPersona: `Primarily targets ${persona}.`,
    primaryUseCases: useCases,
    monetizationEval: monetization,
    marketFitAssessment: marketFit,
    recommendations: recommendations.slice(0, 5),
  };

  if (tier === 'deep') {
    result.competitiveLandscape = `Based on the ${primaryCategory} category, ${name} competes in a space with established players. Differentiation through unique features, superior UX, or niche targeting is essential for survival.`;
    result.growthStrategy = `Recommended growth approach: (1) Build developer/community presence through content and open-source contributions, (2) Leverage existing ${scrapedData.tags.slice(0, 3).join(", ") || "technology"} ecosystems for distribution, (3) Implement referral and word-of-mouth mechanisms to scale organically.`;
  }

  return result;
}

/**
 * Generate a VC-style analysis using OpenAI GPT-4o-mini.
 * For 'basic' tier, returns null (no VC analysis).
 * For 'standard' tier, generates core fields (no competitive/growth).
 * For 'deep' tier, generates all fields including competitive landscape and growth strategy.
 *
 * Falls back to static analysis if OPENAI_API_KEY is not set.
 */
export async function generateVCAnalysis(
  scrapedData: ScrapedData,
  repoAnalysis?: RepoAnalysis | null,
  tier: FeedbackTier = 'standard',
): Promise<VCAnalysis | null> {
  // Basic tier skips VC analysis entirely
  if (tier === 'basic') return null;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    // Fallback to static analysis (same pattern as feedback summarization in routes.ts)
    return generateStaticVCAnalysis(scrapedData, repoAnalysis, tier);
  }

  try {
    const prompt = buildVCPrompt(scrapedData, repoAnalysis ?? null, tier);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an experienced VC analyst evaluating early-stage software products. Respond only with valid JSON. Be direct, specific, and constructive.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error(`[feedbackEngine] OpenAI API error: HTTP ${response.status}`);
      return generateStaticVCAnalysis(scrapedData, repoAnalysis, tier);
    }

    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return generateStaticVCAnalysis(scrapedData, repoAnalysis, tier);
    }

    const parsed = parseVCResponse(content, tier);
    if (!parsed) {
      console.error("[feedbackEngine] Failed to parse VC analysis response, falling back to static");
      return generateStaticVCAnalysis(scrapedData, repoAnalysis, tier);
    }

    return parsed;
  } catch (err) {
    console.error("[feedbackEngine] OpenAI call failed:", err instanceof Error ? err.message : err);
    return generateStaticVCAnalysis(scrapedData, repoAnalysis, tier);
  }
}
