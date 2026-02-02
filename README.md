# Job Application Tracker (Chrome Extension)

A Chrome extension to track job applications with **auto-detection** (job title, company, location), **follow-up reminders**, **CSV export**, and **weekly stats**.

## What you get

- Auto-detect job information on most job pages (JSON-LD + heuristics)
- Optional AI fallback (your Cloudflare Worker) when detection is low confidence
- Track statuses: `pending`, `interview`, `rejected`
- Add follow-up dates and get Chrome notification reminders
- Export all applications to CSV
- See last 8 weeks application activity chart

---

## Install the extension locally

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the folder: `job-tracker-extension/`

Use the popup to Detect → Add → manage your list.

---

## Enable AI fallback (optional)

If you want better extraction on tricky ATS pages, deploy the Cloudflare Worker.

### Deploy

From `ai-backend-cloudflare-worker/`:

```powershell
wrangler login
wrangler secret put OPENAI_API_KEY
wrangler deploy
```

Wrangler prints a URL like:

- `https://job-tracker-ai.<your-subdomain>.workers.dev`

Your endpoint is:

- `https://job-tracker-ai.<your-subdomain>.workers.dev/extract`

### Connect it

Open the extension **Settings** page and paste the endpoint into **AI endpoint**.

---

## Follow-up reminders

- Add a follow-up date when you create/edit an application.
- The extension checks periodically (about every 6 hours) and notifies you if follow-ups are due within your configured look-ahead window.

---

## Chrome Web Store prep checklist

- Update `version` in `job-tracker-extension/manifest.json`
- Add store listing assets:
  - 1280×800 screenshots
  - 16/48/128 icon (included)
- Provide a privacy policy (see `PRIVACY.md`)
- Test permissions justification:
  - `tabs` (open job links, read active tab)
  - `storage` (save your list locally)
  - `downloads` (CSV export)
  - `alarms` + `notifications` (follow-up reminders)
  - `host_permissions` `<all_urls>` (detect job pages)

---

## Development notes

- The extension stores everything in `chrome.storage.local`.
- No data is sent anywhere unless you configure the AI endpoint.

