const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || "123456";
const TOKEN = "secureToken123"; // 可換成 JWT 或亂碼產生器

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



// 登入驗證 API
app.post("/api/login", (req, res) => {
  const { password } = req.body;
  if (password === LOGIN_PASSWORD) {
    res.json({ success: true, token: TOKEN });
  } else {
    res.json({ success: false });
  }
});

// 保護的秘密頁面，由後端產生整頁內容
app.get("/secret", (req, res) => {
  const token = req.query.token;
  if (token === TOKEN) {
    res.send(`
      <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>積分資料處理</title>
</head>
<body>

  
  
  <h1>新增玩家</h1>
  
  <!-- 新增玩家表單 -->
  <form id="addPlayerForm">
    <label for="addName">名稱：</label>
    <input type="text" id="addName" name="name" required><br><br>
    
    <label for="addPoints">積分：</label>
    <input type="number" id="addPoints" name="points" value="1000" required><br><br>
    
    <button type="submit">提交新增</button>
  </form>

  <h1>刪除玩家</h1>

  <!-- 刪除玩家表單 -->
  <form id="deletePlayerForm">
    <label for="deleteName">名稱：</label>
    <input type="text" id="deleteName" name="name" required><br><br>
    
    <button type="submit">提交刪除</button>
  </form>


 <h1>上傳比賽結果</h1>
<form id="uploadMatchForm">
  <label for="matchResults">
    請輸入比賽結果（格式: <strong>贏家, 輸家</strong>，一行一組）：
  </label><br>
  <textarea id="matchResults" rows="6" cols="40"
    placeholder="Alice, Bob&#10;表示 Alice 贏 Bob"
    required></textarea><br><br>
  <button type="submit">提交比賽結果</button>
</form>


  <h2>及時排行榜</h2>
    <ul id="rankingList"></ul>











  <script>
    // 新增玩家功能
    document.getElementById("addPlayerForm").addEventListener("submit", function(event) {
      event.preventDefault();
      
      const playerName = document.getElementById("addName").value;
      const playerPoints = parseInt(document.getElementById("addPoints").value);
      
      fetch("https://prs2.onrender.com/players", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: playerName,
          points: playerPoints
        })
      })
      .then(response => response.json())
      .then(data => {
        alert("玩家新增成功！\n" + JSON.stringify(data));
        loadRanking();
      })
      .catch(error => {
        alert("錯誤: " + error);
      });
    });

    // 刪除玩家功能
document.getElementById("deletePlayerForm").addEventListener("submit", function(event) {
  event.preventDefault();
  
  const playerName = document.getElementById("deleteName").value;

  if (!playerName) {
    alert("請輸入玩家名稱！");
    return;
  }

  // 發送 DELETE 請求到 API 根據玩家名稱刪除
  fetch("https://prs2.onrender.com/players/${playerName}", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('玩家未找到或刪除失敗！');
    }
    return response.json();  // 返回 JSON 格式的資料
  })
  .then(data => {
    // 顯示刪除成功訊息
    if (data.message) {
      alert(data.message);  // 顯示刪除成功訊息
      loadRanking();
      // ✅ 清空輸入框
      document.getElementById("deleteName").value = '';
    } else {
      alert("刪除失敗，請稍後再試！");
    }
  })
  .catch(error => {
    console.error('刪除錯誤:', error);  // 顯示錯誤日誌
    alert("刪除玩家時發生錯誤！");
  });
});








// 上傳比賽結果功能
document.getElementById("uploadMatchForm").addEventListener("submit", function(event) {
  event.preventDefault();

  const rawText = document.getElementById("matchResults").value.trim();
  const lines = rawText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && line.includes(","));

  if (lines.length === 0) {
    alert("請輸入正確的比賽格式（例如：Alice, Bob）");
    return;
  }

  fetch("https://prs2.onrender.com/match-results", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ results: lines })
  })
  .then(res => res.json())
  .then(data => {
    console.log("回傳資料：", data);
    if (data.message) {
      alert("比賽上傳成功！\n" + data.message);
    } else {
      alert("回傳錯誤：" + JSON.stringify(data));
    }

    // ✅ 重整排行榜
    loadRanking();

    // ✅ 清空輸入框
    document.getElementById("matchResults").value = '';
  })
  .catch(error => {
    alert("發生錯誤：" + error.message);
  });
});

















function loadRanking() {
  fetch("https://prs2.onrender.com/players")
    .then(res => res.json())
    .then(data => {
      const list = document.getElementById("rankingList");
      list.innerHTML = "";
      data.forEach(p => {
        const li = document.createElement("li");
        li.textContent = "${p.name} - ${p.points} 分";
        list.appendChild(li);
      });
    });
}

loadRanking(); // 初次載入






  </script>
</body>
</html>

    `);
  } else {
    res.status(401).send("Unauthorized: Token 無效或遺失。");
  }
});





// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at https://prs2.onrender.com:${process.env.PORT || 3000}`);
});
