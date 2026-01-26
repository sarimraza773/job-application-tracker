const el = (id) => document.getElementById(id);

async function msgBackground(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
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
  const { jobTitle, company, likelyApplied } = resp.data;
  el("jobTitle").value = jobTitle || "";
  el("company").value = company || "";
  el("hint").textContent = likelyApplied
    ? "Looks like an application confirmation page."
    : "Detected from page — double‑check then click Add.";
}

async function addPending() {
  const tab = await getActiveTab();
  const jobTitle = el("jobTitle").value.trim();
  const company = el("company").value.trim();
  if (!jobTitle && !company) {
    el("hint").textContent = "Add at least a job title or company.";
    return;
  }
  await msgBackground("ADD_APPLICATION", {
    jobTitle,
    company,
    url: tab && tab.url ? tab.url : ""
  });
  el("jobTitle").value = "";
  el("company").value = "";
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
          <div class="meta">Added ${formatDate(a.createdAt)} ${
            a.url ? "• <a href='#' data-open='1'>Open</a>" : ""
          }</div>
        </div>
        <div class="badge">${a.status}</div>
      </div>
      <div class="actions">
        <button class="small" data-status="pending">Pending</button>
        <button class="small" data-status="interview">Interview</button>
        <button class="small" data-status="rejected">Rejected</button>
        <button class="small" data-del="1">Delete</button>
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

el("detectBtn").addEventListener("click", detectFromTab);
el("addBtn").addEventListener("click", addPending);
el("filter").addEventListener("change", render);
render();
