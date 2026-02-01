const el = (id) => document.getElementById(id);

async function msgBackground(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getAiEndpoint() {
  const { aiEndpoint = "" } = await chrome.storage.local.get("aiEndpoint");
  return (aiEndpoint || "").trim();
}

async function setAiEndpoint(aiEndpoint) {
  await chrome.storage.local.set({ aiEndpoint: (aiEndpoint || "").trim() });
}

async function aiExtractIfNeeded(tab, detected) {
  const endpoint = await getAiEndpoint();
  if (!endpoint) return null;

  const missingCritical = !detected.jobTitle || !detected.company;
  const lowConfidence = (detected.confidence || 0) < 0.7;
  if (!missingCritical && !lowConfidence) return null;

  // Grab a text snapshot from the page
  const snap = await chrome.tabs
    .sendMessage(tab.id, { type: "GET_PAGE_TEXT" })
    .catch(() => null);
  if (!snap?.ok) return null;

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: snap.text, url: snap.url, title: snap.title })
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return {
      jobTitle: (json.jobTitle || "").trim(),
      company: (json.company || "").trim(),
      location: (json.location || "").trim(),
      statusHint: json.statusHint || "unknown"
    };
  } catch {
    return null;
  }
}

async function detectFromTab() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  const resp = await chrome.tabs
    .sendMessage(tab.id, { type: "EXTRACT_JOB_INFO" })
    .catch(() => null);

  if (!resp?.ok) {
    el("hint").textContent =
      "Could not detect on this page (page may block scripts). Enter manually.";
    return;
  }

  const detected = resp.data;
  const { likelyApplied, confidence } = detected;

  // Fill from heuristic detection first
  el("jobTitle").value = detected.jobTitle || "";
  el("company").value = detected.company || "";
  el("location").value = detected.location || "";

  const pct = Math.round(((confidence || 0) * 100) || 0);
  el("hint").textContent =
    (likelyApplied ? "Looks like an application confirmation page. " : "") +
    `Detected (confidence: ${pct}%).`;

  // If weak, try AI extraction (if configured)
  const ai = await aiExtractIfNeeded(tab, detected);
  if (ai) {
    if (ai.jobTitle) el("jobTitle").value = ai.jobTitle;
    if (ai.company) el("company").value = ai.company;
    if (ai.location) el("location").value = ai.location;
    el("hint").textContent += " AI improved extraction — double-check then click Add.";
  } else {
    el("hint").textContent += " Double-check then click Add.";
  }
}

async function addPending() {
  const tab = await getActiveTab();

  const jobTitle = el("jobTitle").value.trim();
  const company = el("company").value.trim();
  const location = el("location").value.trim();

  if (!jobTitle && !company) {
    el("hint").textContent = "Add at least a job title or company.";
    return;
  }

  await msgBackground("ADD_APPLICATION", {
    jobTitle,
    company,
    location,
    url: tab?.url || ""
  });

  el("jobTitle").value = "";
  el("company").value = "";
  el("location").value = "";
  el("hint").textContent = "Added.";

  await render();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString();
}

async function updateStatus(id, status) {
  await msgBackground("UPDATE_STATUS", { id, status });
  await render();
}

async function updateFields(id, fields) {
  await msgBackground("UPDATE_FIELDS", { id, ...fields });
  await render();
}

async function del(id) {
  await msgBackground("DELETE_APPLICATION", { id });
  await render();
}

function matchesFilter(app, filter) {
  if (filter === "all") return true;
  return app.status === filter;
}

async function render() {
  const filter = el("filter").value;
  const res = await msgBackground("LIST_APPLICATIONS", {});
  const list = el("list");
  list.innerHTML = "";

  const apps = (res.applications || []).filter((a) => matchesFilter(a, filter));

  if (apps.length === 0) {
    list.innerHTML = `<div class="item">No applications yet.</div>`;
    return;
  }

  for (const a of apps) {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div class="top">
        <div>
          <div class="title">${escapeHtml(a.jobTitle)} — ${escapeHtml(a.company)}</div>
          <div class="meta">
            ${a.location ? escapeHtml(a.location) + " • " : ""}
            Added ${formatDate(a.createdAt)}
            ${a.url ? "• <a href='#' data-open='1'>Open</a>" : ""}
          </div>
        </div>
        <div class="badge">${a.status}</div>
      </div>

      <div class="actions">
        <button class="small" data-status="pending">Pending</button>
        <button class="small" data-status="interview">Interview</button>
        <button class="small" data-status="rejected">Rejected</button>
        <button class="small" data-edit="1">Edit</button>
        <button class="small" data-del="1">Delete</button>
      </div>

      <div class="edit" style="display:none; margin-top:8px;">
        <div class="row">
          <input data-edit-title placeholder="Job title" value="${escapeHtml(a.jobTitle)}" />
        </div>
        <div class="row">
          <input data-edit-company placeholder="Company" value="${escapeHtml(a.company)}" />
          <input data-edit-location placeholder="Location" value="${escapeHtml(a.location || "")}" />
        </div>
        <div class="actions">
          <button class="small" data-save="1">Save</button>
          <button class="small" data-cancel="1">Cancel</button>
        </div>
      </div>
    `;

    // status buttons
    div.querySelectorAll("button[data-status]").forEach((btn) => {
      btn.addEventListener("click", () => updateStatus(a.id, btn.dataset.status));
    });

    // open link
    const openLink = div.querySelector("a[data-open='1']");
    if (openLink) {
      openLink.addEventListener("click", async (e) => {
        e.preventDefault();
        if (a.url) await chrome.tabs.create({ url: a.url });
      });
    }

    // delete
    div.querySelector("button[data-del='1']").addEventListener("click", () => del(a.id));

    // edit toggle
    const editWrap = div.querySelector(".edit");
    div.querySelector("button[data-edit='1']").addEventListener("click", () => {
      editWrap.style.display = editWrap.style.display === "none" ? "block" : "none";
    });

    // cancel
    div.querySelector("button[data-cancel='1']").addEventListener("click", () => {
      editWrap.style.display = "none";
    });

    // save
    div.querySelector("button[data-save='1']").addEventListener("click", async () => {
      const newTitle = div.querySelector("input[data-edit-title]").value.trim();
      const newCompany = div.querySelector("input[data-edit-company]").value.trim();
      const newLocation = div.querySelector("input[data-edit-location]").value.trim();

      await updateFields(a.id, {
        jobTitle: newTitle,
        company: newCompany,
        location: newLocation
      });
    });

    list.appendChild(div);
  }
}

function escapeHtml(str) {
  return (str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function initSettings() {
  // load stored endpoint
  el("aiEndpoint").value = await getAiEndpoint();

  el("settingsToggle").addEventListener("click", () => {
    const panel = el("settingsPanel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  el("saveEndpoint").addEventListener("click", async () => {
    await setAiEndpoint(el("aiEndpoint").value);
    el("hint").textContent = "AI endpoint saved.";
  });
}

el("detectBtn").addEventListener("click", detectFromTab);
el("addBtn").addEventListener("click", addPending);
el("filter").addEventListener("change", render);

initSettings();
render();
