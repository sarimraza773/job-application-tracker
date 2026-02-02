/* background.js
 * - Stores applications
 * - Runs follow-up reminders via chrome.alarms + chrome.notifications
 */

const SETTINGS_KEY = "settings";

async function getApplications() {
  const { applications = [] } = await chrome.storage.local.get("applications");
  return applications;
}

async function saveApplications(applications) {
  await chrome.storage.local.set({ applications });
}

async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    aiEndpoint: settings.aiEndpoint || "",
    remindersEnabled: settings.remindersEnabled ?? true,
    reminderLookaheadHours: Number.isFinite(settings.reminderLookaheadHours)
      ? settings.reminderLookaheadHours
      : 24
  };
}

async function saveSettings(partial) {
  const current = await getSettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...current, ...partial }
  });
}

function toISODateOnly(date) {
  // yyyy-mm-dd
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateOnlyToISO(dateOnly) {
  // interpret as local date at 09:00 to avoid timezone edge cases
  if (!dateOnly) return "";
  const [y, m, d] = dateOnly.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d, 9, 0, 0, 0);
  return dt.toISOString();
}

async function runFollowupCheck() {
  const settings = await getSettings();
  if (!settings.remindersEnabled) return;

  const apps = await getApplications();
  const now = new Date();
  const lookaheadMs = settings.reminderLookaheadHours * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() + lookaheadMs);

  // Only pending apps with followUpAt
  const due = apps
    .filter(a => a.status === "pending" && a.followUpAt)
    .map(a => ({ a, t: new Date(a.followUpAt) }))
    .filter(({ t }) => !Number.isNaN(t.getTime()) && t <= cutoff)
    .sort((x, y) => x.t - y.t);

  if (due.length === 0) return;

  const top = due.slice(0, 5).map(({ a, t }) => {
    const d = toISODateOnly(t);
    return `• ${a.jobTitle} @ ${a.company}${a.location ? ` (${a.location})` : ""} — follow up ${d}`;
  });

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: `Follow-ups due (${due.length})`,
    message: top.join("\n"),
    priority: 1
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  // Create a periodic alarm to check follow-ups
  chrome.alarms.create("followup_check", { periodInMinutes: 360 }); // every 6 hours
  await saveSettings({});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "followup_check") {
    runFollowupCheck();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) {
      sendResponse({ ok: false, error: "Invalid message" });
      return;
    }

    if (msg.type === "ADD_APPLICATION") {
      const applications = await getApplications();
      const newApp = {
        id: crypto.randomUUID(),
        jobTitle: msg.payload.jobTitle || "Unknown role",
        company: msg.payload.company || "Unknown company",
        location: msg.payload.location || "",
        status: "pending",
        url: msg.payload.url || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        followUpAt: msg.payload.followUpAt || "",
        notes: msg.payload.notes || ""
      };
      applications.unshift(newApp);
      await saveApplications(applications);
      sendResponse({ ok: true, application: newApp });
      return;
    }

    if (msg.type === "UPDATE_STATUS") {
      const applications = await getApplications();
      const idx = applications.findIndex(a => a.id === msg.payload.id);
      if (idx >= 0) {
        applications[idx].status = msg.payload.status;
        applications[idx].updatedAt = new Date().toISOString();
        await saveApplications(applications);
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "UPDATE_FIELDS") {
      const applications = await getApplications();
      const idx = applications.findIndex(a => a.id === msg.payload.id);
      if (idx >= 0) {
        applications[idx].jobTitle = msg.payload.jobTitle ?? applications[idx].jobTitle;
        applications[idx].company = msg.payload.company ?? applications[idx].company;
        applications[idx].location = msg.payload.location ?? applications[idx].location;
        applications[idx].notes = msg.payload.notes ?? applications[idx].notes;
        if (msg.payload.followUpDate !== undefined) {
          applications[idx].followUpAt = parseDateOnlyToISO(msg.payload.followUpDate);
        }
        applications[idx].updatedAt = new Date().toISOString();
        await saveApplications(applications);
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "DELETE_APPLICATION") {
      const applications = await getApplications();
      const next = applications.filter(a => a.id !== msg.payload.id);
      await saveApplications(next);
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "LIST_APPLICATIONS") {
      const applications = await getApplications();
      sendResponse({ ok: true, applications });
      return;
    }

    if (msg.type === "GET_SETTINGS") {
      const settings = await getSettings();
      sendResponse({ ok: true, settings });
      return;
    }

    if (msg.type === "SET_SETTINGS") {
      await saveSettings(msg.payload || {});
      const settings = await getSettings();
      sendResponse({ ok: true, settings });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })();
  return true;
});
