"use strict";
const SECTIONS = [
  { id: "eat", title: "Поесть", icon: "🐾" },
  { id: "walk", title: "Погулять", icon: "🐾" },
  { id: "wish", title: "Вишлист", icon: "🐾" },
  { id: "want", title: "Просто хотелки", icon: "🐾" },
  { id: "together", title: "Совместное времяпровождение", icon: "🐾" },
  { id: "watch", title: "Совместный просмотр", icon: "🐾" },
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

async function rpc(fn, args = {}) {
  const r = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CFG.ANON_KEY },
    body: JSON.stringify({ p_code: code, ...args }),
  });
  if (!r.ok) {
    const msg = await r.text();
    if (msg.includes("denied")) { 
      code = who = null; store.set("code", null); store.set("who", null); route();
    }
    throw new Error(msg);
  }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
function notify(text) {
  fetch(`${CFG.SUPABASE_URL}/functions/v1/bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, from: who, text }),
  }).catch(() => {});
}

function show(id) {
  for (const s of ["screen-code", "screen-app"]) $("#" + s).hidden = s !== id;
  document.body.dataset.theme = id === "screen-app" ? (who === "Вика" ? "vika" : "vitya") : "none";
}
function route() {
  stopWatch();
  if (who !== "Вика" && who !== "Витя") { code = who = null; store.set("code", null); store.set("who", null); }
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
    if (who !== "Вика" && who !== "Витя") throw 0;
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

async function renderList() {
  const sec = SECTIONS.find((s) => s.id === section);
  const el = $("#content");
  el.innerHTML = `
    <form class="add" id="add-form">
      <input name="title" placeholder="${sec.icon} Что добавим?" required maxlength="200">
      <textarea name="note" rows="2" placeholder="Заметка (необязательно)" maxlength="1000"></textarea>
      <input name="link" placeholder="Ссылка (необязательно)" maxlength="500">
      <input type="file" name="files" id="files" accept="image/*,video/*" multiple hidden>
      <div class="previews" id="previews"></div>
      <div class="row"><button type="button" class="btn ghost" id="attach">📎 Фото / видео</button><label class="orig"><input type="checkbox" id="orig"> Оригинал</label><button class="btn" id="add-btn">Добавить</button></div>
      <div class="status" id="up-status"></div>
    </form>
    <div id="list"><div class="empty">Загружаю…</div></div>`;
  let picked = [];
  const drawPicked = () => {
    $("#previews").innerHTML = picked.map((f, i) => `<span class="chip">${f.type.startsWith("video") ? "🎬" : "🖼️"} ${esc(f.name)} <button type="button" data-i="${i}">✕</button></span>`).join("");
    $("#previews").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { picked.splice(+b.dataset.i, 1); drawPicked(); }));
  };
  $("#attach").addEventListener("click", () => $("#files").click());
  $("#files").addEventListener("change", (e) => {
    picked = picked.concat([...e.target.files]).slice(0, 10);
    e.target.value = "";
    drawPicked();
  });
  $("#add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const title = f.get("title").trim();
    const btn = $("#add-btn"), st = $("#up-status");
    btn.disabled = true;
    try {
      const media = [];
      for (let i = 0; i < picked.length; i++) {
        st.textContent = `Загружаю ${i + 1} из ${picked.length}…`;
        media.push(await uploadMedia(picked[i], $("#orig").checked));
      }
      st.textContent = "";
      await rpc("add_item", { p_section: section, p_title: title, p_note: f.get("note").trim(), p_link: f.get("link").trim(), p_author: who, p_media: media });
      notify(`${sec.icon} ${who} добавил(а) в «${sec.title}»: ${title}`);
      e.target.reset();
      picked = []; drawPicked();
      loadList();
    } catch (err) { st.textContent = ""; console.error(err); alert(String(err.message || err).startsWith("Файл") ? err.message : "Не получилось добавить 😿\n" + String(err.message || err).slice(0, 300)); }
    btn.disabled = false;
  });
  loadList();
}
const MEDIA_URL = (p) => `${CFG.SUPABASE_URL}/storage/v1/object/public/media/${p}`;
const MAX_MB = 50;
// Фото: длинная сторона до 2000 px, JPEG 85%. Если не вышло или стало не меньше — грузим как есть.
async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}
async function uploadMedia(file, original = false) {
  if (!original) file = await shrinkImage(file);
  if (file.size > MAX_MB * 1048576) throw new Error(`Файл «${file.name || "без имени"}» больше ${MAX_MB} МБ`);
  const isVideo = file.type.startsWith("video/");
  const ext = file.type === "image/jpeg" && !file.name ? "jpg"
    : ((file.name.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || (isVideo ? "mp4" : "jpg")).toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const r = await fetch(`${CFG.SUPABASE_URL}/storage/v1/object/media/${path}`, {
    method: "POST",
    headers: { apikey: CFG.ANON_KEY, "Content-Type": file.type || (isVideo ? "video/mp4" : "image/jpeg"), "x-upsert": "false" },
    body: file,
  });
  if (!r.ok) throw new Error(`Файл «${file.name || "без имени"}» не загрузился`);
  return { p: path, t: isVideo ? "video" : "image" };
}
function mediaHtml(list) {
  const ok = (Array.isArray(list) ? list : []).filter((m) => m && /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(m.p));
  if (!ok.length) return "";
  return `<div class="media">${ok.map((m) => m.t === "video"
    ? `<video controls playsinline preload="metadata" src="${esc(MEDIA_URL(m.p))}#t=0.1"></video>`
    : `<a href="${esc(MEDIA_URL(m.p))}" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="${esc(MEDIA_URL(m.p))}" alt=""></a>`).join("")}</div>`;
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
          ${mediaHtml(i.media)}
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

let pl = null, applying = false, lastUrl = null, host = null, fresh = false, chatTimer = null, saveTimer = null, lastMsg = 0;

function ytId(u) {
  const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}
// Возвращает {kind, src} для поддерживаемых площадок или null (тогда считаем прямой ссылкой на файл).
function parseEmbed(u) {
  let m = String(u).match(/rutube\.ru\/(?:video|play\/embed)\/([0-9a-f]{32})(?:\/?\?[^#]*?\bp=([\w-]+))?/i);
  if (m) return { kind: "rutube", src: `https://rutube.ru/play/embed/${m[1]}` + (m[2] ? `?p=${m[2]}` : "") };
  if (/(?:vk\.com|vkvideo\.ru)\/video_ext\.php/i.test(u)) {
    return { kind: "vk", src: u + (/js_api=/.test(u) ? "" : "&js_api=1") };
  }
  m = String(u).match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/i);
  if (m) return { kind: "vk", src: `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2&js_api=1` };
  return null;
}
function stopWatch() {
  saveState(); // оставляем видео на паузе, чтобы место запомнилось
  clearInterval(watchTimer); clearInterval(chatTimer); clearInterval(saveTimer);
  watchTimer = chatTimer = saveTimer = null;
  try { pl && pl.destroy(); } catch {}
  pl = null; lastUrl = null; host = null; lastMsg = 0;
}
// ведущий при выходе ставит паузу и сохраняет позицию (keepalive — чтобы запрос ушёл при закрытии вкладки)
function saveState() {
  if (!pl || !pl.ready() || host !== who || !lastUrl) return;
  fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/set_watch`, {
    method: "POST", keepalive: true,
    headers: { "Content-Type": "application/json", apikey: CFG.ANON_KEY },
    body: JSON.stringify({ p_code: code, p_url: lastUrl, p_playing: false, p_pos: pl.time(), p_by: who }),
  }).catch(() => {});
}
addEventListener("pagehide", saveState);
const EMOJI = "😀 😂 🥰 😍 😘 😎 🤔 😮 😭 😡 🥺 😴 🤗 🙈 👍 👎 👏 🙏 💪 🔥 ✨ ❤️ 💔 💋 🎉 🍿 🍕 🍰 ☕ 🐱 🐾 😺 😸 😻 🙀".split(" ");

function renderWatch() {
  $("#content").innerHTML = `
    <div class="add">
      <input id="w-url" placeholder="Ссылка: YouTube, Rutube, VK Видео или файл .mp4/.webm">
      <div class="row"><button class="btn" id="w-invite">Позвать смотреть</button><button class="btn ghost" id="w-sync">Все ко мне</button></div>
      <div class="status" id="w-status"></div>
    </div>
    <div class="player" id="w-player"></div>
    <div class="chat">
      <div class="msgs" id="msgs"></div>
      <div class="emojis" id="emojis" hidden>${EMOJI.map((e) => `<button type="button">${e}</button>`).join("")}</div>
      <form class="send" id="chat-form">
        <button type="button" class="btn ghost" id="emoji-btn">🙂</button>
        <input id="chat-input" placeholder="Сообщение" autocomplete="off" maxlength="500">
        <button class="btn">→</button>
      </form>
    </div>`;
  $("#w-invite").addEventListener("click", async () => {
    const url = $("#w-url").value.trim();
    if (!safeUrl(url)) return alert("Нужна ссылка, начинающаяся с http(s)://");
    await rpc("set_watch", { p_url: url, p_playing: false, p_pos: 0, p_by: who, p_take: true });
    notify(`${who} зовёт смотреть вместе! Заходи на сайт → «Совместный просмотр».`);
    poll();
  });
  $("#w-sync").addEventListener("click", () => push(true));
  $("#emoji-btn").addEventListener("click", () => { const e = $("#emojis"); e.hidden = !e.hidden; });
  $("#emojis").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;
    const i = $("#chat-input"); i.value += e.target.textContent; i.focus();
  });
  $("#chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const i = $("#chat-input"), body = i.value.trim();
    if (!body) return;
    i.value = "";
    try { await rpc("send_msg", { p_author: who, p_body: body }); loadMsgs(); } catch {}
  });
  poll(); loadMsgs();
  watchTimer = setInterval(poll, 2000);
  chatTimer = setInterval(loadMsgs, 2000);
  saveTimer = setInterval(() => { if (host === who && pl && pl.ready() && pl.playing()) push(); }, 5000);
}
async function loadMsgs() {
  const box = $("#msgs");
  if (!box) return;
  let list;
  try { list = await rpc("list_msgs", { p_after: lastMsg }); } catch { return; }
  if (!list.length) return;
  box.insertAdjacentHTML("beforeend", list.map((m) => `
    <div class="msg ${m.author === who ? "mine" : ""}">
      <div class="bubble">${esc(m.body)}</div>
      <div class="meta">${esc(m.author)} · ${new Date(m.created_at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</div>
    </div>`).join(""));
  lastMsg = list[list.length - 1].id;
  box.scrollTop = box.scrollHeight;
}
// Двигать общее состояние может только ведущий; take=true — забрать пульт себе.
async function push(take = false) {
  if (applying || !pl || !pl.ready()) return;
  if (!take && host && host !== who) return;
  try {
    await rpc("set_watch", { p_url: lastUrl, p_playing: pl.playing(), p_pos: pl.time(), p_by: who, p_take: take });
    if (take) host = who;
  } catch {}
}

// ---- адаптеры плееров: ready/time/playing/seek/play/pause/destroy ----
function ytPlayer(box, id) {
  box.innerHTML = `<div id="yt-host"></div>`;
  let p = null;
  const make = () => { p = new YT.Player("yt-host", {
    videoId: id, playerVars: { playsinline: 1, rel: 0 },
    events: { onStateChange: (e) => { if (e.data === 1 || e.data === 2) push(); } },
  }); };
  window.YT && YT.Player ? make() : (window.onYouTubeIframeAPIReady = make);
  return {
    ready: () => !!(p && p.getPlayerState),
    time: () => p.getCurrentTime(),
    playing: () => p.getPlayerState() === 1,
    seek: (t) => p.seekTo(t, true),
    play: () => p.playVideo(),
    pause: () => p.pauseVideo(),
    destroy: () => p && p.destroy && p.destroy(),
  };
}
function fileVideo(box, url) {
  box.innerHTML = `<video controls playsinline src="${esc(url)}"></video>`;
  const v = box.querySelector("video");
  ["play", "pause", "seeked"].forEach((ev) => v.addEventListener(ev, push));
  return {
    ready: () => true,
    time: () => v.currentTime,
    playing: () => !v.paused,
    seek: (t) => (v.currentTime = t),
    play: () => v.play().catch(() => {}),
    pause: () => v.pause(),
    destroy: () => {},
  };
}
function rutubePlayer(box, src) {
  box.innerHTML = `<iframe allow="autoplay; fullscreen; encrypted-media" allowfullscreen src="${esc(src)}"></iframe>`;
  const f = box.querySelector("iframe");
  let t = 0, playing = false, got = false;
  const send = (type, data = {}) => f.contentWindow.postMessage(JSON.stringify({ type, data }), "*");
  const onMsg = (e) => {
    if (e.source !== f.contentWindow) return;
    let m; try { m = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
    if (!m || !m.type) return;
    got = true;
    if (m.type === "player:currentTime") t = +m.data.time || t;
    if (m.type === "player:changeState") { playing = m.data.state === "playing"; push(); }
  };
  window.addEventListener("message", onMsg);
  return {
    ready: () => got,
    time: () => t,
    playing: () => playing,
    seek: (x) => { send("player:setCurrentTime", { time: x }); t = x; },
    play: () => send("player:play"),
    pause: () => send("player:pause"),
    destroy: () => window.removeEventListener("message", onMsg),
  };
}
function vkPlayer(box, src) {
  box.innerHTML = `<iframe allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen src="${esc(src)}"></iframe>`;
  const f = box.querySelector("iframe");
  let p = null, t = 0, playing = false;
  const init = () => {
    p = VK.VideoPlayer(f);
    p.on("started", () => { playing = true; push(); });
    p.on("resumed", () => { playing = true; push(); });
    p.on("paused", () => { playing = false; push(); });
    p.on("timeupdate", (a) => { t = typeof a === "number" ? a : +(a && a.time) || t; });
  };
  const load = () => (window.VK && VK.VideoPlayer ? init() : null);
  if (window.VK && VK.VideoPlayer) load();
  else {
    const sc = document.createElement("script");
    sc.src = "https://vk.com/js/api/videoplayer.js";
    sc.onload = load;
    document.head.appendChild(sc);
  }
  return {
    ready: () => !!p,
    time: () => t,
    playing: () => playing,
    seek: (x) => { p.seek(x); t = x; },
    play: () => p.play(),
    pause: () => p.pause(),
    destroy: () => {},
  };
}

function mount(url) {
  const box = $("#w-player");
  if (!box) return;
  try { pl && pl.destroy(); } catch {}
  lastUrl = url;
  fresh = true; // первый раз применяем сохранённое место, даже если ты ведущий
  const id = ytId(url), emb = parseEmbed(url);
  pl = id ? ytPlayer(box, id)
    : emb && emb.kind === "rutube" ? rutubePlayer(box, emb.src)
    : emb && emb.kind === "vk" ? vkPlayer(box, emb.src)
    : fileVideo(box, url);
}
async function poll() {
  if (section !== "watch") return;
  let w;
  try { w = await rpc("get_watch"); } catch { return; }
  if (!w || !w.url) return;
  host = w.by;
  const st = $("#w-status");
  if (st) st.textContent = host ? `Пульт у: ${host}` : "";
  if (w.url !== lastUrl) mount(w.url);
  if (!pl || !pl.ready()) return;
  if (host === who && !fresh) return; // ведущий сам управляет, подстраиваются остальные
  fresh = false;
  let target = w.pos;
  if (w.playing) target += w.elapsed;
  applying = true;
  try {
    if (Math.abs(pl.time() - target) > 2) pl.seek(target);
    if (w.playing && !pl.playing()) pl.play();
    if (!w.playing && pl.playing()) pl.pause();
  } finally { setTimeout(() => (applying = false), 800); }
}

route();
