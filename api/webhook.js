import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const API_URL = `https://api.telegram.org/bot${TOKEN}`;

// 🔹 Fungsi kirim pesan
async function sendMessage(chat_id, text, buttons) {
  const body = {
    chat_id,
    text,
    parse_mode: "Markdown",
  };
  if (buttons) body.reply_markup = { inline_keyboard: buttons };

  try {
    const res = await fetch(`${API_URL}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log("✅ sendMessage:", data);
  } catch (err) {
    console.error("❌ sendMessage Error:", err);
  }
}

// 🔹 Fungsi kirim foto profil
async function sendPhoto(chat_id, file_id, caption, buttons) {
  const body = {
    chat_id,
    photo: file_id,
    caption,
    parse_mode: "Markdown",
  };
  if (buttons) body.reply_markup = { inline_keyboard: buttons };

  try {
    const res = await fetch(`${API_URL}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log("✅ sendPhoto:", data);
  } catch (err) {
    console.error("❌ sendPhoto Error:", err);
  }
}

// 🔹 Fungsi ambil PP user
async function getUserPhoto(user_id) {
  try {
    const res = await fetch(`${API_URL}/getUserProfilePhotos?user_id=${user_id}&limit=1`);
    const data = await res.json();
    if (data.ok && data.result.photos.length > 0) {
      const file_id = data.result.photos[0][0].file_id;
      return file_id;
    }
    return null;
  } catch (err) {
    console.error("❌ getUserPhoto Error:", err);
    return null;
  }
}

// 🔹 Webhook utama
app.post("/api/webhook", async (req, res) => {
  const update = req.body;
  const msg = update.message || update.callback_query?.message;
  if (!msg) return res.sendStatus(200);

  const chat_id = msg.chat.id;
  const text = update.message?.text || "";
  const cb = update.callback_query;

  // ============================
  // 📍 COMMAND /start
  // ============================
  if (text === "/start") {
    const buttons = [
      [{ text: "🆔 Cek ID", callback_data: "cekid" }],
      [{ text: "🌐 Mode Website", callback_data: "modeweb" }],
      [{ text: "📊 Status Bot", callback_data: "status" }],
      [{ text: "🛡️ Jaga Grup", callback_data: "jagagrup" }],
    ];
    await sendMessage(chat_id, "👋 Halo! Pilih menu di bawah ini:", buttons);
  }

  // ============================
  // 📍 CALLBACK BUTTON
  // ============================
  if (cb) {
    const data = cb.data;
    const user = cb.from;

    // 🔸 Cek ID
    if (data === "cekid") {
      const file_id = await getUserPhoto(user.id);
      const caption = `🪪 *Data Akun Kamu*\n\n👤 Nama: *${user.first_name || "-"}*\n🔗 Username: *@${user.username || "Tidak ada"}*\n🆔 ID: \`${user.id}\``;
      const buttons = [[{ text: "📋 Copy ID", callback_data: `copy_${user.id}` }]];

      if (file_id) {
        await sendPhoto(chat_id, file_id, caption, buttons);
      } else {
        await sendMessage(chat_id, caption, buttons);
      }
    }

    // 🔸 Copy ID
    if (data.startsWith("copy_")) {
      const id = data.split("_")[1];
      await sendMessage(chat_id, `🆔 ID kamu: \`${id}\``);
    }

    // 🔸 Lain-lain
    if (data === "modeweb") await sendMessage(chat_id, "🌐 Mode Website aktif ✅");
    if (data === "status") await sendMessage(chat_id, "🤖 Bot online & berjalan normal.");
    if (data === "jagagrup") await sendMessage(chat_id, "🛡️ Fitur Jaga Grup aktif.");

    // Tutup loading tombol
    await fetch(`${API_URL}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: cb.id }),
    });
  }

  // 🔹 Auto reply jika chat biasa
  if (text && !text.startsWith("/")) {
    await sendMessage(chat_id, `💬 Kamu bilang: *${text}*`);
  }

  res.sendStatus(200);
});

// 🔹 Tes endpoint
app.get("/api/webhook", (req, res) => {
  res.send("✅ Webhook aktif dan berjalan!");
});

export default app;