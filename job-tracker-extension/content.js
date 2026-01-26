/* content.js
 *
 * Extracts job title and company from job application pages.
 * Uses a set of selectors to attempt to locate the relevant fields and
 * falls back to the document title when necessary.  The extracted values
 * are sent back to the extension's popup via a runtime message.
 */

function clean(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function pickJobTitle() {
  const selectors = [
    "h1",
    "[data-test='job-title']",
    "[data-testid='job-title']",
    ".jobsearch-JobInfoHeader-title",
    ".topcard__title",
    ".jobs-unified-top-card__job-title"
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const txt = clean(el && el.innerText);
    if (txt && txt.length >= 4 && txt.length <= 120) return txt;
  }
  const dt = clean(document.title);
  if (dt) return dt.split("|")[0].split("-")[0].trim();
  return "";
}

function pickCompany() {
  const selectors = [
    "[data-test='employer-name']",
    "[data-testid='company-name']",
    ".topcard__org-name-link",
    ".jobs-unified-top-card__company-name",
    ".jobsearch-InlineCompanyRating div:first-child"
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const txt = clean(el && el.innerText);
    if (txt && txt.length >= 2 && txt.length <= 80) return txt;
  }
  // Meta fallback
  const ogSite = document.querySelector("meta[property='og:site_name']")?.content;
  if (ogSite) return clean(ogSite);
  return "";
}

function looksLikeConfirmationPage() {
  const body = clean(document.body?.innerText).toLowerCase();
  return (
    body.includes("application submitted") ||
    body.includes("thank you for applying") ||
    body.includes("we received your application") ||
    body.includes("your application has been submitted")
  );
}

function extractJobInfo() {
  const jobTitle = pickJobTitle();
  const company = pickCompany();
  return {
    jobTitle,
    company,
    url: location.href,
    pageTitle: document.title,
    detectedAt: new Date().toISOString(),
    likelyApplied: looksLikeConfirmationPage()
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "EXTRACT_JOB_INFO") {
    sendResponse({ ok: true, data: extractJobInfo() });
  }
});
