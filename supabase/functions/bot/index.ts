import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("BOT_TOKEN")!;
const SECRET = Deno.env.get("WEBHOOK_SECRET")!;
const SITE = Deno.env.get("SITE_URL") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function tg(chat_id: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
}

function newCode() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(10));
  const s = Array.from(b, (x) => abc[x % abc.length]).join("");
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const body = await req.json().catch(() => ({}));

  if (body.code) {
    const { data: me } = await sb.from("users").select("name").eq("code", String(body.code)).maybeSingle();
    if (!me) return new Response("denied", { status: 403, headers: cors });
    const { data: other } = await sb.from("users").select("chat_id").neq("name", me.name).maybeSingle();
    if (other?.chat_id) await tg(other.chat_id, esc(String(body.text ?? "").slice(0, 500)));
    return new Response("ok", { headers: cors });
  }

  if (req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) return new Response("no", { status: 401 });
  const m = body.message;
  if (!m?.text) return new Response("ok");
  const { data: u } = await sb.from("users").select("*").eq("tg_id", m.from.id).maybeSingle();
  if (!u) {
    await tg(m.chat.id, "Мяу? Тебя нет в списке");
    return new Response("ok");
  }
  const cmd = m.text.split(" ")[0].split("@")[0];
  let code = u.code;
  if (!code || cmd === "/newcode") code = newCode();
  await sb.from("users").update({ code, chat_id: m.chat.id }).eq("tg_id", u.tg_id);
  const head = cmd === "/newcode" ? "Новый номерок (старый больше не работает)" : `Привет, ${u.name}! Твой номерок`;
  await tg(m.chat.id, `${head}:\n\n<code>${code}</code>\n\n${SITE}\n\n/code — показать номерок\n/newcode — выдать новый`);
  return new Response("ok");
});
