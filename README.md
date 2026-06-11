# 🌱 GreenKeeper

自動除草機模擬器 — 用網頁模擬一台除草機如何走遍整座院子。

靈感來自掃地機器人：核心問題都是「**如何有效率地覆蓋整個區域**」。

更遠的目標：把模擬器當「大腦練習場」，**做出一台真的會自己走的機器**——而且已經動工了：實體車會走、Pi 的視覺與動作鏈都已打通（見下方進度）。
計劃見 [計劃頁](https://joechiboo.github.io/greenkeeper/plan.html) ／ [實體機器路線圖](docs/hardware-roadmap.md)。這是好玩、自學的專案，沒有時程壓力。

🔗 線上版：<https://joechiboo.github.io/greenkeeper/>

## 怎麼跑

直接用瀏覽器打開 `index.html` 即可，不需要安裝任何東西。

## 發佈

推送到 `main` 後由 GitHub Actions 自動部署到 GitHub Pages。
首次需到 repo 的 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。

## 目前進度

### 模擬器（大腦練習場）

- [x] 正方形院子（模擬家裡的院子）
- [x] 一台會移動的除草機
- [x] 覆蓋率追蹤 + 視覺化（剪過的草變淺綠）
- [x] 隨機碰撞反彈演算法
- [ ] 規律掃描走法（來回 / 螺旋），比較效率
- [ ] 障礙物（樹、花圃、水池）
- [ ] 自訂院子形狀（非正方形）
- [ ] 電量 / 回充座

### 實體車（詳見 [實體機器路線圖](docs/hardware-roadmap.md)）

- [x] 階段 1：組裝 + L298N，**車會走了**（2026-06-10）
- [x] Pi → USB 序列埠 → Uno 動作鏈打通（2026-06-11）
- [x] Pi + webcam 跑 YOLOv8n，能框出物體（2026-06-11）
- [ ] 接合：視覺 → 規則決策 → 開車（`auto_drive.py`，進行中）
- 決策：藍牙跳過（USB 序列埠即可）、超音波避障保留但延後

## 檔案

- `index.html` — 模擬器頁面結構
- `plan.html` — 專案計劃頁（邁向真實機器的階梯與盤點）
- `style.css` — 樣式
- `sim.js` — 模擬邏輯（院子、除草機、演算法）
- `docs/` — 規劃文檔（YOLO 構想、實體機器路線圖、硬體盤點）
- `firmware/` — Arduino（小腦）韌體：L298N 馬達、序列指令控制
- `robot/` — 樹莓派（大腦）Python：視覺（YOLO）、動作鏈、自動駕駛
