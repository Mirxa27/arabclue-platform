import { MSG } from "../shared/messages.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const canvas = $("fx");
const cursor = $("cursor");
const ctx = canvas.getContext("2d");

let particles = [];
let performing = false;
let pageContext = null;

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const { width, height } = stage.getBoundingClientRect();
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
addEventListener("resize", resize);

function burst(x, y, n = 18) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.5 + Math.random() * 3;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 1,
      size: 1 + Math.random() * 2.4,
      hue: 160 + Math.random() * 40,
    });
  }
}

function tick() {
  const { width, height } = stage.getBoundingClientRect();
  ctx.clearRect(0, 0, width, height);
  if (performing && particles.length < 80 && Math.random() > 0.6) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.2 - Math.random() * 0.5,
      life: 1,
      size: 0.8 + Math.random() * 1.8,
      hue: 165 + Math.random() * 35,
    });
  }
  const next = [];
  for (const p of particles) {
    p.life -= 0.016;
    if (p.life <= 0) continue;
    p.x += p.vx;
    p.y += p.vy;
    ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${p.life})`;
    ctx.shadowColor = `hsla(${p.hue}, 100%, 70%, ${p.life})`;
    ctx.shadowBlur = 10;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    next.push(p);
  }
  particles = next.slice(-140);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

stage.addEventListener("pointermove", (e) => {
  const rect = stage.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  cursor.style.left = `${x}px`;
  cursor.style.top = `${y}px`;
  if (performing && Math.random() > 0.5) burst(x, y, 2);
});

function setStatus(title, text, live = false) {
  $("statusTitle").textContent = title;
  $("statusText").textContent = text;
  $("pulse").classList.toggle("live", live);
  stage.classList.toggle("performing", live);
  cursor.classList.toggle("busy", live);
  performing = live;
}

function showContext(context) {
  pageContext = context;
  $("pageTitle").textContent = context.title || "Untitled page";
  const link = $("pageUrl");
  link.textContent = context.url || "";
  link.href = context.url || "#";
  const body =
    context.selection ||
    context.text?.slice(0, 1200) ||
    "(empty page text)";
  $("snippet").textContent = body;
}

async function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function loadSettings() {
  const res = await send(MSG.GET_SETTINGS);
  if (res?.settings) $("apiBase").value = res.settings.apiBase || "";
  const ping = await send(MSG.PING);
  $("version").textContent = ping?.version ? `v${ping.version}` : "";
}

async function refreshQueue() {
  const res = await send(MSG.GET_QUEUE_STATUS);
  const panel = $("queuePanel");
  if (!res?.ok || !res.count) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $("queueLabel").textContent =
    res.count === 1
      ? "1 capture waiting offline — retries every minute"
      : `${res.count} captures waiting offline — retries every minute`;
}

async function capture(mode = "page") {
  setStatus("Capturing…", "Reading the active tab into Mission Control.", true);
  burst(120, 80, 30);
  const ctxRes = await send(MSG.GET_PAGE_CONTEXT);
  if (!ctxRes?.ok) {
    setStatus("Capture failed", ctxRes?.error || "Could not read tab", false);
    return;
  }
  showContext(ctxRes.context);
  const text =
    mode === "selection"
      ? ctxRes.context.selection || ctxRes.context.text
      : ctxRes.context.text;
  if (!text?.trim()) {
    setStatus("Nothing to send", "No selection or extractable page text.", false);
    return;
  }
  setStatus("Beaming…", "Uplink to ArabClue Voice Agent in progress.", true);
  const ingest = await send(MSG.SEND_TO_AGENT, {
    payload: {
      mode,
      title: ctxRes.context.title,
      url: ctxRes.context.url,
      text,
      headings: ctxRes.context.headings,
      metaDescription: ctxRes.context.metaDescription,
      source: "chrome-extension",
    },
  });
  if (!ingest?.ok) {
    const hint =
      ingest?.status === 401
        ? "Log in to arabclue.com in this browser, then retry."
        : ingest?.error || "Ingest failed";
    setStatus("Uplink failed", hint, false);
    void refreshQueue();
    return;
  }
  burst(160, 140, 40);
  if (ingest.result?.queued) {
    setStatus("Saved offline", ingest.result.message, false);
  } else {
    setStatus(
      "Agent strengthened",
      ingest.result?.autopilot?.message ||
        ingest.result?.message ||
        "Page context staged in Mission Control.",
      false
    );
  }
  void refreshQueue();
}

async function captureShot() {
  setStatus("Capturing screen…", "PNG screenshot → agent ingest.", true);
  const shot = await send(MSG.CAPTURE_SCREENSHOT);
  if (!shot?.ok || !shot.dataUrl) {
    setStatus("Screenshot failed", shot?.error || "No data", false);
    return;
  }
  const ctxRes = await send(MSG.GET_PAGE_CONTEXT);
  const context = ctxRes?.context || {};
  const ingest = await send(MSG.SEND_TO_AGENT, {
    payload: {
      mode: "screenshot",
      title: context.title || "Screenshot",
      url: context.url || "",
      text: `Screenshot of ${context.title || "page"}\n${context.url || ""}\n${
        context.selection || context.metaDescription || ""
      }`,
      screenshotDataUrl: shot.dataUrl,
      headings: context.headings || [],
      source: "chrome-extension",
    },
  });
  if (!ingest?.ok) {
    setStatus("Uplink failed", ingest?.error || "Ingest failed", false);
    return;
  }
  burst(180, 160, 50);
  setStatus("Screenshot beamed", "Staged for Mission Control classify/route.", false);
}

$("btnCapture").addEventListener("click", () => void capture("page"));
$("btnSelection").addEventListener("click", () => void capture("selection"));
$("btnShot").addEventListener("click", () => void captureShot());
$("btnOpen").addEventListener("click", () => void send(MSG.OPEN_MISSION_CONTROL));
$("btnSave").addEventListener("click", async () => {
  await send(MSG.SET_SETTINGS, {
    settings: { apiBase: $("apiBase").value.trim() },
  });
  setStatus("Saved", "API base updated for this browser profile.", false);
});
$("btnFlush").addEventListener("click", async () => {
  setStatus("Retrying…", "Flushing offline capture queue.", true);
  const res = await send(MSG.FLUSH_QUEUE);
  if (res?.flushed) {
    burst(160, 140, 40);
    setStatus(
      "Queue delivered",
      `${res.flushed} capture(s) beamed into Mission Control.`,
      false
    );
  } else {
    setStatus(
      "Still offline",
      res?.lastError || "Captures kept — auto-retry continues.",
      false
    );
  }
  void refreshQueue();
});

void loadSettings();
void refreshQueue();
setInterval(() => void refreshQueue(), 15_000);
void send(MSG.GET_PAGE_CONTEXT).then((res) => {
  if (res?.ok) showContext(res.context);
});
