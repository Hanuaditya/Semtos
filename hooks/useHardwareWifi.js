"use client";

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * useHardwareWifi - Custom React Hook for Wireless V2I HTTP Communication with ESP32
 * 
 * Routes requests via local Next.js proxy (/api/esp32) to bypass browser CORS & PNA security restrictions,
 * with direct fetch fallback.
 */
export function useHardwareWifi() {
  const [espIp, setEspIp] = useState('192.168.4.1');
  const [isWifiEnabled, setIsWifiEnabled] = useState(false);
  const [lastWifiByteSent, setLastWifiByteSent] = useState(null);
  const [wifiStatus, setWifiStatus] = useState('IDLE'); // 'IDLE' | 'CONNECTING' | 'LINKED' | 'ERROR'
  const [lastResponseTime, setLastResponseTime] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [linkSuccess, setLinkSuccess] = useState(false);

  const lastSentRef = useRef(null);
  const espIpRef = useRef('192.168.4.1');
  const isWifiEnabledRef = useRef(false);

  // Restore saved settings from localStorage on mount
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
    const cleanIp = newIp.trim().replace(/^https?:\/\//i, '').replace(/[:\/].*$/, '');
    setEspIp(cleanIp);
    espIpRef.current = cleanIp;
    if (typeof window !== 'undefined') {
      localStorage.setItem('semtos_esp_ip', cleanIp);
    }
    return cleanIp;
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
        setLastError(null);
      }
      return next;
    });
  }, []);

  /**
   * Internal dispatcher using local Next.js proxy route /api/esp32
   */
  const executeHttpDispatch = useCallback(async (ip, cmd) => {
    const start = Date.now();
    try {
      const res = await fetch(`/api/esp32?ip=${encodeURIComponent(ip)}&cmd=${cmd}`, {
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));
      const elapsed = Date.now() - start;

      if (data.success) {
        return { success: true, latency: data.latencyMs || elapsed, data };
      } else {
        return { success: false, error: data.error || 'Connection failed' };
      }
    } catch (err) {
      // Proxy failed; attempt direct fetch as fallback
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        await fetch(`http://${ip}/signal?cmd=${cmd}`, {
          mode: 'no-cors',
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        return { success: true, latency: Date.now() - start };
      } catch (directErr) {
        return { success: false, error: directErr.message || 'Network request failed' };
      }
    }
  }, []);

  /**
   * Save IP, enable Wi-Fi, and perform immediate handshake ping
   */
  const saveAndLink = useCallback(async (ipToSave, testCmd = 'R') => {
    const cleanIp = updateEspIp(ipToSave);
    setIsConnecting(true);
    setWifiStatus('CONNECTING');
    setLastError(null);
    setLinkSuccess(false);

    // Reset deduplication ref so active state can be sent fresh
    lastSentRef.current = null;

    const result = await executeHttpDispatch(cleanIp, testCmd);
    setIsConnecting(false);

    if (result.success) {
      setIsWifiEnabled(true);
      isWifiEnabledRef.current = true;
      if (typeof window !== 'undefined') {
        localStorage.setItem('semtos_wifi_enabled', 'true');
      }
      setWifiStatus('LINKED');
      setLastResponseTime(result.latency);
      setLastWifiByteSent(testCmd);
      lastSentRef.current = testCmd;
      setLinkSuccess(true);
      setLastError(null);
      setTimeout(() => setLinkSuccess(false), 3500);
      return true;
    } else {
      setWifiStatus('ERROR');
      setLastError(result.error || `Could not connect to http://${cleanIp}:80`);
      setLinkSuccess(false);
      return false;
    }
  }, [updateEspIp, executeHttpDispatch]);

  /**
   * Dispatch single-character command over Wi-Fi
   * Deduplicates commands to prevent flooding network buffer
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
    setWifiStatus('SENDING');

    const result = await executeHttpDispatch(targetIp, cmd);

    if (result.success) {
      setLastResponseTime(result.latency);
      setWifiStatus('LINKED');
      setLastError(null);
    } else {
      console.warn(`[Wi-Fi V2I] Failed sending '${cmd}' to ${targetIp}:`, result.error);
      setWifiStatus('ERROR');
      setLastError(result.error);
    }
  }, [executeHttpDispatch]);

  /**
   * Manual Test Override
   */
  const testPing = useCallback(async (cmd = 'P') => {
    const targetIp = espIpRef.current;
    if (!targetIp) return false;
    setWifiStatus('SENDING');
    const result = await executeHttpDispatch(targetIp, cmd);

    if (result.success) {
      setLastResponseTime(result.latency);
      setWifiStatus('LINKED');
      setLastWifiByteSent(cmd);
      lastSentRef.current = cmd;
      setLastError(null);
      return true;
    } else {
      setWifiStatus('ERROR');
      setLastError(result.error);
      return false;
    }
  }, [executeHttpDispatch]);

  return {
    espIp,
    updateEspIp,
    isWifiEnabled,
    toggleWifi,
    lastWifiByteSent,
    wifiStatus,
    lastResponseTime,
    isConnecting,
    lastError,
    linkSuccess,
    saveAndLink,
    sendWifiCommand,
    testPing,
  };
}
