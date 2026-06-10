#!/usr/bin/env python3
"""Pi → Arduino 動作鏈測試（GreenKeeper 階段 3）。

用法（在 Pi 上）：
    pip3 install pyserial
    python3 drive_test.py            # 自動示範：前進1秒→停→左轉1秒→停
    python3 drive_test.py -i        # 互動模式：鍵盤打 w/x/a/d/s + Enter 開車，q 離開

Arduino 端要先燒好 firmware/serial_control/serial_control.ino。
指令協定：w=前進 x=後退 a=左轉 d=右轉 s=停止（9600 baud）。
Arduino 有 1 秒沒指令自動停車的保險，所以持續移動時要每 0.5 秒重送指令。
"""
import sys
import time

import serial
import serial.tools.list_ports


def find_arduino_port():
    """找 Arduino 的序列埠（CH340 clone 或官方板）。"""
    for p in serial.tools.list_ports.comports():
        desc = (p.description or "").lower()
        if "ch340" in desc or "arduino" in desc or "usb serial" in desc or "usb-serial" in desc:
            return p.device
    # 常見 fallback：Pi 上 CH340 會是 /dev/ttyUSB0，官方 Uno 是 /dev/ttyACM0
    for dev in ("/dev/ttyUSB0", "/dev/ttyACM0"):
        try:
            serial.Serial(dev, 9600, timeout=0.1).close()
            return dev
        except (OSError, serial.SerialException):
            continue
    return None


def send_for(ser, cmd, seconds):
    """送指令並維持 N 秒（每 0.5 秒重送，餵 Arduino 的安全計時器）。"""
    end = time.time() + seconds
    while time.time() < end:
        ser.write(cmd.encode())
        time.sleep(0.5)


def demo(ser):
    print("示範：前進 1 秒 → 停 → 左轉 1 秒 → 停")
    send_for(ser, "w", 1.0)
    ser.write(b"s")
    time.sleep(1.0)
    send_for(ser, "a", 1.0)
    ser.write(b"s")
    print("完成。")


def interactive(ser):
    print("互動模式：w=前進 x=後退 a=左轉 d=右轉 s=停 q=離開（輸入後按 Enter）")
    while True:
        cmd = input("> ").strip().lower()
        if cmd == "q":
            ser.write(b"s")
            break
        if cmd in ("w", "x", "a", "d", "s"):
            ser.write(cmd.encode())
            # 非停止指令最多跑 1 秒就被 Arduino 安全機制停掉，
            # 想連續跑就持續重複輸入；這是測試器，不是遙控器。
        else:
            print("只認 w/x/a/d/s/q")


def main():
    port = find_arduino_port()
    if not port:
        sys.exit("找不到 Arduino。確認 USB 已接、燒好 serial_control.ino。")
    print(f"連接 {port} ...")
    ser = serial.Serial(port, 9600, timeout=1)
    time.sleep(2)  # Uno 開序列埠會重置，等它開完機
    greeting = ser.readline().decode(errors="ignore").strip()
    print(f"Arduino 說：{greeting or '(沒回應，但繼續試)'}")

    try:
        if "-i" in sys.argv:
            interactive(ser)
        else:
            demo(ser)
    finally:
        ser.write(b"s")  # 無論如何離開前停車
        ser.close()


if __name__ == "__main__":
    main()
