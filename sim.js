// GreenKeeper — 自動除草機模擬器
// 第一版：正方形院子 + 隨機碰撞反彈演算法

const canvas = document.getElementById("yard");
const ctx = canvas.getContext("2d");

// --- 院子設定 ---
const SIZE = canvas.width;        // 正方形院子的邊長 (px)
const CELL = 6;                   // 覆蓋網格的每格大小 (px)
const COLS = Math.floor(SIZE / CELL);
const ROWS = Math.floor(SIZE / CELL);

// 覆蓋地圖：true = 已剪過
let cut = [];

// --- 除草機狀態 ---
const mower = {
  x: SIZE / 2,
  y: SIZE / 2,
  radius: 20,
  angle: Math.PI / 4,   // 前進方向 (弧度)
  speed: 3,             // 每幀移動距離 (px)
};

// --- 模擬狀態 ---
let running = false;
let startTime = 0;
let elapsedMs = 0;
let rafId = null;

// --- DOM ---
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const speedInput = document.getElementById("speed");
const mowerSizeInput = document.getElementById("mowerSize");
const coverageEl = document.getElementById("coverage");
const coverageBar = document.getElementById("coverageBar");
const elapsedEl = document.getElementById("elapsed");

// --- 初始化 ---
function reset() {
  running = false;
  cancelAnimationFrame(rafId);
  startBtn.textContent = "▶ 開始";

  cut = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));

  mower.x = SIZE / 2;
  mower.y = SIZE / 2;
  mower.angle = Math.random() * Math.PI * 2;
  mower.radius = Number(mowerSizeInput.value);
  mower.speed = Number(speedInput.value);

  elapsedMs = 0;
  draw();
  updateStats();
}

// --- 將除草機目前位置標記為已剪 ---
function markCut() {
  const r = mower.radius;
  const minCol = Math.max(0, Math.floor((mower.x - r) / CELL));
  const maxCol = Math.min(COLS - 1, Math.floor((mower.x + r) / CELL));
  const minRow = Math.max(0, Math.floor((mower.y - r) / CELL));
  const maxRow = Math.min(ROWS - 1, Math.floor((mower.y + r) / CELL));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cx = col * CELL + CELL / 2;
      const cy = row * CELL + CELL / 2;
      const dx = cx - mower.x;
      const dy = cy - mower.y;
      if (dx * dx + dy * dy <= r * r) {
        cut[row][col] = true;
      }
    }
  }
}

// --- 移動：隨機碰撞反彈 ---
function step() {
  let nx = mower.x + Math.cos(mower.angle) * mower.speed;
  let ny = mower.y + Math.sin(mower.angle) * mower.speed;

  const r = mower.radius;
  let bounced = false;

  if (nx - r < 0 || nx + r > SIZE) {
    mower.angle = Math.PI - mower.angle; // 水平反彈
    bounced = true;
  }
  if (ny - r < 0 || ny + r > SIZE) {
    mower.angle = -mower.angle;          // 垂直反彈
    bounced = true;
  }

  if (bounced) {
    // 反彈時加一點隨機抖動，避免卡在固定路徑來回
    mower.angle += (Math.random() - 0.5) * 0.6;
    nx = mower.x + Math.cos(mower.angle) * mower.speed;
    ny = mower.y + Math.sin(mower.angle) * mower.speed;
  }

  mower.x = Math.max(r, Math.min(SIZE - r, nx));
  mower.y = Math.max(r, Math.min(SIZE - r, ny));

  markCut();
}

// --- 繪製 ---
function draw() {
  // 未剪的草地底色
  ctx.fillStyle = "#2e7d32";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 已剪過的區域
  ctx.fillStyle = "#a5d6a7";
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (cut[row][col]) {
        ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
      }
    }
  }

  // 除草機本體
  ctx.beginPath();
  ctx.arc(mower.x, mower.y, mower.radius, 0, Math.PI * 2);
  ctx.fillStyle = "#ff7043";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fff";
  ctx.stroke();

  // 前進方向指示
  ctx.beginPath();
  ctx.moveTo(mower.x, mower.y);
  ctx.lineTo(
    mower.x + Math.cos(mower.angle) * mower.radius,
    mower.y + Math.sin(mower.angle) * mower.radius
  );
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.stroke();
}

// --- 統計 ---
function coveragePercent() {
  let total = 0;
  let done = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      total++;
      if (cut[row][col]) done++;
    }
  }
  return (done / total) * 100;
}

function updateStats() {
  const pct = coveragePercent();
  coverageEl.textContent = pct.toFixed(1) + "%";
  coverageBar.style.width = pct + "%";
  elapsedEl.textContent = (elapsedMs / 1000).toFixed(1) + " s";
}

// --- 主迴圈 ---
function loop(now) {
  if (!running) return;
  if (!startTime) startTime = now;
  elapsedMs = now - startTime;

  // 每幀走幾步，讓速度滑桿更有感
  for (let i = 0; i < 2; i++) step();

  draw();
  updateStats();
  rafId = requestAnimationFrame(loop);
}

// --- 事件 ---
startBtn.addEventListener("click", () => {
  running = !running;
  if (running) {
    startBtn.textContent = "⏸ 暫停";
    startTime = 0;
    const offset = elapsedMs;
    rafId = requestAnimationFrame(function resume(now) {
      startTime = now - offset;
      loop(now);
    });
  } else {
    startBtn.textContent = "▶ 繼續";
    cancelAnimationFrame(rafId);
  }
});

resetBtn.addEventListener("click", reset);

speedInput.addEventListener("input", () => {
  mower.speed = Number(speedInput.value);
});

mowerSizeInput.addEventListener("input", () => {
  mower.radius = Number(mowerSizeInput.value);
  draw();
});

// 啟動
reset();
