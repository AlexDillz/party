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
  clearInterval(chatTimer); chatTimer = null; lastMsg = 0;
  $("#below").innerHTML = "";
  section === "watch" ? renderWatch() : renderList();
  layoutStage();
}
// Плеер и звонок (#stage) живут вне вкладок: на «Совместном просмотре» они в потоке страницы, на остальных вкладках — маленькое окошко в углу.
function layoutStage() {
  const st = $("#stage");
  if (!st) return;
  const inWatch = section === "watch";
  st.hidden = !(watchOn && (inWatch || lastUrl || call.on));
  st.classList.toggle("mini", !inWatch);
  document.body.classList.toggle("watching", inWatch);
}

async function renderList() {
  const sec = SECTIONS.find((s) => s.id === section);
  const el = $("#content");
  el.innerHTML = `
    <form class="add" id="add-form">
      <input name="title" placeholder="${sec.icon} Что добавим?" required maxlength="200">
      <textarea name="note" rows="5" placeholder="Заметка (необязательно)" maxlength="1000"></textarea>
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
  const addFiles = (list) => {
    const ok = [...list].filter((f) => /^(image|video)\//.test(f.type));
    if (!ok.length) return;
    picked = picked.concat(ok).slice(0, 10);
    drawPicked();
  };
  $("#files").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  const form = $("#add-form");
  ["dragenter", "dragover"].forEach((ev) => form.addEventListener(ev, (e) => { e.preventDefault(); form.classList.add("drop"); }));
  ["dragleave", "drop"].forEach((ev) => form.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop" || !form.contains(e.relatedTarget)) form.classList.remove("drop"); }));
  form.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
  form.addEventListener("paste", (e) => addFiles(e.clipboardData.files));
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
    : `<img class="zoom" loading="lazy" src="${esc(MEDIA_URL(m.p))}" alt="">`).join("")}</div>`;
}
// фото открывается поверх страницы; закрыть — тап, Esc или ✕
function openPhoto(src) {
  const box = document.createElement("div");
  box.className = "lightbox";
  box.innerHTML = `<img src="${esc(src)}" alt=""><button type="button" aria-label="Закрыть">✕</button>`;
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  box.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(box);
}
document.addEventListener("click", (e) => { if (e.target.matches("img.zoom")) openPhoto(e.target.src); });
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
      row.querySelector("input").addEventListener("change", async () => {
        row.classList.toggle("done");
        try { await rpc("toggle_item", { p_id: id }); } catch { alert("Не получилось 😿"); }
        loadList();
      });
      row.querySelector(".x").addEventListener("click", async () => {
        if (!confirm("Удалить пункт?")) return;
        row.remove();
        try { await rpc("delete_item", { p_id: id }); } catch { alert("Не получилось удалить 😿"); }
        loadList();
      });
    });
  } catch { box.innerHTML = `<div class="empty">Не удалось загрузить 😿</div>`; }
}

let adMine = false, adManual = false, adSentAt = 0, heldByAd = false, adTimer = null, watchOn = false, pl = null, applying = false, lastUrl = null, host = null, fresh = false, chatTimer = null, saveTimer = null, lastMsg = 0;

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
// раз в секунду смотрим, есть ли у меня реклама (сама или кнопкой), и сообщаем второму
function adTick() {
  const cur = adSelf();
  const now = Date.now();
  if (cur !== adMine || (cur && now - adSentAt > 8000)) {
    adMine = cur; adSentAt = now;
    rpc("set_ad", { p_who: who, p_on: cur }).catch(() => {});
  }
  const b = $("#w-ad");
  if (b) { b.textContent = adManual ? "Реклама закончилась" : "У меня реклама"; b.classList.toggle("off", adManual); }
}
function stopWatch() {
  clearInterval(adTimer); adTimer = null;
  if (adMine) { adMine = false; rpc("set_ad", { p_who: who, p_on: false }).catch(() => {}); }
  adManual = false; heldByAd = false;
  stopCall();
  saveState(); // оставляем видео на паузе, чтобы место запомнилось
  clearInterval(watchTimer); clearInterval(chatTimer); clearInterval(saveTimer);
  watchTimer = chatTimer = saveTimer = null;
  try { pl && pl.destroy(); } catch {}
  pl = null; lastUrl = null; host = null; lastMsg = 0; watchOn = false;
  const box = $("#w-player"); if (box) box.innerHTML = "";
  const st = $("#stage"); if (st) st.hidden = true;
}
// ведущий при выходе ставит паузу и сохраняет позицию (keepalive — чтобы запрос ушёл при закрытии вкладки)
function saveState() {
  if (!pl || !pl.ready() || host !== who || !lastUrl || adSelf()) return;
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
      <div class="row"><button class="btn" id="w-invite">Позвать смотреть</button><button class="btn ghost" id="w-sync">Взять пульт</button><button class="btn ghost" id="w-ad">У меня реклама</button></div>
      <div class="status" id="w-status"></div>
    </div>`;
  $("#below").innerHTML = `
    <div class="chat">
      <div class="msgs" id="msgs"></div>
      <div class="emojis" id="emojis" hidden>${EMOJI.map((e) => `<button type="button">${e}</button>`).join("")}</div>
      <form class="send" id="chat-form">
        <button type="button" class="btn ghost" id="emoji-btn">🙂</button>
        <input id="chat-input" placeholder="Сообщение" autocomplete="off" maxlength="500">
        <button class="btn">→</button>
      </form>
    </div>`;
  $("#n-me").textContent = `${who} (ты)`;
  $("#n-other").textContent = otherName();
  $("#w-invite").addEventListener("click", async () => {
    const url = $("#w-url").value.trim();
    if (!safeUrl(url)) return alert("Нужна ссылка, начинающаяся с http(s)://");
    await rpc("set_watch", { p_url: url, p_playing: false, p_pos: 0, p_by: who, p_take: true });
    notify(`${who} зовёт смотреть вместе! Заходи на сайт → «Совместный просмотр».`);
    poll();
  });
  $("#w-sync").addEventListener("click", () => push(true));
  $("#w-ad").addEventListener("click", () => { adManual = !adManual; adTick(); });
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
  if (!watchOn) {
    watchOn = true;
    watchTimer = setInterval(poll, 2000);
    adTimer = setInterval(adTick, 1000);
    saveTimer = setInterval(() => { if (host === who && pl && pl.ready() && pl.playing()) push(); }, 5000);
  }
  poll(); loadMsgs();
  chatTimer = setInterval(loadMsgs, 2000);
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
const adSelf = () => adManual || !!(pl && pl.inAd && pl.inAd());
async function push(take = false) {
  if (applying || !pl || !pl.ready() || adSelf()) return;
  if (!take && host && host !== who) return;
  try {
    await rpc("set_watch", { p_url: lastUrl, p_playing: pl.playing(), p_pos: pl.time(), p_by: who, p_take: take });
    if (take) host = who;
  } catch {}
}

// ---- адаптеры плееров: ready/time/playing/seek/play/pause/destroy ----
function ytPlayer(box, id) {
  box.innerHTML = `<div id="yt-host"></div>`;
  let p = null, mainDur = 0;
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
    // реклама: у ролика другой id или другая длительность (признаки косвенные, поэтому есть ещё кнопка вручную)
    inAd: () => {
      try {
        const d = p.getVideoData && p.getVideoData();
        if (d && d.video_id && d.video_id !== id) return true;
        const dur = p.getDuration();
        if (dur > 0 && !mainDur) mainDur = dur;
        return mainDur > 0 && dur > 0 && Math.abs(dur - mainDur) > 2;
      } catch { return false; }
    },
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
  layoutStage();
  fresh = true; // первый раз применяем сохранённое место, даже если ты ведущий
  const id = ytId(url), emb = parseEmbed(url);
  pl = id ? ytPlayer(box, id)
    : emb && emb.kind === "rutube" ? rutubePlayer(box, emb.src)
    : emb && emb.kind === "vk" ? vkPlayer(box, emb.src)
    : fileVideo(box, url);
}
async function poll() {
  if (!watchOn) return;
  let w;
  try { w = await rpc("get_watch"); } catch { return; }
  if (!w || !w.url) return;
  host = w.by;
  const st = $("#w-status");
  if (st) st.textContent = host ? `Пульт у: ${host}` : "";
  if (w.url !== lastUrl) mount(w.url);
  if (!pl || !pl.ready()) return;
  const adOther = w.ad && w.ad !== who ? w.ad : null;
  const st2 = $("#w-status");
  if (st2) st2.textContent = (host ? `Пульт у: ${host}` : "") + (w.ad ? `${host ? " · " : ""}реклама у ${w.ad}, ждём` : "");
  if (adMine) return; // у меня реклама: ничего не применяем, пусть доиграет
  if (adOther) {
    if (pl.playing()) { applying = true; pl.pause(); setTimeout(() => (applying = false), 800); }
    heldByAd = true;
    return;
  }
  if (heldByAd) {
    heldByAd = false;
    if (host === who) { applying = false; try { pl.play(); } catch {} setTimeout(() => push(), 1500); }
  }
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

// ---- звонок (WebRTC): сигналы ходят через rtc_send / rtc_poll, видео и звук — напрямую между устройствами ----
const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }];
const call = { on: false, sendQ: Promise.resolve(), lastRestart: 0 };
const rid = () => crypto.randomUUID().slice(0, 8);
const callSt = (t) => { const el = $("#call-status"); if (el) el.textContent = t; };
const otherName = () => (who === "Вика" ? "Витя" : "Вика");

// сигналы уходят строго по очереди, чтобы offer не обгонял свои ice-кандидаты
function rtcSend(data, keepalive = false) {
  if (keepalive) {
    if (!code) return;
    fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/rtc_send`, {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json", apikey: CFG.ANON_KEY },
      body: JSON.stringify({ p_code: code, p_from: who, p_data: data }),
    }).catch(() => {});
    return;
  }
  call.sendQ = call.sendQ.then(() => rpc("rtc_send", { p_from: who, p_data: data })).catch(() => {});
}

// полоска громкости: читаем уровень звука из потока
function meter(stream, sel) {
  if (!call.actx || !stream.getAudioTracks().length) return () => {};
  const src = call.actx.createMediaStreamSource(stream), an = call.actx.createAnalyser();
  an.fftSize = 512; src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  let raf = 0, dead = false;
  const tick = () => {
    if (dead) return;
    an.getByteTimeDomainData(buf);
    let s = 0;
    for (const v of buf) { const x = (v - 128) / 128; s += x * x; }
    const el = $(sel);
    if (el) el.style.width = Math.min(100, Math.sqrt(s / buf.length) * 400).toFixed(0) + "%";
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => { dead = true; cancelAnimationFrame(raf); try { src.disconnect(); } catch {} const el = $(sel); if (el) el.style.width = "0"; };
}

async function startCall() {
  if (call.on) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  try { call.actx = AC ? new AC() : null; call.actx && call.actx.resume(); } catch { call.actx = null; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return callSt("Этот браузер не умеет камеру и микрофон");
  callSt("Жду разрешения от браузера…");
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  let stream = null;
  for (const c of [{ audio, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } }, { audio }, { video: true }]) {
    try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch {}
  }
  if (!$("#tiles")) { stream && stream.getTracks().forEach((t) => t.stop()); return; }
  Object.assign(call, { on: true, stream, sid: rid(), remote: null, after: 0, pc: null, queue: [], rs: null, stops: [], busy: false });
  layoutStage();
  $("#call-join").hidden = true;
  $("#tiles").hidden = false;
  $("#call-leave").hidden = false;
  const vm = $("#v-me");
  if (stream && stream.getVideoTracks().length) { vm.srcObject = stream; vm.play().catch(() => {}); }
  const hasA = !!(stream && stream.getAudioTracks().length), hasV = !!(stream && stream.getVideoTracks().length);
  $("#b-mic").disabled = !hasA; $("#b-cam").disabled = !hasV;
  call.stops.push(hasA ? meter(stream, "#l-me") : () => {});
  callSt(stream ? `Жду, пока зайдёт ${otherName()}…` : "Нет доступа к камере и микрофону — ты только смотришь и слушаешь");
  call.timer = setInterval(rtcPoll, 1000);
  rtcSend({ t: "hello", from: call.sid });
  rtcPoll();
}
function setTracks(kind, on) {
  if (!call.stream) return;
  (kind === "audio" ? call.stream.getAudioTracks() : call.stream.getVideoTracks()).forEach((t) => (t.enabled = on));
  const b = $(kind === "audio" ? "#b-mic" : "#b-cam");
  b.classList.toggle("off", !on);
  b.textContent = (kind === "audio" ? "Микрофон" : "Камера") + (on ? "" : " выкл.");
  sendState();
}
const trackOn = (kind) => { const t = call.stream && (kind === "audio" ? call.stream.getAudioTracks() : call.stream.getVideoTracks())[0]; return !!(t && t.enabled); };
function sendState() {
  if (call.on && call.remote) rtcSend({ t: "state", from: call.sid, to: call.remote, cam: trackOn("video"), mic: trackOn("audio") });
}
function resetPc() {
  if (call.pc) { try { call.pc.close(); } catch {} }
  call.pc = null; call.queue = []; call.rs = null;
  (call.stops || []).splice(1).forEach((f) => f()); // всё, кроме полоски «меня»
  const vo = $("#v-other"); if (vo) vo.srcObject = null;
  const b = $("#o-state"); if (b) b.textContent = "";
}
function ensurePc() {
  if (call.pc) return call.pc;
  const pc = (call.pc = new RTCPeerConnection({ iceServers: ICE }));
  call.rs = new MediaStream();
  const tracks = call.stream ? call.stream.getTracks() : [];
  tracks.forEach((t) => pc.addTrack(t, call.stream));
  if (who === "Витя") ["audio", "video"].forEach((k) => { if (!tracks.some((t) => t.kind === k)) pc.addTransceiver(k, { direction: "recvonly" }); });
  pc.onicecandidate = (e) => { if (e.candidate && call.pc === pc) rtcSend({ t: "ice", from: call.sid, to: call.remote, c: e.candidate.toJSON() }); };
  pc.ontrack = (e) => {
    if (call.pc !== pc) return;
    call.rs.addTrack(e.track);
    const vo = $("#v-other");
    if (vo) { vo.srcObject = call.rs; vo.play().catch(() => callSt("Тапни по видео собеседника, чтобы включить звук")); }
    if (e.track.kind === "audio") call.stops.push(meter(new MediaStream([e.track]), "#l-other"));
  };
  pc.onconnectionstatechange = () => {
    if (call.pc !== pc) return;
    const s = pc.connectionState;
    if (s === "connected") { callSt(`На связи с ${otherName()}`); sendState(); }
    else if (s === "connecting") callSt("Соединяюсь…");
    else if (s === "failed") restartCall();
  };
  return pc;
}
function restartCall() {
  if (!call.on || Date.now() - call.lastRestart < 10000) return;
  call.lastRestart = Date.now();
  resetPc(); call.remote = null; call.sid = rid();
  callSt("Связь пропала, переподключаюсь…");
  rtcSend({ t: "hello", from: call.sid });
}
async function makeOffer() {
  const pc = ensurePc();
  await pc.setLocalDescription(await pc.createOffer());
  rtcSend({ t: "offer", from: call.sid, to: call.remote, sdp: pc.localDescription.toJSON() });
}
async function flushQueue() {
  const q = call.queue; call.queue = [];
  for (const c of q) { try { await call.pc.addIceCandidate(c); } catch {} }
}
async function rtcHandle(d) {
  if (!call.on || !d || !d.t) return;
  if (d.t === "hello") {
    if (d.from === call.remote) return;
    resetPc(); call.remote = d.from;
    callSt("Соединяюсь…");
    rtcSend({ t: "hello", from: call.sid });
    if (who === "Витя") await makeOffer();
    return;
  }
  if (d.t === "bye") {
    if (d.from === call.remote) { resetPc(); call.remote = null; callSt(`${otherName()} вышел(а) из звонка`); }
    return;
  }
  if (d.to !== call.sid) return;
  if (d.t === "offer") {
    if (d.from !== call.remote) { resetPc(); call.remote = d.from; }
    const pc = ensurePc();
    await pc.setRemoteDescription(d.sdp);
    await flushQueue();
    await pc.setLocalDescription(await pc.createAnswer());
    rtcSend({ t: "answer", from: call.sid, to: call.remote, sdp: pc.localDescription.toJSON() });
  } else if (d.t === "answer") {
    if (d.from === call.remote && call.pc && call.pc.signalingState === "have-local-offer") {
      await call.pc.setRemoteDescription(d.sdp);
      await flushQueue();
    }
  } else if (d.t === "ice") {
    if (d.from !== call.remote) return;
    if (call.pc && call.pc.remoteDescription) { try { await call.pc.addIceCandidate(d.c); } catch {} }
    else call.queue.push(d.c);
  } else if (d.t === "state") {
    const b = $("#o-state");
    if (b && d.from === call.remote) b.textContent = [d.cam ? "" : "камера выключена", d.mic ? "" : "микрофон выключен"].filter(Boolean).join(", ");
  }
}
async function rtcPoll() {
  if (!call.on || call.busy) return;
  call.busy = true;
  try {
    const list = await rpc("rtc_poll", { p_me: who, p_after: call.after });
    for (const m of list) { call.after = m.id; try { await rtcHandle(m.data); } catch (e) { console.error(e); } }
  } catch {} finally { call.busy = false; }
}
function stopCall() {
  if (!call.on) return;
  call.on = false;
  clearInterval(call.timer);
  rtcSend({ t: "bye", from: call.sid }, true);
  resetPc();
  (call.stops || []).forEach((f) => f()); call.stops = [];
  call.stream && call.stream.getTracks().forEach((t) => t.stop());
  call.stream = null;
  try { call.actx && call.actx.close(); } catch {}
  const vm = $("#v-me"); if (vm) vm.srcObject = null;
  if ($("#tiles")) { $("#tiles").hidden = true; $("#call-leave").hidden = true; $("#call-join").hidden = false; callSt(""); }
  layoutStage();
}
addEventListener("pagehide", stopCall);

$("#call-join").addEventListener("click", startCall);
$("#call-leave").addEventListener("click", stopCall);
$("#b-cam").addEventListener("click", () => setTracks("video", !trackOn("video")));
$("#b-mic").addEventListener("click", () => setTracks("audio", !trackOn("audio")));
$("#v-other").addEventListener("click", (e) => e.target.play().catch(() => {}));
$("#stage-open").addEventListener("click", () => { section = "watch"; store.set("section", section); renderTabs(); renderSection(); });
$("#stage-close").addEventListener("click", () => { if (confirm("Закрыть просмотр и звонок?")) stopWatch(); });

route();
