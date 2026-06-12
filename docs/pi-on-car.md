# 車載 Pi 配置與出車 SOP

> 建立日期：2026-06-11
> 階段 3 的實戰手冊：Pi + webcam 上車、剪臍帶、自主巡邏。

## 車上配置

```
   [webcam]──USB──┐
                  [Pi 4]──USB──[Uno]──[L298N]──馬達
   [行動電源]─USB-C─┘
   [電池盒(馬達電)]────────────┘
```

- **webcam**：橡皮筋固定，**朝前、微微往下**（看得到車前 0.5~2 公尺的地面）
- **Pi 4**：橡皮筋固定，別擋散熱孔；USB 線留鬆度
- **供電分開**：行動電源（≥2.4A）→ Pi；電池盒 → Uno + 馬達。共用會在馬達啟動時拉垮 Pi
- Uno 是官方板 → Pi 上的裝置是 **/dev/ttyACM0**（CH340 clone 才是 ttyUSB0）

## 程式部署（公司網路 git 被 FortiGate 擋，一律 scp）

```powershell
# 電腦 PowerShell（已設 SSH 金鑰，免密碼）
scp D:\Personal\Project\greenkeeper\robot\auto_drive.py pi@192.168.169.91:~
```

## 測試三部曲

1. **乾跑**（只看不動）：`python3 auto_drive.py` → 確認判斷正常（入鏡=停、離開=前進）
2. **帶臍帶 --drive**（車架空、馬達電池開）：`python3 auto_drive.py --drive` → 輪子跟著判斷動
3. **截圖看視角**：`python3 vision_test.py` → `scp pi@192.168.169.91:~/detect_result.jpg D:\Personal\`

## 無線遙測 📡（2026-06-11 已建立）

Pi 4 內建 WiFi 已連**內網 UCL WiFi**，與辦公 PC 同網段：

- 無線 SSH：`ssh pi@192.168.169.71`（拔掉網路線照樣通；金鑰免密碼）
- 有線備援：`ssh pi@192.168.169.91`（插網路線時）
- 兩個 IP 都是 DHCP，變動時查大章魚「小黑Pi」或 `ssh pi@raspberrypi.local`
- 排雷：Pi 的 WiFi 第一次要 `raspi-config` 設國碼 TW + `rfkill unblock wifi`；
  UCL-Guest 是隔離網段（172.30.x），內網 PC 搆不到，**別用 Guest**

## 開機自動啟動 🤖（2026-06-12 已部署，取代 nohup）

`robot/greenkeeper.service` 已裝進 systemd：**Pi 一上電程式就跑**、掛掉 5 秒自動重啟。

- **武裝開關設計**：程式隨時在送指令，但**馬達電池開關沒開就不會動**。
  開關 = 起跑令 + 緊急煞車。
- 看即時判斷：`journalctl -u greenkeeper -f`
- **手動測試前必停**（否則佔住序列埠/相機）：`sudo systemctl stop greenkeeper`
- 更新程式後：scp 新檔 → `sudo systemctl restart greenkeeper`
- 服務檔已加 `python3 -u`（unbuffered），journal 才看得到輸出

## 出車 SOP ✂️（systemd 版，超簡單）

1. 車放地上、Pi 接行動電源 → 開機（程式自己起來）
2. 等 1 分鐘，撥開**馬達電池開關** → 出發 🚗
3. 想看它在想什麼：`ssh pi@192.168.169.71` → `journalctl -u greenkeeper -f`
4. 停：關馬達電池開關（立停）；或 `sudo systemctl stop greenkeeper`

> 坑提醒：換電源 = Pi 重開機（不能熱插拔），先接好電再撥馬達開關。

## 怎麼讓它停 🛑

| 方式 | 說明 |
|---|---|
| 馬達電池開關 | **緊急停止鈕**，關了立停 |
| 插回網路線 SSH | `pkill -f auto_drive` |
| 拔行動電源 | 粗暴但有效 |
| 內建保險 | 程式死掉 → Uno 1 秒無指令自動停車 |

## 已知行為與限制（v1）

- **脈衝式前進**：Pi 4 推論約 0.33s/張（~3fps），配 Uno 的 1 秒安全機制，走一下頓一下是正常
- **看到 person（信心≥50%）會停**，離開恢復前進
- **會撞牆**：YOLO/COCO 沒有「牆壁」「坑洞」類別，視覺看不見 → 待超音波（防撞底線）或擴充停車類別
- 誤判存在（電話曾被認成 keyboard 35%）→ 信心門檻 50% 擋掉大部分

## 排雷記錄

- `could not open port /dev/ttyUSB0` → Uno 是官方板，裝置在 **ttyACM0**；或 USB 沒插在 Pi 上（`lsusb` 應見 Arduino SA Uno R3）
- webcam 是 AVerMedia Live Streamer CAM 313，/dev/video0
- 公司網路 github SSL 被攔（FortiGate）→ 權重/程式都用 scp，回家網路則一切正常
