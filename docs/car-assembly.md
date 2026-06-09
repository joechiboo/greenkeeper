# 自走車組裝指南（傑森創工 Uno 2WD）

> 建立日期：2026-06-09
> 適合「每天 10 分鐘」慢慢組。卡住就回來看這份。

## 官方資源

- **組裝手冊 PDF（13 頁，20 步）**：<https://jmaker.banner.tw/doc/car_info.pdf>
- **商品頁**：<https://www.jmaker.com.tw/products/arduino-car>
- **L298N 入門（接線，從這開始！）**：<https://blog.jmaker.com.tw/arduino-car-l298n/>
- **避障車範例（超音波）**：<https://blog.jmaker.com.tw/arduino-car-sr04/>
- **循線車範例（紅外）**：<https://blog.jmaker.com.tw/arduino-car-bt/>（循線）/ <https://blog.jmaker.com.tw/arduino-car-ir/>
- **藍牙遙控範例**：<https://blog.jmaker.com.tw/arduino-car-bt/>

> 注意：手冊裡的組裝短網址 `goo.gl/mPjfz1` 已失效（Google 關閉 goo.gl）。直接用上面的 PDF 與 blog 連結。

## 組裝步驟（手冊精簡版）

### A. 機構（Step 1–9）

1. **撕掉所有壓克力件的保護膜**（霧面那層，含底盤與 T 型小片）— 新手最常忘
2. 底盤「**MAKER**」字樣那面朝上
3. 取 4 片 **T 型固定片**（也撕膜）
4. 備好馬達 + 圓頭螺絲/螺帽
5. T 型片裝到底盤**兩側**
6. 馬達放兩片 T 中間，**對孔鎖上**（先不鎖死，兩邊都上再對齊鎖緊）
7. 另一邊同樣；**馬達線朝車尾方向**
8. **輪子**壓進馬達軸（D 形孔，對準缺口壓到底）
9. **馬眼輪**（球輪）用 2 根長銅柱 + 4 螺絲鎖在**車尾底面**

### B. 電子件上座（Step 10–17）

10–13. **Uno** 用 4 根短銅柱鎖上（右下角那孔不鎖，因下方有馬達）
14–16. **L298N** 用 4 根短銅柱 + 8 螺絲鎖上
17. **電池盒**裝上（與 L298N 之間留 ~3mm 間距）

### C. 接線（Step 18–20）

18. 電池盒 **DC 頭 → 插進 Uno 的 DC 座**
19. **馬達線 + 電池紅黑線 → 接到 L298N**
20. 完成 🎉

## 接線腳位（接線時對照）

| 接線 | 接到 |
|---|---|
| L298N IN1 | Uno Pin 8 |
| L298N IN2 | Uno Pin 9 |
| L298N ENA | Uno Pin 10 |
| L298N IN3 | Uno Pin 7 |
| L298N IN4 | Uno Pin 6 |
| 電池盒紅線 | L298N +12V |
| 電池盒黑線 | L298N GND |
| 電池盒 DC 頭 | Uno DC 座 |
| 兩顆馬達 | L298N 馬達接線柱 |

> 馬達銅片很脆：線是焊好再用熱熔膠固定的（應力釋放），接線時別拉扯馬達線。

## 開工順序（對應路線圖階段 1）

1. 組機構（A）→ 車能三點著地站起來
2. 上電子件（B）
3. 接線（C）
4. 上傳官方 **L298N 範例** → 車會前進/後退/左/右/停（驗證硬體全通）
5. **避障** → **藍牙遙控**（階段 1 完成）

之後接 Pi + webcam 跑 YOLO，見 [hardware-roadmap.md](hardware-roadmap.md) 的「Pi ↔ Uno 怎麼合體」。
