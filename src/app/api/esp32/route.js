import { NextResponse } from 'next/server';

/**
 * /api/esp32 - Local Node.js Proxy Route for ESP32 Hardware Communication
 * 
 * Bypasses all browser Private Network Access (PNA) and CORS restrictions.
 * Next.js server executes direct TCP HTTP request to the ESP32's local IP.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ip = searchParams.get('ip');
  const cmd = searchParams.get('cmd') || 'R';

  if (!ip) {
    return NextResponse.json(
      { success: false, error: 'Missing IP address parameter' },
      { status: 400 }
    );
  }

  // Sanitize IP: strip http://, ports, and trailing paths
  const cleanIp = ip.trim().replace(/^https?:\/\//i, '').replace(/[:\/].*$/, '');

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800); // 1.8-second timeout

    const res = await fetch(`http://${cleanIp}/signal?cmd=${cmd}`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);

    const bodyText = await res.text().catch(() => 'OK');
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      success: true,
      status: res.status,
      body: bodyText,
      ip: cleanIp,
      cmd,
      latencyMs
    });
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    const errorMsg = isTimeout
      ? `Connection timed out (1.8s) reaching http://${cleanIp}:80. Check if ESP32 is powered and connected to this Wi-Fi.`
      : `Network error: ${err.message || 'Connection failed'}`;

    return NextResponse.json({
      success: false,
      error: errorMsg,
      isTimeout,
      ip: cleanIp,
      cmd
    }, { status: 502 });
  }
}
