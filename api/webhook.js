import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

  const body = req.body;

  if (body.message) {
    const chatId = body.message.chat.id;
    const text = body.message.text || "";

    let reply = "Halo! Pilih menu:";
    if (text.toLowerCase().includes("halo")) reply = "Hai juga 👋";
    if (text.startsWith("encode:")) {
      const str = text.replace("encode:", "").trim();
      reply = Buffer.from(str).toString("base64");
    } else if (text.startsWith("decode:")) {
      const str = text.replace("decode:", "").trim();
      reply = Buffer.from(str, "base64").toString("utf-8");
    }

    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: reply }),
    });
  }

  res.status(200).send("OK");
}