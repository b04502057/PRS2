const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const app = express();
const PORT = 3000;

// 中介軟體
app.use(cors());
app.use(express.json());

// 資料庫初始化
const db = new sqlite3.Database('./players.db');

// 建立表格（只執行一次）
db.run(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    points INTEGER DEFAULT 1000
  )
`);

// API：取得所有玩家
app.get('/players', (req, res) => {
  db.all("SELECT * FROM players ORDER BY points DESC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// API：新增玩家
app.post('/players', (req, res) => {
  const { name, points } = req.body;
  db.run("INSERT INTO players (name, points) VALUES (?, ?)", [name, points || 1000], function(err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json({ id: this.lastID, name, points });
  });
});

// API：根據名稱刪除玩家
app.delete('/players/:name', (req, res) => {
  console.log("Handling DELETE request for: ", req.params.name);  // 這裡打印
  const playerName = req.params.name;  // 這會從 URL 中擷取名稱

  if (!playerName) {
    return res.status(400).json({ error: '玩家名稱必須提供' });
  }

  // 查詢玩家是否存在
  db.get("SELECT * FROM players WHERE name = ?", [playerName], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: '玩家未找到' });
    }

    // 刪除玩家
    db.run("DELETE FROM players WHERE name = ?", [playerName], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      // 如果刪除成功，返回刪除的玩家名稱
      res.json({ message: `玩家 ${row.name} 已成功刪除！` });
    });
  });
});








function getExpectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function getNewRating(oldRating, expectedScore, actualScore, k = 50) {
  return Math.round(oldRating + k * (actualScore - expectedScore));
}






app.post('/match-results', (req, res) => {
  const { results } = req.body;

  if (!Array.isArray(results)) {
    return res.status(400).json({ error: '格式錯誤，應為陣列' });
  }

  const updates = [];

  const processNext = (i) => {
    if (i >= results.length) {
      return res.json({ message: "處理完成", updates });
    }

    const line = results[i];
    const [winnerRaw, loserRaw] = line.split(",");
    if (!winnerRaw || !loserRaw) {
      updates.push({ error: "格式錯誤", line });
      return processNext(i + 1);
    }

    const winnerName = winnerRaw.trim();
    const loserName = loserRaw.trim();

    db.all("SELECT * FROM players WHERE name IN (?, ?)", [winnerName, loserName], (err, rows) => {
      if (err || rows.length < 2) {
        updates.push({ error: "找不到選手", line });
        return processNext(i + 1);
      }

      const winner = rows.find(p => p.name === winnerName);
      const loser = rows.find(p => p.name === loserName);

      if (!winner || !loser) {
        updates.push({ error: "名稱比對錯誤", line });
        return processNext(i + 1);
      }

      // 1. 預期勝率
        const expectedWinner = getExpectedScore(winner.points, loser.points);
        const expectedLoser = getExpectedScore(loser.points, winner.points);

        // 2. 實際比賽結果（贏家 = 1，輸家 = 0）
        const winnerNewPoints = getNewRating(winner.points, expectedWinner, 1);
        const loserNewPoints = getNewRating(loser.points, expectedLoser, 0);

        // 3. 分數變化量
        const winnerChange = winnerNewPoints - winner.points;
        const loserChange = loserNewPoints - loser.points;

        // 4. 更新資料庫
        db.run("UPDATE players SET points = ? WHERE name = ?", [winnerNewPoints, winner.name], (e1) => {
          if (e1) return processNext(i + 1);

          db.run("UPDATE players SET points = ? WHERE name = ?", [loserNewPoints, loser.name], (e2) => {
            if (e2) return processNext(i + 1);

            updates.push({
              match: `${winner.name} vs ${loser.name}`,
              winnerChange,
              loserChange
            });
            processNext(i + 1);
          });
        });
    });
  };

  processNext(0);
});






app.post("/api/login", express.json(), (req, res) => {
  const password = req.body.password;

  // 比對密碼（最好是從環境變數或資料庫讀）
  if (password === process.env.LOGIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});









// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at https://prs-52ox.onrender.com:${process.env.PORT || 3000}`);
});
