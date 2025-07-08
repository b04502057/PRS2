const express = require('express');
const pool = require('./db');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || "123456";
const TOKEN = "secureToken123";

app.use(cors());
app.use(express.json());

// 建立資料表（第一次執行自動建立）
pool.query(`
  CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    points INTEGER DEFAULT 1000
  )
`);

// API：取得所有玩家
app.get('/players', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players ORDER BY points DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API：新增玩家
app.post('/players', async (req, res) => {
  const { name, points } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO players (name, points) VALUES ($1, $2) RETURNING *",
      [name, points || 1000]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// API：刪除玩家
app.delete('/players/:name', async (req, res) => {
  const playerName = req.params.name;
  try {
    const result = await pool.query("SELECT * FROM players WHERE name = $1", [playerName]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '玩家未找到' });
    }

    await pool.query("DELETE FROM players WHERE name = $1", [playerName]);
    res.json({ message: `玩家 ${playerName} 已成功刪除！` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Elo 計算邏輯
function getExpectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function getNewRating(oldRating, expectedScore, actualScore, k = 50) {
  return Math.round(oldRating + k * (actualScore - expectedScore));
}

// API：處理比賽結果
app.post('/match-results', async (req, res) => {
  const { results } = req.body;
  if (!Array.isArray(results)) {
    return res.status(400).json({ error: '格式錯誤，應為陣列' });
  }

  const updates = [];

  for (const line of results) {
    const [winnerRaw, loserRaw] = line.split(",");
    if (!winnerRaw || !loserRaw) {
      updates.push({ error: "格式錯誤", line });
      continue;
    }

    const winnerName = winnerRaw.trim();
    const loserName = loserRaw.trim();

    try {
      const result = await pool.query(
        "SELECT * FROM players WHERE name = $1 OR name = $2",
        [winnerName, loserName]
      );
      const players = result.rows;
      const winner = players.find(p => p.name === winnerName);
      const loser = players.find(p => p.name === loserName);

      if (!winner || !loser) {
        updates.push({ error: "找不到選手", line });
        continue;
      }

      const expectedWinner = getExpectedScore(winner.points, loser.points);
      const expectedLoser = getExpectedScore(loser.points, winner.points);

      const winnerNewPoints = getNewRating(winner.points, expectedWinner, 1);
      const loserNewPoints = getNewRating(loser.points, expectedLoser, 0);

      await pool.query("UPDATE players SET points = $1 WHERE name = $2", [winnerNewPoints, winner.name]);
      await pool.query("UPDATE players SET points = $1 WHERE name = $2", [loserNewPoints, loser.name]);

      updates.push({
        match: `${winner.name} vs ${loser.name}`,
        winnerChange: winnerNewPoints - winner.points,
        loserChange: loserNewPoints - loser.points
      });

    } catch (err) {
      updates.push({ error: err.message, line });
    }
  }

  res.json({ message: "處理完成", updates });
});

// 登入驗證 API
app.post("/api/login", (req, res) => {
  const { password } = req.body;
  if (password === LOGIN_PASSWORD) {
    res.json({ success: true, token: TOKEN });
  } else {
    res.json({ success: false });
  }
});

// 測試用的後台畫面
app.get("/secret", (req, res) => {
  const token = req.query.token;
  if (token === TOKEN) {
    res.send(`<h1>登入成功，你可以管理資料。</h1>`);
  } else {
    res.status(401).send("Unauthorized");
  }
});

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
