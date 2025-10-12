export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Bot Active ✅");
  }

  try {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const data = JSON.parse(Buffer.concat(buffers).toString());

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

    if (data.message) {
      const chatId = data.message.chat.id;
      const text = data.message.text || "";

      let replyText = "Halo! 👋 Ketik:\n- encode: teks\n- decode: teks";

      if (text.toLowerCase().includes("halo")) {
        replyText = "Hai juga 👋 Bot kamu aktif di Vercel 🚀";
      } else if (text.startsWith("encode:")) {
        const str = text.replace("encode:", "").trim();
        replyText = Buffer.from(str).toString("base64");
      } else if (text.startsWith("decode:")) {
        const str = text.replace("decode:", "").trim();
        replyText = Buffer.from(str, "base64").toString("utf-8");
      }

      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: replyText }),
      });
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(200).send("Error processing update");
  }
}