# job-application-tracker

This repository contains a Chrome extension (MV3) and an optional Cloudflare Worker backend that helps you track your job applications.

## Chrome extension

The extension lives in the `job-tracker-extension/` folder. It allows you to:

- Auto-detect **job title**, **company**, and **location** (best-effort) from the current tab.
- Add applications to a local list and track their status (**pending**, **interview**, **rejected**).
- Edit saved entries (job title, company, location) any time.
- View, filter, and update your applications via the popup UI.

To install the extension in Chrome:

1. Enable Developer mode in `chrome://extensions`.
2. Click **Load unpacked** and select the `job-tracker-extension` directory.
3. Navigate to a job posting, open the extension, click **Detect from this tab**, and add the application.

## Optional AI backend

The `ai-backend-cloudflare-worker/` folder contains a Cloudflare Worker example that can call the OpenAI API to extract structured fields when heuristic extraction fails.

### Deploy

1. Install Wrangler
2. From `ai-backend-cloudflare-worker/`:

```bash
wrangler login
wrangler secret put OPENAI_API_KEY
wrangler deploy
```

The worker exposes `POST /extract`.

## Development

This project is provided as an example and is not published to the Chrome Web Store. Feel free to modify the selectors in `content.js` or add adapters for specific job boards.