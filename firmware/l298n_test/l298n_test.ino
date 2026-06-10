/*
 * L298N 自走車測試 — GreenKeeper 階段 1
 *
 * 接線（對應 docs/car-assembly.md）：
 *   左輪：L298N IN1/IN2/ENA = D8 / D9 / D10
 *   右輪：L298N IN3/IN4/ENB = D7 / D6 / D5
 *   ⚠️ L298N 的 ENA/ENB 跳線帽要先拔掉
 *   電源：電池紅→+12V、黑→GND、DC 頭→Uno DC 座（自動共地）
 *   馬達：左→OUT1/2、右→OUT3/4
 *
 * 上傳：開發板選「Arduino Uno」，USB 連線即可（上傳不需電池）。
 *       馬達要「電池開電」才會轉；USB 電流推不動。
 * 測試前：把車架空（輪子離地），免得衝下桌。
 *
 * 第一次測建議：先只測直走。把 loop() 內 demoCycle() 註解掉，
 *   改成只呼叫 forward();，確認兩輪都往前、方向正確，再用完整循環。
 *   某輪轉反 → 關電，把那顆馬達兩條線對調。
 */

#define LEFT1 8
#define LEFT2 9
#define LEFT_PWM 10   // ENA
#define RIGHT1 7
#define RIGHT2 6
#define RIGHT_PWM 5   // ENB

// 左右輪速度 0~255。便宜 TT 馬達兩側轉速常有差，
// 若車偏一邊：把「比較快」那側的數字調小一點，直到走直。
int LEFT_SPEED = 150;
int RIGHT_SPEED = 150;

void setup() {
  int pins[] = {LEFT1, LEFT2, LEFT_PWM, RIGHT1, RIGHT2, RIGHT_PWM};
  for (int p : pins) pinMode(p, OUTPUT);
}

void forward() {
  digitalWrite(LEFT1, HIGH);  digitalWrite(LEFT2, LOW);
  digitalWrite(RIGHT1, HIGH); digitalWrite(RIGHT2, LOW);
  analogWrite(LEFT_PWM, LEFT_SPEED); analogWrite(RIGHT_PWM, RIGHT_SPEED);
}

void backward() {
  digitalWrite(LEFT1, LOW);  digitalWrite(LEFT2, HIGH);
  digitalWrite(RIGHT1, LOW); digitalWrite(RIGHT2, HIGH);
  analogWrite(LEFT_PWM, LEFT_SPEED); analogWrite(RIGHT_PWM, RIGHT_SPEED);
}

void turnLeft() {   // 左輪停、右輪轉
  digitalWrite(RIGHT1, HIGH); digitalWrite(RIGHT2, LOW);
  analogWrite(LEFT_PWM, 0); analogWrite(RIGHT_PWM, RIGHT_SPEED);
}

void turnRight() {  // 右輪停、左輪轉
  digitalWrite(LEFT1, HIGH); digitalWrite(LEFT2, LOW);
  analogWrite(LEFT_PWM, LEFT_SPEED); analogWrite(RIGHT_PWM, 0);
}

void stopMotor() {
  analogWrite(LEFT_PWM, 0); analogWrite(RIGHT_PWM, 0);
}

void demoCycle() {
  forward();   delay(2000);
  backward();  delay(2000);
  turnLeft();  delay(1000);
  turnRight(); delay(1000);
  stopMotor(); delay(2000);
}

void loop() {
  demoCycle();
  // 第一次測直走時改用：forward();
}
