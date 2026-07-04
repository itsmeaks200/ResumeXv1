import os
import re
import json
import urllib.request
import pdfplumber
import docx
from groq import Groq
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")


# ---------------------------------------------------------------------------
# GitHub helpers
# ---------------------------------------------------------------------------

def _extract_github_repos(text: str) -> list:
    """Return deduplicated (owner, repo) tuples found anywhere in the text."""
    pattern = r"github\.com/([a-zA-Z0-9._-]+)/([a-zA-Z0-9._-]+)"
    seen = set()
    result = []
    for owner, repo in re.findall(pattern, text):
        repo = repo.rstrip(".,;)/")   # strip trailing punctuation the regex may grab
        key = (owner.lower(), repo.lower())
        if key not in seen:
            seen.add(key)
            result.append((owner, repo))
    return result


def _fetch_github_metadata(owner: str, repo: str) -> dict:
    """
    Hit the public GitHub API (no token required for public repos) and the
    raw README endpoint to build a short context block for the LLM.
    Times out quickly so a bad URL never stalls the parser.
    """
    meta = {
        "url": f"https://github.com/{owner}/{repo}",
        "description": None,
        "readme_gist": None,
    }

    # 1. Repo metadata (description, topics, etc.)
    try:
        req = urllib.request.Request(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers={
                "User-Agent": "ResumeX-Parser/1.0",
                "Accept": "application/vnd.github+json",
            },
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode())
            meta["description"] = data.get("description") or None
    except Exception:
        pass  # network or 404 — silently continue

    # 2. README gist (first ~400 readable characters)
    for branch in ("main", "master"):
        try:
            raw_url = (
                f"https://raw.githubusercontent.com/{owner}/{repo}"
                f"/{branch}/README.md"
            )
            req = urllib.request.Request(
                raw_url, headers={"User-Agent": "ResumeX-Parser/1.0"}
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                content = resp.read().decode("utf-8", errors="ignore")
                # Strip markdown badges, HTML tags, and blank lines
                lines = [
                    l.strip()
                    for l in content.splitlines()
                    if l.strip()
                    and not l.startswith("![")
                    and not l.startswith("<")
                    and not l.startswith("[![")
                ]
                gist = " ".join(lines)[:400].strip()
                if gist:
                    meta["readme_gist"] = gist
                break
        except Exception:
            continue

    return meta


def _build_github_context(text: str) -> str:
    """
    Discover all GitHub repo URLs in *text*, fetch live metadata for each,
    and return a formatted section ready to be appended to the LLM prompt.
    Returns an empty string if no repos are found.
    """
    repos = _extract_github_repos(text)
    if not repos:
        return ""

    lines = ["GitHub Repository Details (fetched live):"]
    for owner, repo in repos:
        meta = _fetch_github_metadata(owner, repo)
        lines.append(f"\n  URL: {meta['url']}")
        if meta["description"]:
            lines.append(f"  Description: {meta['description']}")
        if meta["readme_gist"]:
            lines.append(f'  README Gist: "{meta["readme_gist"]}"')

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract body text and collect all hyperlink URIs from every page.
    GitHub URIs are appended as plain text so the regex in _extract_github_repos
    can find them alongside any typed-out URLs in the resume body.
    """
    text = ""
    seen_uris: set = set()
    github_uris: list = []

    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"

            for link in page.hyperlinks:
                uri = link.get("uri", "")
                if uri and uri not in seen_uris:
                    seen_uris.add(uri)
                    if "github.com" in uri.lower():
                        github_uris.append(uri)

    if github_uris:
        text += "\n\nGitHub URLs from PDF hyperlinks:\n" + "\n".join(github_uris)

    return text.strip()


def extract_text_from_docx(file_path: str) -> str:
    doc = docx.Document(file_path)
    return "\n".join(para.text for para in doc.paragraphs if para.text.strip())


def extract_text(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext in (".docx", ".doc"):
        return extract_text_from_docx(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")


# ---------------------------------------------------------------------------
# LLM prompt
# ---------------------------------------------------------------------------

PARSE_PROMPT = """\
You are a resume parser. Extract structured information from the resume text below.

Return a JSON object with this exact schema:
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "linkedin": "string or null",
  "github": "string or null",
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "field": "string",
      "gpa": "string or null",
      "start_year": "string or null",
      "end_year": "string or null"
    }
  ],
  "experience": [
    {
      "company": "string",
      "role": "string",
      "start_date": "string",
      "end_date": "string or null (null if current)",
      "website": "string or null",
      "bullets": ["list of bullet point strings"]
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "tech_stack": ["list of technologies used"],
      "github_url": "string or null",
      "live_url": "string or null",
      "bullets": ["list of detail strings"]
    }
  ],
  "skills": {
    "languages": ["e.g. Python, C++, Java"],
    "frameworks": ["e.g. React, Express, Django"],
    "tools": ["e.g. Git, Docker, AWS"],
    "databases": ["e.g. PostgreSQL, MongoDB"],
    "other": ["anything that doesn't fit above"]
  },
  "certifications": [
    {
      "name": "string",
      "issuer": "string or null",
      "year": "string or null"
    }
  ]
}

Rules:
- Only return the JSON object, no markdown, no explanation.
- If a field is not found in the resume, use null or empty array as appropriate.
- Normalize skill aliases (JS -> JavaScript, ML -> Machine Learning, etc.)
- Infer tech_stack from project descriptions if not explicitly listed.
- A "GitHub Repository Details" section may appear at the end of the text.
  Use it to:
    1. Match each GitHub URL to the correct project by comparing the repo name
       and description/README gist against the project names on the resume.
    2. Set github_url for the matched project.
    3. Enrich the project description and tech_stack using README content if
       the resume entry is sparse.
- live_url is for deployed/demo links (not GitHub).

Resume text:
"""


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def parse_resume(file_path: str) -> dict:
    raw_text = extract_text(file_path)

    # Fetch live GitHub metadata and append as extra context for the LLM
    github_context = _build_github_context(raw_text)
    prompt_text = raw_text
    if github_context:
        prompt_text += "\n\n" + github_context

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

    # 4096 tokens gives ~3x headroom over typical resume JSON output (~1500 tokens).
    # Lower values risk truncating mid-JSON on detailed resumes.
    message = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": PARSE_PROMPT + prompt_text,
            }
        ],
    )

    response_text = message.choices[0].message.content.strip()

    # Strip markdown code fences if model wraps response in ```json ... ```
    if response_text.startswith("```"):
        response_text = response_text.split("```")[1]
        if response_text.startswith("json"):
            response_text = response_text[4:]
        response_text = response_text.strip()

    return json.loads(response_text)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python resume_parser.py <path_to_resume>")
        sys.exit(1)

    result = parse_resume(sys.argv[1])
    print(json.dumps(result, indent=2))
