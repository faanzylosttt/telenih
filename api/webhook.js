export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("🤖 Bot Active with Inline Menu ✅");
  }

  try {
    // Parse body dari Telegram
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const update = JSON.parse(Buffer.concat(buffers).toString());

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

    // 🔔 Auto welcome message
    if (update.message?.new_chat_members) {
      const chatId = update.message.chat.id;
      for (const member of update.message.new_chat_members) {
        await sendMsg(API, chatId, `👋 Selamat datang, ${member.first_name || "teman baru"}!`);
      }
    }

    // 📩 Pesan dari user
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text || "";

      // /start command
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
        const str = text.replace("encode:", "").trim();
        const encoded = Buffer.from(str).toString("base64");
        await sendMsg(API, chatId, `✅ *Hasil Encode:*\n\`${encoded}\``, "Markdown");
      }

      // Decode
      else if (text.startsWith("decode:")) {
        const str = text.replace("decode:", "").trim();
        try {
          const decoded = Buffer.from(str, "base64").toString("utf-8");
          await sendMsg(API, chatId, `✅ *Hasil Decode:*\n${decoded}`, "Markdown");
        } catch {
          await sendMsg(API, chatId, "❌ Format Base64 tidak valid.");
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
        await sendMsg(API, chatId, `🆔 *Nama:* ${name}\n💬 *Chat Type:* ${chatType}\n📎 *ID:* \`${id}\``, "Markdown");
      }
    }

    // 🔘 Tombol ditekan (callback_query)
    if (update.callback_query) {
      const chatId = update.callback_query.message.chat.id;
      const messageId = update.callback_query.message.message_id;
      const data = update.callback_query.data;

      let text = "Pilih menu di bawah ini:";
      let keyboard = mainMenu();

      if (data === "tools") {
        text = "🧰 Pilih tools:";
        keyboard = toolsMenu();
      } else if (data === "info") {
        text = "ℹ️ *Telenih Bot*\nDibuat oleh @ZyanEditzzz.\nGunakan bot ini untuk encode, decode, shortlink, dan cek ID.";
      } else if (data === "back") {
        text = "👋 Kembali ke menu utama:";
        keyboard = mainMenu();
      }

      // Edit pesan lama, bukan kirim baru
      await fetch(`${API}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }),
      });
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(200).send("Error processing update");
  }
}

// Fungsi utilitas kirim pesan
async function sendMsg(api, chatId, text, mode = "HTML") {
  await fetch(`${api}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: mode,
    }),
  });
}

// Menu utama
function mainMenu() {
  return {
    inline_keyboard: [
      [
        { text: "🧰 Tools", callback_data: "tools" },
        { text: "ℹ️ Info Bot", callback_data: "info" },
      ],
    ],
  };
}

// Menu tools
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