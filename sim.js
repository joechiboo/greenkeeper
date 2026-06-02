// GreenKeeper — 自動除草機模擬器
// 第三版：多演算法並排比較

// --- 院子設定 ---
const SIZE = 360;                 // 每個院子的內部解析度 (px)
const CELL = 6;                   // 覆蓋網格每格大小 (px)
const COLS = Math.floor(SIZE / CELL);
const ROWS = Math.floor(SIZE / CELL);

// --- 真實世界比例尺 ---
// 假設一個 SIZE×SIZE 的院子相當於 6m×6m，所以 60px = 1 公尺。
const SCALE = 60;                 // px / 公尺
// 真實割草機很慢（手推式約 3.6 km/h），完整割完一塊地要很久。
// 為了看得完，畫面以 SIM_ACCEL 倍加速播放；下方「時間」欄位會換算回真實所需時間。
const SIM_ACCEL = 4;              // 模擬加速倍率
const FPS = 60;                   // requestAnimationFrame 約略幀率
const STEPS_PER_FRAME = 2;        // 每幀推進幾步（見 loop）

// 把真實時速 (km/h) 換算成每一步要移動的像素數
function kmhToPxPerStep(kmh) {
  const mPerSec = kmh / 3.6;
  return (mPerSec * SCALE * SIM_ACCEL) / (FPS * STEPS_PER_FRAME);
}

// 把毫秒格式化成易讀的時間字串
function formatTime(ms) {
  const totalSec = ms / 1000;
  if (totalSec < 60) return totalSec.toFixed(1) + "s";
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

// --- 演算法定義 ---
// 每個演算法是一個 step(sim) 函式，負責把除草機移動一步並標記剪過的草。
const ALGORITHMS = {
  boundary: {
    name: "邊界偵測掃描",
    init: initZigzag,
    step: stepBoundary,
  },
  systematic: {
    name: "規律掃描（已知地圖）",
    init: initZigzag,
    step: stepSystematic,
  },
  crosscut: {
    name: "交叉雙向（橫向＋縱向）",
    init: initCrosscut,
    step: stepCrosscut,
  },
  crossfill: {
    name: "交叉雙向＋補洞",
    init: initCrossfill,
    step: stepCrossfill,
    rank: 2,                       // 推薦第二：覆蓋完整、實作直觀
  },
  bcd: {
    name: "梯形分解（遇障礙分區）",
    init: initBcd,
    step: stepBcd,
    rank: 1,                       // 推薦第一：業界最專業的全覆蓋路徑規劃（BCD）
  },
  cellular: {
    name: "分區掃描（拆欄）",
    init: initCellular,
    step: stepCellular,
  },
  spiral: {
    name: "螺旋掃描",
    init: initSpiral,
    step: stepSpiral,
  },
  wall: {
    name: "沿牆走（先繞邊）",
    init: initWall,
    step: stepWall,
  },
  nearest: {
    name: "最近未掃點導航",
    init: initNearest,
    step: stepNearest,
  },
  slam: {
    name: "建圖式掃描（SLAM）",
    init: initSlam,
    step: stepSlam,
  },
  random: {
    name: "隨機碰撞反彈",
    init: initRandom,
    step: stepRandom,
  },
};

// --- 全域控制狀態 ---
let running = false;
let lastTs = 0;
let rafId = null;
let speedKmh = 3.6;            // 選定的真實時速 (km/h)
let speed = kmhToPxPerStep(speedKmh); // 換算後的每步像素位移
let radius = 12;
let returnHomeEnabled = true;  // 割完一律回起點（充電座）
let sims = [];   // 目前顯示的模擬
let viewMode = "grass";  // 檢視模式：grass（草皮）/ heat（重複次數熱力圖）

// --- 障礙物（樹、坑洞）---
let obstaclesOn = false;
let obstacles = [];             // { type, x, y, r }
let mowableCells = ROWS * COLS; // 可割的格子數（排除障礙物佔據的）

// 建立障礙物並重新計算可割面積。位置依院子比例設定，三個院子共用。
function buildObstacles() {
  obstacles = obstaclesOn
    ? [
        { type: "tree", x: SIZE * 0.32, y: SIZE * 0.42, r: 24 },
        { type: "hole", x: SIZE * 0.68, y: SIZE * 0.64, r: 20 },
      ]
    : [];

  // 格子中心落在任一障礙物內 → 不可割，從分母剔除
  let blocked = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cx = col * CELL + CELL / 2;
      const cy = row * CELL + CELL / 2;
      if (obstacles.some((o) => Math.hypot(cx - o.x, cy - o.y) < o.r)) blocked++;
    }
  }
  mowableCells = ROWS * COLS - blocked;
}

// 半徑 r 的除草機放在 (x, y) 是否會撞到障礙物
function hitsObstacle(x, y, r) {
  return obstacles.some((o) => Math.hypot(x - o.x, y - o.y) < o.r + r);
}

// --- DOM ---
const grid = document.getElementById("grid");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const toggles = document.getElementById("toggles");
const speedInput = document.getElementById("speed");
const mowerSizeInput = document.getElementById("mowerSize");
const obstaclesInput = document.getElementById("obstacles");
const viewModeInput = document.getElementById("viewMode");
const accelNote = document.getElementById("accelNote");

// 重複次數 → 熱力圖顏色：1 次=理想（綠），越多次=越過度修剪（黃→橘→紅）
function heatColor(n) {
  if (n <= 0) return null;
  if (n === 1) return "#43a047";  // 剛好割一遍：最理想
  if (n === 2) return "#cddc39";  // 兩遍：可接受
  if (n === 3) return "#ffb300";  // 三遍：偏多
  if (n === 4) return "#fb8c00";  // 四遍：過度
  return "#e53935";               // 五遍以上：嚴重重複碾壓
}

// =====================================================================
// Sim：一個獨立的院子 + 除草機 + 演算法
// =====================================================================
class Sim {
  constructor(algoKey) {
    this.algoKey = algoKey;
    this.algo = ALGORITHMS[algoKey];
    this.buildDom();
    this.reset();
  }

  buildDom() {
    const card = document.createElement("div");
    card.className = "sim-card";

    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;

    const name = document.createElement("div");
    name.className = "sim-name";
    name.textContent = this.algo.name;
    if (this.algo.rank === 1) {
      card.classList.add("rank-1");
      const badge = document.createElement("span");
      badge.className = "rank-badge rank-badge-1";
      badge.textContent = "🥇 最專業";
      name.appendChild(badge);
    } else if (this.algo.rank === 2) {
      card.classList.add("rank-2");
      const badge = document.createElement("span");
      badge.className = "rank-badge rank-badge-2";
      badge.textContent = "🥈 推薦";
      name.appendChild(badge);
    }

    const bar = document.createElement("div");
    bar.className = "bar";
    const barFill = document.createElement("div");
    barFill.className = "bar-fill";
    bar.appendChild(barFill);

    const stats = document.createElement("div");
    stats.className = "sim-stats";
    stats.innerHTML = `
      <div class="stat"><span class="stat-label">覆蓋率</span><span class="stat-value cov">0%</span></div>
      <div class="stat"><span class="stat-label">時間</span><span class="stat-value time">0.0s</span></div>
      <div class="stat"><span class="stat-label">達 95%</span><span class="stat-value t95">—</span></div>
      <div class="stat"><span class="stat-label">平均重複</span><span class="stat-value rep">—</span></div>
    `;

    card.append(canvas, name, bar, stats);
    grid.appendChild(card);

    this.card = card;
    this.ctx = canvas.getContext("2d");
    this.barFill = barFill;
    this.covEl = stats.querySelector(".cov");
    this.timeEl = stats.querySelector(".time");
    this.t95El = stats.querySelector(".t95");
    this.repEl = stats.querySelector(".rep");
  }

  reset() {
    this.cut = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
    this.passes = Array.from({ length: ROWS }, () => new Array(COLS).fill(0)); // 每格被刀片掃過幾「趟」
    this._prevCovered = new Set();   // 上一步覆蓋到的格（用來偵測「重新進入」= 新的一趟）
    this.radius = radius;
    this.finished = false;
    this.elapsedMs = 0;
    this.time95Ms = null;
    this.sensing = false;
    this.algo.init(this);
    // init 設好起始座標後，把它記成「起點 / 充電座」
    this.homeX = this.x;
    this.homeY = this.y;
    this.returning = false;
    this.draw();
    this.updateStats();
  }

  markCut() {
    const r = this.radius;
    const minCol = Math.max(0, Math.floor((this.x - r) / CELL));
    const maxCol = Math.min(COLS - 1, Math.floor((this.x + r) / CELL));
    const minRow = Math.max(0, Math.floor((this.y - r) / CELL));
    const maxRow = Math.min(ROWS - 1, Math.floor((this.y + r) / CELL));
    const covered = new Set();   // 這一步刀片覆蓋到的格
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cx = col * CELL + CELL / 2;
        const cy = row * CELL + CELL / 2;
        const dx = cx - this.x;
        const dy = cy - this.y;
        if (dx * dx + dy * dy <= r * r) {
          this.cut[row][col] = true;
          const k = row * COLS + col;
          covered.add(k);
          // 上一步沒覆蓋、這步才覆蓋 → 刀片「重新進入」這格 = 新的一趟
          if (!this._prevCovered.has(k)) this.passes[row][col]++;
        }
      }
    }
    this._prevCovered = covered;
  }

  step() {
    if (this.returning) this.stepReturn();
    else this.algo.step(this);
    this.markCut();
  }

  // 收尾返航：朝起點前進，途中遇障礙物會偏轉繞過，抵達後標記完成
  stepReturn() {
    const dx = this.homeX - this.x;
    const dy = this.homeY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= speed) {
      this.x = this.homeX;
      this.y = this.homeY;
      this.returning = false;
      this.finished = true;
      this.sensing = false;
      return;
    }

    const r = this.radius;
    const desired = Math.atan2(dy, dx);
    const free = (a) => {
      const nx = this.x + Math.cos(a) * speed;
      const ny = this.y + Math.sin(a) * speed;
      const inBounds = nx - r >= 0 && nx + r <= SIZE && ny - r >= 0 && ny + r <= SIZE;
      return inBounds && !(obstaclesOn && hitsObstacle(nx, ny, r));
    };

    // 以朝家方向為基準，逐步加大偏轉角找出可走的方向（繞過障礙物）
    let chosen = desired;
    let deflected = false;
    if (!free(desired)) {
      deflected = true;
      chosen = null;
      for (let off = 0.25; off <= Math.PI && chosen === null; off += 0.25) {
        if (free(desired + off)) chosen = desired + off;
        else if (free(desired - off)) chosen = desired - off;
      }
    }

    if (chosen === null) return; // 暫時無路可走，下一步再試
    this.angle = chosen;
    this.x += Math.cos(chosen) * speed;
    this.y += Math.sin(chosen) * speed;
    this.sensing = deflected; // 繞行時亮紅燈
  }

  coveragePercent() {
    let done = 0;
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++)
        if (this.cut[row][col]) done++;
    return (done / mowableCells) * 100;
  }

  draw() {
    const ctx = this.ctx;

    if (viewMode === "heat") {
      // 熱力圖：用顏色深淺顯示每格被刀片掃過幾趟（重複碾壓 = 不平整/費力）
      ctx.fillStyle = "#0d240d";   // 未割：暗底
      ctx.fillRect(0, 0, SIZE, SIZE);
      for (let row = 0; row < ROWS; row++)
        for (let col = 0; col < COLS; col++) {
          const c = heatColor(this.passes[row][col]);
          if (c) { ctx.fillStyle = c; ctx.fillRect(col * CELL, row * CELL, CELL, CELL); }
        }
    } else {
      // 草皮：綠底 + 已割的淺綠
      ctx.fillStyle = "#2e7d32";
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = "#a5d6a7";
      for (let row = 0; row < ROWS; row++)
        for (let col = 0; col < COLS; col++)
          if (this.cut[row][col]) ctx.fillRect(col * CELL, row * CELL, CELL, CELL);

      // SLAM 建圖階段：尚未探索到的區域蓋上暗幕，視覺化「地圖逐步建立」
      if (this.slamPhase === "explore") {
        ctx.fillStyle = "rgba(6,14,6,0.62)";
        for (let row = 0; row < ROWS; row++)
          for (let col = 0; col < COLS; col++) {
            const cx = col * CELL + CELL / 2;
            const cy = row * CELL + CELL / 2;
            if (cx < this.minX || cx > this.maxX || cy < this.minY || cy > this.maxY)
              ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
          }
      }
    }

    // 障礙物（樹、坑洞）
    for (const o of obstacles) {
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fillStyle = o.type === "tree" ? "#1b5e20" : "#241a12";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = o.type === "tree" ? "#0c3a10" : "#000";
      ctx.stroke();
      ctx.font = `${Math.round(o.r * 1.4)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(o.type === "tree" ? "🌳" : "🕳️", o.x, o.y);
    }

    // 起點 / 充電座標記
    if (this.homeX != null) {
      ctx.beginPath();
      ctx.arc(this.homeX, this.homeY, 5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText("⌂", this.homeX, this.homeY);
    }

    // 返航導引線
    if (this.returning) {
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.homeX, this.homeY);
      ctx.strokeStyle = "rgba(66,165,245,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 感測器射線（偵測到邊界時變紅）
    const r = this.radius;
    const sx = this.x + Math.cos(this.angle) * (r + 8);
    const sy = this.y + Math.sin(this.angle) * (r + 8);
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(sx, sy);
    ctx.strokeStyle = this.sensing ? "#ff5252" : "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    ctx.fillStyle = this.sensing ? "#ff5252" : "rgba(255,255,255,0.6)";
    ctx.fill();

    // 除草機本體
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.returning ? "#42a5f5" : "#ff7043";  // 返航時轉藍
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.stroke();

    // SLAM 狀態標籤：建圖中 / 已建圖，以及建圖耗時（真實時間）
    if (this.slamPhase) {
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText(
        this.slamPhase === "explore" ? "🛰️ 建圖中…" : "🗺️ 已建圖 · 覆蓋中",
        6, 6
      );
      if (this.mapDoneMs != null)
        ctx.fillText("建圖耗時 " + formatTime(this.mapDoneMs * SIM_ACCEL), 6, 20);
    }
  }

  updateStats() {
    const pct = this.coveragePercent();
    if (this.time95Ms === null && pct >= 95) this.time95Ms = this.elapsedMs;
    this.covEl.textContent = pct.toFixed(1) + "%";
    this.barFill.style.width = pct + "%";
    // 畫面是加速播放的，這裡換算回「真實所需時間」
    this.timeEl.textContent = formatTime(this.elapsedMs * SIM_ACCEL);
    this.t95El.textContent =
      this.time95Ms === null ? "—" : formatTime(this.time95Ms * SIM_ACCEL);

    // 平均重複次數：已割格的平均被掃趟數，越接近 1 越均勻、越省力
    let sum = 0, n = 0;
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++)
        if (this.cut[row][col]) { sum += this.passes[row][col]; n++; }
    this.repEl.textContent = n ? (sum / n).toFixed(2) + "×" : "—";
  }
}

// =====================================================================
// 演算法實作
// =====================================================================

// 掃描完成：割草機一律返航回起點（充電座）；已在原點才直接結束
function finishMowing(s) {
  if (s.x !== s.homeX || s.y !== s.homeY) s.returning = true;
  else s.finished = true;
}

// 隨機碰撞反彈：撞牆隨機轉向
function initRandom(s) {
  s.x = SIZE / 2;
  s.y = SIZE / 2;
  s.angle = 0.7; // 固定起始角，每次重置結果一致、可重現
}
function stepRandom(s) {
  const r = s.radius;
  let nx = s.x + Math.cos(s.angle) * speed;
  let ny = s.y + Math.sin(s.angle) * speed;
  let bounced = false;
  if (nx - r < 0 || nx + r > SIZE) { s.angle = Math.PI - s.angle; bounced = true; }
  if (ny - r < 0 || ny + r > SIZE) { s.angle = -s.angle; bounced = true; }
  if (bounced) {
    s.angle += (s.x * 0.013 + s.y * 0.017) % 0.6 - 0.3; // 偽隨機抖動（可重現）
    nx = s.x + Math.cos(s.angle) * speed;
    ny = s.y + Math.sin(s.angle) * speed;
  }
  // 撞到障礙物：轉向避開
  if (obstaclesOn && hitsObstacle(nx, ny, r)) {
    s.angle += 2.2 + ((s.x * 0.021 + s.y * 0.029) % 0.8 - 0.4);
    bounced = true;
    nx = s.x + Math.cos(s.angle) * speed;
    ny = s.y + Math.sin(s.angle) * speed;
    if (hitsObstacle(nx, ny, r)) { nx = s.x; ny = s.y; } // 仍卡住就原地轉，下一步再試
  }
  s.sensing = bounced;
  s.x = Math.max(r, Math.min(SIZE - r, nx));
  s.y = Math.max(r, Math.min(SIZE - r, ny));
  // 隨機走法沒有「掃完」的概念，覆蓋率夠高就視為完成、開始返航
  if (bounced && s.coveragePercent() >= 99) finishMowing(s);
}

// 來回掃描共用的初始化（從左上角往右，沿 x 來回、沿 y 推進）
function initZigzag(s) {
  s.x = s.radius;
  s.y = s.radius;
  s.angle = 0;
  s.dir = 1;
  s.secDir = 1;
  s.phase = "across";
  s.targetS = s.y;
  s.finalRowDone = false;
  s.pendingFinal = false;
}

// 通用來回掃描核心：primary = 來回的軸，secondary = 換行推進的軸。
// 回傳 true 表示本趟掃描已走完整塊地。
function zigzagAxis(s, primary, secondary, boundaryAware) {
  const r = s.radius;
  const stripe = r * 2 * 0.9;
  const secDir = s.secDir || 1;          // 換行推進方向（+1 順向 / -1 逆向）

  // 候選座標：沿 primary 軸前進到 p 後的 (x, y)
  const posAlong = (p) => (primary === "x" ? [p, s[secondary]] : [s[secondary], p]);
  // 換行(secondary)前進時的朝向角
  const secAngle = secondary === "y"
    ? (secDir > 0 ? Math.PI / 2 : -Math.PI / 2)
    : (secDir > 0 ? 0 : Math.PI);
  // secondary 推進到座標 v 是否已越過邊界
  const secOverflow = (v) => (secDir > 0 ? v + r > SIZE : v - r < 0);

  if (s.phase === "across") {
    // 來回方向：沿 x 時 0/π，沿 y 時 ±π/2
    if (primary === "x") s.angle = s.dir > 0 ? 0 : Math.PI;
    else s.angle = s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;

    const np = s[primary] + s.dir * speed;
    const hitWall = np + r > SIZE || np - r < 0;
    const [px, py] = posAlong(np);
    const obsAhead = obstaclesOn && hitsObstacle(px, py, r);
    s.sensing = (boundaryAware && hitWall) || obsAhead;

    if (hitWall) {
      s[primary] = Math.max(r, Math.min(SIZE - r, np));
      let nextS = s[secondary] + secDir * stripe;
      if (secOverflow(nextS)) {
        if (s.finalRowDone) return true;   // 整塊地掃完
        nextS = secDir > 0 ? SIZE - r : r; // 貼著邊再掃最後一排
        s.pendingFinal = true;
      }
      s.phase = "down";
      s.targetS = nextS;
    } else if (obsAhead) {
      s.phase = "detour";                  // 前方有障礙物 → 沿邊繞過
    } else {
      s[primary] = np;
    }
  } else if (s.phase === "detour") {
    // 沿換行方向滑行繞過障礙物，前方淨空就恢復來回
    s.angle = secAngle;
    const np = s[primary] + s.dir * speed;
    const aheadWall = np + r > SIZE || np - r < 0;
    const [ax, ay] = posAlong(np);
    if (!aheadWall && !(obstaclesOn && hitsObstacle(ax, ay, r))) {
      s.phase = "across";                  // 已繞過，恢復來回
      return false;
    }
    const ns = s[secondary] + secDir * speed;
    const [sx, sy] = primary === "x" ? [s[primary], ns] : [ns, s[primary]];
    if (secOverflow(ns) || (obstaclesOn && hitsObstacle(sx, sy, r))) {
      s.phase = "across";                  // 繞不過去（角落）→ 折返
      s.dir *= -1;
    } else {
      s[secondary] = ns;
    }
    s.sensing = true;
  } else {
    // 推進到下一排：沿 secondary 軸（secDir 方向）移動
    s.angle = secAngle;
    const ns = s[secondary] + secDir * speed;
    const [dx2, dy2] = primary === "x" ? [s[primary], ns] : [ns, s[primary]];
    if (obstaclesOn && hitsObstacle(dx2, dy2, r)) {
      // 換行途中撞到障礙物 → 提早恢復來回，避免穿越
      s.phase = "across";
      s.dir *= -1;
      if (s.pendingFinal) { s.finalRowDone = true; s.pendingFinal = false; }
      s.sensing = true;
      return false;
    }
    let nsClamped = ns;
    const reached = secDir > 0 ? nsClamped >= s.targetS : nsClamped <= s.targetS;
    if (reached) {
      nsClamped = s.targetS;
      s.phase = "across";
      s.dir *= -1;
      if (s.pendingFinal) { s.finalRowDone = true; s.pendingFinal = false; }
    }
    s[secondary] = nsClamped;
    s.sensing = false;
  }
  return false;
}

// 橫向來回（沿 x 來回、沿 y 推進）
function zigzag(s, boundaryAware) {
  if (zigzagAxis(s, "x", "y", boundaryAware)) finishMowing(s);
}

// 規律掃描（已知地圖）：直接用程式裡的 SIZE 算路徑 —— 等於「作弊」
function stepSystematic(s) { zigzag(s, false); }

// 邊界偵測掃描：靠感測器偵測到邊界才轉彎 —— 真實割草機的做法
function stepBoundary(s) { zigzag(s, true); }

// 交叉雙向：先橫向掃一遍，再轉 90° 縱向掃一遍 —— 球場格紋割法，覆蓋更完整
function initCrosscut(s) {
  initZigzag(s);
  s.pass = "h";   // 先橫向
}

function stepCrosscut(s) {
  if (s.pass === "h") {
    if (zigzagAxis(s, "x", "y", true)) {
      // 橫向掃完，就地轉 90° 開始縱向（不返航）：沿 y 來回、沿 x 推進
      s.pass = "v";
      s.phase = "across";
      s.dir = -1;                          // 目前在底部，第一道往上掃
      s.secDir = s.x > SIZE / 2 ? -1 : 1;  // 朝尚未掃過的另一側推進
      s.targetS = s.x;
      s.finalRowDone = false;
      s.pendingFinal = false;
    }
  } else {
    // 縱向也掃完 → 交給 finishMowing 決定是否返航回起點
    if (zigzagAxis(s, "y", "x", true)) finishMowing(s);
  }
}

// 交叉雙向 ＋ 補洞：先用交叉雙向快速鋪滿，再用最近未掃點補縫隙到 ~100%
function initCrossfill(s) {
  initCrosscut(s);
  s.path = [];   // 補洞階段（stepNearest）用的路徑佇列
}

function stepCrossfill(s) {
  if (s.pass === "h") {
    if (zigzagAxis(s, "x", "y", true)) {
      // 橫向掃完，就地轉 90° 開始縱向
      s.pass = "v";
      s.phase = "across";
      s.dir = -1;
      s.secDir = s.x > SIZE / 2 ? -1 : 1;
      s.targetS = s.x;
      s.finalRowDone = false;
      s.pendingFinal = false;
    }
  } else if (s.pass === "v") {
    // 兩遍掃完 → 進補洞階段（先別返航）
    if (zigzagAxis(s, "y", "x", true)) s.pass = "fill";
  } else {
    stepNearest(s);   // 找最近未掃格補縫，補完（無未掃格）才返航
  }
}

// 朝 (tx, ty) 直線前進一步，抵達回傳 true（供需要點對點移動的演算法共用）
function driveToward(s, tx, ty) {
  const dx = tx - s.x;
  const dy = ty - s.y;
  const dist = Math.hypot(dx, dy);
  s.sensing = false;
  if (dist <= speed) { s.x = tx; s.y = ty; return true; }
  s.angle = Math.atan2(dy, dx);
  s.x += Math.cos(s.angle) * speed;
  s.y += Math.sin(s.angle) * speed;
  return false;
}

// ---------------------------------------------------------------------
// 分區掃描（Boustrophedon Cellular Decomposition / 拆欄）
// 把院子切成數個直欄，逐欄做垂直來回。欄較窄、路徑短，遇障礙物時
// 也只影響單一欄 —— 正是多數掃地機／割草機「太大就拆區」的做法。
// ---------------------------------------------------------------------
const CELL_COLUMNS = 3;   // 切成幾欄

function initCellular(s) {
  s.x = s.radius;
  s.y = s.radius;
  s.angle = 0;
  s.cols = [];
  const w = SIZE / CELL_COLUMNS;
  for (let i = 0; i < CELL_COLUMNS; i++) s.cols.push({ x0: i * w, x1: (i + 1) * w });
  s.colIndex = 0;
  s.phase = "enter";   // enter→開到本欄起點, across→垂直來回, detour→繞障礙, advance→換條
  s.dir = 1;           // y 方向：1 向下、-1 向上
}

function stepCellular(s) {
  const r = s.radius;
  const stripe = r * 2 * 0.9;
  const col = s.cols[s.colIndex];
  const left = col.x0 + r;
  const right = col.x1 - r;
  const top = r;
  const bottom = SIZE - r;

  if (s.phase === "enter") {
    // 平滑開到本欄左上角，抵達後開始垂直來回
    if (driveToward(s, left, top)) { s.phase = "across"; s.dir = 1; }
    return;
  }

  if (s.phase === "across") {
    s.angle = s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const ny = s.y + s.dir * speed;
    const hitEdge = ny > bottom || ny < top;
    const obsAhead = obstaclesOn && hitsObstacle(s.x, ny, r);
    s.sensing = hitEdge || obsAhead;
    if (hitEdge) {
      s.phase = "advance";
      s.targetX = Math.min(s.x + stripe, right);
    } else if (obsAhead) {
      s.phase = "detour";
    } else {
      s.y = ny;
    }
    return;
  }

  if (s.phase === "detour") {
    // 垂直前方被障礙物擋住 → 沿 x 滑過；前方淨空恢復來回，滑到欄界就折返
    s.angle = 0;
    const vy = s.y + s.dir * speed;
    if (!(obstaclesOn && hitsObstacle(s.x, vy, r))) { s.phase = "across"; return; }
    const nx = s.x + speed;
    if (nx > right || (obstaclesOn && hitsObstacle(nx, s.y, r))) {
      s.phase = "across";
      s.dir *= -1;
    } else {
      s.x = nx;
    }
    s.sensing = true;
    return;
  }

  // advance：往右換到下一條
  s.angle = 0;
  if (obstaclesOn && hitsObstacle(s.x + speed, s.y, r)) {
    // 換條途中撞障礙 → 提早折返來回，避免穿越
    s.phase = "across";
    s.dir *= -1;
    s.sensing = true;
    return;
  }
  s.x = Math.min(s.x + speed, s.targetX);
  s.sensing = false;
  if (s.x >= s.targetX - 0.001) {
    if (s.targetX >= right - 0.001) {
      // 本欄掃完 → 下一欄
      s.colIndex++;
      if (s.colIndex >= s.cols.length) finishMowing(s);
      else s.phase = "enter";
    } else {
      s.phase = "across";
      s.dir *= -1;
    }
  }
}

// ---------------------------------------------------------------------
// 螺旋掃描（Spiral）
// 從中心向外繞阿基米德螺線，每圈外擴一個割幅。實作簡單，但方形院子
// 的四角永遠掃不到 —— 適合展示螺旋的先天死角。不主動避障。
// ---------------------------------------------------------------------
function initSpiral(s) {
  s.x = SIZE / 2;
  s.y = SIZE / 2;
  s.angle = 0;
  s.theta = 0;
  s.spiralB = (s.radius * 2 * 0.9) / (2 * Math.PI); // r = b·θ，每圈外擴一個割幅
}

function stepSpiral(s) {
  const r = s.radius;
  const b = s.spiralB;

  // 推進角度求出螺旋上的下一個目標點；若目標落在障礙物內，
  // 持續外推跳過被擋住的弧段（純螺旋本來就蓋不到障礙物正後方）
  let tx, ty, rad, guard = 0;
  do {
    const cur = b * s.theta;
    s.theta += speed / Math.max(b, Math.hypot(cur, b)); // 近似弧長等速前進
    rad = b * s.theta;
    tx = Math.max(r, Math.min(SIZE - r, SIZE / 2 + Math.cos(s.theta) * rad));
    ty = Math.max(r, Math.min(SIZE - r, SIZE / 2 + Math.sin(s.theta) * rad));
  } while (obstaclesOn && hitsObstacle(tx, ty, r) && rad <= SIZE * 0.72 && ++guard < 600);

  // 朝目標點前進一步，遇障礙物就偏轉繞行（與返航相同的避障邏輯）
  const desired = Math.atan2(ty - s.y, tx - s.x);
  const free = (a) => {
    const nx = s.x + Math.cos(a) * speed;
    const ny = s.y + Math.sin(a) * speed;
    return nx - r >= 0 && nx + r <= SIZE && ny - r >= 0 && ny + r <= SIZE &&
      !(obstaclesOn && hitsObstacle(nx, ny, r));
  };
  let chosen = free(desired) ? desired : null;
  s.sensing = chosen === null;                // 需要繞行時亮紅燈
  for (let off = 0.3; off <= Math.PI && chosen === null; off += 0.3) {
    if (free(desired + off)) chosen = desired + off;
    else if (free(desired - off)) chosen = desired - off;
  }
  if (chosen !== null) {
    s.angle = chosen;
    s.x += Math.cos(chosen) * speed;
    s.y += Math.sin(chosen) * speed;
  }

  // 螺旋半徑已大到涵蓋角落（中心到角落約 0.71·SIZE）→ 收尾返航
  if (rad > SIZE * 0.72) finishMowing(s);
}

// ---------------------------------------------------------------------
// 沿牆走（Wall-Following）
// 先沿四邊繞一圈把邊界掃乾淨，再以一般橫向來回處理內部 ——
// 很多掃地機開機第一件事就是貼牆走一圈。
// ---------------------------------------------------------------------
function initWall(s) {
  const r = s.radius;
  s.x = r;
  s.y = r;
  s.angle = 0;
  // 沿內縮邊界的四個角繞一圈，最後回到左上
  s.waypoints = [[SIZE - r, r], [SIZE - r, SIZE - r], [r, SIZE - r], [r, r]];
  s.wpIndex = 0;
  s.wallDone = false;
}

function stepWall(s) {
  if (!s.wallDone) {
    const [tx, ty] = s.waypoints[s.wpIndex];
    if (driveToward(s, tx, ty)) {
      s.wpIndex++;
      if (s.wpIndex >= s.waypoints.length) {
        s.wallDone = true;
        initZigzag(s);   // 繞完邊界 → 從左上角開始內部橫向來回
      }
    }
    s.sensing = true;   // 沿牆時感測器持續貼邊
    return;
  }
  zigzag(s, true);      // 內部用邊界偵測式橫向來回
}

// ---------------------------------------------------------------------
// 最近未掃點導航（Greedy Nearest-Unscanned + BFS 路徑）
// 不照固定路線，而是不斷找「最近的未掃格」，用 BFS 在可行格網上
// 規劃避開障礙的最短路徑走過去 —— 接近真實機器人的全覆蓋收尾邏輯。
// ---------------------------------------------------------------------
function initNearest(s) {
  s.x = s.radius;
  s.y = s.radius;
  s.angle = 0;
  s.path = [];   // 目前導航路徑（cell 中心座標佇列）
}

// cell 中心是否為除草機可停留的點（在內縮邊界內、未被障礙物擋住）
function cellReachable(col, row, r) {
  const cx = col * CELL + CELL / 2;
  const cy = row * CELL + CELL / 2;
  if (cx < r || cx > SIZE - r || cy < r || cy > SIZE - r) return false;
  if (obstaclesOn && hitsObstacle(cx, cy, r)) return false;
  return true;
}

// 找離目前位置最近（歐氏距離）的未掃且可停留格
function nearestUncovered(s) {
  const r = s.radius;
  let best = null, bestD = Infinity;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (s.cut[row][col]) continue;
      if (!cellReachable(col, row, r)) continue;
      const cx = col * CELL + CELL / 2;
      const cy = row * CELL + CELL / 2;
      const d = (cx - s.x) ** 2 + (cy - s.y) ** 2;
      if (d < bestD) { bestD = d; best = { col, row, cx, cy }; }
    }
  }
  return best;
}

// 在可停留格網上做 BFS，回傳到 goal 的最短路徑（cell 中心座標陣列，含終點）
function bfsPath(s, goal) {
  const r = s.radius;
  const startCol = Math.min(COLS - 1, Math.max(0, Math.floor(s.x / CELL)));
  const startRow = Math.min(ROWS - 1, Math.max(0, Math.floor(s.y / CELL)));
  const key = (c, rr) => rr * COLS + c;
  const start = key(startCol, startRow);
  const goalKey = key(goal.col, goal.row);
  const prev = new Map();
  const seen = new Set([start]);
  const q = [[startCol, startRow]];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let head = 0;
  while (head < q.length) {
    const [c, rr] = q[head++];
    if (key(c, rr) === goalKey) break;
    for (const [dc, dr] of dirs) {
      const nc = c + dc, nr = rr + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const k = key(nc, nr);
      if (seen.has(k) || !cellReachable(nc, nr, r)) continue;
      seen.add(k);
      prev.set(k, key(c, rr));
      q.push([nc, nr]);
    }
  }
  // 回溯路徑（不可達就直線過去）
  const center = (k) => ({ x: (k % COLS) * CELL + CELL / 2, y: Math.floor(k / COLS) * CELL + CELL / 2 });
  if (goalKey !== start && !prev.has(goalKey)) return [{ x: goal.cx, y: goal.cy }];
  const path = [];
  let cur = goalKey;
  while (cur !== start) {
    path.push(center(cur));
    cur = prev.get(cur);
  }
  path.reverse();
  return path;
}

function stepNearest(s) {
  if (s.path.length === 0) {
    const goal = nearestUncovered(s);
    if (!goal) { finishMowing(s); return; } // 沒有任何未掃格 → 真的完成
    s.path = bfsPath(s, goal);              // 可能為空（目標就在腳下，本幀 markCut 會蓋掉）
  }
  if (s.path.length > 0) {
    const wp = s.path[0];
    if (driveToward(s, wp.x, wp.y)) s.path.shift();
  }
  s.sensing = obstaclesOn &&
    hitsObstacle(s.x + Math.cos(s.angle) * (s.radius + 6), s.y + Math.sin(s.angle) * (s.radius + 6), 1);
}

// ---------------------------------------------------------------------
// 建圖式掃描（SLAM）
// 現代雷射掃地機的做法：開機後先沿牆繞一圈把「地圖」建起來（期間整片
// 未知區域是暗的），地圖建好後才在已知範圍上規律來回高效覆蓋。
// 重點在凸顯「前期建圖要花時間」—— 畫面會標出建圖耗時。
// ---------------------------------------------------------------------
function initSlam(s) {
  s.x = s.radius;
  s.y = s.radius;
  s.angle = 0;             // 先沿頂邊往右探索
  s.turns = 0;             // 轉過幾個牆角（滿 4 個 = 繞完外圈）
  s.slamPhase = "explore"; // explore（建圖）→ cover（覆蓋）
  s.mapDoneMs = null;      // 建圖完成的時間點（毫秒，模擬時間）
  // 目前已探索到的外包矩形 → 用來畫「未知區域暗幕」
  s.minX = s.x; s.maxX = s.x;
  s.minY = s.y; s.maxY = s.y;
}

function stepSlam(s) {
  const r = s.radius;

  if (s.slamPhase === "explore") {
    // 沿牆走：直行，撞牆或障礙就順時針轉 90°，繞滿一圈視為建圖完成
    const nx = s.x + Math.cos(s.angle) * speed;
    const ny = s.y + Math.sin(s.angle) * speed;
    const hitWall = nx - r < 0 || nx + r > SIZE || ny - r < 0 || ny + r > SIZE;
    const hitObs = obstaclesOn && hitsObstacle(nx, ny, r);
    if (hitWall || hitObs) {
      if (hitWall) {
        s.x = Math.max(r, Math.min(SIZE - r, nx));
        s.y = Math.max(r, Math.min(SIZE - r, ny));
      }
      s.angle += Math.PI / 2;
      s.turns += 1;
      s.sensing = true;
      if (s.turns >= 4) {            // 繞完外圈 → 地圖建立完成，切換成覆蓋
        s.mapDoneMs = s.elapsedMs;
        s.slamPhase = "cover";
        initZigzag(s);               // 已知地圖，從左上角開始規律來回
      }
    } else {
      s.x = nx; s.y = ny;
      s.sensing = false;
    }
    // 擴張已知範圍（路徑掃過處的外包矩形）
    s.minX = Math.min(s.minX, s.x - r); s.maxX = Math.max(s.maxX, s.x + r);
    s.minY = Math.min(s.minY, s.y - r); s.maxY = Math.max(s.maxY, s.y + r);
  } else {
    zigzag(s, true);                 // 覆蓋階段：在已知地圖上邊界感知來回
  }
}

// ---------------------------------------------------------------------
// 梯形分解（Boustrophedon Cellular Decomposition, BCD）
// 真正的「遇障礙物算邊界、分區執行」：用一條垂直掃描線由左到右掃過院子，
// 障礙物會把可走空間切成數個「上下不被打斷」的子區（cell）。每個子區內
// 只要單純上下來回就能完整覆蓋；再依序走訪所有子區即可逼近 100% 覆蓋，
// 且幾乎不重複 —— 清掃／割草文獻裡最經典的全覆蓋分解法。
// ---------------------------------------------------------------------

// 某一直行(col)中，除草機中心可停留的連續 row 區段 [start, end]
function columnSegments(col, r) {
  const segs = [];
  let start = -1;
  for (let row = 0; row < ROWS; row++) {
    const ok = cellReachable(col, row, r);
    if (ok && start === -1) start = row;
    if (!ok && start !== -1) { segs.push([start, row - 1]); start = -1; }
  }
  if (start !== -1) segs.push([start, ROWS - 1]);
  return segs;
}

const rangesOverlap = (a, b) => a[0] <= b[1] && b[0] <= a[1];

// 在可停留格網上做 BFS，回傳 (sc,sr)→(gc,gr) 的格中心座標路徑（不含起點）
function bfsCells(sc, sr, gc, gr, r) {
  const key = (c, rr) => rr * COLS + c;
  const start = key(sc, sr), goal = key(gc, gr);
  if (start === goal) return [];
  const prev = new Map(), seen = new Set([start]);
  const q = [[sc, sr]]; let head = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (head < q.length) {
    const [c, rr] = q[head++];
    if (key(c, rr) === goal) break;
    for (const [dc, dr] of dirs) {
      const nc = c + dc, nr = rr + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const k = key(nc, nr);
      if (seen.has(k) || !cellReachable(nc, nr, r)) continue;
      seen.add(k); prev.set(k, key(c, rr)); q.push([nc, nr]);
    }
  }
  const center = (k) => ({ x: (k % COLS) * CELL + CELL / 2, y: Math.floor(k / COLS) * CELL + CELL / 2 });
  if (!prev.has(goal)) return [center(goal)];      // 不可達就直接給終點
  const path = []; let cur = goal;
  while (cur !== start) { path.push(center(cur)); cur = prev.get(cur); }
  return path.reverse();
}

// 某一橫列(row)中，除草機中心可停留的連續 col 區段 [start, end]
function rowSegments(row, r) {
  const segs = [];
  let start = -1;
  for (let col = 0; col < COLS; col++) {
    const ok = cellReachable(col, row, r);
    if (ok && start === -1) start = col;
    if (!ok && start !== -1) { segs.push([start, col - 1]); start = -1; }
  }
  if (start !== -1) segs.push([start, COLS - 1]);
  return segs;
}

// 預先把整條覆蓋路徑算好：分解 → 每子區 boustrophedon → 子區間以 BFS 連接。
// axis "v"：垂直掃描線由左到右、每子區上下來回；"h"：水平掃描線由上到下、每子區左右來回。
// (startCol,startRow) 為出發格，用來銜接前一階段的結束位置。
function buildBcdPath(r, axis, startCol, startRow) {
  const horiz = axis === "h";
  const OUTER = horiz ? ROWS : COLS;
  const segOf = horiz ? (i) => rowSegments(i, r) : (i) => columnSegments(i, r);
  // 把 (掃描線索引 o, 區段內索引 inner) 還原成格座標 (col,row)
  const toCell = (o, inner) => (horiz ? { col: inner, row: o } : { col: o, row: inner });

  // 1) 掃描分解：把每條掃描線的區段標記成所屬子區(cell)
  const cells = [];   // 每個 cell：{ lines: [{o, lo, hi}] }
  let prev = [];      // 上一條掃描線的區段 [{rng:[a,b], cell}]
  for (let o = 0; o < OUTER; o++) {
    const cur = segOf(o).map((rng) => ({ rng, cell: -1 }));
    for (const cs of cur) {
      const pov = prev.filter((p) => rangesOverlap(p.rng, cs.rng));
      if (pov.length === 1) {
        const cov = cur.filter((x) => rangesOverlap(pov[0].rng, x.rng));
        cs.cell = cov.length === 1 ? pov[0].cell : cells.push({ lines: [] }) - 1; // 1對1延續，否則分裂成新區
      } else {
        cs.cell = cells.push({ lines: [] }) - 1;    // 起始或合併 → 新區
      }
      cells[cs.cell].lines.push({ o, lo: cs.rng[0], hi: cs.rng[1] });
    }
    prev = cur;
  }

  // 2) 逐個子區產生來回路徑，子區之間用 BFS 避障連接
  //    用 floor 而非 round：保證條距 < 刀寬 2r，相鄰掃描條一定重疊、不留接縫
  const stripe = Math.max(1, Math.floor((r * 2 * 0.85) / CELL));
  const path = [];
  let lc = startCol, lr = startRow;
  let dir = 1;   // 交替決定每條掃描先掃哪一端

  for (const cell of cells) {
    if (cell.lines.length === 0) continue;
    const lineMap = new Map(cell.lines.map((l) => [l.o, l]));
    const first = cell.lines[0].o, last = cell.lines[cell.lines.length - 1].o;
    const sweep = [];
    for (let o = first; o <= last; o += stripe) sweep.push(o);
    if (sweep[sweep.length - 1] !== last) sweep.push(last);   // 確保掃到子區末緣

    for (const o of sweep) {
      const l = lineMap.get(o);
      if (!l) continue;
      const ends = dir > 0 ? [l.lo, l.hi] : [l.hi, l.lo];
      const head = toCell(o, ends[0]);
      for (const p of bfsCells(lc, lr, head.col, head.row, r)) path.push(p); // 連到本條起點
      for (const inner of ends) {
        const pt = toCell(o, inner);
        path.push({ x: pt.col * CELL + CELL / 2, y: pt.row * CELL + CELL / 2 });
        lc = pt.col; lr = pt.row;
      }
      dir = -dir;
    }
  }
  return path;
}

function initBcd(s) {
  s.x = s.radius;
  s.y = s.radius;
  s.angle = 0;
  const g = Math.floor(s.radius / CELL);
  s.path = buildBcdPath(s.radius, "v", g, g);   // 第一趟：垂直分區掃
  s.bcdPhase = "vertical";                       // vertical → horizontal → 返航
}

function stepBcd(s) {
  if (s.path && s.path.length > 0) {
    const wp = s.path[0];
    if (driveToward(s, wp.x, wp.y)) s.path.shift();
    return;
  }
  // 目前這趟梯形分解走完了
  if (s.bcdPhase === "vertical") {
    // 第二趟：換成水平掃描線的梯形分解，從目前位置接續
    s.bcdPhase = "horizontal";
    s.path = buildBcdPath(s.radius, "h", Math.floor(s.x / CELL), Math.floor(s.y / CELL));
    return;
  }
  finishMowing(s);   // 垂直 ＋ 水平兩趟分區都完成 → 返航
}

// =====================================================================
// 多面板控制
// =====================================================================
function selectedAlgos() {
  return [...toggles.querySelectorAll("input:checked")].map((i) => i.dataset.algo);
}

function rebuild() {
  pause();
  grid.innerHTML = "";
  sims = [];
  const algos = selectedAlgos();
  if (algos.length === 0) {
    grid.innerHTML = '<div class="empty">請至少勾選一種演算法</div>';
    return;
  }
  sims = algos.map((a) => new Sim(a));
}

function loop(ts) {
  if (!running) return;
  const dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
  lastTs = ts;

  for (const s of sims) {
    if (s.finished) continue;
    s.elapsedMs += dt;
    for (let i = 0; i < 2 && !s.finished; i++) s.step();
    s.draw();
    s.updateStats();
  }

  if (sims.every((s) => s.finished)) {
    running = false;
    startBtn.textContent = "✓ 完成";
    return;
  }
  rafId = requestAnimationFrame(loop);
}

function play() {
  if (sims.length === 0 || sims.every((s) => s.finished)) return;
  running = true;
  lastTs = 0;
  startBtn.textContent = "⏸ 暫停";
  rafId = requestAnimationFrame(loop);
}

function pause() {
  running = false;
  cancelAnimationFrame(rafId);
  if (sims.length) startBtn.textContent = "▶ 繼續";
}

// --- 事件 ---
startBtn.addEventListener("click", () => (running ? pause() : play()));

resetBtn.addEventListener("click", () => {
  pause();
  sims.forEach((s) => s.reset());
  if (sims.length) startBtn.textContent = "▶ 開始";
});

toggles.addEventListener("change", rebuild);

speedInput.addEventListener("input", () => {
  speedKmh = Number(speedInput.value);
  speed = kmhToPxPerStep(speedKmh);
  updateAccelNote();
});

function updateAccelNote() {
  if (!accelNote) return;
  accelNote.textContent =
    `真實時速約 ${speedKmh} km/h　•　畫面已加速 ×${SIM_ACCEL} 播放，` +
    `「時間」為真實所需時間`;
}

mowerSizeInput.addEventListener("input", () => {
  radius = Number(mowerSizeInput.value);
  pause();
  sims.forEach((s) => s.reset());
  if (sims.length) startBtn.textContent = "▶ 開始";
});

if (obstaclesInput) {
  obstaclesInput.addEventListener("change", () => {
    obstaclesOn = obstaclesInput.checked;
    buildObstacles();
    pause();
    sims.forEach((s) => s.reset());
    if (sims.length) startBtn.textContent = "▶ 開始";
  });
}

// 切換檢視模式：草皮 ↔ 熱力圖。即使暫停中也立即重畫
if (viewModeInput) {
  viewModeInput.addEventListener("change", () => {
    viewMode = viewModeInput.value;
    sims.forEach((s) => s.draw());
  });
}

// 啟動
speedKmh = Number(speedInput.value);
speed = kmhToPxPerStep(speedKmh);
radius = Number(mowerSizeInput.value);
if (obstaclesInput) obstaclesOn = obstaclesInput.checked;
if (viewModeInput) viewMode = viewModeInput.value;
buildObstacles();
updateAccelNote();
rebuild();
