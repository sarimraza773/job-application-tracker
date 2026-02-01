/* content.js (upgraded)
 *
 * Extract jobTitle, company, and location from job/job-application pages.
 * Priority:
 *  1) JSON-LD JobPosting
 *  2) Common selectors across major job boards / ATS
 *  3) Meta tags (og:title, og:site_name)
 *  4) Document title parsing
 */

function clean(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function textFrom(sel) {
  const el = document.querySelector(sel);
  return clean(el?.innerText || el?.textContent);
}

function meta(nameOrProp) {
  return clean(
    document.querySelector(`meta[name="${nameOrProp}"]`)?.content ||
      document.querySelector(`meta[property="${nameOrProp}"]`)?.content
  );
}

function parseJsonLdJobPosting() {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
  for (const s of scripts) {
    try {
      const raw = JSON.parse(s.textContent || "{}");
      const nodes = Array.isArray(raw) ? raw : [raw];

      const scan = (node) => {
        if (!node) return null;
        if (node["@graph"] && Array.isArray(node["@graph"])) {
          for (const g of node["@graph"]) {
            const r = scan(g);
            if (r) return r;
          }
        }

        const type = node?.["@type"];
        const isJob =
          type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
        if (!isJob) return null;

        const jobTitle = clean(node?.title);
        const org = node?.hiringOrganization;
        const company = clean(typeof org === "string" ? org : org?.name || org?.legalName);

        let location = "";
        const jl = node?.jobLocation;
        const addr = Array.isArray(jl) ? jl[0]?.address : jl?.address;
        if (addr) {
          const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(
            Boolean
          );
          location = clean(parts.join(", "));
        }

        return { jobTitle, company, location };
      };

      for (const n of nodes) {
        const r = scan(n);
        if (r) return r;
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return null;
}

function guessFromDocumentTitle() {
  const dt = clean(document.title);
  if (!dt) return { jobTitle: "", company: "" };

  const parts = dt.split("|").map(clean).filter(Boolean);
  const main = parts[0] || dt;
  const dashParts = main.split(" - ").map(clean).filter(Boolean);

  if (dashParts.length >= 2) {
    return { jobTitle: dashParts[0], company: dashParts[1] };
  }
  return { jobTitle: main, company: "" };
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
  // 1) JSON-LD
  const ld = parseJsonLdJobPosting();
  if (ld && (ld.jobTitle || ld.company || ld.location)) {
    return { ...ld, confidence: 0.95 };
  }

  // 2) Common selectors
  const titleSelectors = [
    ".jobs-unified-top-card__job-title", // LinkedIn
    ".topcard__title",
    ".jobsearch-JobInfoHeader-title", // Indeed-ish
    "[data-test='job-title']",
    "[data-testid='job-title']",
    "h1"
  ];

  const companySelectors = [
    ".jobs-unified-top-card__company-name",
    ".topcard__org-name-link",
    "[data-test='employer-name']",
    "[data-testid='company-name']",
    ".jobsearch-InlineCompanyRating div:first-child"
  ];

  const locationSelectors = [
    ".jobs-unified-top-card__bullet",
    "[data-testid='job-location']",
    "[data-test='job-location']",
    ".location",
    ".jobsearch-JobInfoHeader-subtitle div:last-child"
  ];

  let jobTitle = "";
  for (const s of titleSelectors) {
    jobTitle = textFrom(s);
    if (jobTitle && jobTitle.length <= 140) break;
  }

  let company = "";
  for (const s of companySelectors) {
    company = textFrom(s);
    if (company && company.length <= 120) break;
  }

  let location = "";
  for (const s of locationSelectors) {
    location = textFrom(s);
    if (location && location.length <= 140) break;
  }

  // 3) Meta fallbacks
  if (!jobTitle) {
    const ogt = meta("og:title");
    if (ogt) jobTitle = ogt.split("|")[0].split("-")[0].trim();
  }

  if (!company) {
    const ogSite = meta("og:site_name");
    if (ogSite && ogSite.length <= 120) company = ogSite;
  }

  // 4) Document title fallback
  if (!jobTitle || !company) {
    const g = guessFromDocumentTitle();
    if (!jobTitle) jobTitle = g.jobTitle;
    if (!company) company = g.company;
  }

  // Confidence scoring
  let confidence = 0.35;
  if (jobTitle) confidence += 0.25;
  if (company) confidence += 0.25;
  if (location) confidence += 0.15;
  confidence = Math.min(confidence, 0.9);

  return { jobTitle, company, location, confidence };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "EXTRACT_JOB_INFO") {
    const extracted = extractJobInfo();
    sendResponse({
      ok: true,
      data: {
        ...extracted,
        url: location.href,
        pageTitle: document.title,
        detectedAt: new Date().toISOString(),
        likelyApplied: looksLikeConfirmationPage()
      }
    });
  }

  if (msg?.type === "GET_PAGE_TEXT") {
    // Best-effort text snapshot for AI extraction. Limit size to avoid huge payloads.
    const text = (document.body?.innerText || "").slice(0, 20000);
    sendResponse({
      ok: true,
      text,
      title: document.title,
      url: location.href
    });
  }
});
