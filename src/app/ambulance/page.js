// src/app/ambulance/page.js
"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  useV2XReceiver,
  ORIGIN_LNG,
  ORIGIN_LAT,
  GOOGLE_ROAD_NODES,
  buildRoadTrafficLinesGeoJSON,
} from '../../../hooks/useV2XSync';

if (typeof window !== 'undefined' && maplibregl.setWorkerUrl) {
  maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
}

// ── Free Google Maps 2D Tile Style (Streets, Hybrid Satellite, Pure Satellite) ──
const GOOGLE_2D_MAP_STYLE = {
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
      attribution: '© Google Maps',
    },
    'google-hybrid': {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      maxzoom: 21,
      attribution: '© Google Maps Satellite',
    },
    'google-satellite': {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      maxzoom: 21,
      attribution: '© Google Satellite',
    },
  },
  layers: [
    {
      id: 'google-streets-layer',
      type: 'raster',
      source: 'google-streets',
      layout: { visibility: 'visible' },
    },
    {
      id: 'google-hybrid-layer',
      type: 'raster',
      source: 'google-hybrid',
      layout: { visibility: 'none' },
    },
    {
      id: 'google-satellite-layer',
      type: 'raster',
      source: 'google-satellite',
      layout: { visibility: 'none' },
    },
  ],
};

// ── Clean 2D Top-Down Ambulance SVG Icon (Rotates 100% along Road Bearing) ──
function create2DAmbulanceElement(label, borderColor, badgeBg) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:54px;height:54px;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:60;';

  const pulse = document.createElement('div');
  pulse.style.cssText = `
    position:absolute;width:50px;height:50px;border-radius:50%;
    background:${borderColor}33;border:2px solid ${borderColor};
    animation:ambPulse2D 1.1s infinite ease-out;
  `;

  const rotor = document.createElement('div');
  rotor.className = 'amb-2d-rotor';
  rotor.style.cssText = 'width:38px;height:38px;display:flex;align-items:center;justify-content:center;transition:transform 0.06s linear;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.65));';
  rotor.innerHTML = `
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- White 2D Top-Down Ambulance Chassis Pointing North (0 deg) -->
      <rect x="8" y="2" width="20" height="32" rx="5" fill="#ffffff" stroke="${borderColor}" stroke-width="2.5"/>
      <!-- Front Windshield (North / Top) -->
      <path d="M10 9 C10 6, 26 6, 26 9 L25 13 L11 13 Z" fill="#0f172a"/>
      <!-- Red Emergency Cross on Roof -->
      <rect x="16" y="16" width="4" height="10" rx="1" fill="#ef4444"/>
      <rect x="13" y="19" width="10" height="4" rx="1" fill="#ef4444"/>
      <!-- Flashing Roof Lightbar -->
      <rect x="11" y="13.2" width="6.5" height="2.2" rx="1" fill="#ef4444"/>
      <rect x="18.5" y="13.2" width="6.5" height="2.2" rx="1" fill="#3b82f6"/>
    </svg>
  `;

  const tag = document.createElement('div');
  tag.style.cssText = `
    position:absolute;top:-22px;white-space:nowrap;
    background:${badgeBg};color:#fff;border:1.5px solid ${borderColor};
    font-family:monospace;font-size:10px;font-weight:900;
    padding:2px 7px;border-radius:5px;letter-spacing:0.6px;
    box-shadow:0 2px 8px rgba(0,0,0,0.7);
  `;
  tag.innerText = label;

  wrapper.appendChild(pulse);
  wrapper.appendChild(rotor);
  wrapper.appendChild(tag);
  return wrapper;
}

export default function AmbulanceSatelliteCockpit() {
  const { state, sendCommand } = useV2XReceiver();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLoadedRef = useRef(false);

  const amb1MarkerRef = useRef(null);
  const ambAMarkerRef = useRef(null);
  const ambBMarkerRef = useRef(null);
  const signalMarkersRef = useRef({});
  const waypointMarkersRef = useRef([]);

  const [activeUnit, setActiveUnit] = useState('AMB_B'); // 'AMB_1' | 'AMB_A' | 'AMB_B'
  const [cameraMode, setCameraMode] = useState('OVERVIEW'); // 'OVERVIEW' | 'FOLLOW' | 'JUNCTION' | 'FREE'
  const [mapStyleMode, setMapStyleMode] = useState('STREETS'); // 'STREETS' | 'HYBRID' | 'SATELLITE'

  useEffect(() => {
    if (state.selectedCase === 1) {
      setActiveUnit('AMB_1');
    } else if (state.selectedCase === 3 && activeUnit === 'AMB_1') {
      setActiveUnit('AMB_B');
    }
  }, [state.selectedCase, activeUnit]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        sendCommand('DISPATCH');
      } else if (e.code === 'KeyF') {
        sendCommand('FREEZE');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sendCommand]);

  // ── Initialize Pure 2D Top-Down Google Map (pitch: 0, bearing: 0) ──
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: GOOGLE_2D_MAP_STYLE,
      center: [77.6062, 12.9762],
      zoom: 15.6,
      pitch: 0,
      bearing: 0,
      maxPitch: 0, // Lock strictly to 2D Top-Down so roads and ambulances never distort
      attributionControl: false,
    });

    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), 'bottom-right');

    map.on('load', () => {
      mapLoadedRef.current = true;

      // ── Dynamic Red-to-Green Traffic Corridor Lines Source & Layers ──
      map.addSource('traffic-corridor-lines', {
        type: 'geojson',
        data: buildRoadTrafficLinesGeoJSON(state),
      });

      // Outer Dark Road Casing for High Contrast on Google Streets & Satellite
      map.addLayer({
        id: 'traffic-lines-casing',
        type: 'line',
        source: 'traffic-corridor-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#020617',
          'line-width': ['+', ['get', 'width'], 5],
          'line-opacity': 0.85,
        },
      });

      // Soft Neon Glow Halo (Red when traffic is queued, Green when ambulance approaches)
      map.addLayer({
        id: 'traffic-lines-glow',
        type: 'line',
        source: 'traffic-corridor-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'glowWidth'],
          'line-opacity': 0.35,
          'line-blur': 5,
        },
      });

      // Solid Core Traffic Line Directly on the Road Asphalt
      map.addLayer({
        id: 'traffic-lines-core',
        type: 'line',
        source: 'traffic-corridor-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': 0.96,
        },
      });

      // Directional Flow Chevrons Along the Road
      map.addLayer({
        id: 'traffic-lines-dash',
        type: 'line',
        source: 'traffic-corridor-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 2.5,
          'line-dasharray': [2, 3],
          'line-opacity': 0.75,
        },
      });

      // ── 4-Way Signal Indicators at the Road Stop Lines around J0 (M.G. Rd & Brigade Rd) ──
      const signalArms = [
        { arm: 'W', label: 'W (M.G. RD WEST)', lngLat: GOOGLE_ROAD_NODES.MG_METRO },
        { arm: 'E', label: 'E (M.G. RD EAST)', lngLat: GOOGLE_ROAD_NODES.MG_CAUV_EAST },
        { arm: 'S', label: 'S (BRIGADE RD)',   lngLat: GOOGLE_ROAD_NODES.BRIGADE_CHUR },
        { arm: 'N', label: 'N (KAMARAJ RD)',   lngLat: GOOGLE_ROAD_NODES.KAMARAJ_S },
      ];

      signalArms.forEach((sig) => {
        const el = document.createElement('div');
        el.style.cssText = `
          width:22px;height:22px;border-radius:50%;background:#ef4444;
          border:2.5px solid #ffffff;box-shadow:0 0 12px #ef4444;
          display:flex;align-items:center;justify-content:center;
          font-family:monospace;font-size:10px;font-weight:900;color:#fff;
        `;
        el.innerText = sig.arm;
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(sig.lngLat)
          .addTo(map);
        signalMarkersRef.current[sig.arm] = { marker, el };
      });

      // ── Case 03 Waypoint Badges on the Exact Real-Road Intersections ──
      const wps = [
        { id: 'WP1', label: 'WP1: KAMARAJ RD TURN',     lngLat: GOOGLE_ROAD_NODES.J0_BRIGADE, color: '#f59e0b' },
        { id: 'WP2', label: 'WP2: CUBBON RD TURN',      lngLat: GOOGLE_ROAD_NODES.CUBBON_KAM, color: '#38bdf8' },
        { id: 'WP3', label: 'WP3: CENTRAL ST TURN',     lngLat: GOOGLE_ROAD_NODES.CUBBON_CENT, color: '#38bdf8' },
        { id: 'WP4', label: 'WP4: ANIL KUMBLE REJOIN',  lngLat: GOOGLE_ROAD_NODES.ANIL_KUMBLE, color: '#22c55e' },
      ];

      wps.forEach((wp) => {
        const el = document.createElement('div');
        el.style.cssText = `
          background:rgba(2,6,23,0.92);color:${wp.color};border:1.5px solid ${wp.color};
          padding:2px 7px;border-radius:5px;font-family:monospace;font-size:9px;font-weight:800;
          white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.65);pointer-events:none;
        `;
        el.innerText = wp.label;
        const m = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -10] })
          .setLngLat(wp.lngLat)
          .addTo(map);
        waypointMarkersRef.current.push({ marker: m, el });
      });

      // ── Create 2D Top-Down Ambulance Markers ──
      const el1 = create2DAmbulanceElement('AMB-108 (M.G. ROAD)', '#22c55e', '#052e16');
      amb1MarkerRef.current = new maplibregl.Marker({ element: el1, anchor: 'center' })
        .setLngLat(GOOGLE_ROAD_NODES.ANIL_KUMBLE)
        .addTo(map);

      const elA = create2DAmbulanceElement('AMB-A (BRIGADE RD)', '#3b82f6', '#172554');
      ambAMarkerRef.current = new maplibregl.Marker({ element: elA, anchor: 'center' })
        .setLngLat(GOOGLE_ROAD_NODES.BRIGADE_RES)
        .addTo(map);

      const elB = create2DAmbulanceElement('AMB-B (REROUTE)', '#f59e0b', '#451a03');
      ambBMarkerRef.current = new maplibregl.Marker({ element: elB, anchor: 'center' })
        .setLngLat(GOOGLE_ROAD_NODES.MG_CARIAPPA)
        .addTo(map);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Switch Google Maps 2D Tile Layer (Streets / Hybrid / Pure Satellite) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    try {
      map.setLayoutProperty('google-streets-layer', 'visibility', mapStyleMode === 'STREETS' ? 'visible' : 'none');
      map.setLayoutProperty('google-hybrid-layer', 'visibility', mapStyleMode === 'HYBRID' ? 'visible' : 'none');
      map.setLayoutProperty('google-satellite-layer', 'visibility', mapStyleMode === 'SATELLITE' ? 'visible' : 'none');
    } catch (_) {}
  }, [mapStyleMode]);

  // ── Update 2D Traffic Lines, Signal Lights & Road-Snapped 2D Ambulances at 20Hz ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    // 1. Update Dynamic Red-to-Green Traffic Corridor Lines on the Roads
    const trafficSrc = map.getSource('traffic-corridor-lines');
    if (trafficSrc) {
      trafficSrc.setData(buildRoadTrafficLinesGeoJSON(state));
    }

    // 2. Show/Hide Case 03 Waypoint Badges
    waypointMarkersRef.current.forEach(({ el }) => {
      el.style.display = state.selectedCase === 3 ? 'block' : 'none';
    });

    // 3. Update 4-Way Signal Indicators
    const sig = state.signals || {};
    const armStates = {
      N: { green: sig.sGreen, yellow: sig.sYellow },
      S: { green: sig.nGreen, yellow: sig.nYellow },
      E: { green: sig.wGreen, yellow: sig.wYellow },
      W: { green: sig.eGreen, yellow: sig.eYellow },
    };

    Object.entries(armStates).forEach(([arm, st]) => {
      const item = signalMarkersRef.current[arm];
      if (!item) return;
      const col = st.green ? '#22c55e' : st.yellow ? '#facc15' : '#ef4444';
      item.el.style.background = col;
      item.el.style.boxShadow = `0 0 14px ${col}`;
    });

    // 4. Update 2D Ambulance Positions & Exact Road Bearing Rotation
    const set2DRotation = (markerRef, bearingDeg) => {
      const el = markerRef.current?.getElement();
      const rotor = el?.querySelector('.amb-2d-rotor');
      if (rotor) {
        rotor.style.transform = `rotate(${bearingDeg}deg)`;
      }
    };

    if (state.selectedCase === 1) {
      amb1MarkerRef.current.getElement().style.display = 'flex';
      ambAMarkerRef.current.getElement().style.display = 'none';
      ambBMarkerRef.current.getElement().style.display = 'none';

      const lngLat1 = state.case1?.ambulanceLngLat || GOOGLE_ROAD_NODES.ANIL_KUMBLE;
      const bearing1 = state.case1?.ambulanceBearing ?? 104;
      amb1MarkerRef.current.setLngLat(lngLat1);
      set2DRotation(amb1MarkerRef, bearing1);

      if (cameraMode === 'FOLLOW') {
        map.easeTo({ center: lngLat1, zoom: 16.4, pitch: 0, bearing: 0, duration: 120 });
      }
    } else {
      amb1MarkerRef.current.getElement().style.display = 'none';
      ambAMarkerRef.current.getElement().style.display = 'flex';
      ambBMarkerRef.current.getElement().style.display = 'flex';

      const lngLatA = state.case3?.ambulanceA?.lngLat || GOOGLE_ROAD_NODES.BRIGADE_RES;
      const bearingA = state.case3?.ambulanceA?.bearing ?? 15;
      const lngLatB = state.case3?.ambulanceB?.lngLat || GOOGLE_ROAD_NODES.MG_CARIAPPA;
      const bearingB = state.case3?.ambulanceB?.bearing ?? 285;

      ambAMarkerRef.current.setLngLat(lngLatA);
      set2DRotation(ambAMarkerRef, bearingA);

      ambBMarkerRef.current.setLngLat(lngLatB);
      set2DRotation(ambBMarkerRef, bearingB);

      if (cameraMode === 'FOLLOW') {
        const target = activeUnit === 'AMB_A' ? lngLatA : lngLatB;
        map.easeTo({ center: target, zoom: 16.3, pitch: 0, bearing: 0, duration: 120 });
      }
    }
  }, [state, activeUnit, cameraMode]);

  const setViewPreset = (mode) => {
    setCameraMode(mode);
    const map = mapRef.current;
    if (!map) return;
    if (mode === 'JUNCTION') {
      map.flyTo({ center: [ORIGIN_LNG, ORIGIN_LAT], zoom: 16.8, pitch: 0, bearing: 0, duration: 700 });
    } else if (mode === 'OVERVIEW') {
      map.flyTo({ center: [77.6062, 12.9762], zoom: 15.6, pitch: 0, bearing: 0, duration: 700 });
    }
  };

  const isCase1 = state.selectedCase === 1;
  const activeTelemetry = isCase1
    ? {
        name: 'AMB-108 (M.G. Road Priority)',
        status: state.signals?.isPreempted
          ? 'GREEN CORRIDOR ACTIVE'
          : state.case1?.isSimulationRunning
          ? 'APPROACHING RED TRAFFIC LINE'
          : 'STANDBY AT ANIL KUMBLE CIRCLE',
        dist: state.case1?.distanceToJunction ?? 120,
        instruction:
          state.case1?.distanceToJunction > 85
            ? 'Red Traffic Line Ahead on M.G. Road — Approaching Preemption Zone'
            : state.case1?.distanceToJunction > 0
            ? 'Signal Preempted! Red Traffic Line Turned GREEN on M.G. Road'
            : 'Junction Cleared — Sequential Traffic Release Active',
        color: state.signals?.isPreempted ? '#22c55e' : '#38bdf8',
      }
    : activeUnit === 'AMB_A'
    ? {
        name: 'Ambulance A (Brigade Rd -> Kamaraj Rd)',
        status: state.case3?.ambulanceA?.status || 'IDLE_STANDBY',
        dist: Math.round(state.case3?.ambulanceA?.distanceToJunction ?? 90),
        instruction: 'Proceed Straight North on Brigade Rd -> Kamaraj Rd Green Corridor',
        color: '#3b82f6',
      }
    : {
        name: 'Ambulance B (Kamaraj -> Cubbon -> Anil Kumble Detour)',
        status: state.case3?.ambulanceB?.status || 'IDLE_STANDBY',
        dist: Math.round(
          Math.hypot(
            state.case3?.ambulanceB?.position?.x || 0,
            state.case3?.ambulanceB?.position?.z || 0
          )
        ),
        instruction: state.case3?.ambulanceB?.waypointName || 'Awaiting Dispatch on M.G. Road East',
        color: '#f59e0b',
      };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#020617', fontFamily: 'monospace', color: '#f8fafc' }}>
      <style>{`
        @keyframes ambPulse2D {
          0% { transform: scale(0.75); opacity: 0.95; }
          100% { transform: scale(1.85); opacity: 0; }
        }
      `}</style>

      {/* Fullscreen 2D Google Map Container */}
      <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />

      {/* Top Navigation & Case Switcher Bar */}
      <div style={{
        position: 'fixed', top: 16, left: 16, right: 16, zIndex: 30,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
        background: 'rgba(2, 6, 23, 0.92)', border: '1.5px solid #334155', borderRadius: 12,
        padding: '10px 16px', backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.65)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ background: '#1e293b', color: '#cbd5e1', border: '1px solid #475569', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 800, textDecoration: 'none' }}>
            ← 3D TWIN CMD
          </a>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#22c55e', letterSpacing: 1.5 }}>
              🚑 SEMTOS 2D GOOGLE MAPS CORRIDOR COCKPIT
            </div>
            <div style={{ fontSize: 10, color: state.isStandaloneFallback ? '#38bdf8' : '#22c55e' }}>
              {state.isStandaloneFallback
                ? '● STANDALONE 2D ROAD-SNAPPED SIMULATOR (RED -> GREEN TRAFFIC LINES)'
                : '● LIVE 20Hz SYNC WITH 3D TWIN COMMAND CENTER'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => sendCommand('SWITCH_CASE', { caseId: 1 })}
            style={{
              background: isCase1 ? '#22c55e' : '#0f172a',
              color: isCase1 ? '#000' : '#94a3b8',
              border: '1.5px solid #22c55e', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 900, cursor: 'pointer'
            }}
          >
            CASE 01 (M.G. ROAD PREEMPTION)
          </button>
          <button
            onClick={() => sendCommand('SWITCH_CASE', { caseId: 3 })}
            style={{
              background: !isCase1 ? '#f59e0b' : '#0f172a',
              color: !isCase1 ? '#000' : '#94a3b8',
              border: '1.5px solid #f59e0b', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 900, cursor: 'pointer'
            }}
          >
            CASE 03 (DUAL AMB & KAMARAJ–CUBBON DETOUR)
          </button>

          {!isCase1 && (
            <div style={{ display: 'flex', background: '#0f172a', padding: 3, borderRadius: 8, border: '1px solid #334155', gap: 4 }}>
              <button
                onClick={() => setActiveUnit('AMB_B')}
                style={{
                  background: activeUnit === 'AMB_B' ? '#f59e0b' : 'transparent',
                  color: activeUnit === 'AMB_B' ? '#000' : '#94a3b8',
                  border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: 900, cursor: 'pointer'
                }}
              >
                🚑 AMB B (DETOUR)
              </button>
              <button
                onClick={() => setActiveUnit('AMB_A')}
                style={{
                  background: activeUnit === 'AMB_A' ? '#3b82f6' : 'transparent',
                  color: activeUnit === 'AMB_A' ? '#fff' : '#94a3b8',
                  border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: 900, cursor: 'pointer'
                }}
              >
                🚑 AMB A (BRIGADE RD)
              </button>
            </div>
          )}

          <a href="/driver" target="_blank" rel="noopener noreferrer" style={{
            background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid #f59e0b',
            borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 800, textDecoration: 'none'
          }}>
            📱 OPEN PHONE HUD
          </a>
        </div>
      </div>

      {/* Top-Center Turn-by-Turn Navigation Banner */}
      <div style={{
        position: 'fixed', top: 82, left: '50%', transform: 'translateX(-50%)', zIndex: 25,
        background: 'rgba(2, 6, 23, 0.94)', border: `2px solid ${activeTelemetry.color}`,
        borderRadius: 14, padding: '12px 24px', minWidth: 440, textAlign: 'center',
        boxShadow: `0 0 28px ${activeTelemetry.color}44`, backdropFilter: 'blur(12px)'
      }}>
        <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: 2, marginBottom: 4 }}>
          2D ROAD-SNAPPED NAVIGATION • {activeTelemetry.name}
        </div>
        <div style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc', letterSpacing: 0.6 }}>
          {activeTelemetry.instruction}
        </div>
      </div>

      {/* Left Cockpit Telemetry & Dispatch Control Panel */}
      <div style={{
        position: 'fixed', top: 165, left: 16, zIndex: 25, width: 325,
        background: 'rgba(2, 6, 23, 0.93)', border: '1.5px solid #334155', borderRadius: 14,
        padding: 16, backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
        display: 'flex', flexDirection: 'column', gap: 12
      }}>
        <button
          onClick={() => sendCommand('DISPATCH')}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 10, fontWeight: 900, fontSize: 12,
            letterSpacing: 1.4, cursor: 'pointer', border: '1px solid #22c55e',
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: '#020617',
            boxShadow: '0 0 20px rgba(34, 197, 94, 0.45)'
          }}
        >
          ▶ DISPATCH AMBULANCE [ENTER]
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 9, color: '#64748b' }}>DIST TO SIGNAL</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#38bdf8' }}>{activeTelemetry.dist} m</div>
          </div>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 9, color: '#64748b' }}>ROAD LINE STATUS</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: state.signals?.isPreempted ? '#22c55e' : '#ef4444', marginTop: 4 }}>
              {state.signals?.isPreempted ? '🟢 GREEN WAVE' : '🔴 RED TRAFFIC'}
            </div>
          </div>
        </div>

        {/* 4-Way Signal Matrix */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginBottom: 8 }}>
            <span>M.G. & BRIGADE RD SIGNALS</span>
            <strong style={{ color: '#38bdf8' }}>{state.signals?.signalPhase}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
            {[
              { label: 'NORTH (KAMARAJ)', green: state.signals?.sGreen, yellow: state.signals?.sYellow },
              { label: 'SOUTH (BRIGADE)', green: state.signals?.nGreen, yellow: state.signals?.nYellow },
              { label: 'EAST (M.G. RD)',  green: state.signals?.wGreen, yellow: state.signals?.wYellow },
              { label: 'WEST (M.G. RD)',  green: state.signals?.eGreen, yellow: state.signals?.eYellow },
            ].map((a) => (
              <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{a.green ? '🟢' : a.yellow ? '🟡' : '🔴'}</span>
                <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: 10 }}>{a.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Case 03 5-Leg Real-Road Detour Progress */}
        {!isCase1 && (
          <div style={{ background: '#0f172a', border: '1px solid #f59e0b55', borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 9, color: '#f59e0b', fontWeight: 800, marginBottom: 6 }}>
              AMB-B REAL-ROAD DETOUR (KAMARAJ → CUBBON → ANIL KUMBLE)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {[
                { id: 1, label: 'WP1: Kamaraj Rd' },
                { id: 2, label: 'WP2: Cubbon Rd' },
                { id: 3, label: 'WP3: Central St' },
                { id: 4, label: 'WP4: Anil Kumble' },
              ].map((wp) => {
                const cur = state.case3?.ambulanceB?.currentWaypointIdx ?? 0;
                const done = cur > wp.id;
                const active = cur === wp.id;
                return (
                  <div key={wp.id} style={{
                    padding: '4px 6px', borderRadius: 6, fontSize: 9, fontWeight: 800, textAlign: 'center',
                    background: done ? '#22c55e' : active ? '#f59e0b' : '#1e293b',
                    color: done || active ? '#000' : '#64748b'
                  }}>
                    {wp.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10, color: '#cbd5e1', borderTop: '1px solid #1e293b', paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 22, height: 5, borderRadius: 3, background: '#ef4444', display: 'inline-block', boxShadow: '0 0 8px #ef4444' }} />
            <span>Red Road Line = Traffic Queue / Red Signal</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 22, height: 5, borderRadius: 3, background: '#22c55e', display: 'inline-block', boxShadow: '0 0 8px #22c55e' }} />
            <span>Green Road Line = Ambulance Preempted Green Wave</span>
          </div>
        </div>
      </div>

      {/* Bottom Camera & 2D Map Layer Controls */}
      <div style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 25,
        background: 'rgba(2, 6, 23, 0.94)', border: '1.5px solid #334155', borderRadius: 12,
        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.7)'
      }}>
        <span style={{ fontSize: 10, color: '#64748b', marginRight: 2 }}>2D VIEW:</span>
        {[
          { id: 'OVERVIEW', label: '🗺️ CORRIDOR OVERVIEW' },
          { id: 'FOLLOW',   label: '🎯 FOLLOW AMBULANCE' },
          { id: 'JUNCTION', label: '🚦 BRIGADE RD SIGNAL' },
          { id: 'FREE',     label: '🖐️ FREE PAN' },
        ].map((cam) => (
          <button
            key={cam.id}
            onClick={() => setViewPreset(cam.id)}
            style={{
              background: cameraMode === cam.id ? '#38bdf8' : '#0f172a',
              color: cameraMode === cam.id ? '#020617' : '#cbd5e1',
              border: '1px solid #334155', borderRadius: 8, padding: '6px 10px',
              fontSize: 10, fontWeight: 900, cursor: 'pointer'
            }}
          >
            {cam.label}
          </button>
        ))}

        <span style={{ color: '#334155', margin: '0 2px' }}>|</span>
        <span style={{ fontSize: 10, color: '#64748b' }}>GOOGLE 2D MAP:</span>
        {[
          { id: 'STREETS',   label: '🗺️ GOOGLE 2D STREETS' },
          { id: 'HYBRID',    label: '🛰️ GOOGLE SATELLITE + ROADS' },
          { id: 'SATELLITE', label: '🌍 PURE SATELLITE' },
        ].map((st) => (
          <button
            key={st.id}
            onClick={() => setMapStyleMode(st.id)}
            style={{
              background: mapStyleMode === st.id ? '#22c55e' : '#0f172a',
              color: mapStyleMode === st.id ? '#020617' : '#cbd5e1',
              border: '1px solid #334155', borderRadius: 8, padding: '6px 10px',
              fontSize: 10, fontWeight: 900, cursor: 'pointer'
            }}
          >
            {st.label}
          </button>
        ))}
      </div>
    </div>
  );
}
