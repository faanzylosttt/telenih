import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/* === Ganti token di sini === */
const TOKEN = "8003430162:AAGuxN5NEcXnbnnXCLcGciSprRKFcnChkQI";
const API = `https://api.telegram.org/bot${TOKEN}`;

/* === Fungsi kirim pesan === */
async function sendMessage(chat_id, text, buttons = null) {
  const body = { chat_id, text, parse_mode: "Markdown" };
  if (buttons) body.reply_markup = { inline_keyboard: buttons };

  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* === Menu utama === */
async function showMainMenu(chat_id) {
  const buttons = [
    [
      { text: "🆔 Cek ID", callback_data: "cekid" },
      { text: "🎬 Download TikTok", callback_data: "tiktok" }
    ],
    [{ text: "🛡️ Jaga Grup", callback_data: "jagagrup" }]
  ];
  await sendMessage(chat_id, "*👋 Selamat datang di Bot Multifungsi!*", buttons);
}

/* === Fitur jaga grup sederhana === */
async function guardGroup(message) {
  const text = message.text || "";
  const chat_id = message.chat.id;

  // Contoh: hapus pesan yang mengandung link tertentu
  const spamPattern = /(https?:\/\/[^\s]+)/i;
  if (spamPattern.test(text) && message.chat.type !== "private") {
    await fetch(`${API}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        message_id: message.message_id
      })
    });
    await sendMessage(chat_id, "🚫 Pesan dengan tautan telah dihapus (fitur jaga grup).");
  }
}

/* === Webhook utama === */
app.post("/api/webhook", async (req, res) => {
  const msg = req.body.message || req.body.callback_query?.message;
  if (!msg) return res.sendStatus(200);

  const chat_id = msg.chat.id;
  const text = req.body.message?.text || "";
  const cb = req.body.callback_query;

  // ---- Command /start ----
  if (text.startsWith("/start")) {
    await showMainMenu(chat_id);
  }

  // ---- Callback tombol ----
  if (cb) {
    const user = cb.from;
    const data = cb.data;

    if (data === "cekid") {
      await sendMessage(chat_id, `🆔 ID kamu: *${user.id}*`);
    } else if (data === "tiktok") {
      await sendMessage(chat_id, "🎬 Kirim link TikTok yang ingin kamu proses!");
    } else if (data === "jagagrup") {
      await sendMessage(chat_id, "🛡️ Mode jaga grup aktif (hapus link otomatis).");
    } else if (data === "menu") {
      await showMainMenu(chat_id);
    }

    // Hentikan animasi tombol loading
    await fetch(`${API}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: cb.id })
    });
  }

  // ---- Deteksi link TikTok ----
  const match = text.match(/https?:\/\/(?:vt|www)\.tiktok\.com\/[^\s]+/);
  if (match) {
    const link = match[0];
    const apiUrl = `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(link)}`;

    try {
      const resApi = await fetch(apiUrl);
      const data = await resApi.json();

      if (data.status) {
        const caption = `🎬 *Video TikTok ditemukan!*\n\n📌 *Judul:* ${data.result.title || "-"}\n👤 *User:* ${data.result.author || "-"}\n\n🔽 Klik tombol di bawah untuk mengunduh:`;
        const buttons = [
          [{ text: "🔗 Download dari API", url: apiUrl }],
          [{ text: "🏠 Kembali ke Menu", callback_data: "menu" }]
        ];
        await sendMessage(chat_id, caption, buttons);
      } else {
        await sendMessage(chat_id, "⚠️ Tidak dapat mengambil data dari API TikTok.");
      }
    } catch {
      await sendMessage(chat_id, "❌ Terjadi kesalahan saat memproses tautan TikTok.");
    }
  }

  // ---- Jalankan proteksi grup ----
  if (msg.chat.type !== "private") await guardGroup(msg);

  res.sendStatus(200);
});

/* === Tes endpoint === */
app.get("/", (req, res) => res.send("✅ Bot Telegram aktif di Vercel"));

export default app;