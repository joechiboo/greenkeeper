# firmware — Arduino（小腦）程式

控制馬達與感測器的 Arduino sketch，對應自走車的「手腳」層。

- 接線：見 [../docs/car-assembly.md](../docs/car-assembly.md)
- 整體架構（Pi ↔ Uno 怎麼合體）：見 [../docs/hardware-roadmap.md](../docs/hardware-roadmap.md)

## 內容

- `l298n_test/` — L298N 馬達測試（前進／後退／左／右／停 自動循環）。階段 1 第一支程式。

## 怎麼用

1. Arduino IDE 開 `l298n_test/l298n_test.ino`
2. 開發板選 **Arduino Uno**、選對 **COM 埠**（CH340）
3. USB 上傳（不需電池）
4. 車架空（輪子離地）→ 開電池 → 看動作

> 之後階段：避障（超音波）、藍牙遙控、改吃 Pi 的序列指令（`Serial.read()`）。
