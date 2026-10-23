/*
 * ==============================================================================
 * SEMTOS Digital Twin — Phase C Hardware Actuation
 * ESP32 Physical Traffic Light Controller (Dual USB Serial + Wireless V2I Wi-Fi)
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
 * Protocols Supported Simultaneously:
 * 1. USB Serial (115200 baud) — Zero-fail, instant, no network needed
 * 2. Wi-Fi HTTP WebServer (Port 80) — Wireless V2I demonstration over hotspot
 *    Endpoint: GET http://<ESP32_IP>/signal?cmd=<P|G|Y|R>
 * 
 * Commands:
 * - 'P' -> Preemption Green (Emergency Ambulance Corridor Active)
 * - 'G' -> Normal Green (Approach Released)
 * - 'Y' -> Yellow Transition (Yield / Change Phase)
 * - 'R' -> Red (Approach Holding / All-Red Standby)
 * ==============================================================================
 */

#include <WiFi.h>
#include <WebServer.h>

// ── Wi-Fi Hotspot Configuration ─────────────────────────────────────────────
const char* WIFI_SSID     = "H";
const char* WIFI_PASSWORD = "123456798";

// Fallback SoftAP Configuration (Used if hotspot is unreachable)
const char* AP_SSID       = "SEMTOS-TRAFFIC-AP";
const char* AP_PASSWORD   = "semtos1234";

// ── Physical Pin Mapping (Matches user hardware wiring) ─────────────────────
const int PIN_RED    = 18;
const int PIN_YELLOW = 19;
const int PIN_GREEN  = 21;
const int STATUS_LED = 2;  // Onboard blue LED (preemption strobe)

WebServer server(80);
char currentCommand = 'R';

void setSignal(int redState, int yellowState, int greenState, int statusState = LOW) {
  digitalWrite(PIN_RED, redState);
  digitalWrite(PIN_YELLOW, yellowState);
  digitalWrite(PIN_GREEN, greenState);
  digitalWrite(STATUS_LED, statusState);
}

void applyCommand(char cmd) {
  currentCommand = cmd;
  switch (cmd) {
    case 'P': // Emergency Corridor Active (Preemption Green + Status LED)
      setSignal(LOW, LOW, HIGH, HIGH);
      Serial.println(F("[SEMTOS] -> PREEMPTION GREEN ('P') ACTIVE"));
      break;

    case 'G': // Normal Green
      setSignal(LOW, LOW, HIGH, LOW);
      Serial.println(F("[SEMTOS] -> NORMAL GREEN ('G') ACTIVE"));
      break;

    case 'Y': // Yellow Transition
      setSignal(LOW, HIGH, LOW, LOW);
      Serial.println(F("[SEMTOS] -> YELLOW ('Y') TRANSITION"));
      break;

    case 'R': // Red
      setSignal(HIGH, LOW, LOW, LOW);
      Serial.println(F("[SEMTOS] -> RED ('R') HOLD"));
      break;

    default:
      Serial.print(F("[SEMTOS] Unrecognized command byte: "));
      Serial.println(cmd);
      break;
  }
}

// ── HTTP Request Handlers ───────────────────────────────────────────────────
void handleSignal() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  server.sendHeader("Access-Control-Allow-Private-Network", "true");

  if (server.hasArg("cmd")) {
    String cmdStr = server.arg("cmd");
    if (cmdStr.length() > 0) {
      char cmd = cmdStr.charAt(0);
      applyCommand(cmd);
      server.send(200, "text/plain", String("OK: Command ") + cmd + " applied");
      return;
    }
  }
  server.send(400, "text/plain", "Missing cmd parameter (e.g. /signal?cmd=P)");
}

void handleOptions() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  server.sendHeader("Access-Control-Allow-Private-Network", "true");
  server.send(204);
}

void handleRoot() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  String html = "<!DOCTYPE html><html><body style='font-family:monospace;background:#020617;color:#22c55e;padding:30px;'>";
  html += "<h2>SEMTOS ESP32 TRAFFIC ACTUATOR</h2>";
  html += "<p>Current Signal: <strong>" + String(currentCommand) + "</strong></p>";
  html += "<p>Endpoints: /signal?cmd=P | G | Y | R</p>";
  html += "</body></html>";
  server.send(200, "text/html", html);
}

// ── Setup ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  pinMode(PIN_RED, OUTPUT);
  pinMode(PIN_YELLOW, OUTPUT);
  pinMode(PIN_GREEN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);

  // Safety Default on Boot: Solid Red (Stop / Hold)
  setSignal(HIGH, LOW, LOW, LOW);

  Serial.println();
  Serial.println(F("=================================================="));
  Serial.println(F("  SEMTOS ESP32 DUAL-MODE CONTROLLER INITIALIZING  "));
  Serial.println(F("=================================================="));

  // Attempt Wi-Fi Connection
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print(F("Connecting to Wi-Fi Hotspot: "));
  Serial.println(WIFI_SSID);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 12) { // 6-second timeout
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F("[Wi-Fi] Connected successfully!"));
    Serial.print(F("[Wi-Fi] IP Address: http://"));
    Serial.println(WiFi.localIP());
  } else {
    // If hotspot fails, launch Access Point Mode
    Serial.println(F("[Wi-Fi] Hotspot connection failed. Starting Fallback Access Point..."));
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    Serial.print(F("[Wi-Fi AP] Access Point started: "));
    Serial.println(AP_SSID);
    Serial.print(F("[Wi-Fi AP] Connect to AP and visit: http://"));
    Serial.println(WiFi.softAPIP()); // Usually 192.168.4.1
  }

  // Setup Web Server Routes
  server.on("/", HTTP_GET, handleRoot);
  server.on("/signal", HTTP_GET, handleSignal);
  server.on("/signal", HTTP_OPTIONS, handleOptions);
  server.begin();
  Serial.println(F("[HTTP] Web Server listening on port 80"));
  Serial.println(F("[USB] Serial listener active at 115200 baud"));
  Serial.println(F("=================================================="));
}

// ── Main Loop ───────────────────────────────────────────────────────────────
void loop() {
  // 1. Process Wireless HTTP Web Requests
  server.handleClient();

  // 2. Process USB Serial Commands (Zero-Fail Fallback)
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    if (cmd != '\r' && cmd != '\n') {
      applyCommand(cmd);
    }
  }
}
