// api/webhook.js
export const config = { api: { bodyParser: false } };

/**
 * Full-featured Telegram webhook for Vercel
 * - No external deps (uses global fetch)
 * - Requires env: BOT_TOKEN, OWNER_CHAT_ID
 * - Optional env for persistence: GITHUB_TOKEN, OWNER_REPO, STATUS_PATH
 *
 * Features:
 * - /start menu (inline buttons), editMessageText on button press
 * - Check ID (sends profile photo if available) + "Copy ID" button
 * - Auto-detect TikTok links -> preview (thumbnail) + buttons (watch / download via API)
 * - encode:, decode:, short: commands
 * - /id command
 * - Auto-welcome new chat members
 * - Group guard (delete messages with links) - bot must be admin
 * - Owner-only site ON/OFF (in-memory fallback, optional GitHub persistence)
 * - Logging to console (check Vercel function logs)
 */

/* -------------------- Config / Globals -------------------- */
const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;
if (!BOT_TOKEN) {
  console.error("BOT_TOKEN not set in environment variables!");
}
const API_BASE = (token) => `https://api.telegram.org/bot${token}`;
const TIKTOK_API_BASE = "https://api.siputzx.my.id/api/d/tiktok?url="; // your provided API for info/link

// in-memory site status fallback (true = site active)
let IN_MEMORY_SITE_ACTIVE = (process.env.SITE_ACTIVE || "true").toLowerCase() === "true";

/* -------------------- Optional GitHub persistence --------------------
If GITHUB_TOKEN and OWNER_REPO provided, read/write site-status.json on repo.
OWNER_REPO example: "username/repo"
-------------------------------------------------------------------- */
async function readStatusFromGitHub() {
  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const OWNER_REPO = process.env.OWNER_REPO;
    const PATH = process.env.STATUS_PATH || "site-status.json";
    if (!GITHUB_TOKEN || !OWNER_REPO) return null;
    const [owner, repo] = OWNER_REPO.split("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${PATH}`;
    const r = await fetch(url, { headers: { Authorization: `token ${GITHUB_TOKEN}`, "User-Agent": "SiteStatus" } });
    if (!r.ok) return null;
    const j = await r.json();
    const content = Buffer.from(j.content, "base64").toString("utf8");
    const data = JSON.parse(content);
    return { active: !!data.active, sha: j.sha };
  } catch (e) {
    console.error("readStatusFromGitHub error:", e);
    return null;
  }
}
async function writeStatusToGitHub(active, prevSha = null) {
  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const OWNER_REPO = process.env.OWNER_REPO;
    const PATH = process.env.STATUS_PATH || "site-status.json";
    if (!GITHUB_TOKEN || !OWNER_REPO) return false;
    const [owner, repo] = OWNER_REPO.split("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${PATH}`;
    const content = Buffer.from(JSON.stringify({ active: !!active, updated_at: new Date().toISOString() }, null, 2)).toString("base64");
    const body = { message: `set site active=${!!active}`, content };
    if (prevSha) body.sha = prevSha;
    const r = await fetch(url, { method: "PUT", headers: { Authorization: `token ${GITHUB_TOKEN}`, "User-Agent": "SiteStatus", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.ok;
  } catch (e) {
    console.error("writeStatusToGitHub error:", e);
    return false;
  }
}

/* -------------------- Helpers for Telegram API -------------------- */
function tg(method) { return `${API_BASE(BOT_TOKEN)}/${method}`; }

async function tgSendMessage(chat_id, text, keyboard = null, parse_mode = "Markdown") {
  const body = { chat_id, text, parse_mode };
  if (keyboard) body.reply_markup = keyboard;
  try {
    const r = await fetch(tg("sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    // console.log("tgSendMessage ->", j);
    return j;
  } catch (e) {
    console.error("tgSendMessage error:", e);
    return null;
  }
}
async function tgSendPhoto(chat_id, photo, caption = "", keyboard = null) {
  const body = { chat_id, photo, caption, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = keyboard;
  try {
    const r = await fetch(tg("sendPhoto"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) {
    console.error("tgSendPhoto error:", e);
    return null;
  }
}
async function tgEditMessage(chat_id, message_id, text, keyboard = null, parse_mode = "Markdown") {
  const body = { chat_id, message_id, text, parse_mode };
  if (keyboard) body.reply_markup = keyboard;
  try {
    const r = await fetch(tg("editMessageText"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) {
    console.error("tgEditMessage error:", e);
    return null;
  }
}
async function tgAnswerCallback(callback_query_id, text = "") {
  try {
    await fetch(tg("answerCallbackQuery"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: callback_query_id, text }) });
  } catch (e) {
    console.error("answerCallbackQuery error:", e);
  }
}
async function tgDeleteMessage(chat_id, message_id) {
  try {
    await fetch(tg("deleteMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id, message_id }) });
  } catch (e) {
    // ignore
  }
}
async function getUserProfilePhotoFileId(user_id) {
  try {
    const r = await fetch(tg(`getUserProfilePhotos?user_id=${user_id}&limit=1`));
    const j = await r.json();
    if (j.ok && j.result && j.result.total_count > 0) {
      // choose the largest size (last in array)
      const photos = j.result.photos[0];
      return photos[photos.length - 1].file_id;
    }
  } catch (e) {
    console.error("getUserProfilePhotoFileId error:", e);
  }
  return null;
}

/* -------------------- Utilities -------------------- */
function escapeMD(s) {
  return (s || "").toString().replace(/([_*[\]()~`>#+=|{}.!-])/g, "\\$1");
}
const TIKTOK_REGEX = /(https?:\/\/(?:vm|vt|m|www)\.tiktok\.com\/[^\s]+|https?:\/\/(?:www\.)?tiktok\.com\/@[^\/\s]+\/video\/\d+|https?:\/\/(?:www\.)?tiktok\.com\/t\/[^\s]+)/i;

/* -------------------- Keyboards -------------------- */
function mainKeyboard(isOwner = false, siteActive = true) {
  const rows = [
    [{ text: "🆔 Cek ID", callback_data: "cekid" }, { text: "🎬 TikTok", callback_data: "tiktok" }],
    [{ text: "🔐 Encode", callback_data: "encode_help" }, { text: "🔓 Decode", callback_data: "decode_help" }],
    [{ text: "🌐 Shortlink", callback_data: "short_help" }],
  ];
  if (isOwner) rows.push([{ text: siteActive ? "🔴 Nonaktifkan Web" : "🟢 Aktifkan Web", callback_data: siteActive ? "site_off" : "site_on" }]);
  return { inline_keyboard: rows };
}
function adminRow(active) { return { inline_keyboard: [[{ text: active ? "🔴 Nonaktifkan Web" : "🟢 Aktifkan Web", callback_data: active ? "site_off" : "site_on" }]] }; }

/* -------------------- Read/Write status helpers -------------------- */
async function readSiteStatus() {
  const gh = await readStatusFromGitHub();
  if (gh) return { active: gh.active, sha: gh.sha, from: "github" };
  return { active: IN_MEMORY_SITE_ACTIVE, sha: null, from: "memory" };
}
async function writeSiteStatus(val) {
  const cur = await readStatusFromGitHub();
  if (cur) {
    const ok = await writeStatusToGitHub(!!val, cur.sha);
    if (ok) return { ok: true, via: "github" };
  }
  IN_MEMORY_SITE_ACTIVE = !!val;
  return { ok: true, via: "memory" };
}

/* -------------------- Main handler -------------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Bot Active");

  try {
    // parse raw body (bodyParser disabled)
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const update = JSON.parse(Buffer.concat(buffers).toString());
    console.log("[WEBHOOK] update:", JSON.stringify(update).slice(0, 3000)); // truncated log

    const BOT = BOT_TOKEN;
    const OWNER = OWNER_CHAT_ID;
    if (!BOT || !OWNER) {
      console.error("Missing BOT_TOKEN or OWNER_CHAT_ID");
      return res.status(500).send("Server not configured");
    }

    // handle new chat members (welcome)
    if (update.message?.new_chat_members) {
      const chatId = update.message.chat.id;
      for (const m of update.message.new_chat_members) {
        await tgSendMessage(chatId, `👋 Selamat datang, ${m.first_name || "teman baru"}!`);
      }
    }

    // convenience
    const message = update.message;
    const callback = update.callback_query;
    const chat = message?.chat || callback?.message?.chat;
    const chatId = chat?.id;
    const from = message?.from || callback?.from;
    const fromId = from?.id;
    const text = (message?.text || "").trim();

    // ---- /start ----
    if (text === "/start") {
      const st = await readSiteStatus();
      const isOwner = String(fromId) === String(OWNER);
      await tgSendMessage(chatId, `👋 Halo! Site: ${st.active ? "🟢 AKTIF" : "🔴 NONAKTIF"} (via ${st.from})`, mainKeyboard(isOwner, st.active));
    }

    // ---- /site on | /site off (owner only) ----
    if (text.startsWith("/site")) {
      if (String(fromId) !== String(OWNER)) {
        await tgSendMessage(chatId, "❌ Akses ditolak — hanya owner yang dapat mengubah status.");
      } else {
        const parts = text.split(/\s+/);
        const arg = parts[1] || "";
        if (arg === "on" || arg === "off") {
          const val = arg === "on";
          const w = await writeSiteStatus(val);
          await tgSendMessage(chatId, `✅ Situs sekarang ${val ? "AKTIF" : "NONAKTIF"} (via ${w.via}).`);
        } else {
          await tgSendMessage(chatId, "Gunakan: `/site on` atau `/site off`");
        }
      }
    }

    // ---- quick /id ----
    if (text === "/id") {
      await tgSendMessage(chatId, `🆔 ID kamu: \`${fromId}\``, null, "Markdown");
    }

    // ---- encode / decode / short ----
    if (/^encode:/i.test(text)) {
      const raw = text.replace(/^encode:/i, "").trim();
      const out = Buffer.from(raw).toString("base64");
      await tgSendMessage(chatId, `🔐 Encode:\n\`${out}\``, null, "Markdown");
    } else if (/^decode:/i.test(text)) {
      const raw = text.replace(/^decode:/i, "").trim();
      try {
        const out = Buffer.from(raw, "base64").toString("utf8");
        await tgSendMessage(chatId, `🔓 Decode:\n${out}`);
      } catch {
        await tgSendMessage(chatId, "❌ Gagal decode — format Base64 tidak valid.");
      }
    } else if (/^short:/i.test(text)) {
      const raw = text.replace(/^short:/i, "").trim();
      try {
        const r = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(raw)}`);
        const s = await r.text();
        await tgSendMessage(chatId, `🌐 Shortlink:\n${s}`);
      } catch (e) {
        await tgSendMessage(chatId, "❌ Gagal membuat shortlink.");
      }
    }

    // ---- Auto-detect TikTok links (no /tiktok required) ----
    if (text && TIKTOK_REGEX.test(text)) {
      const match = text.match(TIKTOK_REGEX)[0];
      try {
        const apiUrl = TIKTOK_API_BASE + encodeURIComponent(match);
        const r = await fetch(apiUrl);
        const j = await r.json();
        const info = j.data || j.result || j;
        const title = info?.desc || info?.title || "Video TikTok";
        const author = info?.author?.nickname || info?.author || "-";
        const thumb = info?.cover || info?.thumbnail || info?.origin_cover || null;
        const downloadUrl = info?.url || apiUrl;

        const caption = `🎬 *${escapeMD(title)}*\n👤 *${escapeMD(author)}*`;
        const kb = { inline_keyboard: [[{ text: "▶️ Tonton di TikTok", url: match }], [{ text: "⬇️ Download (API)", url: downloadUrl }]] };

        if (thumb) {
          await tgSendPhoto(chatId, thumb, caption, kb);
        } else {
          await tgSendMessage(chatId, `${caption}\n\n🔽 Download: ${downloadUrl}`, kb);
        }
      } catch (e) {
        console.error("TikTok preview error:", e);
        await tgSendMessage(chatId, "❌ Gagal mengambil info TikTok (API tidak respons atau format tak dikenali).");
      }
    }

    // ---- Callback query (buttons) ----
    if (callback) {
      const cb = callback;
      const data = cb.data;
      const cbFrom = cb.from;
      const cbMsg = cb.message;
      const cbChatId = cbMsg.chat.id;
      const cbMsgId = cbMsg.message_id;

      // site toggle (owner only)
      if (data === "site_on" || data === "site_off") {
        if (String(cbFrom.id) !== String(OWNER)) {
          await tgAnswerCallback(cb.id, "❌ Akses ditolak");
        } else {
          const val = data === "site_on";
          const w = await writeSiteStatus(val);
          await tgAnswerCallback(cb.id, `Situs -> ${val ? "AKTIF" : "NONAKTIF"} (${w.via})`);
          try { await tgEditMessage(cbChatId, cbMsgId, `📋 Site status: ${val ? "🟢 AKTIF" : "🔴 NONAKTIF"}`, adminRow(val)); } catch {}
        }
      }

      // cekid: send profile photo + info + copy button
      else if (data === "cekid") {
        const user = cbFrom;
        const fileId = await getUserProfilePhotoFileId(user.id);
        const caption = `🪪 *Data Akun*\n\n👤 *Nama:* ${escapeMD(user.first_name || "")}\n🔗 *Username:* ${user.username ? "@" + escapeMD(user.username) : "-" }\n🆔 *ID:* \`${user.id}\``;
        const kb = { inline_keyboard: [[{ text: "📋 Copy ID", callback_data: `copy_${user.id}` }]] };
        if (fileId) await tgSendPhoto(cbChatId, fileId, caption, kb);
        else await tgSendMessage(cbChatId, caption, kb);
        await tgAnswerCallback(cb.id);
      }

      // copy ID pressed
      else if (data?.startsWith("copy_")) {
        const id = data.split("_")[1];
        await tgSendMessage(cbChatId, `🆔 ID: \`${id}\``, null, "Markdown");
        await tgAnswerCallback(cb.id, "ID dikirim (tap lalu salin)");
      }

      // other helper buttons (help text)
      else if (data === "tiktok") {
        await tgEditMessage(cbChatId, cbMsgId, "🎬 Kirim link TikTok di chat — bot akan otomatis mendeteksi & menampilkan preview.", mainKeyboard(String(cbFrom.id) === String(OWNER)));
        await tgAnswerCallback(cb.id);
      } else if (data === "encode_help") {
        await tgEditMessage(cbChatId, cbMsgId, "✏️ Kirim teks: `encode: teks_anda` untuk mengubah ke Base64.", mainKeyboard(String(cbFrom.id) === String(OWNER)));
        await tgAnswerCallback(cb.id);
      } else if (data === "decode_help") {
        await tgEditMessage(cbChatId, cbMsgId, "🔓 Kirim teks: `decode: teks_base64` untuk decode Base64.", mainKeyboard(String(cbFrom.id) === String(OWNER)));
        await tgAnswerCallback(cb.id);
      } else if (data === "short_help") {
        await tgEditMessage(cbChatId, cbMsgId, "🌐 Kirim: `short: https://example.com` untuk membuat shortlink via TinyURL.", mainKeyboard(String(cbFrom.id) === String(OWNER)));
        await tgAnswerCallback(cb.id);
      } else {
        // unknown callback -> just answer to stop loader
        await tgAnswerCallback(cb.id);
      }
    }

    // ---- Group guard: delete messages with URLs (demo) ----
    if (message && message.chat && message.chat.type !== "private") {
      const txt = message.text || "";
      if (/(https?:\/\/[^\s]+)/i.test(txt)) {
        // try delete — requires bot to be admin with delete rights
        try {
          await tgDeleteMessage(message.chat.id, message.message_id);
          // optionally notify (commented to avoid spam)
          // await tgSendMessage(message.chat.id, "🚫 Pesan dengan tautan dihapus oleh bot (jaga grup aktif).");
        } catch (e) {
          // ignore permission errors
        }
      }
    }

    // ---- fallback auto-reply for plain text not handled above ----
    if (message && message.text && !message.text.startsWith("/")) {
      // keep replies polite & brief
      await tgSendMessage(chatId, `💬 Aku menerima pesanmu: _${escapeMD(message.text.slice(0, 200))}_`);
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook handler error:", err);
    // respond 200 so Telegram won't retry endlessly; developer can inspect logs
    return res.status(200).send("error");
  }
}

/* -------------------- End of webhook -------------------- */