# robot — 樹莓派（大腦）程式

跑在 Pi 4 上的 Python：視覺（YOLO）與決策，透過 USB 序列埠指揮 Arduino。

- 整體架構：見 [../docs/hardware-roadmap.md](../docs/hardware-roadmap.md) 的「Pi ↔ Uno 怎麼合體」
- Arduino 端韌體：見 [../firmware/](../firmware/)

## 內容

- `drive_test.py` — 動作鏈測試：Pi 送 `w/x/a/d/s` 開車。`-i` 進互動模式。

## 快速開始（在 Pi 上）

```bash
ssh pi@192.168.169.91          # IP 變了用 ssh pi@raspberrypi.local
pip3 install pyserial
# 先把 firmware/serial_control/serial_control.ino 燒進 Uno，USB 接到 Pi
python3 drive_test.py          # 自動示範
python3 drive_test.py -i      # 鍵盤互動
```

> 安全：Arduino 端 1 秒沒指令會自動停車；車測試時先架空（輪子離地）。
