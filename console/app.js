// APE console client — DOM-built UI with no HTML-string rendering and no
// inline handlers.
//
// Every dynamic value reaches the page via textContent (never HTML parsing),
// so hostile trace summaries, profile names, or connector names render as
// inert text. Rows that act (run detail, loadDoc, analyze) carry data-*
// attributes; one delegated listener per container dispatches them.
//
// Auth: the CLI opens the console with ?t=<per-session token>. It is read
// once, stripped from the address bar, kept in memory only, and sent as
// Authorization: Bearer on every /api call. It never goes into fetch URLs,
// localStorage, or the share page.
let since = 0;
let editKind = null;
let editName = null;

const TOKEN = (() => {
  try {
    const t = new URLSearchParams(location.search).get("t") || "";
    if (t) history.replaceState(null, "", location.pathname);
    return t;
  } catch {
    return "";
  }
})();

function $(id) {
  return document.getElementById(id);
}

function el(tag, text, attrs) {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = String(text);
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function td(text) {
  return el("td", text ?? "");
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function setStatus(msg) {
  const s = $("status");
  if (s) s.textContent = msg;
}

async function api(path, opts) {
  const r = await fetch(path, {
    ...(opts || {}),
    headers: { ...(opts && opts.headers ? opts.headers : {}), ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}) },
  });
  if (r.status === 401 || r.status === 403) {
    const body = await r.text().catch(() => "");
    throw new Error(`console API denied (${r.status}): ${body.slice(0, 120) || "check the session token"}`);
  }
  return r.json();
}

function apiPost(path, payload) {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function sliceTime(ts) {
  return String(ts || "").slice(11, 19);
}

// --- tabs (data-tab buttons, one listener) ---
document.querySelectorAll("nav button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    ["trace", "tasks", "runs", "graph", "exp", "ledger", "mods", "agent"].forEach(
      (t) => { $("tab-" + t).hidden = t !== b.dataset.tab; },
    );
  });
});

// --- tool picker ---
async function init() {
  try {
    const t = await api("/api/tools");
    const tools = t.tools || [];
    const sel = $("tool");
    clear(sel);
    for (const x of tools) {
      const o = document.createElement("option");
      o.textContent = x.name;
      sel.appendChild(o);
    }
    setStatus(`${tools.length} tools · ttlMs ${t.ttlMs}`);
  } catch (e) {
    setStatus(String(e.message || e));
  }
}

// --- live trace / tasks / ledger / spend ---
async function poll() {
  try {
    const r = await api("/api/trace?since=" + since);
    since = r.count || since;
    const tb = $("rows");
    for (const e of (r.events || []).slice(-30)) {
      const tr = document.createElement("tr");
      tr.className = "fadein";
      tr.appendChild(td(sliceTime(e.ts)));
      tr.appendChild(td(e.tool));
      tr.appendChild(td(e.durationMs));
      tr.appendChild(td(String(e.resultSummary || "").slice(0, 120)));
      tb.prepend(tr);
    }
    while (tb.rows.length > 30) tb.deleteRow(-1);
  } catch { /* keep last frame */ }
  try {
    const t = await api("/api/tasks");
    const tt = $("taskrows");
    clear(tt);
    for (const x of t.tasks || []) {
      const tr = document.createElement("tr");
      tr.appendChild(td(x.id));
      tr.appendChild(td(x.tool));
      tr.appendChild(td(x.status));
      tr.appendChild(td(sliceTime(x.finished) === "" ? "—" : sliceTime(x.finished)));
      tt.appendChild(tr);
    }
  } catch { /* keep last frame */ }
  try {
    const L = await api("/api/ledger");
    const lr = $("ledgerrows");
    clear(lr);
    for (const e of L.entries || []) {
      const d = (e.kind || "") === "agent.destructive";
      const tr = document.createElement("tr");
      if (d) tr.setAttribute("style", "background:#3b1a1a");
      tr.appendChild(td(sliceTime(e.ts)));
      const kind = td(d ? "⚠ " + (e.kind || "") : (e.kind || ""));
      tr.appendChild(kind);
      tr.appendChild(td(`${e.verdict || ""} ${e.ledger_entry || ""} ${e.tool || ""}`.trim()));
      lr.appendChild(tr);
    }
  } catch { /* keep last frame */ }
  try {
    const S = await api("/api/spend");
    $("spend").textContent = `· spend $${Number(S.today_usd || 0).toFixed(4)}/$${S.daily_cap_usd} · runs ${S.running}/${S.max_concurrent}`;
  } catch { /* keep last frame */ }
}

// --- CLI dispatch ---
async function call() {
  const name = $("tool").value;
  let a = {};
  try {
    a = JSON.parse($("args").value || "{}");
  } catch (e) {
    $("out").textContent = "bad JSON args";
    return;
  }
  try {
    const r = await apiPost("/api/call", { name, arguments: a });
    $("out").textContent = JSON.stringify(r, null, 2).slice(0, 6000);
  } catch (e) {
    $("out").textContent = String(e.message || e).slice(0, 6000);
  }
  poll();
}

// --- graph / experience / mods ---
async function pollSlow() {
  try {
    const g = await api("/api/graph");
    $("graph").textContent = (g.graph?.output || JSON.stringify(g.graph)).slice(0, 3000);
  } catch {
    $("graph").textContent = "graph unavailable";
  }
  try {
    const e = await api("/api/experience");
    const box = $("exp");
    clear(box);
    if ((e.runs || []).length) {
      for (const x of e.runs) {
        const div = document.createElement("div");
        div.appendChild(el("b", x.tool));
        div.appendChild(document.createTextNode(" "));
        div.appendChild(el("span", `${sliceTime(x.ts)} · ${x.durationMs}ms`, { class: "muted" }));
        div.appendChild(document.createElement("br"));
        div.appendChild(document.createTextNode(String(x.resultSummary || "").slice(0, 240)));
        box.appendChild(div);
      }
    } else {
      box.textContent = "no EVE runs yet — use ape_validate_experience";
    }
  } catch { /* keep last frame */ }
  try {
    const m = await api("/api/mods");
    const box = $("mods");
    clear(box);
    for (const x of m.mods || []) {
      const div = document.createElement("div");
      div.appendChild(document.createTextNode(String(x.name) + " "));
      div.appendChild(el("span", `v${x.version} · preCall=${x.preCall} postCall=${x.postCall}`, { class: "muted" }));
      box.appendChild(div);
    }
    const hint = document.createElement("div");
    hint.setAttribute("class", "muted");
    hint.textContent = 'Toggle: mods/<name>/mod.json {"enabled":false}.';
    box.appendChild(hint);
  } catch { /* keep last frame */ }
}

// --- runs table (delegated row clicks via data-run) ---
async function pollRuns() {
  try {
    const R = await api("/api/runs");
    const tb = $("runrows");
    clear(tb);
    for (const x of R.runs || []) {
      const tr = document.createElement("tr");
      tr.setAttribute("data-run", x.run_id || "");
      tr.appendChild(td(String(x.run_id || "").slice(0, 13)));
      tr.appendChild(td(x.profile || ""));
      tr.appendChild(td(String(x.model || "").slice(0, 28)));
      tr.appendChild(td(`${x.status || ""}${x.unverified ? " ⚠" : ""}`));
      tr.appendChild(td(x.step_count ?? ""));
      tr.appendChild(td(`$${Number(x.total_cost || 0).toFixed(4)}`));
      tr.appendChild(td(sliceTime(x.started_at)));
      tb.appendChild(tr);
    }
  } catch { /* keep last frame */ }
}

$("runrows").addEventListener("click", (ev) => {
  const tr = ev.target.closest("tr[data-run]");
  if (tr && tr.dataset.run) showRun(tr.dataset.run);
});

async function showRun(id) {
  try {
    const R = await api("/api/runs/get?run_id=" + encodeURIComponent(id));
    const r = R.run || {};
    const steps = (r.steps || [])
      .map((s) => `#${s.step} [${s.kind}] ${s.tool || "model"} ${s.durationMs || 0}ms ${s.tokens || 0}tok $${Number(s.cost || 0).toFixed(5)}\n  ${String(s.resultSummary || "").slice(0, 200)}`)
      .join("\n");
    $("rundetail").textContent =
      `${r.run_id}\nprofile=${r.profile} model=${r.model} stop=${r.stop_reason}${r.unverified ? " UNVERIFIED" : ""}\n` +
      `steps=${r.step_count} tokens=${r.total_tokens} cost=$${Number(r.total_cost || 0).toFixed(5)}\n` +
      `outcome: ${String(r.outcome || "").slice(0, 600)}\n--- steps ---\n${steps.slice(-3000)}`;
  } catch {
    $("rundetail").textContent = "run unavailable";
  }
}

// --- profiles / connectors (delegated actions via data-action) ---
function docLink(label, action, kind, name, title) {
  const a = document.createElement("a");
  a.setAttribute("href", "#");
  a.dataset.action = action;
  a.dataset.kind = kind;
  a.dataset.name = name;
  if (title) a.setAttribute("title", title);
  a.textContent = label;
  return a;
}

async function pollAgent() {
  try {
    const P = await api("/api/profiles");
    const box = $("profilelist");
    clear(box);
    for (const p of P.profiles || []) {
      const div = document.createElement("div");
      div.appendChild(docLink(p.name, "load", "profile", p.name));
      div.appendChild(document.createTextNode(" "));
      div.appendChild(el("span", `${String(p.description || "").slice(0, 80)} · ${p.model?.provider}/${p.model?.id}`, { class: "muted" }));
      div.appendChild(document.createTextNode(" "));
      div.appendChild(docLink("[analyze]", "analyze", "profile", p.name, "analyze recent runs and propose profile edits"));
      box.appendChild(div);
    }
  } catch { /* keep last frame */ }
  try {
    const C = await api("/api/connectors");
    const box = $("connectorlist");
    clear(box);
    const list = C.connectors || [];
    if (!list.length) {
      box.textContent = "none — create one from the template below";
    } else {
      for (const c of list) {
        const div = document.createElement("div");
        div.appendChild(docLink(c.name, "load", "connector", c.name));
        div.appendChild(document.createTextNode(" "));
        div.appendChild(el("span", `${(c.operations || []).map((o) => o.name).join(", ")} · [${(c.egress_allow || []).join(", ")}]`, { class: "muted" }));
        box.appendChild(div);
      }
    }
  } catch { /* keep last frame */ }
}

$("profilelist").addEventListener("click", agentListClick);
$("connectorlist").addEventListener("click", agentListClick);

function agentListClick(ev) {
  const a = ev.target.closest("a[data-action]");
  if (!a) return;
  ev.preventDefault();
  if (a.dataset.action === "load") loadDoc(a.dataset.kind, a.dataset.name);
  else if (a.dataset.action === "analyze") analyzeProfile(a.dataset.name);
}

async function loadDoc(kind, name) {
  try {
    const R = await api("/api/" + kind + "?name=" + encodeURIComponent(name));
    if (R.yaml) {
      editKind = kind;
      editName = name;
      $("editor").value = R.yaml;
      $("editname").textContent = kind + "/" + name;
      $("editsource").textContent = "(" + R.source + ")";
    }
  } catch { /* keep last frame */ }
}

async function newDoc(kind) {
  try {
    const R = await api("/api/templates");
    editKind = kind;
    editName = "my-" + kind;
    $("editor").value = kind === "profile" ? R.profile : R.connector;
    $("editname").textContent = "new " + kind + " (rename + save)";
    $("editsource").textContent = "";
  } catch { /* keep last frame */ }
}

async function saveDoc() {
  const msg = $("savemsg");
  try {
    const v = $("editor").value;
    const m = v.match(/^name:\s*([A-Za-z0-9_-]+)/m);
    const name = (m && m[1]) || editName || "unnamed";
    // editKind mirrors the pre-rewrite behavior: saving without a loaded or
    // templated doc targets no route. Guard explicitly instead of fetching
    // "/api/null/save".
    if (editKind !== "profile" && editKind !== "connector") {
      msg.textContent = "nothing to save: load or template a doc first";
      return;
    }
    const R = await apiPost("/api/" + editKind + "/save", { name, yaml: v });
    msg.textContent = R.ok ? ("saved " + R.kind + "/" + R.name) : ("error: " + R.error);
    pollAgent();
  } catch (e) {
    msg.textContent = "save failed";
  }
}

async function analyzeProfile(name) {
  const msg = $("savemsg");
  try {
    msg.textContent = "analyzing " + name + "…";
    const R = await apiPost("/api/call", { name: "ape_agent_analyze", arguments: { profile: name, window: 20 } });
    const a = R.structuredContent?.result ?? R;
    const lines = (a.findings || []).map((f) => `· ${f.metric}: ${typeof f.value === "object" ? JSON.stringify(f.value) : f.value} — ${f.detail || ""}`);
    const patches = (a.suggestions || []).map((s) => `→ [${s.finding}] ${s.rationale}${s.patch ? " | patch: " + JSON.stringify(s.patch) : ""}`);
    $("editor").value =
      `# analysis of ${name} (${a.runs ?? 0} runs)\n#\n# findings:\n${lines.map((l) => "# " + l).join("\n")}\n#\n# suggested patches (apply by editing the profile YAML):\n${patches.map((l) => "# " + l).join("\n")}`;
    $("editname").textContent = "analysis/" + name;
    msg.textContent = (a.suggestions || []).length
      ? ((a.suggestions || []).length + " suggestion(s) — review above, then edit + save")
      : "no suggestions (healthy)";
  } catch (e) {
    msg.textContent = "analysis failed";
  }
}

$("btn-new-profile").addEventListener("click", () => newDoc("profile"));
$("btn-new-connector").addEventListener("click", () => newDoc("connector"));
$("btn-save").addEventListener("click", saveDoc);
$("btn-run").addEventListener("click", call);

// --- boot ---
init();
poll();
pollSlow();
pollRuns();
pollAgent();
setInterval(poll, 2000);
setInterval(pollSlow, 10000);

let sseOk = false;
try {
  const es = new EventSource("/api/runs/stream");
  es.addEventListener("run", () => { sseOk = true; pollRuns(); });
  es.addEventListener("step", () => {
    sseOk = true;
    if (!$("tab-runs").hidden) pollRuns();
  });
  es.addEventListener("spend", (e) => {
    try {
      const S = JSON.parse(e.data);
      $("spend").textContent = `· spend $${Number(S.today_usd || 0).toFixed(4)}/$${S.daily_cap_usd} · runs ${S.running}/${S.max_concurrent} · live`;
    } catch { /* keep last frame */ }
  });
  es.addEventListener("error", () => {
    try { es.close(); } catch { /* ignore */ }
    if (!sseOk) setInterval(pollRuns, 5000);
  });
} catch {
  setInterval(pollRuns, 5000);
}

// ambient particle drift (rich motion, paused when hidden)
const bgc = $("bg");
const bx = bgc.getContext("2d");
const BP = [];
function rs() {
  bgc.width = innerWidth;
  bgc.height = innerHeight;
}
rs();
addEventListener("resize", rs);
for (let i = 0; i < 70; i++) BP.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, v: 0.3 + Math.random() * 0.7 });
(function tick() {
  if (!document.hidden) {
    bx.clearRect(0, 0, bgc.width, bgc.height);
    bx.fillStyle = "#f5c542";
    BP.forEach((p) => {
      p.y -= p.v;
      if (p.y < 0) p.y = innerHeight;
      bx.globalAlpha = 0.25;
      bx.fillRect(p.x, p.y, 1.6, 1.6);
    });
    bx.globalAlpha = 1;
  }
  requestAnimationFrame(tick);
})();
