async function msgBackground(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

const aiEndpoint = document.getElementById("aiEndpoint");
const saveAi = document.getElementById("saveAi");
const remindersEnabled = document.getElementById("remindersEnabled");
const lookahead = document.getElementById("lookahead");
const saveRem = document.getElementById("saveRem");

async function load() {
  const res = await msgBackground("GET_SETTINGS", {});
  const s = res.settings || {};
  aiEndpoint.value = s.aiEndpoint || "";
  remindersEnabled.checked = s.remindersEnabled ?? true;
  lookahead.value = s.reminderLookaheadHours ?? 24;
}

saveAi.addEventListener("click", async () => {
  await msgBackground("SET_SETTINGS", { aiEndpoint: aiEndpoint.value.trim() });
  alert("Saved.");
});

saveRem.addEventListener("click", async () => {
  const hours = Number(lookahead.value);
  await msgBackground("SET_SETTINGS", {
    remindersEnabled: remindersEnabled.checked,
    reminderLookaheadHours: Number.isFinite(hours) ? hours : 24
  });
  alert("Saved.");
});

load();
