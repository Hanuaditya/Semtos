import { NextResponse } from 'next/server';
import os from 'os';

/**
 * /api/network-ip - Discovers the host laptop's local LAN IPv4 address
 * Enables one-scan mobile phone QR code linking for the Phone HUD (/driver)
 */
export async function GET() {
  const interfaces = os.networkInterfaces();
  let candidateIp = '127.0.0.1';
  let wifiIp = null;

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // Skip IPv6 and internal loopback addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        const lowerName = name.toLowerCase();
        // Prioritize Wi-Fi / Wireless adapters
        if (lowerName.includes('wi-fi') || lowerName.includes('wireless') || lowerName.includes('wlan')) {
          wifiIp = iface.address;
        } else if (candidateIp === '127.0.0.1') {
          candidateIp = iface.address;
        }
      }
    }
  }

  const selectedIp = wifiIp || candidateIp;

  return NextResponse.json({
    ok: true,
    ip: selectedIp,
    driverUrl: `http://${selectedIp}:3000/driver`,
    ambulanceUrl: `http://${selectedIp}:3000/ambulance`,
    dashboardUrl: `http://${selectedIp}:3000/`,
  });
}
