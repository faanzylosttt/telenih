export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("🤖 Telenih Bot Aktif!");
  }

  try {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const update = JSON.parse(Buffer.concat(buffers).toString());

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

    // 🧍 Auto welcome
    if (update.message?.new_chat_members) {
      const chatId = update.message.chat.id;
      for (const member of update.message.new_chat_members) {
        await sendMsg(API, chatId, `👋 Selamat datang, ${member.first_name || "teman baru"}!`);
      }
    }

    // 💬 Command atau pesan biasa
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text?.trim() || "";

      // Start
      if (text === "/start") {
        await fetch(`${API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "👋 Selamat datang di *Telenih Bot*\nPilih menu di bawah ini:",
            parse_mode: "Markdown",
            reply_markup: mainMenu(),
          }),
        });
      }

      // Encode
      else if (text.startsWith("encode:")) {
        const input = text.replace("encode:", "").trim();
        const encoded = Buffer.from(input).toString("base64");
        await sendMsg(API, chatId, `🔐 *Encode Result:*\n\`${encoded}\``, "Markdown");
      }

      // Decode
      else if (text.startsWith("decode:")) {
        const input = text.replace("decode:", "").trim();
        try {
          const decoded = Buffer.from(input, "base64").toString("utf-8");
          await sendMsg(API, chatId, `🔓 *Decode Result:*\n${decoded}`, "Markdown");
        } catch {
          await sendMsg(API, chatId, "❌ Gagal decode, format Base64 tidak valid.");
        }
      }

      // Shortlink
      else if (text.startsWith("short:")) {
        const url = text.replace("short:", "").trim();
        try {
          const r = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
          const short = await r.text();
          await sendMsg(API, chatId, `🌐 *Shortlink:*\n${short}`, "Markdown");
        } catch {
          await sendMsg(API, chatId, "❌ Gagal membuat shortlink.");
        }
      }

      // Cek ID
      else if (text === "/id") {
        const name = update.message.from.first_name || "User";
        const id = update.message.from.id;
        const chatType = update.message.chat.type;
        await sendMsg(API, chatId, `🆔 *Nama:* ${name}\n💬 *Tipe:* ${chatType}\n📎 *ID:* \`${id}\``, "Markdown");
      }

      // TikTok info
      else if (text.startsWith("tiktok:")) {
        const link = text.replace("tiktok:", "").trim();
        if (!link.startsWith("http")) {
          return await sendMsg(API, chatId, "⚠️ Kirim dengan format:\n`tiktok: https://...`", "Markdown");
        }

        try {
          const resTik = await fetch(`https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(link)}`);
          const data = await resTik.json();

          if (data.status && data.data) {
            const info = data.data;
            const caption = `🎬 *Video TikTok Ditemukan!*\n\n📱 *Username:* ${info.author?.nickname || "-"}\n💬 *Deskripsi:* ${info.desc || "-"}\n⏱️ *Durasi:* ${info.duration || "?"} detik\n\n[🔗 Klik di sini untuk Download Video](${data.data.url || link})`;
            await sendMsg(API, chatId, caption, "Markdown");
          } else {
            await sendMsg(API, chatId, "❌ Gagal mengambil info video TikTok.");
          }
        } catch {
          await sendMsg(API, chatId, "❌ API TikTok tidak dapat diakses sekarang.");
        }
      }
    }

    // 🔘 Callback button
    if (update.callback_query) {
      const chatId = update.callback_query.message.chat.id;
      const msgId = update.callback_query.message.message_id;
      const data = update.callback_query.data;

      let text = "";
      let keyboard = mainMenu();

      if (data === "tools") {
        text = "🧰 Pilih tools yang ingin digunakan:";
        keyboard = toolsMenu();
      } else if (data === "tiktok") {
        text = "🎬 Kirim link TikTok dengan format:\n`tiktok: https://tiktok.com/...`\n\nBot akan menampilkan informasi video dan tautan download-nya.";
        keyboard = backButton();
      } else if (data === "info") {
        text = "🤖 *Telenih Bot*\nDibuat oleh @ZyanEditzzz\nFitur: Encode, Decode, Shortlink, ID, TikTok Info.";
        keyboard = backButton();
      } else if (data === "back") {
        text = "👋 Kembali ke menu utama:";
        keyboard = mainMenu();
      }

      await fetch(`${API}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: msgId,
          text,
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }),
      });
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(200).send("Error processing update");
  }
}

// ========== Fungsi Pendukung ==========

async function sendMsg(api, chatId, text, mode = "Markdown") {
  await fetch(`${api}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: mode }),
  });
}

function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: "🧰 Tools", callback_data: "tools" }, { text: "🎬 TikTok", callback_data: "tiktok" }],
      [{ text: "ℹ️ Info Bot", callback_data: "info" }],
    ],
  };
}

function toolsMenu() {
  return {
    inline_keyboard: [
      [
        { text: "🔐 Encode", callback_data: "encode_help" },
        { text: "🔓 Decode", callback_data: "decode_help" },
      ],
      [{ text: "🌐 Shortlink", callback_data: "short_help" }],
      [{ text: "⬅️ Kembali", callback_data: "back" }],
    ],
  };
}

function backButton() {
  return { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "back" }]] };
}