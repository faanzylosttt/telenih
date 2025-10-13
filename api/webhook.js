// api/webhook.js
export const config = { api: { bodyParser: false } };

// ========== CONFIG ==========
const BOT_TOKEN = process.env.BOT_TOKEN;          // Token bot Telegram
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;  // ID Telegram kamu (angka)
let SITE_ACTIVE = true; // status web default

// ========== UTILS ==========
function tgApi(method) {
  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
}

async function sendMessage(chat_id, text, keyboard = null, mode = "Markdown") {
  const body = { chat_id, text, parse_mode: mode };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(tgApi("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function editMessage(chat_id, message_id, text, keyboard = null) {
  const body = { chat_id, message_id, text, parse_mode: "Markdown" };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(tgApi("editMessageText"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function escapeMD(s) {
  return (s || "").replace(/([_*[\]()~`>#+=|{}.!-])/g, "\\$1");
}

// ========== MAIN ==========
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Bot Active ✅");
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const data = JSON.parse(Buffer.concat(chunks).toString());

    const message = data.message || data.callback_query?.message;
    const chatId = message?.chat?.id;
    const fromId = data.message?.from?.id || data.callback_query?.from?.id;
    const text = (data.message?.text || "").trim();

    // ====== COMMANDS ======
    if (text === "/start") {
      const isOwner = String(fromId) === String(OWNER_CHAT_ID);
      const statusText = SITE_ACTIVE ? "🟢 Aktif" : "🔴 Nonaktif";
      await sendMessage(
        chatId,
        `👋 Halo, selamat datang!\nStatus web saat ini: *${statusText}*`,
        mainKeyboard(isOwner)
      );
    }

    // Owner control: /site on | /site off
    if (text.startsWith("/site")) {
      if (String(fromId) !== String(OWNER_CHAT_ID)) {
        await sendMessage(chatId, "❌ Hanya owner yang bisa ubah status web.");
      } else {
        const cmd = text.split(" ")[1];
        if (cmd === "on") {
          SITE_ACTIVE = true;
          await sendMessage(chatId, "✅ Situs diaktifkan.");
        } else if (cmd === "off") {
          SITE_ACTIVE = false;
          await sendMessage(chatId, "🛑 Situs dinonaktifkan.");
        } else {
          await sendMessage(chatId, "Gunakan `/site on` atau `/site off`.");
        }
      }
    }

    // /id → lihat ID user
    if (text === "/id") {
      await sendMessage(chatId, `🆔 ID kamu: \`${fromId}\``, null, "Markdown");
    }

    // auto detect TikTok link
    const tiktokMatch = text.match(/https?:\/\/(?:www\.)?(?:vm|vt|tiktok)\.com\/[^\s]+/i);
    if (tiktokMatch) {
      const link = tiktokMatch[0];
      try {
        const r = await fetch(`https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(link)}`);
        const j = await r.json();
        const dataVid = j.data || j.result || {};
        const title = dataVid.desc || dataVid.title || "Video TikTok";
        const author = dataVid.author?.nickname || "-";
        const thumb = dataVid.cover || dataVid.thumbnail || "";
        const url = dataVid.url || link;

        const caption = `🎬 *${escapeMD(title)}*\n👤 ${escapeMD(author)}`;
        const kb = {
          inline_keyboard: [
            [{ text: "▶️ Tonton di TikTok", url: link }],
            [{ text: "⬇️ Download (API)", url }],
          ],
        };

        if (thumb) {
          await fetch(tgApi("sendPhoto"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              photo: thumb,
              caption,
              parse_mode: "Markdown",
              reply_markup: kb,
            }),
          });
        } else {
          await sendMessage(chatId, caption, kb);
        }
      } catch {
        await sendMessage(chatId, "❌ Gagal memuat info TikTok.");
      }
    }

    // Inline button callback
    if (data.callback_query) {
      const cb = data.callback_query;
      const fromId = cb.from.id;
      const msgId = cb.message.message_id;
      const chatId = cb.message.chat.id;
      const action = cb.data;

      if (action === "site_on" || action === "site_off") {
        if (String(fromId) !== String(OWNER_CHAT_ID)) {
          await fetch(tgApi("answerCallbackQuery"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: cb.id, text: "❌ Bukan owner" }),
          });
        } else {
          SITE_ACTIVE = action === "site_on";
          await fetch(tgApi("answerCallbackQuery"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              callback_query_id: cb.id,
              text: SITE_ACTIVE ? "🟢 Web diaktifkan" : "🔴 Web dimatikan",
            }),
          });
          await editMessage(
            chatId,
            msgId,
            `Status web: ${SITE_ACTIVE ? "🟢 Aktif" : "🔴 Nonaktif"}`,
            adminKeyboard()
          );
        }
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(200).send("error");
  }
}

// ===== KEYBOARDS =====
function mainKeyboard(isOwner = false) {
  const base = [
    [{ text: "🆔 Cek ID", callback_data: "cekid" }],
    [{ text: "🎬 Kirim Link TikTok", callback_data: "tiktok" }],
  ];
  if (isOwner)
    base.push([
      {
        text: SITE_ACTIVE ? "🔴 Nonaktifkan Web" : "🟢 Aktifkan Web",
        callback_data: SITE_ACTIVE ? "site_off" : "site_on",
      },
    ]);
  return { inline_keyboard: base };
}
function adminKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: SITE_ACTIVE ? "🔴 Nonaktifkan Web" : "🟢 Aktifkan Web",
          callback_data: SITE_ACTIVE ? "site_off" : "site_on",
        },
      ],
    ],
  };
}