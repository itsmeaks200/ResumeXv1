const GITHUB_API = "https://api.github.com";

// Read token lazily so dotenv has time to load
function getHeaders() {
  const h = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "ResumeX-Interview",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function decodeBase64(encoded) {
  // Buffer-based decode works in Node.js (atob is browser-only)
  return Buffer.from(encoded.replace(/\n/g, ""), "base64").toString("utf-8");
}

function cleanReadme(raw) {
  return raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/#{1,6}\s+/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 500);
}

export async function analyzeGithubRepo(githubUrl) {
  if (!githubUrl) return null;

  // Parse owner/repo from URL
  const match = githubUrl.match(/github\.com\/([^/\s]+)\/([^/\s?#]+)/i);
  if (!match) return null;
  const [, owner, repo] = match;

  try {
    const [repoRes, readmeRes, langsRes] = await Promise.all([
      fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers: getHeaders() }),
      fetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`, { headers: getHeaders() }),
      fetch(`${GITHUB_API}/repos/${owner}/${repo}/languages`, { headers: getHeaders() }),
    ]);

    if (!repoRes.ok) {
      console.warn(`GitHub API ${repoRes.status} for ${owner}/${repo}`);
      return null;
    }

    const [repoData, langsData] = await Promise.all([
      repoRes.json(),
      langsRes.ok ? langsRes.json() : Promise.resolve({}),
    ]);

    let readmeSnippet = "";
    if (readmeRes.ok) {
      const readmeData = await readmeRes.json();
      readmeSnippet = cleanReadme(decodeBase64(readmeData.content));
    }

    const techStack = Object.keys(langsData).slice(0, 6);

    return {
      name: repoData.name,
      description: repoData.description || "",
      primaryLanguage: repoData.language || "Unknown",
      techStack,
      stars: repoData.stargazers_count,
      url: repoData.html_url,
      readmeSnippet,
    };
  } catch (err) {
    console.warn(`GitHub fetch failed for ${owner}/${repo}:`, err.message);
    return null;
  }
}

export async function analyzeGithubRepos(urls) {
  const results = await Promise.all(urls.map(analyzeGithubRepo));
  return results.filter(Boolean);
}
