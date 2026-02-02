const el = (id) => document.getElementById(id);

async function msgBackground(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function escapeHtml(str) {
  return (str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function toDateOnly(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function callAIExtract(pageText, pageTitle, pageUrl) {
  const { settings } = await msgBackground("GET_SETTINGS", {});
  const endpoint = settings?.aiEndpoint || "";
  if (!endpoint) return null;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: pageText, title: pageTitle, url: pageUrl })
  }).catch(() => null);

  if (!resp || !resp.ok) return null;
  const data = await resp.json().catch(() => null);
  if (!data || typeof data !== "object") return null;
  return data;
}

async function detectFromTab() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;

  const resp = await chrome.tabs
    .sendMessage(tab.id, { type: "EXTRACT_JOB_INFO" })
    .catch(() => null);

  if (!resp || !resp.ok) {
    el("hint").textContent =
      "Could not detect on this page (page may block scripts). Enter manually.";
    return;
  }

  const { jobTitle, company, location, likelyApplied, confidence } = resp.data;
  el("jobTitle").value = jobTitle || "";
  el("company").value = company || "";
  el("location").value = location || "";

  // AI fallback when confidence is low or key fields missing
  const needsAI = (!jobTitle || !company) || (typeof confidence === "number" && confidence < 0.7);

  if (needsAI) {
    el("hint").textContent = "Low confidence — trying AI…";
    const page = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_TEXT" }).catch(() => null);
    if (page?.ok) {
      const ai = await callAIExtract(page.text, page.title, page.url);
      if (ai) {
        if (ai.jobTitle && !el("jobTitle").value) el("jobTitle").value = ai.jobTitle;
        if (ai.company && !el("company").value) el("company").value = ai.company;
        if (ai.location && !el("location").value) el("location").value = ai.location;
        el("hint").textContent = (likelyApplied ? "Looks like an application confirmation page. " : "") +
          "Detected with AI assist — double‑check then Add.";
        return;
      }
    }
  }

  el("hint").textContent = (likelyApplied ? "Looks like an application confirmation page. " : "") +
    `Detected (confidence: ${Math.round((confidence || 0) * 100)}%). Double-check then Add.`;
}

async function addPending() {
  const tab = await getActiveTab();
  const jobTitle = el("jobTitle").value.trim();
  const company = el("company").value.trim();
  const location = el("location").value.trim();
  const followUpDate = el("followUpDate").value;

  if (!jobTitle && !company) {
    el("hint").textContent = "Add at least a job title or company.";
    return;
  }

  await msgBackground("ADD_APPLICATION", {
    jobTitle,
    company,
    location,
    url: tab?.url || "",
    followUpAt: followUpDate ? new Date(followUpDate + "T09:00:00").toISOString() : ""
  });

  el("jobTitle").value = "";
  el("company").value = "";
  el("location").value = "";
  el("followUpDate").value = "";
  el("hint").textContent = "Added.";
  await render();
}

async function updateStatus(id, status) {
  await msgBackground("UPDATE_STATUS", { id, status });
  await render();
}

async function del(id) {
  await msgBackground("DELETE_APPLICATION", { id });
  await render();
}

function matchesFilter(app, filter, q) {
  if (filter !== "all" && app.status !== filter) return false;
  if (!q) return true;
  const s = `${app.jobTitle} ${app.company} ${app.location}`.toLowerCase();
  return s.includes(q);
}

function weekKey(date) {
  // Monday-based ISO-ish week label: YYYY-Www
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function drawChart(apps) {
  const canvas = el("chart");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // last 8 weeks buckets
  const now = new Date();
  const buckets = [];
  const counts = new Map();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i * 7);
    const k = weekKey(d);
    buckets.push(k);
    counts.set(k, 0);
  }

  for (const a of apps) {
    const d = new Date(a.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const k = weekKey(d);
    if (counts.has(k)) counts.set(k, counts.get(k) + 1);
  }

  const vals = buckets.map(k => counts.get(k));
  const max = Math.max(1, ...vals);

  const padding = 10;
  const w = canvas.width - padding * 2;
  const h = canvas.height - padding * 2 - 14;
  const barW = Math.floor(w / buckets.length) - 6;

  // axes baseline
  ctx.beginPath();
  ctx.moveTo(padding, padding + h);
  ctx.lineTo(padding + w, padding + h);
  ctx.stroke();

  // bars
  buckets.forEach((k, i) => {
    const v = counts.get(k);
    const bh = Math.round((v / max) * h);
    const x = padding + i * (barW + 6) + 3;
    const y = padding + h - bh;
    ctx.fillRect(x, y, barW, bh);
  });

  // labels (every other)
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  buckets.forEach((k, i) => {
    if (i % 2 !== 0) return;
    const x = padding + i * (barW + 6) + 3 + barW / 2;
    ctx.fillText(k.slice(5), x, padding + h + 3);
  });
}

async function exportCSV() {
  const res = await msgBackground("LIST_APPLICATIONS", {});
  const apps = res.applications || [];
  const header = ["jobTitle","company","location","status","url","createdAt","followUpAt","notes"].join(",");
  const rows = apps.map(a => [
    a.jobTitle,
    a.company,
    a.location,
    a.status,
    a.url,
    a.createdAt,
    a.followUpAt || "",
    (a.notes || "").replace(/\r?\n/g, " ")
  ].map(v => {
    const s = (v ?? "").toString();
    const escaped = s.replaceAll('"', '""');
    return `"${escaped}"`;
  }).join(","));

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  await chrome.downloads.download({
    url,
    filename: `job-applications-${new Date().toISOString().slice(0,10)}.csv`,
    saveAs: true
  });
}

async function render() {
  const filter = el("filter").value;
  const q = el("search").value.trim().toLowerCase();
  const res = await msgBackground("LIST_APPLICATIONS", {});
  const appsAll = res.applications || [];

  // stats
  const pending = appsAll.filter(a => a.status === "pending").length;
  const interview = appsAll.filter(a => a.status === "interview").length;
  const rejected = appsAll.filter(a => a.status === "rejected").length;
  el("counts").textContent = `Pending ${pending} • Interview ${interview} • Rejected ${rejected}`;
  drawChart(appsAll);

  const apps = appsAll.filter(a => matchesFilter(a, filter, q));
  const list = el("list");
  list.innerHTML = "";
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
            ${a.location ? `${escapeHtml(a.location)} • ` : ""}
            Added ${formatDate(a.createdAt)}
            ${a.followUpAt ? `• Follow up ${escapeHtml(formatDate(a.followUpAt))}` : ""}
            ${a.url ? "• <a href='#' data-open='1'>Open</a>" : ""}
          </div>
        </div>
        <div class="badge">${escapeHtml(a.status)}</div>
      </div>

      <div class="actions">
        <button class="small" data-status="pending">Pending</button>
        <button class="small" data-status="interview">Interview</button>
        <button class="small" data-status="rejected">Rejected</button>
        <button class="small" data-edit="1">Edit</button>
        <button class="small" data-del="1">Delete</button>
      </div>

      <div class="edit">
        <div class="row">
          <input data-edit-title placeholder="Job title" value="${escapeHtml(a.jobTitle)}" />
        </div>
        <div class="row">
          <input data-edit-company placeholder="Company" value="${escapeHtml(a.company)}" />
          <input data-edit-location placeholder="Location" value="${escapeHtml(a.location || "")}" />
        </div>
        <div class="row">
          <input data-edit-followup type="date" value="${escapeHtml(toDateOnly(a.followUpAt))}" />
        </div>
        <div class="row">
          <textarea data-edit-notes placeholder="Notes">${escapeHtml(a.notes || "")}</textarea>
        </div>
        <div class="actions">
          <button class="small" data-save="1">Save</button>
          <button class="small" data-cancel="1">Cancel</button>
        </div>
      </div>
    `;

    div.querySelectorAll("button[data-status]").forEach((btn) => {
      btn.addEventListener("click", () => updateStatus(a.id, btn.dataset.status));
    });

    const openLink = div.querySelector("a[data-open='1']");
    if (openLink) {
      openLink.addEventListener("click", async (e) => {
        e.preventDefault();
        if (a.url) await chrome.tabs.create({ url: a.url });
      });
    }

    div.querySelector("button[data-del='1']").addEventListener("click", () => del(a.id));

    const editWrap = div.querySelector(".edit");
    div.querySelector("button[data-edit='1']").addEventListener("click", () => {
      editWrap.style.display = editWrap.style.display === "block" ? "none" : "block";
    });

    div.querySelector("button[data-cancel='1']").addEventListener("click", () => {
      editWrap.style.display = "none";
    });

    div.querySelector("button[data-save='1']").addEventListener("click", async () => {
      const newTitle = div.querySelector("input[data-edit-title]").value.trim();
      const newCompany = div.querySelector("input[data-edit-company]").value.trim();
      const newLocation = div.querySelector("input[data-edit-location]").value.trim();
      const followUpDate = div.querySelector("input[data-edit-followup]").value;
      const notes = div.querySelector("textarea[data-edit-notes]").value;

      await msgBackground("UPDATE_FIELDS", {
        id: a.id,
        jobTitle: newTitle,
        company: newCompany,
        location: newLocation,
        followUpDate,
        notes
      });

      await render();
    });

    list.appendChild(div);
  }
}

el("detectBtn").addEventListener("click", detectFromTab);
el("addBtn").addEventListener("click", addPending);
el("exportBtn").addEventListener("click", exportCSV);
el("filter").addEventListener("change", render);
el("search").addEventListener("input", render);

render();
