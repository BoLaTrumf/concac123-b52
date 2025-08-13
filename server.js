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
  phien: 0,
  Xuc_xac_1: 0,
  Xuc_xac_2: 0,
  Xuc_xac_3: 0,
  Tong: 0,
  Ket_qua: "",
  Pattern: "",
  Du_doan: ""
};

// Load history from file if it exists
if (fs.existsSync(HISTORY_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    fullHistory = data;
    patternHistory = data.map(item => item.Ket_qua === "Tài" ? "t" : "x");
    if (fullHistory.length > 0) latestResult = fullHistory[fullHistory.length - 1];
    console.log(`✅ Đã load ${fullHistory.length} phiên từ history.json`);
  } catch (e) {
    console.error("❌ Lỗi khi đọc history.json:", e.message);
  }
}

function getTaiXiu(sum) {
  return sum > 10 ? "t" : "x";
}

// --- THUẬT TOÁN DỰ ĐOÁN ĐA CHIỀU MỚI ---
function predictMultilayered(history, fullHistoryData) {
    const votes = { t: 0, x: 0 };

    // Lớp 1: Phân tích Markov Chain (Trọng số 40%)
    const last4 = history.slice(-4).join('');
    const counts = { t: 0, x: 0 };
    let totalMatches = 0;
    for (let i = 0; i < history.length - 4; i++) {
        if (history.slice(i, i + 4).join('') === last4) {
            const next = history[i + 4];
            if (next) {
                counts[next]++;
                totalMatches++;
            }
        }
    }
    if (totalMatches > 0) {
        const markovPrediction = counts.t >= counts.x ? 't' : 'x';
        const confidence = (Math.max(counts.t, counts.x) / totalMatches);
        votes[markovPrediction] += 0.4 * confidence;
    }

    // Lớp 2: Phân tích Xu hướng & Chuỗi (Trọng số 30%)
    const last10 = history.slice(-10);
    const taiStreak = last10.filter(r => r === 't').length;
    const xiuStreak = last10.filter(r => r === 'x').length;

    if (taiStreak >= 4) {
        votes['x'] += 0.3;
    } else if (xiuStreak >= 4) {
        votes['t'] += 0.3;
    }

    // Lớp 3: Phân tích Xác suất Tổng điểm (Trọng số 20%)
    const lastTotal = fullHistoryData.length > 0 ? fullHistoryData[fullHistoryData.length - 1].Tong : null;
    if (lastTotal) {
        const taiTotals = [11, 12, 13, 14, 15, 16, 17];
        const xiuTotals = [4, 5, 6, 7, 8, 9, 10];
        
        // Phân tích các tổng điểm cực đoan (hiếm)
        if (lastTotal <= 6) { // Tổng điểm Xỉu cực thấp
            votes['t'] += 0.2;
        } else if (lastTotal >= 15) { // Tổng điểm Tài cực cao
            votes['x'] += 0.2;
        }
    }

    // Lớp 4: Phân tích Tần suất & Cân bằng (Trọng số 10%)
    const taiCount = history.filter(c => c === 't').length;
    const xiuCount = history.length - taiCount;
    const total = history.length || 1;
    const taiRatio = taiCount / total;

    if (taiRatio > 0.55) {
        votes['x'] += 0.1;
    } else if (taiRatio < 0.45) {
        votes['t'] += 0.1;
    }

    // Quyết định cuối cùng
    let finalPrediction;
    if (votes.t > votes.x) {
        finalPrediction = 'Tài';
    } else if (votes.x > votes.t) {
        finalPrediction = 'Xỉu';
    } else {
        finalPrediction = (Math.random() > 0.5) ? 'Tài' : 'Xỉu';
    }

    return finalPrediction;
}

// --- CẬP NHẬT KẾT QUẢ MỚI ---
function updateResult(d1, d2, d3, sid = null) {
    const total = d1 + d2 + d3;
    const result = total > 10 ? "Tài" : "Xỉu";
    const shorthand = getTaiXiu(total);

    if (sid !== latestResult.phien) {
        patternHistory.push(shorthand);
        if (patternHistory.length > MAX_HISTORY) patternHistory.shift();

        const pattern = patternHistory.join("");
        const prediction = predictMultilayered(patternHistory, fullHistory);

        latestResult = {
            phien: sid || latestResult.phien,
            Xuc_xac_1: d1,
            Xuc_xac_2: d2,
            Xuc_xac_3: d3,
            Tong: total,
            Ket_qua: result,
            Pattern: pattern,
            Du_doan: prediction
        };

        fullHistory.push({ ...latestResult });
        if (fullHistory.length > MAX_HISTORY) fullHistory.shift();

        fs.writeFileSync(HISTORY_FILE, JSON.stringify(fullHistory, null, 2));

        const timeStr = new Date().toISOString().replace("T", " ").slice(0, 19);
        console.log(
            `[🎲✅] Phiên ${latestResult.phien} - ${d1}-${d2}-${d3} ➜ Tổng: ${total}, Kết quả: ${result} | Dự đoán: ${prediction}`
        );
    }
}

// --- LẤY DỮ LIỆU TỪ API NGOÀI ---
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
        console.error("❌ Lỗi khi lấy dữ liệu từ API:", error.message);
    }
}

// --- LẬP LẠI LẤY DỮ LIỆU MỖI 5 GIÂY ---
setInterval(fetchGameData, 5000);

// --- API ENDPOINTS ---
app.get("/api/taixiu", (req, res) => {
    res.json(latestResult);
});

app.get("/api/history", (req, res) => {
    res.json(fullHistory);
});

app.get("/", (req, res) => {
    res.json({ status: "B52 Tài Xỉu đang chạy", phien: latestResult.phien });
});

// Ping để giữ server không ngủ
setInterval(() => {
    if (SELF_URL.includes("http")) {
        axios.get(`${SELF_URL}/api/taixiu`).catch(() => {});
    }
}, 300000);

app.listen(PORT, () => {
    console.log(`🚀 Server B52 Tài Xỉu đang chạy tại http://localhost:${PORT}`);
});
