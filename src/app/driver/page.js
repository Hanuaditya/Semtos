"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  useV2XSubscriber,
  twinToLngLat,
  buildTwinRoadGeoJSON,
} from '../../../hooks/useV2XSync';

const MINI_SATELLITE_STYLE = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'carto-dark-base',
      type: 'raster',
      source: 'carto-dark',
      paint: { 'raster-brightness-max': 0.82 },
    },
  ],
};

// Commuter presets mapped to real cars in TrafficManager.jsx
const COMMUTER_PROFILES = [
  {
    id: 'WEST_AVE_CAR',
    label: '🚗 Car on West Avenue (Eastbound • Case 01 Corridor)',
    dir: 'E',
    defaultX: -35.0,
    defaultZ: -7.5,
    pullOverHint: 'PULL LEFT TO SHOULDER (Z = -9.0m)',
  },
  {
    id: 'SOUTH_AVE_CAR',
    label: '🚗 Car on South Approach (Northbound • Case 03 Amb A Corridor)',
    dir: 'N',
    defaultX: 1.2,
    defaultZ: 42.0,
    pullOverHint: 'PULL LEFT TO MEDIAN (X = 1.0m)',
  },
  {
    id: 'NORTH_CROSS_CAR',
    label: '🚙 Car on North Cross-Street (Southbound • Filtered / Non-Corridor)',
    dir: 'S',
    defaultX: -3.1,
    defaultZ: -22.0,
    pullOverHint: 'HOLD AT RED SIGNAL — NO LANE MERGE NEEDED',
  },
];

export default function PhoneUserDriverDashboard() {
  const { snapshot, isLiveTwinConnected, sendCommand } = useV2XSubscriber();

  const [selectedProfileId, setSelectedProfileId] = useState('WEST_AVE_CAR');
  const [audioEnabled, setAudioEnabled] = useState(true);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const commuterMarkerRef = useRef(null);
  const ambMarkerRef = useRef(null);
  const lastSpokenStateRef = useRef('NORMAL');

  const selectedCase = snapshot.selectedCase || 1;

  // Auto-select the active corridor profile when Case switches
  useEffect(() => {
    if (selectedCase === 3 && selectedProfileId === 'WEST_AVE_CAR') {
      setSelectedProfileId('SOUTH_AVE_CAR');
    } else if (selectedCase === 1 && selectedProfileId === 'SOUTH_AVE_CAR') {
      setSelectedProfileId('WEST_AVE_CAR');
    }
  }, [selectedCase, selectedProfileId]);

  const profile = useMemo(
    () => COMMUTER_PROFILES.find((p) => p.id === selectedProfileId) || COMMUTER_PROFILES[0],
    [selectedProfileId]
  );

  // Find the matching live car from TrafficManager.jsx vehicles array
  const matchedCar = useMemo(() => {
    const cars = snapshot.vehicles || [];
    const sameDir = cars.filter((c) => c.type === profile.dir);
    if (sameDir.length === 0) {
      return { x: profile.defaultX, z: profile.defaultZ, state: 'IDLE_QUEUE', speed: 0, receivesBLE: false };
    }
    // Pick a car in the trailing yield zone so the user sees the exact BLE yield behavior
    if (profile.dir === 'E') {
      return sameDir.find((c) => c.x < -20 && c.x > -50) || sameDir[Math.floor(sameDir.length / 2)];
    }
    if (profile.dir === 'N') {
      return sameDir.find((c) => c.z >= 30 && c.z <= 50) || sameDir[Math.floor(sameDir.length / 2)];
    }
    return sameDir[0];
  }, [snapshot.vehicles, profile]);

  // Evaluate BLE Proximity & Directional Vector Filtering (100% accurate to TrafficManager.jsx)
  const alertEvaluation = useMemo(() => {
    const activeAmbPos =
      selectedCase === 3
        ? snapshot.ambulanceA?.position || { x: 2.2, z: 90 }
        : snapshot.ambulancePosition || { x: -120, z: -6.0 };

    const distMeters = Math.round(
      Math.hypot(matchedCar.x - activeAmbPos.x, matchedCar.z - activeAmbPos.z)
    );

    const ambCorridorDir = selectedCase === 3 ? 'N' : 'E';
    const isSameCorridor = profile.dir === ambCorridorDir;

    // Check if ambulance has already passed this commuter car
    const hasAmbPassed =
      selectedCase === 1
        ? activeAmbPos.x > matchedCar.x + 12
        : activeAmbPos.z < matchedCar.z - 12;

    if (!snapshot.isSimulationRunning) {
      return {
        mode: 'NORMAL_STANDBY',
        bannerColor: '#10b981',
        title: 'CLEAR ROAD AHEAD',
        subtitle: 'Normal navigation active • V2X BLE listener armed',
        distMeters,
        activeAmbPos,
      };
    }

    if (isSameCorridor && hasAmbPassed) {
      return {
        mode: 'CLEARED_RESUME',
        bannerColor: '#22c55e',
        title: '✅ AMBULANCE PASSED — RESUME LANE',
        subtitle: 'Emergency corridor cleared • Return to normal lane position',
        distMeters,
        activeAmbPos,
      };
    }

    if (
      isSameCorridor &&
      (matchedCar.state === 'YIELDING' ||
        matchedCar.state === 'HOLDING' ||
        distMeters <= 45)
    ) {
      return {
        mode: 'CRITICAL_YIELD',
        bannerColor: '#ef4444',
        title: '🚨 EMERGENCY VEHICLE APPROACHING BEHIND',
        subtitle: profile.pullOverHint,
        distMeters,
        activeAmbPos,
      };
    }

    if (!isSameCorridor && distMeters <= 75) {
      return {
        mode: 'SUPPRESSED_CROSS_STREET',
        bannerColor: '#3b82f6',
        title: '🛡️ V2X VECTOR FILTER: HOLD AT INTERSECTION',
        subtitle: 'Ambulance on perpendicular corridor — Yield alert suppressed for your lane',
        distMeters,
        activeAmbPos,
      };
    }

    return {
      mode: 'APPROACHING_ADVISORY',
      bannerColor: '#f59e0b',
      title: '⚠️ EMERGENCY CORRIDOR PREEMPTED AHEAD',
      subtitle: `Ambulance dispatched (${distMeters}m away) — Prepare to yield`,
      distMeters,
      activeAmbPos,
    };
  }, [snapshot, selectedCase, matchedCar, profile]);

  // Voice TTS & Web Audio Alert when entering CRITICAL_YIELD or CLEARED_RESUME
  useEffect(() => {
    if (!audioEnabled || typeof window === 'undefined') return;
    if (alertEvaluation.mode === lastSpokenStateRef.current) return;
    lastSpokenStateRef.current = alertEvaluation.mode;

    if (alertEvaluation.mode === 'CRITICAL_YIELD') {
      // Play Web Audio Two-Tone Alert Chime
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.setValueAtTime(660, ctx.currentTime + 0.18);
          gain.gain.setValueAtTime(0.18, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.45);
        }
      } catch (_) {}

      // Speak Turn-by-Turn Yield Instruction
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(
          'Emergency ambulance approaching in your lane. Please yield left immediately.'
        );
        utter.rate = 1.05;
        window.speechSynthesis.speak(utter);
      }
    } else if (alertEvaluation.mode === 'CLEARED_RESUME') {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(
          'Ambulance has cleared your corridor. You may safely resume your lane.'
        );
        utter.rate = 1.05;
        window.speechSynthesis.speak(utter);
      }
    }
  }, [alertEvaluation.mode, audioEnabled]);

  // Initialize Embedded Satellite Mini-Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter = twinToLngLat(matchedCar.x, matchedCar.z);
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MINI_SATELLITE_STYLE,
      center: initialCenter,
      zoom: 18.5,
      pitch: 45,
      bearing: profile.dir === 'E' ? 90 : profile.dir === 'N' ? 0 : 180,
      interactive: false,
    });

    map.on('load', () => {
      const roadGeo = buildTwinRoadGeoJSON(selectedCase, false);
      map.addSource('mini-roads', { type: 'geojson', data: roadGeo.polygons });
      map.addLayer({
        id: 'mini-roads-fill',
        type: 'fill',
        source: 'mini-roads',
        paint: { 'fill-color': '#090e18', 'fill-opacity': 0.95 },
      });
      map.addLayer({
        id: 'mini-roads-line',
        type: 'line',
        source: 'mini-roads',
        paint: { 'line-color': '#334155', 'line-width': 1.5, 'line-opacity': 0.7 },
      });

      map.addSource('mini-lines', { type: 'geojson', data: roadGeo.lines });
      map.addLayer({
        id: 'mini-lines-dashes',
        type: 'line',
        source: 'mini-lines',
        filter: ['==', ['get', 'kind'], 'lane_dash'],
        paint: { 'line-color': '#94a3b8', 'line-width': 1.2, 'line-dasharray': [2, 2], 'line-opacity': 0.7 },
      });
      map.addLayer({
        id: 'mini-lines-medians',
        type: 'line',
        source: 'mini-lines',
        filter: ['==', ['get', 'kind'], 'median'],
        paint: { 'line-color': '#facc15', 'line-width': 1.8, 'line-opacity': 0.85 },
      });
      map.addLayer({
        id: 'mini-lines-route',
        type: 'line',
        source: 'mini-lines',
        filter: ['in', ['get', 'kind'], ['literal', ['amb_corridor_case1', 'amb_a_corridor', 'amb_b_detour']]],
        paint: { 'line-color': '#00f5ff', 'line-width': 4, 'line-opacity': 0.8 },
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update Commuter Marker & Ambulance Marker on Satellite Mini-Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const myLngLat = twinToLngLat(matchedCar.x, matchedCar.z);
    const ambLngLat = twinToLngLat(
      alertEvaluation.activeAmbPos.x,
      alertEvaluation.activeAmbPos.z
    );

    if (!commuterMarkerRef.current) {
      const el = document.createElement('div');
      commuterMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(myLngLat)
        .addTo(map);
    } else {
      commuterMarkerRef.current.setLngLat(myLngLat);
    }

    commuterMarkerRef.current.getElement().innerHTML = `
      <div style="
        background: #22c55e;
        color: #020617;
        font-family: monospace;
        font-size: 9px;
        font-weight: 900;
        padding: 3px 7px;
        border-radius: 999px;
        border: 2px solid #fff;
        box-shadow: 0 0 14px #22c55e;
        white-space: nowrap;
      ">
        📍 YOU (${matchedCar.state})
      </div>
    `;

    if (!ambMarkerRef.current) {
      const el = document.createElement('div');
      ambMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(ambLngLat)
        .addTo(map);
    } else {
      ambMarkerRef.current.setLngLat(ambLngLat);
    }

    ambMarkerRef.current.getElement().innerHTML = `
      <div style="
        background: #ef4444;
        color: #fff;
        font-family: monospace;
        font-size: 9px;
        font-weight: 900;
        padding: 3px 7px;
        border-radius: 999px;
        border: 2px solid #fff;
        box-shadow: 0 0 16px #ef4444;
        white-space: nowrap;
      ">
        🚑 AMB (${alertEvaluation.distMeters}m)
      </div>
    `;

    map.easeTo({
      center: myLngLat,
      bearing: profile.dir === 'E' ? 90 : profile.dir === 'N' ? 0 : 180,
      duration: 150,
    });
  }, [matchedCar, alertEvaluation, profile]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% 0%, #0f172a 0%, #020617 75%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 14px',
      fontFamily: 'monospace',
      color: '#f8fafc',
    }}>
      {/* Top Bar */}
      <div style={{
        width: '100%',
        maxWidth: 430,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
      }}>
        <a
          href="/"
          style={{
            background: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #475569',
            borderRadius: 6,
            padding: '5px 10px',
            fontSize: 10,
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          ← 3D TWIN
        </a>
        <span style={{ fontSize: 11, fontWeight: 900, color: '#f59e0b', letterSpacing: 1 }}>
          📱 SEMTOS V2X PHONE COMPANION
        </span>
        <a
          href="/ambulance"
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#10b981',
            border: '1px solid #10b981',
            borderRadius: 6,
            padding: '5px 10px',
            fontSize: 10,
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          🛰️ AMB MAP
        </a>
      </div>

      {/* Smartphone Chassis Frame */}
      <div style={{
        width: '100%',
        maxWidth: 430,
        background: '#090d16',
        border: `3px solid ${alertEvaluation.bannerColor}`,
        borderRadius: 28,
        overflow: 'hidden',
        boxShadow: `0 0 40px ${alertEvaluation.bannerColor}44, 0 20px 50px rgba(0,0,0,0.8)`,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Phone Status Bar */}
        <div style={{
          background: '#020617',
          padding: '10px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 10,
          borderBottom: '1px solid #1e293b',
        }}>
          <span style={{ color: isLiveTwinConnected ? '#22c55e' : '#f59e0b', fontWeight: 800 }}>
            {isLiveTwinConnected ? '● V2X BLE + TWIN LINKED' : '● STANDALONE V2X SIM'}
          </span>
          <span style={{ color: '#94a3b8' }}>CASE 0{selectedCase}</span>
          <button
            onClick={() => setAudioEnabled((prev) => !prev)}
            style={{
              background: audioEnabled ? '#1e293b' : '#7f1d1d',
              color: '#fff',
              border: '1px solid #334155',
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 9,
              cursor: 'pointer',
            }}
          >
            {audioEnabled ? '🔊 TTS ON' : '🔇 MUTED'}
          </button>
        </div>

        {/* Commuter Car Selector */}
        <div style={{ padding: '12px 14px', background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
          <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 4, fontWeight: 800 }}>
            SELECT YOUR COMMUTER VEHICLE LANE (FROM TRAFFICMANAGER.JSX):
          </div>
          <select
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
            style={{
              width: '100%',
              background: '#020617',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: 700,
            }}
          >
            {COMMUTER_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Primary Alert Banner */}
        <div style={{
          background:
            alertEvaluation.mode === 'CRITICAL_YIELD'
              ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
              : alertEvaluation.mode === 'CLEARED_RESUME'
              ? 'linear-gradient(135deg, #059669 0%, #065f46 100%)'
              : alertEvaluation.mode === 'SUPPRESSED_CROSS_STREET'
              ? 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)'
              : '#1e293b',
          padding: '16px 16px',
          textAlign: 'center',
          transition: 'all 0.25s ease',
        }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', letterSpacing: 0.8, marginBottom: 4 }}>
            {alertEvaluation.title}
          </div>
          <div style={{ fontSize: 11, color: '#f1f5f9', fontWeight: 700 }}>
            {alertEvaluation.subtitle}
          </div>
        </div>

        {/* Live Satellite Mini-Map */}
        <div style={{ position: 'relative', height: 250, width: '100%' }}>
          <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />
          <div style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            background: 'rgba(2, 6, 23, 0.88)',
            border: '1px solid #334155',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 9,
            color: '#cbd5e1',
          }}>
            YOUR POS: X: {matchedCar.x.toFixed(1)}m | Z: {matchedCar.z.toFixed(1)}m
          </div>
        </div>

        {/* Telemetry Cards */}
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: '#090d16' }}>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 9, color: '#64748b' }}>AMBULANCE DISTANCE</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: alertEvaluation.bannerColor }}>
              {alertEvaluation.distMeters} m
            </div>
          </div>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 9, color: '#64748b' }}>YOUR CAR STATE</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#38bdf8', marginTop: 3 }}>
              {matchedCar.state}
            </div>
          </div>
        </div>

        {/* Quick Test Controls inside Phone HUD */}
        <div style={{ padding: '0 14px 16px 14px', display: 'flex', gap: 8 }}>
          <button
            onClick={() => sendCommand('DISPATCH')}
            style={{
              flex: 1,
              background: '#10b981',
              color: '#020617',
              border: 'none',
              borderRadius: 8,
              padding: '10px 0',
              fontSize: 11,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            ▶ TRIGGER DISPATCH
          </button>
          <button
            onClick={() =>
              sendCommand('SWITCH_CASE', { caseId: selectedCase === 1 ? 3 : 1 })
            }
            style={{
              background: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            SWITCH TO CASE 0{selectedCase === 1 ? 3 : 1}
          </button>
        </div>
      </div>
    </div>
  );
}
