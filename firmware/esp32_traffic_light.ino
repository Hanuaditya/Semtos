/*
 * ==============================================================================
 * SEMTOS Digital Twin — Phase C Hardware Actuation
 * ESP32 Physical Traffic Light Controller
 * ==============================================================================
 * 
 * Hardware Setup:
 * - Microcontroller: ESP32 NodeMCU / DevKit
 * - Module: 3-Color LED Traffic Signal Module (Common Cathode/GND or Anode)
 * 
 * Pin Configuration:
 * - RED LED:    GPIO 25
 * - YELLOW LED: GPIO 26
 * - GREEN LED:  GPIO 27
 * - GND:        GND
 * 
 * Serial Protocol:
 * - Baud Rate: 115200
 * - Single-Byte Commands:
 *   'P' -> Preemption Green (Emergency Ambulance Corridor Active - Solid Green or Strobe)
 *   'G' -> Normal Green (Approach Released)
 *   'Y' -> Yellow Transition (Yield / Change Phase)
 *   'R' -> Red (Approach Holding / All-Red Standby)
 * ==============================================================================
 */

const int PIN_RED    = 25;
const int PIN_YELLOW = 26;
const int PIN_GREEN  = 27;

char currentCommand = 'R';

void setup() {
  Serial.begin(115200);

  pinMode(PIN_RED, OUTPUT);
  pinMode(PIN_YELLOW, OUTPUT);
  pinMode(PIN_GREEN, OUTPUT);

  // Safety Default on Boot: Solid Red (Stop / Hold)
  setSignal(HIGH, LOW, LOW);
  
  Serial.println(F("[SEMTOS] ESP32 Traffic Light Actuator Online (115200 baud)"));
}

void loop() {
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    
    // Filter carriage return / newline
    if (cmd == '\r' || cmd == '\n') return;

    currentCommand = cmd;

    switch (cmd) {
      case 'P': // Emergency Corridor Active (Preemption Green)
        setSignal(LOW, LOW, HIGH);
        Serial.println(F("[ESP32] -> PREEMPTION GREEN ('P') ACTIVE"));
        break;

      case 'G': // Normal Green
        setSignal(LOW, LOW, HIGH);
        Serial.println(F("[ESP32] -> NORMAL GREEN ('G') ACTIVE"));
        break;

      case 'Y': // Yellow Transition
        setSignal(LOW, HIGH, LOW);
        Serial.println(F("[ESP32] -> YELLOW ('Y') TRANSITION"));
        break;

      case 'R': // Red
        setSignal(HIGH, LOW, LOW);
        Serial.println(F("[ESP32] -> RED ('R') HOLD"));
        break;

      default:
        // Ignore unrecognized bytes
        break;
    }
  }
}

void setSignal(int redState, int yellowState, int greenState) {
  digitalWrite(PIN_RED, redState);
  digitalWrite(PIN_YELLOW, yellowState);
  digitalWrite(PIN_GREEN, greenState);
}
