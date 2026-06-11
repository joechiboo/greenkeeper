#!/usr/bin/env python3
"""自動駕駛 v1：看到人就停，沒人就前進（GreenKeeper 階段 3 接合）。

迴圈：webcam 抓畫面 → YOLOv8n 偵測 → 規則決定 → USB 序列埠指令給 Uno。
這是「視覺 → 決策 → 動作」第一次接起來，規則之後再進化
（找草、避障礙、覆蓋演算法）。

用法（在 Pi 上，車先架空測試！）：
    python3 auto_drive.py            # 乾跑：只印判斷，不開車（安全預設）
    python3 auto_drive.py --drive    # 真的開：沒人→前進，有人→停
    python3 auto_drive.py --save     # 順便存每次判斷的框圖到 ~/auto_view.jpg
    Ctrl+C 結束（會自動送停車指令）

行為說明：
- Pi 4 純 CPU 推論一張約 0.5~2 秒，而 Uno 有 1 秒無指令自動停車的保險，
  所以 --drive 時車是「脈衝式前進」（走一下、頓一下）。第一版這樣反而安全。
- 規則：偵測到 person 且信心 >= CONF_MIN 就停（信心門檻擋掉誤判雜訊）。
"""
import argparse
import time
from pathlib import Path

import cv2
from ultralytics import YOLO

CONF_MIN = 0.5            # 信心門檻：低於這個不當真（擋誤判）
WEIGHTS = Path.home() / "yolov8n.pt"
SAVE_PATH = Path.home() / "auto_view.jpg"


def find_arduino_port():
    import serial.tools.list_ports
    for p in serial.tools.list_ports.comports():
        desc = (p.description or "").lower()
        if "ch340" in desc or "arduino" in desc or "usb serial" in desc or "usb-serial" in desc:
            return p.device
    return "/dev/ttyUSB0"


def grab_fresh(cap):
    """丟掉緩衝的舊畫面，拿最新一張（推論慢時 buffer 會堆舊圖）。"""
    for _ in range(4):
        cap.grab()
    ok, frame = cap.retrieve()
    return frame if ok else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--drive", action="store_true", help="真的開車（預設只乾跑印判斷）")
    ap.add_argument("--save", action="store_true", help="每次判斷存框圖到 ~/auto_view.jpg")
    ap.add_argument("--cam", type=int, default=0, help="webcam 編號（預設 0）")
    args = ap.parse_args()

    ser = None
    if args.drive:
        import serial
        port = find_arduino_port()
        print(f"連接 Arduino：{port}")
        ser = serial.Serial(port, 9600, timeout=1)
        time.sleep(2)  # Uno 開埠會重置，等開機
    else:
        print("乾跑模式（不開車）。確認判斷正常後加 --drive。")

    print(f"開 webcam /dev/video{args.cam} ...")
    cap = cv2.VideoCapture(args.cam)
    if not cap.isOpened():
        raise SystemExit("打不開 webcam")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    for _ in range(5):
        cap.read()  # 暖機

    print("載入 YOLO ...")
    model = YOLO(str(WEIGHTS))
    print("開始巡邏（Ctrl+C 結束）")

    try:
        while True:
            frame = grab_fresh(cap)
            if frame is None:
                continue

            t0 = time.time()
            r = model(frame, imgsz=320, verbose=False)[0]
            dt = time.time() - t0

            # 規則 v1：有夠可信的 person → 停，否則前進
            people = [b for b in r.boxes
                      if r.names[int(b.cls)] == "person" and float(b.conf) >= CONF_MIN]
            cmd = "s" if people else "w"

            seen = ", ".join(f"{r.names[int(b.cls)]} {float(b.conf):.0%}" for b in r.boxes) or "（沒東西）"
            action = {"s": "🛑 停（有人）", "w": "▶️ 前進"}[cmd]
            print(f"[{dt:.2f}s] 看到：{seen} → {action}")

            if ser:
                ser.write(cmd.encode())
            if args.save:
                cv2.imwrite(str(SAVE_PATH), r.plot())
    except KeyboardInterrupt:
        print("\n結束，停車。")
    finally:
        if ser:
            ser.write(b"s")
            ser.close()
        cap.release()


if __name__ == "__main__":
    main()
