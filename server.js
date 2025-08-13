const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 5000;
const SELF_URL = process.env.SELF_URL || `http://localhost:${PORT}`;
const HISTORY_FILE = "history.json";

let patternHistory = [];
let fullHistory = [];
const MAX_HISTORY = 100;

let latestResult = {
  id: "binhtool90",
  Phien: 0,
  Xuc_xac_1: 0,
  Xuc_xac_2: 0,
  Xuc_xac_3: 0,
  Tong: 0,
  Ket_qua: "",
  Pattern: "",
  Du_doan: "",
  Do_tin_cay: "",
  Giai_thich: "",
  Streak: ""
};

// Load lịch sử từ file JSON nếu có
if (fs.existsSync(HISTORY_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    fullHistory = data;
    patternHistory = data.map(item => item.Ket_qua === "Tài" ? "t" : "x");
    if (fullHistory.length > 0) latestResult = fullHistory[fullHistory.length - 1];
    console.log(`✅ Đã load ${fullHistory.length} phiên từ history.json`);
  } catch (e) {
    console.error("❌ Lỗi khi đọc file history.json:", e.message);
  }
}

function getTaiXiu(sum) {
  return sum > 10 ? "t" : "x";
}

// Thuật toán dự đoán nâng cao - kết hợp nhiều lớp phân tích
function duDoanAdvanced(historyPattern, fullHistoryData) {
  const votes = { t: 0, x: 0 };
  const explanations = [];
  const minHistory = 15;
  
  if (historyPattern.length < minHistory) {
    // Quá ít dữ liệu, dự đoán dựa trên xác suất cơ bản
    const counts = { t: 0, x: 0 };
    for (const c of historyPattern) counts[c]++;
    const total = counts.t + counts.x || 1;
    const percentT = counts.t / total;
    const duDoanResult = percentT >= 0.5 ? "Tài" : "Xỉu";
    const doTinCay = (Math.max(counts.t, counts.x) / total * 100).toFixed(1);
    return { duDoanResult, doTinCay, explanation: "Dữ liệu chưa đủ, dự đoán dựa trên xác suất tổng thể." };
  }

  // Lớp 1: Phân tích Markov bậc cao (Trọng số 50%)
  const orders = [4, 3, 2];
  const totalWeight = orders.reduce((sum, order) => sum + order, 0);

  let markovVotes = { t: 0, x: 0 };
  orders.forEach(order => {
    const lastSeq = historyPattern.slice(-order);
    let counts = { t: 0, x: 0 };
    let total = 0;
    for (let i = 0; i <= historyPattern.length - order - 1; i++) {
      if (historyPattern.slice(i, i + order).join('') === lastSeq.join('')) {
        const next = historyPattern[i + order];
        counts[next]++;
        total++;
      }
    }
    if (total > 0) {
      markovVotes.t += (counts.t / total) * order;
      markovVotes.x += (counts.x / total) * order;
    }
  });

  const markovTotal = markovVotes.t + markovVotes.x;
  if (markovTotal > 0) {
    votes.t += (markovVotes.t / markovTotal) * 0.5;
    votes.x += (markovVotes.x / markovTotal) * 0.5;
    explanations.push(`Markov: Phân tích mẫu hình bậc 2-4.`);
  }

  // Lớp 2: Phân tích Xu hướng & Chuỗi (Trọng số 30%)
  const last5 = historyPattern.slice(-5);
  const taiStreak = last5.filter(r => r === 't').length;
  const xiuStreak = last5.filter(r => r === 'x').length;

  if (taiStreak >= 4) {
    votes['x'] += 0.3;
    explanations.push(`Xu hướng: Chuỗi ${taiStreak} Tài liên tiếp, khả năng đảo chiều cao.`);
  } else if (xiuStreak >= 4) {
    votes['t'] += 0.3;
    explanations.push(`Xu hướng: Chuỗi ${xiuStreak} Xỉu liên tiếp, khả năng đảo chiều cao.`);
  }

  // Lớp 3: Phân tích Tổng điểm & Cân bằng (Trọng số 20%)
  const lastTotal = fullHistoryData[fullHistoryData.length - 1]?.Tong;
  if (lastTotal) {
    // Nếu tổng điểm cực hiếm, dự đoán ngược lại
    if (lastTotal <= 5) {
      votes['t'] += 0.2;
      explanations.push(`Tổng điểm: Tổng ${lastTotal} rất thấp, dự đoán Tài.`);
    } else if (lastTotal >= 16) {
      votes['x'] += 0.2;
      explanations.push(`Tổng điểm: Tổng ${lastTotal} rất cao, dự đoán Xỉu.`);
    }
  }

  // Tổng hợp và đưa ra quyết định cuối cùng
  let duDoanResult = "Tài";
  let doTinCay = "50.0";
  let combinedVotes = votes.t + votes.x;

  if (combinedVotes > 0) {
    const percentT = (votes.t / combinedVotes) * 100;
    const percentX = (votes.x / combinedVotes) * 100;
    duDoanResult = percentT >= percentX ? "Tài" : "Xỉu";
    doTinCay = percentT >= percentX ? percentT.toFixed(1) : percentX.toFixed(1);
  }

  return { duDoanResult, doTinCay, explanation: explanations.join(" | ") };
}

// Tính streak liên tiếp hiện tại
function getCurrentStreak(pattern) {
  if (pattern.length === 0) return { type: "-", count: 0 };
  const lastChar = pattern.slice(-1);
  let count = 0;
  for (let i = pattern.length - 1; i >= 0; i--) {
    if (pattern[i] === lastChar) count++;
    else break;
  }
  return {
    type: lastChar === "t" ? "Tài" : "Xỉu",
    count
  };
}

function updateResult(d1, d2, d3, sid = null) {
  const total = d1 + d2 + d3;
  const result = total > 10 ? "Tài" : "Xỉu";
  const shorthand = getTaiXiu(total);

  if (sid !== latestResult.Phien) {
    patternHistory.push(shorthand);
    if (patternHistory.length > MAX_HISTORY) patternHistory.shift();

    const pattern = patternHistory.join("");
    const { duDoanResult, doTinCay, explanation } = duDoanAdvanced(patternHistory, fullHistory);
    const streak = getCurrentStreak(pattern);

    latestResult = {
      id: "binhtool90",
      Phien: sid || latestResult.Phien,
      Xuc_xac_1: d1,
      Xuc_xac_2: d2,
      Xuc_xac_3: d3,
      Tong: total,
      Ket_qua: result,
      Pattern: pattern,
      Du_doan: duDoanResult,
      Do_tin_cay: doTinCay + "%",
      Giai_thich: explanation,
      Streak: `${streak.type} (${streak.count})`
    };

    fullHistory.push({ ...latestResult });
    if (fullHistory.length > MAX_HISTORY) fullHistory.shift();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(fullHistory, null, 2));

    const timeStr = new Date().toISOString().replace("T", " ").slice(0, 19);
    console.log(
      `[🎲✅] Phiên ${latestResult.Phien} - ${d1}-${d2}-${d3} ➜ Tổng: ${total}, Kết quả: ${result} | Dự đoán: ${duDoanResult} (${doTinCay}%) | Gợi ý: ${explanation}`
    );
  }
}

// API lấy kết quả Hitclub
const API_TARGET_URL = 'https://jakpotgwab.geightdors.net/glms/v1/notify/taixiu?platform_id=b5&gid=vgmn_101';

async function fetchGameData() {
  try {
    const response = await axios.get(API_TARGET_URL);
    const data = response.data;
    if (data.status === "OK" && Array.isArray(data.data) && data.data.length > 0) {
      const game = data.data[0];
      const sid = game.sid;
      const d1 = game.d1;
      const d2 = game.d2;
      const d3 = game.d3;
      if (sid && d1 !== undefined && d2 !== undefined && d3 !== undefined) {
        updateResult(d1, d2, d3, sid);
      }
    }
  } catch (error) {
    console.error("❌ Lỗi khi lấy dữ liệu từ API GET:", error.message);
  }
}

// Fetch dữ liệu mỗi 5s
setInterval(fetchGameData, 5000);

// API endpoints
app.get("/api/taixiu", (req, res) => {
  res.json(latestResult);
});

app.get("/api/history", (req, res) => {
  res.json(fullHistory);
});

app.get("/", (req, res) => {
  res.json({ status: "HITCLUB Tài Xỉu đang chạy", phien: latestResult.Phien });
});

// Ping để Render không ngủ
setInterval(() => {
  if (SELF_URL.includes("http")) {
    axios.get(`${SELF_URL}/api/taixiu`).catch(() => {});
  }
}, 300000);

app.listen(PORT, () => {
  console.log(`🚀 Server b52 Tài Xỉu đang chạy tại http://localhost:${PORT}`);
});

