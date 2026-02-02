// Cloudflare Worker: POST /extract
// Calls OpenAI Responses API to extract {jobTitle, company, location, statusHint}
// Requires OPENAI_API_KEY secret.

function json(data, status = 200, corsOrigin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function clampText(s, max = 18000) {
  s = (s || "").toString();
  return s.length > max ? s.slice(0, max) : s;
}

function sanitize(text) {
  let t = text || "";
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
  t = t.replace(/\+?\d[\d\s().-]{8,}\d/g, "[redacted-phone]");
  return t;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true }, 200);
    }

    if (url.pathname !== "/extract") return json({ error: "Not found" }, 404);
    if (request.method !== "POST") return json({ error: "Use POST" }, 405);
    if (!env.OPENAI_API_KEY) return json({ error: "Missing OPENAI_API_KEY secret" }, 500);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Body must be JSON" }, 400);
    }

    const pageText = clampText(sanitize(body?.text || ""));
    const pageUrl = (body?.url || "").toString().slice(0, 500);
    const pageTitle = (body?.title || "").toString().slice(0, 300);

    if (!pageText && !pageTitle) return json({ error: "Missing text/title" }, 400);

    const system = `You extract job application info from messy career/job pages.
Return ONLY valid JSON with EXACT keys:
{
  "jobTitle": string,
  "company": string,
  "location": string,
  "statusHint": "submitted" | "unknown"
}
Rules:
- Prefer the company name shown on the page (not job board name).
- If missing, infer company from page title/URL only if very confident; otherwise empty string.
- Keep strings short (<=120 chars).
- statusHint = "submitted" only if text strongly indicates application submission/confirmation.`;

    const input = [
      { role: "system", content: system },
      { role: "user", content: `URL: ${pageUrl}\nTITLE: ${pageTitle}\n\nTEXT:\n${pageText}` }
    ];

    const openaiResp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input,
        response_format: { type: "json_object" }
      })
    });

    if (!openaiResp.ok) {
      const errText = await openaiResp.text().catch(() => "");
      return json(
        { error: "OpenAI request failed", status: openaiResp.status, details: errText.slice(0, 500) },
        502
      );
    }

    const data = await openaiResp.json();

    let extracted = null;
    try {
      const txt =
        data?.output?.[0]?.content?.find((c) => c.type === "output_text")?.text ||
        data?.output_text ||
        "";
      if (txt) extracted = JSON.parse(txt);
    } catch {
      extracted = null;
    }

    if (!extracted || typeof extracted !== "object") return json({ error: "Could not parse model JSON" }, 500);

    const result = {
      jobTitle: (extracted.jobTitle || "").toString().slice(0, 120),
      company: (extracted.company || "").toString().slice(0, 120),
      location: (extracted.location || "").toString().slice(0, 120),
      statusHint: extracted.statusHint === "submitted" ? "submitted" : "unknown"
    };

    return json(result);
  }
};
