"use client";

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * useHardwareWifi - Custom React Hook for Wireless V2I HTTP Communication with ESP32
 * 
 * Protocol:
 * - Method: GET http://<espIp>/signal?cmd=<P|G|Y|R>
 * - Mode: 'no-cors' (allows cross-origin requests to ESP32 local WebServer)
 * 
 * Commands:
 * - 'P' = Preemption Green (Emergency Ambulance Corridor Active)
 * - 'G' = Normal Green (Approach Released)
 * - 'Y' = Yellow Transition (Yield / Change Phase)
 * - 'R' = Red (Stop / Hold)
 */
export function useHardwareWifi() {
  const [espIp, setEspIp] = useState('192.168.4.1');
  const [isWifiEnabled, setIsWifiEnabled] = useState(false);
  const [lastWifiByteSent, setLastWifiByteSent] = useState(null);
  const [wifiStatus, setWifiStatus] = useState('IDLE'); // 'IDLE' | 'LINKED' | 'SENDING' | 'ERROR'
  const [lastResponseTime, setLastResponseTime] = useState(null);

  const lastSentRef = useRef(null);
  const espIpRef = useRef('192.168.4.1');
  const isWifiEnabledRef = useRef(false);

  // Restore saved settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedIp = localStorage.getItem('semtos_esp_ip');
      if (savedIp) {
        setEspIp(savedIp);
        espIpRef.current = savedIp;
      }
      const savedEnabled = localStorage.getItem('semtos_wifi_enabled');
      if (savedEnabled === 'true') {
        setIsWifiEnabled(true);
        isWifiEnabledRef.current = true;
      }
    }
  }, []);

  const updateEspIp = useCallback((newIp) => {
    const cleanIp = newIp.trim().replace(/^http:\/\//, '').replace(/\/.*$/, '');
    setEspIp(cleanIp);
    espIpRef.current = cleanIp;
    if (typeof window !== 'undefined') {
      localStorage.setItem('semtos_esp_ip', cleanIp);
    }
  }, []);

  const toggleWifi = useCallback((forcedState) => {
    setIsWifiEnabled(prev => {
      const next = typeof forcedState === 'boolean' ? forcedState : !prev;
      isWifiEnabledRef.current = next;
      if (typeof window !== 'undefined') {
        localStorage.setItem('semtos_wifi_enabled', next ? 'true' : 'false');
      }
      if (!next) {
        setWifiStatus('IDLE');
      }
      return next;
    });
  }, []);

  /**
   * Dispatch single-character command over Wi-Fi HTTP fetch
   * Deduplicates commands to prevent flooding wireless network buffer
   */
  const sendWifiCommand = useCallback(async (cmd) => {
    if (!cmd) return;
    const validBytes = ['R', 'Y', 'G', 'P'];
    if (!validBytes.includes(cmd)) return;

    // Deduplicate: ignore if unchanged
    if (cmd === lastSentRef.current) return;
    lastSentRef.current = cmd;
    setLastWifiByteSent(cmd);

    if (!isWifiEnabledRef.current || !espIpRef.current) return;

    const targetIp = espIpRef.current;
    try {
      setWifiStatus('SENDING');
      const start = Date.now();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

      await fetch(`http://${targetIp}/signal?cmd=${cmd}`, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setLastResponseTime(Date.now() - start);
      setWifiStatus('LINKED');
    } catch (err) {
      console.warn(`[Wi-Fi V2I] Failed to send command '${cmd}' to http://${targetIp}/signal:`, err);
      setWifiStatus('ERROR');
    }
  }, []);

  /**
   * Manual Ping / Test Command
   */
  const testPing = useCallback(async (cmd = 'P') => {
    const targetIp = espIpRef.current;
    if (!targetIp) return false;
    try {
      setWifiStatus('SENDING');
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      await fetch(`http://${targetIp}/signal?cmd=${cmd}`, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setLastResponseTime(Date.now() - start);
      setWifiStatus('LINKED');
      lastSentRef.current = cmd;
      setLastWifiByteSent(cmd);
      return true;
    } catch (err) {
      console.warn(`[Wi-Fi V2I Ping Failed] http://${targetIp}:`, err);
      setWifiStatus('ERROR');
      return false;
    }
  }, []);

  return {
    espIp,
    updateEspIp,
    isWifiEnabled,
    toggleWifi,
    lastWifiByteSent,
    wifiStatus,
    lastResponseTime,
    sendWifiCommand,
    testPing,
  };
}
