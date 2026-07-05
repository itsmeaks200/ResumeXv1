import { getDocument } from 'pdfjs-dist/legacy/build/pdf.js';
import mammoth from 'mammoth';
import path from 'path';
import fs from 'fs';
import { analyzeGithubRepo } from './github.js';
import { getGroqClient, stripJson } from './groq.js';

const PARSE_PROMPT = `You are a resume parser. Extract structured information from the resume text below.

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
`;

async function extractTextFromPdf(filePath) {
  let text = '';
  const seenUris = new Set();
  const githubUris = [];

  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    
    // Extract body text
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    if (pageText) text += pageText + '\n';

    // Extract hyperlink annotations
    const annotations = await page.getAnnotations();
    for (const annot of annotations) {
      if (annot.subtype === 'Link' && annot.url) {
        const uri = annot.url;
        if (!seenUris.has(uri)) {
          seenUris.add(uri);
          if (uri.toLowerCase().includes('github.com')) {
            githubUris.push(uri);
          }
        }
      }
    }
  }

  if (githubUris.length > 0) {
    text += '\n\nGitHub URLs from PDF hyperlinks:\n' + githubUris.join('\n');
  }

  return text.trim();
}

async function extractTextFromDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value.trim();
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    return await extractTextFromPdf(filePath);
  } else if (ext === '.docx' || ext === '.doc') {
    return await extractTextFromDocx(filePath);
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }
}

function extractGithubRepos(text) {
  const pattern = /github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/g;
  const seen = new Set();
  const repos = [];
  
  let match;
  while ((match = pattern.exec(text)) !== null) {
    let [, owner, repo] = match;
    repo = repo.replace(/[.,;)/]+$/, ''); // strip trailing punctuation
    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      repos.push({ owner, repo });
    }
  }
  return repos;
}

async function buildGithubContext(text) {
  const repos = extractGithubRepos(text);
  if (repos.length === 0) return '';

  const lines = ['GitHub Repository Details (fetched live):'];
  
  // We reuse the existing analyzeGithubRepo logic which already does 
  // exactly what we need (fetching metadata + README and returning an object).
  // We just need to format it into a string for the prompt.
  const promises = repos.map(r => analyzeGithubRepo(`https://github.com/${r.owner}/${r.repo}`));
  const results = await Promise.all(promises);

  for (const meta of results) {
    if (!meta) continue;
    lines.push(`\n  URL: ${meta.url}`);
    if (meta.description) lines.push(`  Description: ${meta.description}`);
    if (meta.readmeSnippet) lines.push(`  README Gist: "${meta.readmeSnippet}"`);
  }

  // If all failed, don't return the header
  if (lines.length === 1) return '';

  return lines.join('\n');
}

export async function parseResumeFile(filePath, mimetype) {
  const rawText = await extractText(filePath);
  const githubContext = await buildGithubContext(rawText);
  
  const promptText = githubContext ? `${rawText}\n\n${githubContext}` : rawText;

  const client = getGroqClient();
  const completion = await client.chat.completions.create({
    model: 'openai/gpt-oss-20b',
    messages: [
      {
        role: 'user',
        content: PARSE_PROMPT + promptText,
      }
    ],
    max_tokens: 4096,
  });

  const responseText = completion.choices[0].message.content.trim();
  const jsonString = stripJson(responseText);
  
  return JSON.parse(jsonString);
}
