# robot — 樹莓派（大腦）程式

跑在 Pi 4 上的 Python：視覺（YOLO）與決策，透過 USB 序列埠指揮 Arduino。

- 整體架構：見 [../docs/hardware-roadmap.md](../docs/hardware-roadmap.md) 的「Pi ↔ Uno 怎麼合體」
- Arduino 端韌體：見 [../firmware/](../firmware/)

## 內容

- `drive_test.py` — 動作鏈測試：Pi 送 `w/x/a/d/s` 開車。`-i` 進互動模式。（階段 1，✅ 已通）
- `vision_test.py` — 視覺第一眼：抓一張 webcam → YOLOv8n 偵測 → 印出看到什麼、存框圖。（階段 2，✅ 已通）
- `auto_drive.py` — 自動駕駛 v1：webcam → YOLO → 規則 → 序列指令，視覺/決策/動作首次接合。`--drive` 才真開車，預設乾跑只印判斷。（階段 3，進行中）

## 快速開始（在 Pi 上）

```bash
ssh pi@192.168.169.91          # IP 變了用 ssh pi@raspberrypi.local
pip3 install pyserial
# 先把 firmware/serial_control/serial_control.ino 燒進 Uno，USB 接到 Pi
python3 drive_test.py          # 自動示範
python3 drive_test.py -i      # 鍵盤互動
```

> 安全：Arduino 端 1 秒沒指令會自動停車；車測試時先架空（輪子離地）。
