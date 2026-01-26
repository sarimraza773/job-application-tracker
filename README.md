# job-application-tracker

This repository contains a Chrome extension and optional Cloudflare Worker backend that helps you track your job applications.

## Chrome extension

The extension lives in the `job-tracker-extension/` folder. It allows you to:

- Detect job titles and company names on most job application pages.
- Add applications to a local list and track their status (pending, interview, rejected).
- View, filter, and update your applications via the popup UI.

To install the extension in Chrome:

1. Enable Developer mode in `chrome://extensions`.
2. Click **Load unpacked** and select the `job-tracker-extension` directory.
3. Navigate to a job posting, open the extension, click **Detect from this tab**, and add the application.

## Optional AI backend

The `ai-backend-cloudflare-worker/` folder contains an example Cloudflare Worker that you can deploy to enhance extraction when the heuristic extraction fails. It requires an OpenAI API key set via a Wrangler secret (`OPENAI_API_KEY`). Deploy it using [Wrangler](https://developers.cloudflare.com/workers/wrangler/) and configure the endpoint in the extension settings.

## Development

This project is provided as an example and is not published to the Chrome Web Store. Feel free to modify the selectors in `content.js` or add adapters for specific job boards.
