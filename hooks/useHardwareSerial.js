"use client";

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * useHardwareSerial - Custom React Hook for Web Serial API Communication with ESP32
 * 
 * Protocol:
 * - Baud Rate: 115200
 * - Single-character byte commands:
 *   'P' = Preemption Green (Emergency Corridor Active)
 *   'G' = Normal Green
 *   'Y' = Yellow Transition
 *   'R' = Red (Stop / Hold)
 * 
 * Microcontroller Pinout:
 * - RED LED:    GPIO 25
 * - YELLOW LED: GPIO 26
 * - GREEN LED:  GPIO 27
 */
export function useHardwareSerial() {
  const [isConnected, setIsConnected] = useState(false);
  const [portName, setPortName] = useState('ESP32 / USB Serial');
  const [lastByteSent, setLastByteSent] = useState(null);
  const [isSupported, setIsSupported] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const portRef = useRef(null);
  const writerRef = useRef(null);
  const lastSentRef = useRef(null);
  const isWritingRef = useRef(false);

  // Check Web Serial API support in the current browser
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      setIsSupported(true);
    }
  }, []);

  // Gracefully handle device unplugging
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) return;

    const handleDisconnect = (e) => {
      if (portRef.current && e.target === portRef.current) {
        disconnectESP32();
      }
    };

    navigator.serial.addEventListener('disconnect', handleDisconnect);
    return () => {
      navigator.serial.removeEventListener('disconnect', handleDisconnect);
    };
  }, []);

  /**
   * Safely disconnect and close the serial stream
   */
  const disconnectESP32 = useCallback(async () => {
    try {
      if (writerRef.current) {
        try {
          // Send 'R' byte to turn off green/yellow and leave red as fail-safe
          await writerRef.current.write(new TextEncoder().encode('R'));
          await writerRef.current.close();
        } catch (_) {}
        writerRef.current = null;
      }
      if (portRef.current) {
        try {
          await portRef.current.close();
        } catch (_) {}
        portRef.current = null;
      }
    } catch (err) {
      console.warn('Error during serial port disconnect:', err);
    } finally {
      setIsConnected(false);
      lastSentRef.current = null;
      setLastByteSent(null);
      setErrorMsg(null);
    }
  }, []);

  /**
   * Connect to ESP32 via Web Serial API prompt
   */
  const connectESP32 = useCallback(async () => {
    setErrorMsg(null);
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      const msg = 'Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.';
      setErrorMsg(msg);
      alert(msg);
      return false;
    }

    try {
      // Prompt user to select ESP32 COM port
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });

      const writer = port.writable.getWriter();
      writerRef.current = writer;
      portRef.current = port;

      // Identify port vendor/product if provided by OS
      const info = port.getInfo ? port.getInfo() : {};
      const name = info.usbVendorId
        ? `ESP32 (VID: 0x${info.usbVendorId.toString(16).toUpperCase()})`
        : 'ESP32 (115200 baud)';
      setPortName(name);

      // Immediately send byte 'R' on initial connection (All-Red safety default)
      const data = new TextEncoder().encode('R');
      await writer.write(data);
      lastSentRef.current = 'R';
      setLastByteSent('R');
      setIsConnected(true);
      return true;
    } catch (err) {
      if (err.name === 'NotFoundError') {
        // User cancelled port selection modal
        console.log('User cancelled ESP32 serial selection.');
      } else {
        console.error('Failed to open ESP32 serial port:', err);
        setErrorMsg(err.message || 'Failed to connect to ESP32');
      }
      return false;
    }
  }, []);

  /**
   * Send single-character byte command to ESP32
   * Deduplicates commands (only writes to serial if char !== lastSentRef.current)
   */
  const sendByteCommand = useCallback(async (char) => {
    if (!char) return;
    const validBytes = ['R', 'Y', 'G', 'P'];
    if (!validBytes.includes(char)) return;

    // Deduplicate: ignore if unchanged
    if (char === lastSentRef.current) return;

    lastSentRef.current = char;
    setLastByteSent(char);

    // If port is not connected, update state indicator only
    if (!writerRef.current || !portRef.current) {
      return;
    }

    if (isWritingRef.current) return;
    isWritingRef.current = true;

    try {
      const data = new TextEncoder().encode(char);
      await writerRef.current.write(data);
    } catch (err) {
      console.error(`Failed to write command '${char}' to ESP32:`, err);
    } finally {
      isWritingRef.current = false;
    }
  }, []);

  // Cleanup on hook unmount
  useEffect(() => {
    return () => {
      if (writerRef.current || portRef.current) {
        disconnectESP32();
      }
    };
  }, [disconnectESP32]);

  return {
    isConnected,
    portName,
    lastByteSent,
    isSupported,
    errorMsg,
    connectESP32,
    disconnectESP32,
    sendByteCommand,
  };
}
