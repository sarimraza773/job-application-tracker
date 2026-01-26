/* background.js
 *
 * Handles storage of job applications and responds to messages from the popup.
 */

async function getApplications() {
  const { applications = [] } = await chrome.storage.local.get("applications");
  return applications;
}

async function saveApplications(applications) {
  await chrome.storage.local.set({ applications });
}

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
        status: "pending",
        url: msg.payload.url || "",
        createdAt: new Date().toISOString(),
        notes: ""
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
    // unknown message
    sendResponse({ ok: false, error: "Unknown message type" });
  })();
  // keep message channel alive for asynchronous response
  return true;
});
