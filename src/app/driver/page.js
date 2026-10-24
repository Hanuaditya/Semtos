// src/app/driver/page.js
"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  useV2XReceiver,
  GOOGLE_ROAD_NODES,
  buildRoadTrafficLinesGeoJSON,
  haversineMeters,
} from '../../../hooks/useV2XSync';

if (typeof window !== 'undefined' && maplibregl.setWorkerUrl) {
  maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
}

const GOOGLE_2D_DRIVER_STYLE = {
  version: 8,
  sources: {
    'google-streets': {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      maxzoom: 21,
    },
  },
  layers: [
    {
      id: 'google-streets-layer',
      type: 'raster',
      source: 'google-streets',
    },
  ],
};

// Commuter Phone Locations directly on the Active Roads
const DRIVER_PRESETS = [
  {
    id: 'MG_METRO',
    label: '🚗 Commuter on M.G. Road (Near Metro Station)',
    lngLat: GOOGLE_ROAD_NODES.MG_METRO,
    corridor: 'M.G. Road Corridor (Case 01)',
    yieldSide: 'PULL LEFT TOWARD CURB — CLEAR M.G. ROAD LANE',
  },
  {
    id: 'BRIGADE_APPROACH',
    label: '🚗 Commuter on Brigade Road (Case 03 AMB-A)',
    lngLat: GOOGLE_ROAD_NODES.BRIGADE_CHUR,
    corridor: 'Brigade Road Corridor (Case 03 AMB-A)',
    yieldSide: 'PULL LEFT ON BRIGADE RD — CLEAR AMB-A CORRIDOR',
  },
  {
    id: 'CUBBON_DETOUR',
    label: '🚗 Commuter on Cubbon Road (Case 03 AMB-B Detour)',
    lngLat: GOOGLE_ROAD_NODES.CUBBON_VEER,
    corridor: 'Cubbon Road Detour (Case 03 AMB-B)',
    yieldSide: 'YIELD ON CUBBON RD — AMB-B MACRO-DETOUR ACTIVE',
  },
];

export default function CivilianDriverPhoneHUD() {
  const { state, sendCommand } = useV2XReceiver();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const driverMarkerRef = useRef(null);
  const ambMarkerRef = useRef(null);

  const [presetIdx, setPresetIdx] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const lastSpokenAlertRef = useRef(false);

  const activePreset = DRIVER_PRESETS[presetIdx] || DRIVER_PRESETS[0];

  const activeAmb = (() => {
    if (state.selectedCase === 1) {
      return {
        id: 'AMB-108',
        name: 'Ambulance 108 (M.G. Road)',
        lngLat: state.case1?.ambulanceLngLat || GOOGLE_ROAD_NODES.ANIL_KUMBLE,
        running: Boolean(state.case1?.isSimulationRunning),
      };
    }
    const aPos = state.case3?.ambulanceA?.lngLat || GOOGLE_ROAD_NODES.BRIGADE_RES;
    const bPos = state.case3?.ambulanceB?.lngLat || GOOGLE_ROAD_NODES.MG_CARIAPPA;
    const dA = haversineMeters(activePreset.lngLat, aPos);
    const dB = haversineMeters(activePreset.lngLat, bPos);
    if (dA < dB) {
      return {
        id: 'AMB-A',
        name: 'Ambulance A (Brigade Rd Priority)',
        lngLat: aPos,
        running: Boolean(state.case3?.isSimulationRunning && !state.case3?.trafficCycleActive),
      };
    }
    return {
      id: 'AMB-B',
      name: 'Ambulance B (Kamaraj–Cubbon Detour)',
      lngLat: bPos,
      running: Boolean(state.case3?.isSimulationRunning && !state.case3?.trafficCycleActive),
    };
  })();

  const distanceMeters = Math.round(haversineMeters(activePreset.lngLat, activeAmb.lngLat));
  const isEmergencyNear = activeAmb.running && distanceMeters <= 260;

  useEffect(() => {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isEmergencyNear && !lastSpokenAlertRef.current) {
      lastSpokenAlertRef.current = true;
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(
          `Emergency Alert! ${activeAmb.name} approaching ${distanceMeters} meters behind you. ${activePreset.yieldSide}.`
        );
        utter.rate = 1.05;
        window.speechSynthesis.speak(utter);
      } catch (_) {}
    } else if (!isEmergencyNear) {
      lastSpokenAlertRef.current = false;
    }
  }, [isEmergencyNear, distanceMeters, activeAmb.name, activePreset.yieldSide, voiceEnabled]);

  // Initialize 2D Google Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: GOOGLE_2D_DRIVER_STYLE,
      center: activePreset.lngLat,
      zoom: 16.0,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      attributionControl: false,
    });

    map.on('load', () => {
      mapLoadedRef.current = true;

      map.addSource('driver-traffic-lines', {
        type: 'geojson',
        data: buildRoadTrafficLinesGeoJSON(state),
      });

      map.addLayer({
        id: 'driver-traffic-casing',
        type: 'line',
        source: 'driver-traffic-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#020617',
          'line-width': ['+', ['get', 'width'], 4],
          'line-opacity': 0.85,
        },
      });

      map.addLayer({
        id: 'driver-traffic-core',
        type: 'line',
        source: 'driver-traffic-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': 0.95,
        },
      });

      // Commuter Phone Marker ("YOU")
      const drvEl = document.createElement('div');
      drvEl.style.cssText = `
        width:30px;height:30px;border-radius:50%;background:#3b82f6;
        border:3px solid #fff;box-shadow:0 0 16px #3b82f6;
        display:flex;align-items:center;justify-content:center;font-size:14px;
      `;
      drvEl.innerText = '🚗';
      driverMarkerRef.current = new maplibregl.Marker({ element: drvEl, anchor: 'center' })
        .setLngLat(activePreset.lngLat)
        .addTo(map);

      // Incoming 2D Ambulance Marker
      const ambEl = document.createElement('div');
      ambEl.style.cssText = `
        width:36px;height:36px;border-radius:50%;background:#ef4444;
        border:3px solid #fff;box-shadow:0 0 22px #ef4444;
        display:flex;align-items:center;justify-content:center;font-size:18px;
      `;
      ambEl.innerText = '🚑';
      ambMarkerRef.current = new maplibregl.Marker({ element: ambEl, anchor: 'center' })
        .setLngLat(activeAmb.lngLat)
        .addTo(map);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers & dynamic red-to-green traffic lines
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    driverMarkerRef.current?.setLngLat(activePreset.lngLat);
    ambMarkerRef.current?.setLngLat(activeAmb.lngLat);

    const src = map.getSource('driver-traffic-lines');
    if (src) src.setData(buildRoadTrafficLinesGeoJSON(state));
  }, [state, activePreset, activeAmb.lngLat]);

  return (
    <div style={{
      minHeight: '100vh', background: '#020617', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'monospace', color: '#f8fafc'
    }}>
      <div style={{ width: '100%', maxWidth: 460, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <a href="/" style={{ color: '#94a3b8', fontSize: 11, textDecoration: 'none', fontWeight: 800 }}>← 3D TWIN CMD</a>
        <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 800 }}>SEMTOS V2X COMMUTER PHONE HUD</span>
        <a href="/ambulance" style={{ color: '#22c55e', fontSize: 11, textDecoration: 'none', fontWeight: 800 }}>2D AMB MAP →</a>
      </div>

      {/* Smartphone Frame */}
      <div style={{
        width: '100%', maxWidth: 460, height: '86vh', background: '#0f172a',
        border: `3px solid ${isEmergencyNear ? '#ef4444' : '#334155'}`,
        borderRadius: 32, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: isEmergencyNear ? '0 0 50px rgba(239, 68, 68, 0.65)' : '0 20px 50px rgba(0,0,0,0.8)',
        position: 'relative'
      }}>
        {/* Top Alert Banner */}
        <div style={{
          padding: '16px 18px',
          background: isEmergencyNear
            ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
            : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderBottom: '1px solid #334155', zIndex: 10
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.5, color: isEmergencyNear ? '#fef08a' : '#22c55e' }}>
              {isEmergencyNear ? '🚨 BLE + V2X EMERGENCY ALERT' : '🟢 NORMAL NAVIGATION (2D GOOGLE MAPS)'}
            </span>
            <span style={{ fontSize: 11, fontWeight: 900, background: 'rgba(0,0,0,0.35)', padding: '2px 8px', borderRadius: 12 }}>
              {distanceMeters}m AWAY
            </span>
          </div>

          <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', lineHeight: 1.25 }}>
            {isEmergencyNear ? `⬅️ ${activePreset.yieldSide}` : 'Road Clear — Monitoring BLE & V2X Beacons'}
          </div>
        </div>

        {/* 2D Google Map View */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />
        </div>

        {/* Bottom Controls */}
        <div style={{ padding: 14, background: '#020617', borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select
            value={presetIdx}
            onChange={(e) => {
              const idx = Number(e.target.value);
              setPresetIdx(idx);
              mapRef.current?.flyTo({ center: DRIVER_PRESETS[idx].lngLat, zoom: 16.0, duration: 600 });
            }}
            style={{
              width: '100%', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155',
              borderRadius: 8, padding: '8px 10px', fontSize: 11, fontFamily: 'monospace', fontWeight: 700
            }}
          >
            {DRIVER_PRESETS.map((p, i) => (
              <option key={p.id} value={i}>{p.label}</option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => sendCommand('DISPATCH')}
              style={{
                flex: 1, background: '#22c55e', color: '#020617', border: 'none',
                borderRadius: 8, padding: '8px 0', fontSize: 11, fontWeight: 900, cursor: 'pointer'
              }}
            >
              ▶ DISPATCH [ENTER]
            </button>
            <button
              onClick={() => sendCommand('SWITCH_CASE', { caseId: state.selectedCase === 1 ? 3 : 1 })}
              style={{
                flex: 1, background: '#1e293b', color: '#f59e0b', border: '1px solid #f59e0b',
                borderRadius: 8, padding: '8px 0', fontSize: 11, fontWeight: 900, cursor: 'pointer'
              }}
            >
              SWITCH TO CASE {state.selectedCase === 1 ? '03' : '01'}
            </button>
            <button
              onClick={() => setVoiceEnabled((v) => !v)}
              style={{
                background: voiceEnabled ? '#0284c7' : '#1e293b', color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 10px', fontSize: 11, fontWeight: 900, cursor: 'pointer'
              }}
            >
              {voiceEnabled ? '🔊 TTS' : '🔇'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
