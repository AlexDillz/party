"use strict";
const SECTIONS = [
  { id: "eat", title: "Где поесть", icon: "🍜" },
  { id: "walk", title: "Где погулять", icon: "🌳" },
  { id: "wish", title: "Вишлист", icon: "🎁" },
  { id: "want", title: "Просто хотелки", icon: "✨" },
  { id: "watch", title: "Совместный просмотр", icon: "🎬" },
];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

let code = store.get("code");
let who = store.get("who");
let section = store.get("section") || "eat";
let watchTimer = null;

// ---------- API ----------
async function rpc(fn, args = {}) {
  const r = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CFG.ANON_KEY },
    body: JSON.stringify({ p_code: code, ...args }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
function notify(text) {
  fetch(`${CFG.SUPABASE_URL}/functions/v1/bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, from: who, text }),
  }).catch(() => {});
}

// ---------- screens ----------
function show(id) {
  for (const s of ["screen-code", "screen-app"]) $("#" + s).hidden = s !== id;
  document.body.dataset.theme = id === "screen-app" ? (who === "Вика" ? "vika" : "vitya") : "none";
}
function route() {
  stopWatch();
  if (!code) return show("screen-code");
  show("screen-app");
  $("#me-name").textContent = who;
  $("#me-avatar").src = who === "Вика" ? "img/vika.png" : "img/vitya.png";
  renderTabs();
  renderSection();
}
$("#code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = $("#code-input").value.trim().toLowerCase();
  const err = $("#code-error");
  err.hidden = true;
  code = v;
  try {
    who = await rpc("check_code");
    if (!who) throw 0;
    store.set("code", code);
    store.set("who", who);
    route();
  } catch {
    code = null;
    err.textContent = "Мяу? Такого номерка нет 🙀";
    err.hidden = false;
  }
});
$("#profile").addEventListener("click", () => {
  if (confirm("Выйти из профиля?")) { code = who = null; store.set("code", null); store.set("who", null); route(); }
});

// ---------- tabs ----------
function renderTabs() {
  $("#tabs").innerHTML = SECTIONS.map((s) =>
    `<button data-id="${s.id}" class="${s.id === section ? "on" : ""}">${s.icon} ${s.title}</button>`).join("");
  $("#tabs").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    section = b.dataset.id; store.set("section", section); renderTabs(); renderSection();
  }));
  const on = $("#tabs .on");
  if (on) on.scrollIntoView({ inline: "center", block: "nearest" });
}
function renderSection() {
  stopWatch();
  section === "watch" ? renderWatch() : renderList();
}

// ---------- lists ----------
async function renderList() {
  const sec = SECTIONS.find((s) => s.id === section);
  const el = $("#content");
  el.innerHTML = `
    <form class="add" id="add-form">
      <input name="title" placeholder="${sec.icon} Что добавим?" required maxlength="200">
      <textarea name="note" rows="2" placeholder="Заметка (необязательно)" maxlength="1000"></textarea>
      <div class="row"><input name="link" placeholder="Ссылка (необязательно)" maxlength="500"><button class="btn">Добавить</button></div>
    </form>
    <div id="list"><div class="empty">Загружаю…</div></div>`;
  $("#add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const title = f.get("title").trim();
    try {
      await rpc("add_item", { p_section: section, p_title: title, p_note: f.get("note").trim(), p_link: f.get("link").trim(), p_author: who });
      notify(`${sec.icon} ${who} добавил(а) в «${sec.title}»: ${title}`);
      e.target.reset();
      loadList();
    } catch { alert("Не получилось добавить 😿"); }
  });
  loadList();
}
async function loadList() {
  const box = $("#list");
  if (!box) return;
  try {
    const items = await rpc("list_items", { p_section: section });
    box.innerHTML = items.length ? items.map((i) => `
      <div class="item ${i.done ? "done" : ""}" data-id="${i.id}">
        <input type="checkbox" ${i.done ? "checked" : ""}>
        <div class="body">
          <div class="t">${esc(i.title)}</div>
          ${i.note ? `<div class="n">${esc(i.note)}</div>` : ""}
          ${safeUrl(i.link) ? `<a href="${esc(safeUrl(i.link))}" target="_blank" rel="noopener noreferrer">${esc(i.link)}</a>` : ""}
          <div class="meta">${esc(i.author)} · ${new Date(i.created_at).toLocaleDateString("ru")}</div>
        </div>
        <button class="x" title="Удалить">✕</button>
      </div>`).join("") : `<div class="empty">Пока пусто 🐾</div>`;
    box.querySelectorAll(".item").forEach((row) => {
      const id = +row.dataset.id;
      row.querySelector("input").addEventListener("change", async () => { await rpc("toggle_item", { p_id: id }); loadList(); });
      row.querySelector(".x").addEventListener("click", async () => {
        if (confirm("Удалить пункт?")) { await rpc("delete_item", { p_id: id }); loadList(); }
      });
    });
  } catch { box.innerHTML = `<div class="empty">Не удалось загрузить 😿</div>`; }
}

// ---------- совместный просмотр ----------
let yt = null, vid = null, applying = false, lastUrl = null;

function ytId(u) {
  const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function stopWatch() {
  clearInterval(watchTimer); watchTimer = null;
  try { yt && yt.destroy && yt.destroy(); } catch {}
  yt = vid = null; lastUrl = null;
}
function renderWatch() {
  $("#content").innerHTML = `
    <div class="add">
      <input id="w-url" placeholder="Ссылка на YouTube или прямая ссылка на видео (.mp4/.webm)">
      <div class="row"><button class="btn" id="w-invite">🎬 Позвать смотреть</button><button class="btn ghost" id="w-sync">Все ко мне</button></div>
      <div class="status" id="w-status"></div>
    </div>
    <div class="player" id="w-player"></div>`;
  $("#w-invite").addEventListener("click", async () => {
    const url = $("#w-url").value.trim();
    if (!safeUrl(url)) return alert("Нужна ссылка, начинающаяся с http(s)://");
    await rpc("set_watch", { p_url: url, p_playing: false, p_pos: 0, p_by: who });
    notify(`🎬 ${who} зовёт смотреть вместе! Заходи на сайт → «Совместный просмотр».`);
    poll();
  });
  $("#w-sync").addEventListener("click", () => push());
  poll();
  watchTimer = setInterval(poll, 2000);
}
function curTime() {
  if (yt && yt.getCurrentTime) return yt.getCurrentTime();
  return vid ? vid.currentTime : 0;
}
function isPlaying() {
  if (yt && yt.getPlayerState) return yt.getPlayerState() === 1;
  return vid ? !vid.paused : false;
}
async function push() {
  if (applying) return;
  try { await rpc("set_watch", { p_url: lastUrl, p_playing: isPlaying(), p_pos: curTime(), p_by: who }); } catch {}
}
function mount(url) {
  const box = $("#w-player");
  if (!box) return;
  lastUrl = url;
  yt = vid = null;
  const id = ytId(url);
  if (id) {
    box.innerHTML = `<div id="yt-host"></div>`;
    const make = () => { yt = new YT.Player("yt-host", {
      videoId: id, playerVars: { playsinline: 1, rel: 0 },
      events: { onStateChange: (e) => { if (e.data === 1 || e.data === 2) push(); } },
    }); };
    window.YT && YT.Player ? make() : (window.onYouTubeIframeAPIReady = make);
  } else {
    box.innerHTML = `<video controls playsinline src="${esc(url)}"></video>`;
    vid = box.querySelector("video");
    ["play", "pause", "seeked"].forEach((ev) => vid.addEventListener(ev, push));
  }
}
async function poll() {
  if (section !== "watch") return;
  let w;
  try { w = await rpc("get_watch"); } catch { return; }
  if (!w || !w.url) return;
  if (w.url !== lastUrl) {
    mount(w.url);
    $("#w-status").textContent = `Смотрим вместе (${w.by})`;
  }
  const ready = (yt && yt.getPlayerState) || vid;
  if (!ready) return;
  let target = w.pos;
  if (w.playing) target += w.elapsed;
  applying = true;
  try {
    if (Math.abs(curTime() - target) > 2) yt ? yt.seekTo(target, true) : (vid.currentTime = target);
    if (w.playing && !isPlaying()) yt ? yt.playVideo() : vid.play().catch(() => {});
    if (!w.playing && isPlaying()) yt ? yt.pauseVideo() : vid.pause();
  } finally { setTimeout(() => (applying = false), 800); }
}

route();
