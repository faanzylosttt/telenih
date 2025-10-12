export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("🤖 Bot Active with Menu ✅");
  }

  try {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const data = JSON.parse(Buffer.concat(buffers).toString());

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

    // ✉️ Pesan biasa
    if (data.message) {
      const chatId = data.message.chat.id;
      const text = data.message.text || "";

      // Jika /start diketik → kirim menu
      if (text === "/start") {
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "👋 Selamat datang di *Telenih Bot*!\nPilih menu di bawah ini:",
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "🧰 Tools", callback_data: "tools" },
                  { text: "ℹ️ Info Bot", callback_data: "info" },
                ],
              ],
            },
          }),
        });
      }
    }

    // ⚙️ Callback dari tombol menu
    if (data.callback_query) {
      const chatId = data.callback_query.message.chat.id;
      const dataBtn = data.callback_query.data;

      let replyText = "Pilih menu:";

      if (dataBtn === "tools") {
        replyText = "🧰 Pilih tools yang ingin kamu gunakan:";
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "🔐 Encode Text", callback_data: "encode" },
                  { text: "🔓 Decode Text", callback_data: "decode" },
                ],
                [{ text: "🌐 Shortlink", callback_data: "shortlink" }],
                [{ text: "⬅️ Kembali", callback_data: "back" }],
              ],
            },
          }),
        });
      }

      else if (dataBtn === "info") {
        replyText = "ℹ️ *Telenih Bot*\nBot ini dibuat untuk berbagai tools praktis seperti encode, decode, dan shortlink.\nDeveloper: @ZyanEditzzz";
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: "Markdown",
          }),
        });
      }

      else if (dataBtn === "encode") {
        replyText = "Kirim teks dengan format:\n`encode: teks_kamu`";
      }

      else if (dataBtn === "decode") {
        replyText = "Kirim teks dengan format:\n`decode: teks_yang_di_base64`";
      }

      else if (dataBtn === "shortlink") {
        replyText = "Kirim link dengan format:\n`short: https://linkmu.com`";
      }

      else if (dataBtn === "back") {
        replyText = "⬅️ Kembali ke menu utama";
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "👋 Selamat datang kembali!",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "🧰 Tools", callback_data: "tools" },
                  { text: "ℹ️ Info Bot", callback_data: "info" },
                ],
              ],
            },
          }),
        });
        return res.status(200).send("OK");
      }

      // kirim balasan
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: "Markdown",
        }),
      });
    }

    // 🔄 Perintah encode/decode/shortlink
    if (data.message) {
      const chatId = data.message.chat.id;
      const text = data.message.text || "";

      if (text.startsWith("encode:")) {
        const str = text.replace("encode:", "").trim();
        const encoded = Buffer.from(str).toString("base64");
        await sendMsg(TELEGRAM_API, chatId, `✅ Hasil encode:\n\`${encoded}\``);
      }

      else if (text.startsWith("decode:")) {
        const str = text.replace("decode:", "").trim();
        try {
          const decoded = Buffer.from(str, "base64").toString("utf-8");
          await sendMsg(TELEGRAM_API, chatId, `✅ Hasil decode:\n${decoded}`);
        } catch {
          await sendMsg(TELEGRAM_API, chatId, "❌ Format Base64 tidak valid.");
        }
      }

      else if (text.startsWith("short:")) {
        const url = text.replace("short:", "").trim();
        try {
          const resShort = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
          const shortLink = await resShort.text();
          await sendMsg(TELEGRAM_API, chatId, `✅ Shortlink:\n${shortLink}`);
        } catch {
          await sendMsg(TELEGRAM_API, chatId, "❌ Gagal membuat shortlink.");
        }
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(200).send("Error processing update");
  }
}

async function sendMsg(api, chatId, text) {
  await fetch(`${api}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}