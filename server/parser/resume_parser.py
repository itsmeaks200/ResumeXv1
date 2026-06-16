import os
import json
import pdfplumber
import docx
from groq import Groq
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")


def _find_nearby_text(words: list, link: dict, radius: int = 20) -> str:
    """Return text from words that overlap or are close to the link bounding box."""
    lx0, ly0, lx1, ly1 = link["x0"], link["top"], link["x1"], link["bottom"]
    nearby = []
    for w in words:
        if (w["x0"] <= lx1 + radius and w["x1"] >= lx0 - radius and
                w["top"] <= ly1 + radius and w["bottom"] >= ly0 - radius):
            nearby.append(w["text"])
    return " ".join(nearby).strip()


def extract_text_from_pdf(file_path: str) -> str:
    text = ""
    annotated_links = []
    seen_uris = set()

    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"

            words = page.extract_words()
            for link in page.hyperlinks:
                uri = link.get("uri", "")
                if not uri or uri in seen_uris:
                    continue
                seen_uris.add(uri)
                nearby_text = _find_nearby_text(words, link)
                if nearby_text:
                    annotated_links.append(f'"{nearby_text}" -> {uri}')
                else:
                    annotated_links.append(uri)

    if annotated_links:
        text += "\n\nHyperlinks with context:\n" + "\n".join(annotated_links)

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


PARSE_PROMPT = """
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
- Use the "Hyperlinks with context" section to match GitHub URLs to projects (github.com links) and set github_url accordingly.
- If a hyperlink context text matches or is near a project name, assign that URL to that project's github_url.
- live_url is for deployed/demo links (not GitHub).

Resume text:
"""


def parse_resume(file_path: str) -> dict:
    raw_text = extract_text(file_path)

    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

    message = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": PARSE_PROMPT + raw_text
            }
        ]
    )

    response_text = message.choices[0].message.content.strip()

    # strip markdown code fences if model wraps response in ```json ... ```
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
