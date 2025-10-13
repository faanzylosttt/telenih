// api/webhook.js
export const config = { api: { bodyParser: false } };

let IN_MEMORY_STATUS = (process.env.SITE_ACTIVE || "true").toLowerCase() === "true";

// --- GitHub helpers (optional persistence) ---
async function readStatusFromGitHub() {
  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const OWNER_REPO = process.env.OWNER_REPO;
    const STATUS_PATH = process.env.STATUS_PATH || "site-status.json";
    if (!GITHUB_TOKEN || !OWNER_REPO) return null;
    const [owner, repo] = OWNER_REPO.split("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${STATUS_PATH}`;
    const r = await fetch(url, { headers:{ Authorization:`token ${GITHUB_TOKEN}`, "User-Agent":"SiteStatus" } });
    if (!r.ok) return null;
    const j = await r.json();
    const content = Buffer.from(j.content, "base64").toString("utf8");
    const data = JSON.parse(content);
    return { active: !!data.active, sha: j.sha };
  } catch (e) { return null; }
}

async function writeStatusToGitHub(active, prevSha = null) {
  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const OWNER_REPO = process.env.OWNER_REPO;
    const STATUS_PATH = process.env.STATUS_PATH || "site-status.json";
    if (!GITHUB_TOKEN || !OWNER_REPO) return false;
    const [owner, repo] = OWNER_REPO.split("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${STATUS_PATH}`;
    const content = Buffer.from(JSON.stringify({ active: !!active, updated_at: new Date().toISOString() }, null, 2)).toString("base64");
    const body = { message: `set site active=${!!active}`, content };
    if (prevSha) body.sha = prevSha;
    const r = await fetch(url, { method:"PUT", headers:{ Authorization:`token ${GITHUB_TOKEN}`, "User-Agent":"SiteStatus", "Content-Type":"application/json" }, body: JSON.stringify(body) });
    return r.ok;
  } catch (e) { return false; }
}

// --- helper Telegram API ---
function tgApi(token, method) { return `https://api.telegram.org/bot${token}/${method}`; }

async function sendMessage(botToken, chat_id, text, keyboard = null, mode="Markdown") {
  const body = { chat_id, text, parse_mode: mode };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(tgApi(botToken, "sendMessage"), { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
}

async function sendPhoto(botToken, chat_id, photoUrl, caption, keyboard=null) {
  const body = { chat_id, photo: photoUrl, caption, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(tgApi(botToken, "sendPhoto"), { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
}

async function editMessageText(botToken, chat_id, message_id, text, keyboard=null, mode="Markdown") {
  const body = { chat_id, message_id, text, parse_mode: mode };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(tgApi(botToken, "editMessageText"), { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
}

// Regex to detect many tiktok URL patterns
const TIKTOK_REGEX = /(https?:\/\/(?:vm|vt|m|www)\.tiktok\.com\/[^\s]+|https?:\/\/(?:www\.)?tiktok\.com\/@[^\/\s]+\/video\/\d+|https?:\/\/(?:www\.)?tiktok\.com\/t\/[^\s]+)/i;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Bot Active");

  try {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const update = JSON.parse(Buffer.concat(buffers).toString());

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;
    if (!BOT_TOKEN || !OWNER_CHAT_ID) return res.status(500).send("BOT_TOKEN or OWNER_CHAT_ID not set");

    // helpers to read/write status
    async function readStatus() {
      const gh = await readStatusFromGitHub();
      if (gh) return { active: gh.active, sha: gh.sha, from: "github" };
      return { active: IN_MEMORY_STATUS, sha: null, from: "memory" };
    }
    async function writeStatus(val) {
      const cur = await readStatusFromGitHub();
      if (cur) {
        const ok = await writeStatusToGitHub(!!val, cur.sha);
        if (ok) return { ok:true, via:"github" };
      }
      IN_MEMORY_STATUS = !!val;
      return { ok:true, via:"memory" };
    }

    // Auto-welcome members
    if (update.message?.new_chat_members) {
      const chatId = update.message.chat.id;
      for (const m of update.message.new_chat_members) {
        await sendMessage(BOT_TOKEN, chatId, `👋 Selamat datang, ${m.first_name || "teman baru"}!`);
      }
    }

    // Handle messages
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = (update.message.text || "").trim();

      // /start -> show menu (owner sees admin toggle)
      if (text === "/start") {
        const st = await readStatus();
        const isOwner = String(update.message.from.id) === String(OWNER_CHAT_ID);
        await sendMessage(BOT_TOKEN, chatId, `👋 Halo! Site: ${st.active ? "AKTIF" : "NONAKTIF"} (via ${st.from})`, mainKeyboard(isOwner, st.active));
      }

      // /site on/off (owner only)
      else if (text.startsWith("/site")) {
        if (String(update.message.from.id) !== String(OWNER_CHAT_ID)) {
          await sendMessage(BOT_TOKEN, chatId, "❌ Akses ditolak — hanya owner yang bisa mengubah status.");
        } else {
          const parts = text.split(/\s+/);
          const cmd = parts[1] || "";
          if (cmd === "on" || cmd === "off") {
            const val = cmd === "on";
            const w = await writeStatus(val);
            await sendMessage(BOT_TOKEN, chatId, `✅ Situs sekarang ${val ? "AKTIF" : "NONAKTIF"} (via ${w.via}).`);
          } else {
            await sendMessage(BOT_TOKEN, chatId, "Gunakan: `/site on` atau `/site off`");
          }
        }
      }

      // encode / decode / short / id
      else if (text.toLowerCase().startsWith("encode:")) {
        const str = text.slice(7).trim();
        const out = Buffer.from(str).toString("base64");
        await sendMessage(BOT_TOKEN, chatId, `🔐 Encode result:\n\`${out}\``, null, "Markdown");
      } else if (text.toLowerCase().startsWith("decode:")) {
        const str = text.slice(7).trim();
        try {
          const out = Buffer.from(str, "base64").toString("utf8");
          await sendMessage(BOT_TOKEN, chatId, `🔓 Decode result:\n${out}`);
        } catch {
          await sendMessage(BOT_TOKEN, chatId, "❌ Format Base64 tidak valid.");
        }
      } else if (text.toLowerCase().startsWith("short:")) {
        const url = text.slice(6).trim();
        try {
          const r = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
          const s = await r.text();
          await sendMessage(BOT_TOKEN, chatId, `🌐 Shortlink:\n${s}`);
        } catch {
          await sendMessage(BOT_TOKEN, chatId, "❌ Gagal membuat shortlink.");
        }
      } else if (text === "/id") {
        const u = update.message.from;
        await sendMessage(BOT_TOKEN, chatId, `🆔 Nama: ${u.first_name}\n📎 ID: \`${u.id}\``, null, "Markdown");
      }

      // Auto-detect tiktok links (no /tiktok needed)
      const tmatch = (update.message.text || "").match(TIKTOK_REGEX);
      if (tmatch) {
        const link = tmatch[0];
        // call user's API (safe: we only display info + link)
        const apiUrl = `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(link)}`;
        try {
          const r = await fetch(apiUrl);
          const j = await r.json();
          const info = j.data || j.result || j;
          const title = info?.desc || info?.title || "Video TikTok";
          const author = info?.author?.nickname || info?.author || info?.owner || "-";
          const thumb = info?.cover || info?.thumbnail || info?.origin_cover || info?.play || null;
          const downloadUrl = info?.url || apiUrl;

          const caption = `🎬 *${escapeMD(title)}*\n👤 *${escapeMD(author)}*`;
          const keyboard = { inline_keyboard: [
            [{ text: "▶️ Tonton di TikTok", url: link }],
            [{ text: "⬇️ Download (API)", url: downloadUrl }],
          ]};

          if (thumb) {
            await sendPhoto(BOT_TOKEN, chatId, thumb, caption, keyboard);
          } else {
            await sendMessage(BOT_TOKEN, chatId, `${caption}\n\n🔽 Download: ${downloadUrl}`, keyboard);
          }
        } catch (e) {
          console.error("TikTok API error", e);
          await sendMessage(BOT_TOKEN, chatId, "❌ Gagal mengambil info TikTok (API tidak respons atau format tidak dikenali).");
        }
      }
    }

    // Callback query handling (buttons)
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data;
      const chatId = cb.message.chat.id;
      const msgId = cb.message.message_id;
      const from = cb.from;

      // Owner-only toggles
      if (data === "site_on" || data === "site_off") {
        if (String(from.id) !== String(process.env.OWNER_CHAT_ID)) {
          // answer and deny
          await fetch(tgApi(process.env.BOT_TOKEN, "answerCallbackQuery"), { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ callback_query_id: cb.id, text: "Akses ditolak" }) });
        } else {
          const val = data === "site_on";
          const w = await writeStatus(val);
          await fetch(tgApi(process.env.BOT_TOKEN, "answerCallbackQuery"), { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ callback_query_id: cb.id, text: `Situs -> ${val ? "AKTIF" : "NONAKTIF"} (${w.via})` }) });
          try {
            await editMessageText(BOT_TOKEN, chatId, msgId, `📋 Site status: ${val ? "AKTIF" : "NONAKTIF"}`, adminRow(val));
          } catch {}
        }
      }

      // menu actions
      else if (data === "cekid") {
        await editMessageText(BOT_TOKEN, chatId, msgId, `🆔 ID: \`${from.id}\``, null, "Markdown");
      } else if (data === "tiktok") {
        await editMessageText(BOT_TOKEN, chatId, msgId, "🎬 Kirim link TikTok di chat — bot otomatis mendeteksi.", mainKeyboard(String(from.id) === String(process.env.OWNER_CHAT_ID)));
      } else if (data === "jagagrup") {
        await editMessageText(BOT_TOKEN, chatId, msgId, "🛡️ Mode jaga grup: aktif (demo). Jika ingin aktifkan penghapusan pesan, pastikan bot jadi admin.", mainKeyboard(String(from.id) === String(process.env.OWNER_CHAT_ID)));
      } else if (data === "menu") {
        const st = await readStatus();
        await editMessageText(BOT_TOKEN, chatId, msgId, `👋 Menu — Site: ${st.active ? "AKTIF" : "NONAKTIF"}`, mainKeyboard(String(from.id) === String(process.env.OWNER_CHAT_ID), st.active));
      }

      // stop loading
      await fetch(tgApi(process.env.BOT_TOKEN, "answerCallbackQuery"), { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ callback_query_id: cb.id }) });
    }

    // Group guard: delete messages with links in groups (requires bot admin)
    if (update.message && update.message.chat && update.message.chat.type !== "private") {
      const txt = update.message.text || "";
      if (/(https?:\/\/[^\s]+)/i.test(txt)) {
        try {
          await fetch(tgApi(process.env.BOT_TOKEN, "deleteMessage"), { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ chat_id: update.message.chat.id, message_id: update.message.message_id }) });
        } catch (e) {
          // ignore if fails (lack of permission)
        }
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("webhook error:", err);
    return res.status(200).send("error");
  }
}

// Keyboards
function mainKeyboard(isOwner=false, active=false) {
  const row1 = [{ text: "🆔 Cek ID", callback_data: "cekid" }, { text: "🎬 TikTok", callback_data: "tiktok" }];
  const row2 = [{ text: "🛡️ Jaga Grup", callback_data: "jagagrup" }];
  const adminRow = isOwner ? [{ text: active ? "🔴 Nonaktifkan Web" : "🟢 Aktifkan Web", callback_data: active ? "site_off" : "site_on" }] : [];
  return { inline_keyboard: [row1, row2, ...(adminRow.length ? [adminRow] : [])] };
}
function adminRow(active) { return { inline_keyboard: [[{ text: active ? "🔴 Nonaktifkan Web" : "🟢 Aktifkan Web", callback_data: active ? "site_off" : "site_on" }]] }; }

function escapeMD(s) { return (s||"").toString().replace(/([_*\\[\\]()~`>#+=|{}.!-])/g, "\\$1"); }