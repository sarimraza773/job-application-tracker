// ai-backend-cloudflare-worker/worker.js
// Cloudflare Worker: POST /extract -> returns { jobTitle, company, location, statusHint }
//
// Before deploying, set a secret:
//   wrangler secret put OPENAI_API_KEY
//
// This keeps your OpenAI key off the client (Chrome extension).

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
  const t = (s || "").toString();
  return t.length > max ? t.slice(0, max) : t;
}

// basic PII-ish scrubbing (best-effort)
function sanitize(text) {
  let t = (text || "").toString();
  // emails
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
  // phone-ish
  t = t.replace(/\+?\d[\d\s().-]{8,}\d/g, "[redacted-phone]");
  return t;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return json({ ok: true }, 200);
    }

    if (url.pathname !== "/extract") {
      return json({ error: "Not found" }, 404);
    }

    if (request.method !== "POST") {
      return json({ error: "Use POST" }, 405);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY secret" }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Body must be JSON" }, 400);
    }

    const pageText = clampText(sanitize(body?.text || ""));
    const pageUrl = (body?.url || "").toString().slice(0, 500);
    const pageTitle = (body?.title || "").toString().slice(0, 300);

    if (!pageText && !pageTitle) {
      return json({ error: "Missing text/title" }, 400);
    }

    const systemPrompt = `
You extract job application info from messy career/job pages.

Return ONLY valid JSON with EXACT keys:
{
  "jobTitle": string,
  "company": string,
  "location": string,
  "statusHint": "submitted" | "unknown"
}

Rules:
- Prefer company name shown on the page (not the job board / ATS brand).
- If company isn't present, infer from URL/title only if very confident; otherwise empty string.
- Keep strings short (<=120 chars).
- statusHint = "submitted" only if text strongly indicates submission/confirmation.
`.trim();

    const input = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `URL: ${pageUrl}\nTITLE: ${pageTitle}\n\nTEXT:\n${pageText}`.trim()
      }
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
        {
          error: "OpenAI request failed",
          status: openaiResp.status,
          details: errText.slice(0, 500)
        },
        502
      );
    }

    const data = await openaiResp.json();

    // Extract model JSON text from Responses API output
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

    if (!extracted || typeof extracted !== "object") {
      return json({ error: "Could not parse model JSON" }, 500);
    }

    const result = {
      jobTitle: (extracted.jobTitle || "").toString().slice(0, 120),
      company: (extracted.company || "").toString().slice(0, 120),
      location: (extracted.location || "").toString().slice(0, 120),
      statusHint: extracted.statusHint === "submitted" ? "submitted" : "unknown"
    };

    return json(result);
  }
};
