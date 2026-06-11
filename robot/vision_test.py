#!/usr/bin/env python3
"""webcam + YOLO 第一眼測試（GreenKeeper 階段 2）。

抓一張 webcam 畫面 → YOLOv8n 偵測 → 印出看到什麼，
並把框好的圖存成 ~/detect_result.jpg（SSH 沒螢幕，存圖回電腦看）。

用法（在 Pi 上，yolov8n.pt 放家目錄）：
    python3 vision_test.py           # 用 /dev/video0
    python3 vision_test.py 1         # 指定 /dev/video1

看結果（在電腦上）：
    scp pi@192.168.169.91:~/detect_result.jpg D:\\Personal\\
"""
import sys
import time
from pathlib import Path

import cv2
from ultralytics import YOLO

CAM_INDEX = int(sys.argv[1]) if len(sys.argv) > 1 else 0
OUT = Path.home() / "detect_result.jpg"
WEIGHTS = Path.home() / "yolov8n.pt"


def main():
    print(f"開啟 webcam /dev/video{CAM_INDEX} ...")
    cap = cv2.VideoCapture(CAM_INDEX)
    if not cap.isOpened():
        sys.exit(f"打不開 /dev/video{CAM_INDEX}。先 ls /dev/video* 看 webcam 在哪一號。")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    # 暖機：丟掉前幾張（webcam 剛開常常過暗/全黑）
    for _ in range(5):
        cap.read()
    ok, frame = cap.read()
    cap.release()
    if not ok:
        sys.exit("抓不到畫面（webcam 回應失敗）。換個 USB 孔再試。")

    print("載入 YOLOv8n（第一次要等一下）...")
    model = YOLO(str(WEIGHTS))

    t0 = time.time()
    results = model(frame, imgsz=320, verbose=False)
    dt = time.time() - t0

    r = results[0]
    names = r.names
    if len(r.boxes) == 0:
        print(f"推論 {dt:.2f}s — 沒偵測到東西（試著對鏡頭比個人/放杯子/手機）")
    else:
        print(f"推論 {dt:.2f}s — 看到 {len(r.boxes)} 個物體：")
        for box in r.boxes:
            cls = names[int(box.cls)]
            conf = float(box.conf)
            print(f"  - {cls}（信心 {conf:.0%}）")

    cv2.imwrite(str(OUT), r.plot())
    print(f"框好的圖已存：{OUT}")
    print(r"電腦上看：scp pi@192.168.169.91:~/detect_result.jpg D:\Personal\ ")


if __name__ == "__main__":
    main()
