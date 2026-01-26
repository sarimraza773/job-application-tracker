/*
 * Example Cloudflare Worker that returns a JSON payload for job extraction.
 *
 * This worker exposes a single endpoint at /extract. When called, it expects
 * the body of the request to contain the raw text or summary of a job
 * application page. It can then call the OpenAI API (not implemented here)
 * to extract structured fields (jobTitle, company, location, statusHint).
 *
 * Before deploying, set a secret named OPENAI_API_KEY via Wrangler:
 *
 *   wrangler secret put OPENAI_API_KEY
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/extract") {
      return new Response(
        JSON.stringify({ error: "Not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    let pageText = "";
    try {
      pageText = await request.text();
    } catch {
      // ignore parse errors
    }
    // TODO: call OpenAI API using env.OPENAI_API_KEY and pageText to extract fields
    // For now, return empty fields.
    const result = {
      jobTitle: "",
      company: "",
      location: "",
      statusHint: ""
    };
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" }
    });
  }
};
