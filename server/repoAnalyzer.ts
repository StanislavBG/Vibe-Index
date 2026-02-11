/**
 * Repository Analyzer for the "Get Feedback" workflow.
 *
 * Fetches metadata from GitHub / GitLab public APIs to enrich
 * the feedback report with repo-level signals (README quality,
 * license, activity, language, topics).
 */

export interface RepoAnalysis {
  hasReadme: boolean;
  readmeLength: number;
  readmeExcerpt: string;
  hasLicense: boolean;
  license: string | null;
  defaultBranch: string | null;
  stars: number | null;
  language: string | null;
  topics: string[];
  lastPush: string | null;
  openIssues: number | null;
}

interface GitHubRepo {
  default_branch: string;
  stargazers_count: number;
  language: string | null;
  topics: string[];
  pushed_at: string;
  license: { spdx_id: string } | null;
  open_issues_count: number;
}

interface GitLabProject {
  default_branch: string;
  star_count: number;
  topics: string[];
  last_activity_at: string;
  open_issues_count: number;
}

const FETCH_TIMEOUT = 10_000;

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "VibeIndex/1.0 (Feedback Analyzer)",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/plain",
        "User-Agent": "VibeIndex/1.0 (Feedback Analyzer)",
      },
    });
    if (!res.ok) return "";
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse a GitHub or GitLab URL into { host, owner, repo }.
 * Returns null if the URL is not a recognized repo URL.
 */
function parseRepoUrl(repoUrl: string): { host: "github" | "gitlab"; owner: string; repo: string } | null {
  try {
    const u = new URL(repoUrl);
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1];
    if (u.hostname === "github.com") return { host: "github", owner, repo };
    if (u.hostname === "gitlab.com") return { host: "gitlab", owner, repo };
    return null;
  } catch {
    return null;
  }
}

async function analyzeGitHub(owner: string, repo: string): Promise<RepoAnalysis> {
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

  // Fetch repo metadata and README in parallel
  const [repoData, readmeText] = await Promise.all([
    fetchJson(apiBase) as Promise<GitHubRepo>,
    fetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`),
  ]);

  return {
    hasReadme: readmeText.length > 0,
    readmeLength: readmeText.length,
    readmeExcerpt: readmeText.slice(0, 1000),
    hasLicense: !!repoData.license,
    license: repoData.license?.spdx_id || null,
    defaultBranch: repoData.default_branch || null,
    stars: repoData.stargazers_count ?? null,
    language: repoData.language || null,
    topics: repoData.topics || [],
    lastPush: repoData.pushed_at || null,
    openIssues: repoData.open_issues_count ?? null,
  };
}

async function analyzeGitLab(owner: string, repo: string): Promise<RepoAnalysis> {
  const encodedPath = encodeURIComponent(`${owner}/${repo}`);
  const apiBase = `https://gitlab.com/api/v4/projects/${encodedPath}`;

  const projectData = await fetchJson(apiBase) as GitLabProject;

  // Try fetching README from GitLab API
  let readmeText = "";
  try {
    const readmeData = await fetchJson(
      `${apiBase}/repository/files/README.md/raw?ref=${projectData.default_branch || "main"}`
    );
    readmeText = typeof readmeData === "string" ? readmeData : "";
  } catch {
    // README might not exist
  }

  return {
    hasReadme: readmeText.length > 0,
    readmeLength: readmeText.length,
    readmeExcerpt: readmeText.slice(0, 1000),
    hasLicense: false, // GitLab API requires extra call for license
    license: null,
    defaultBranch: projectData.default_branch || null,
    stars: projectData.star_count ?? null,
    language: null, // GitLab doesn't return a primary language from this endpoint
    topics: projectData.topics || [],
    lastPush: projectData.last_activity_at || null,
    openIssues: projectData.open_issues_count ?? null,
  };
}

/**
 * Analyze a Git repository URL. Supports GitHub and GitLab public repos.
 * Returns null if the URL is not recognized or the request fails.
 */
export async function analyzeRepo(repoUrl: string): Promise<RepoAnalysis | null> {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return null;

  try {
    if (parsed.host === "github") {
      return await analyzeGitHub(parsed.owner, parsed.repo);
    } else {
      return await analyzeGitLab(parsed.owner, parsed.repo);
    }
  } catch {
    return null;
  }
}
