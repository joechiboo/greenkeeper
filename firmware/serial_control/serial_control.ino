/*
 * Serial 指令控制 — GreenKeeper 階段 3（Pi 整合：動作鏈）
 *
 * 聽 USB 序列埠的單字元指令來開車（9600 baud）：
 *   w=前進  x=後退  a=左轉  d=右轉  s=停止
 *
 * 指令來源不限：Arduino IDE 的 Serial Monitor、Pi 的 Python（pyserial）
 * 都是同一條 USB 線、同一套協定。
 *
 * 安全機制：超過 TIMEOUT_MS 沒收到任何指令就自動停車，
 * 避免 Pi 當機/斷線時車子一路衝出去。
 * （所以 Pi 端要持續送指令，或至少定期重送同一個指令。）
 *
 * 接線同 l298n_test（docs/car-assembly.md）：
 *   左輪 IN1/IN2/ENA = D8/D9/D10，右輪 IN3/IN4/ENB = D7/D6/D5
 */

#define LEFT1 8
#define LEFT2 9
#define LEFT_PWM 10   // ENA
#define RIGHT1 7
#define RIGHT2 6
#define RIGHT_PWM 5   // ENB

// 左右輪速 0~255，照 l298n_test 微調後的值改這裡
int LEFT_SPEED = 150;
int RIGHT_SPEED = 150;

const unsigned long TIMEOUT_MS = 1000;  // 1 秒沒指令就自動停
unsigned long lastCmdAt = 0;
char current = 's';

void setup() {
  int pins[] = {LEFT1, LEFT2, LEFT_PWM, RIGHT1, RIGHT2, RIGHT_PWM};
  for (int p : pins) pinMode(p, OUTPUT);
  Serial.begin(9600);
  stopMotor();
  Serial.println("ready");   // 開機打招呼，Pi 端可確認連線
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

void apply(char cmd) {
  switch (cmd) {
    case 'w': forward();   break;
    case 'x': backward();  break;
    case 'a': turnLeft();  break;
    case 'd': turnRight(); break;
    case 's': stopMotor(); break;
    default:  return;      // 不認得的字元（含換行）直接忽略
  }
  current = cmd;
  lastCmdAt = millis();
  Serial.print("ok ");     // 回覆收到，Pi 端可讀來確認
  Serial.println(cmd);
}

void loop() {
  if (Serial.available()) {
    apply(Serial.read());
  }
  // 安全停車：太久沒指令且不是停止狀態 → 停
  if (current != 's' && millis() - lastCmdAt > TIMEOUT_MS) {
    stopMotor();
    current = 's';
    Serial.println("timeout stop");
  }
}
