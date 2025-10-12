export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const TOKEN = process.env.BOT_TOKEN;
  const API_URL = `https://api.telegram.org/bot${TOKEN}`;
  const data = req.body;

  // Helper kirim pesan
  async function sendMessage(chat_id, text, reply_markup = null) {
    await fetch(`${API_URL}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text, reply_markup, parse_mode: "Markdown" }),
    });
  }

  // Menu utama
  async function sendMainMenu(chat_id) {
    const reply_markup = {
      inline_keyboard: [
        [{ text: "🧰 Tools", callback_data: "tools" }],
        [{ text: "ℹ️ Info Bot", callback_data: "info" }],
      ],
    };
    await sendMessage(chat_id, "👋 Selamat datang di *FaanZy Tools Bot!*\nPilih menu di bawah ini:", reply_markup);
  }

  // Menu tools
  async function sendToolsMenu(chat_id) {
    const reply_markup = {
      inline_keyboard: [
        [
          { text: "🔗 Shortlink", callback_data: "shortlink" },
          { text: "🔢 Encode", callback_data: "encode" },
          { text: "🔓 Decode", callback_data: "decode" }
        ],
        [{ text: "⬅️ Kembali", callback_data: "back" }]
      ]
    };
    await sendMessage(chat_id, "🧰 Pilih salah satu tools:", reply_markup);
  }

  // Handle message user
  try {
    if (data.message) {
      const chatId = data.message.chat.id;
      const text = data.message.text?.trim();

      // Jika /start
      if (text === "/start") {
        await sendMainMenu(chatId);
      }

      // Jika user kirim link dan sebelumnya pilih shortlink
      else if (text.startsWith("http")) {
        // TinyURL API
        const resp = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`);
        const short = await resp.text();
        await sendMessage(chatId, `🔗 Link pendek:\n${short}`);
      }

      // Encode Base64
      else if (text.startsWith("encode:")) {
        const toEncode = text.replace("encode:", "").trim();
        const encoded = Buffer.from(toEncode).toString("base64");
        await sendMessage(chatId, `🔢 Hasil Encode:\n\`${encoded}\``);
      }

      // Decode Base64
      else if (text.startsWith("decode:")) {
        try {
          const toDecode = text.replace("decode:", "").trim();
          const decoded = Buffer.from(toDecode, "base64").toString("utf8");
          await sendMessage(chatId, `🔓 Hasil Decode:\n\`${decoded}\``);
        } catch {
          await sendMessage(chatId, "⚠️ Gagal decode teks, pastikan format Base64 valid!");
        }
      }

      else {
        await sendMessage(chatId, "Kirim /start untuk menampilkan menu utama ⚙️");
      }
    }

    // Handle callback button
    if (data.callback_query) {
      const chatId = data.callback_query.message.chat.id;
      const query = data.callback_query.data;

      if (query === "tools") await sendToolsMenu(chatId);
      else if (query === "info") {
        await sendMessage(chatId, "🤖 *FaanZy Tools Bot*\nDibuat dengan ❤️ dan Vercel.\nGunakan menu Tools untuk encode, decode, atau shortlink!");
      }
      else if (query === "shortlink") {
        await sendMessage(chatId, "🔗 Kirim link yang ingin dipendekkan (contoh: https://example.com)");
      }
      else if (query === "encode") {
        await sendMessage(chatId, "✏️ Kirim teks dengan format: `encode: teks_anda`");
      }
      else if (query === "decode") {
        await sendMessage(chatId, "🔓 Kirim teks dengan format: `decode: base64_anda`");
      }
      else if (query === "back") await sendMainMenu(chatId);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Error");
  }
}