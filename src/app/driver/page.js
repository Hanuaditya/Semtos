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
  twinToRoadGeo,
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
    id: 'BRIGADE_APPROACH',
    label: '🚗 Phone 1: Brigade Rd (In Front of Amb A)',
    roadName: 'Brigade Road (South Approach)',
    corridorId: 'BRIGADE_ROAD',
    laneSide: 'Northbound Lane (toward J0 Signal)',
    lngLat: GOOGLE_ROAD_NODES.BRIGADE_CHUR,
    stationZ: 22.0,
    yieldSide: 'PULL LEFT ON BRIGADE RD — CLEAR AMB-A CORRIDOR',
  },
  {
    id: 'KAMARAJ_NORTH',
    label: '🚗 Phone 2: North Lane (Kamaraj Rd — Non-Conflicting)',
    roadName: 'Kamaraj Road (North Approach)',
    corridorId: 'NORTH_LANE',
    laneSide: 'Southbound Lane (toward J0 Signal)',
    lngLat: GOOGLE_ROAD_NODES.KAMARAJ_M,
    stationZ: -70.0,
    yieldSide: 'MAINTAIN LANE — NORTH LANE CLEAR',
  },
  {
    id: 'MG_METRO',
    label: '🚗 Commuter on M.G. Road (Case 01 AMB-108 Corridor)',
    roadName: 'Mahatma Gandhi Road',
    corridorId: 'MG_ROAD',
    laneSide: 'Eastbound Lane (toward Trinity)',
    lngLat: GOOGLE_ROAD_NODES.MG_METRO,
    stationX: -20.0,
    yieldSide: 'PULL LEFT TOWARD CURB — CLEAR M.G. ROAD LANE',
  },
  {
    id: 'CUBBON_DETOUR',
    label: '🚗 Commuter on Cubbon Road (Case 03 AMB-B Detour)',
    roadName: 'Cubbon Road Detour',
    corridorId: 'CUBBON_ROAD',
    laneSide: 'Westbound Lane (toward Central St)',
    lngLat: GOOGLE_ROAD_NODES.CUBBON_VEER,
    stationX: 5.0,
    yieldSide: 'YIELD ON CUBBON RD — AMB-B MACRO-DETOUR ACTIVE',
  },
];

export default function CivilianDriverPhoneHUD() {
  const { state, sendCommand } = useV2XReceiver();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const driverMarkerRef = useRef(null);
  const ambMarkerARef = useRef(null);
  const ambMarkerBRef = useRef(null);

  const [presetIdx, setPresetIdx] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const lastSpokenAlertRef = useRef(false);

  const activePreset = DRIVER_PRESETS[presetIdx] || DRIVER_PRESETS[0];

  // ── Determine active emergency vehicle telemetry & corridor conflict ──
  const evalEmergency = () => {
    let isEmergencyNear = false;
    let distanceMeters = 0;
    let conflictAmbulance = null;
    let statusBadge = '🟢 NORMAL NAVIGATION (2D GOOGLE MAPS)';
    let bannerTitle = 'Road Clear — Monitoring BLE & V2X Beacons';
    let subBanner = 'No active emergency vehicles detected in your corridor.';
    let distancePill = 'STANDBY';
    let isConflictingSafe = true;
    let hasPassed = false;

    // Geo coordinates for ambulances
    let geoA = null;
    let geoB = null;

    if (state.selectedCase === 1) {
      const p1 = state.case1?.ambulancePosition || { x: -120, z: -6.0 };
      const geo1 = twinToRoadGeo(p1.x, p1.z, { ambId: 'AMB_1' });
      geoA = geo1;
      const isRunning = Boolean(state.case1?.isSimulationRunning);
      const dist = Math.round(haversineMeters(activePreset.lngLat, geo1.lngLat));
      distanceMeters = dist;

      conflictAmbulance = {
        id: 'AMB-108',
        name: 'Ambulance 108 (M.G. Road)',
        lngLat: geo1.lngLat,
        running: isRunning,
      };

      if (isRunning) {
        if (activePreset.corridorId === 'MG_ROAD') {
          const ambX = p1.x;
          if (ambX <= -15 && dist <= 260) {
            isEmergencyNear = true;
            isConflictingSafe = false;
            statusBadge = '🚨 BLE + V2X EMERGENCY ALERT';
            bannerTitle = `⬅️ ${activePreset.yieldSide}`;
            subBanner = `Ambulance 108 approaching ${dist}m behind you on M.G. Road!`;
            distancePill = `${dist}m BEHIND YOU`;
          } else if (ambX > -15) {
            hasPassed = true;
            statusBadge = '🟢 AMBULANCE PASSED — SAFE TO RESUME';
            bannerTitle = 'Ambulance 108 Cleared Your Location';
            subBanner = 'Emergency vehicle has overtaken. Safe to resume regular lane flow.';
            distancePill = `PASSED (${dist}m AHEAD)`;
          } else {
            statusBadge = '🟢 AMBULANCE 108 EN ROUTE';
            bannerTitle = 'Emergency Vehicle Inbound';
            subBanner = `Ambulance 108 is ${dist}m west on M.G. Road.`;
            distancePill = `${dist}m WEST`;
          }
        } else {
          isEmergencyNear = false;
          statusBadge = '🟢 ROUTE CLEAR • NO CONFLICT IN YOUR LANE';
          bannerTitle = 'Your Lane Clear — Maintain Normal Traffic Flow';
          subBanner = `Ambulance 108 is on M.G. Road (${dist}m away). Your route has no conflict.`;
          distancePill = `NO CONFLICT • ${dist}m`;
        }
      }
    } else {
      // ══════════════════════════════════════════════════════════════════════
      // CASE 03: DUAL-AMBULANCE CONFLICT & LANE-AWARE FILTERING
      // ══════════════════════════════════════════════════════════════════════
      const pA = state.case3?.ambulanceA?.position || { x: 2.2, z: 90 };
      geoA = twinToRoadGeo(pA.x, pA.z, { ambId: 'AMB_A' });

      const pB = state.case3?.ambulanceB?.position || { x: 90, z: -2.89 };
      const wpB = state.case3?.ambulanceB?.currentWaypointIdx ?? 0;
      geoB = twinToRoadGeo(pB.x, pB.z, { ambId: 'AMB_B', wpIdx: wpB });

      const isRunning = Boolean(state.case3?.isSimulationRunning && !state.case3?.trafficCycleActive);
      const distA = Math.round(haversineMeters(activePreset.lngLat, geoA.lngLat));
      const distB = Math.round(haversineMeters(activePreset.lngLat, geoB.lngLat));

      if (distA <= distB) {
        conflictAmbulance = {
          id: 'AMB-A',
          name: 'Ambulance A (Brigade Rd Priority)',
          lngLat: geoA.lngLat,
          running: isRunning,
        };
        distanceMeters = distA;
      } else {
        conflictAmbulance = {
          id: 'AMB-B',
          name: 'Ambulance B (Kamaraj–Cubbon Detour)',
          lngLat: geoB.lngLat,
          running: isRunning,
        };
        distanceMeters = distB;
      }

      if (isRunning) {
        // ── 1. Phone 1: Brigade Road South Approach (In Front of Amb A) ──
        if (activePreset.corridorId === 'BRIGADE_ROAD') {
          const ambZ = pA.z;
          if (ambZ > 15.0 && distA <= 260) {
            isEmergencyNear = true;
            isConflictingSafe = false;
            distanceMeters = distA;
            conflictAmbulance = {
              id: 'AMB-A',
              name: 'Ambulance A (Brigade Rd Priority)',
              lngLat: geoA.lngLat,
              running: true,
            };
            statusBadge = '🚨 BLE + V2X EMERGENCY ALERT';
            bannerTitle = `⬅️ ${activePreset.yieldSide}`;
            subBanner = `Ambulance A approaching ${distA}m behind you on Brigade Road!`;
            distancePill = `${distA}m BEHIND YOU`;
          } else if (ambZ <= 15.0) {
            hasPassed = true;
            statusBadge = '🟢 AMBULANCE A PASSED — SAFE TO RESUME';
            bannerTitle = 'Ambulance A Cleared Your Location';
            subBanner = 'Ambulance A entered junction. Safe to resume regular lane flow.';
            distancePill = `PASSED (${distA}m AHEAD)`;
          } else {
            statusBadge = '🟢 STANDBY • MONITORING AMB-A';
            bannerTitle = 'Brigade Road Corridor Active';
            subBanner = `Ambulance A stationed at Residency Rd (${distA}m south).`;
            distancePill = `${distA}m SOUTH`;
          }
        }
        // ── 2. Phone 2: North Lane (Kamaraj Rd North Approach) ──
        else if (activePreset.corridorId === 'NORTH_LANE') {
          // Ambulance A is on Brigade Road (South Approach) heading towards J0.
          // North lane commuter is on the opposite approach / non-conflicting carriageway!
          isEmergencyNear = false;
          isConflictingSafe = true;
          distanceMeters = distA;
          statusBadge = '🟢 ROUTE CLEAR • NO CONFLICT IN YOUR LANE';
          bannerTitle = 'Your Lane Clear — Maintain Normal Traffic Flow';
          subBanner = `Ambulance A is on South Approach (Brigade Rd, ${distA}m away). North lane has NO conflict.`;
          distancePill = `NO CONFLICT • ${distA}m`;
        }
        // ── 3. Commuter on Cubbon Road Detour (Case 03 Amb B) ──
        else if (activePreset.corridorId === 'CUBBON_ROAD') {
          if (wpB === 2 && pB.x > 0.0 && distB <= 260) {
            isEmergencyNear = true;
            isConflictingSafe = false;
            distanceMeters = distB;
            conflictAmbulance = {
              id: 'AMB-B',
              name: 'Ambulance B (Cubbon Detour)',
              lngLat: geoB.lngLat,
              running: true,
            };
            statusBadge = '🚨 BLE + V2X DETOUR ALERT';
            bannerTitle = `⬅️ ${activePreset.yieldSide}`;
            subBanner = `Ambulance B rerouting through Cubbon Rd (${distB}m behind you)!`;
            distancePill = `${distB}m BEHIND YOU`;
          } else if (wpB >= 3 || (wpB === 2 && pB.x <= 0.0)) {
            hasPassed = true;
            statusBadge = '🟢 AMBULANCE B PASSED';
            bannerTitle = 'Ambulance B Cleared Cubbon Road';
            subBanner = 'Macro-detour vehicle past your waypoint. Normal traffic resumed.';
            distancePill = `PASSED (${distB}m AHEAD)`;
          } else {
            statusBadge = '🟢 ROUTE CLEAR • NO CONFLICT IN YOUR LANE';
            bannerTitle = 'Your Lane Clear — Maintain Normal Traffic Flow';
            subBanner = `Ambulance B is on M.G. Road East Approach (${distB}m away).`;
            distancePill = `NO CONFLICT • ${distB}m`;
          }
        }
        // ── 4. Commuter on M.G. Road (Case 03 Gridlock Corridor) ──
        else {
          isEmergencyNear = false;
          isConflictingSafe = true;
          distanceMeters = distA;
          statusBadge = '🟢 ROUTE CLEAR • NO CONFLICT IN YOUR LANE';
          bannerTitle = 'Your Lane Clear — Maintain Normal Traffic Flow';
          subBanner = `Ambulance A is on South Approach (Brigade Rd, ${distA}m away). M.G. Road is unaffected.`;
          distancePill = `NO CONFLICT • ${distA}m`;
        }
      }
    }

    return {
      isEmergencyNear,
      distanceMeters,
      conflictAmbulance,
      statusBadge,
      bannerTitle,
      subBanner,
      distancePill,
      isConflictingSafe,
      hasPassed,
      geoA,
      geoB,
    };
  };

  const evalResult = evalEmergency();
  const {
    isEmergencyNear,
    distanceMeters,
    conflictAmbulance,
    statusBadge,
    bannerTitle,
    subBanner,
    distancePill,
    isConflictingSafe,
    geoA,
    geoB,
  } = evalResult;

  useEffect(() => {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isEmergencyNear && !lastSpokenAlertRef.current) {
      lastSpokenAlertRef.current = true;
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(
          `Emergency Alert! ${conflictAmbulance?.name || 'Emergency Vehicle'} approaching ${distanceMeters} meters behind you. ${activePreset.yieldSide}.`
        );
        utter.rate = 1.05;
        window.speechSynthesis.speak(utter);
      } catch (_) {}
    } else if (!isEmergencyNear) {
      lastSpokenAlertRef.current = false;
    }
  }, [isEmergencyNear, distanceMeters, conflictAmbulance?.name, activePreset.yieldSide, voiceEnabled]);

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
        width:32px;height:32px;border-radius:50%;background:#3b82f6;
        border:3px solid #fff;box-shadow:0 0 18px #3b82f6;
        display:flex;align-items:center;justify-content:center;font-size:15px;
      `;
      drvEl.innerText = '🚗';
      driverMarkerRef.current = new maplibregl.Marker({ element: drvEl, anchor: 'center' })
        .setLngLat(activePreset.lngLat)
        .addTo(map);

      // Primary Ambulance A Marker (Red)
      const ambAEl = document.createElement('div');
      ambAEl.style.cssText = `
        width:36px;height:36px;border-radius:50%;background:#ef4444;
        border:3px solid #fff;box-shadow:0 0 22px #ef4444;
        display:flex;align-items:center;justify-content:center;font-size:16px;
      `;
      ambAEl.innerText = '🚑';
      ambMarkerARef.current = new maplibregl.Marker({ element: ambAEl, anchor: 'center' })
        .setLngLat(geoA?.lngLat || activePreset.lngLat)
        .addTo(map);

      // Ambulance B Marker (Amber - Case 03 Detour)
      const ambBEl = document.createElement('div');
      ambBEl.style.cssText = `
        width:32px;height:32px;border-radius:50%;background:#f59e0b;
        border:3px solid #fff;box-shadow:0 0 20px #f59e0b;
        display:none;align-items:center;justify-content:center;font-size:14px;
      `;
      ambBEl.innerText = '🚑';
      ambMarkerBRef.current = new maplibregl.Marker({ element: ambBEl, anchor: 'center' })
        .setLngLat(geoB?.lngLat || activePreset.lngLat)
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
    if (geoA?.lngLat) {
      ambMarkerARef.current?.setLngLat(geoA.lngLat);
    }
    if (geoB?.lngLat && state.selectedCase === 3) {
      if (ambMarkerBRef.current) {
        ambMarkerBRef.current.getElement().style.display = 'flex';
        ambMarkerBRef.current.setLngLat(geoB.lngLat);
      }
    } else if (ambMarkerBRef.current) {
      ambMarkerBRef.current.getElement().style.display = 'none';
    }

    const src = map.getSource('driver-traffic-lines');
    if (src) src.setData(buildRoadTrafficLinesGeoJSON(state));
  }, [state, activePreset, geoA?.lngLat, geoB?.lngLat]);

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
        border: `3px solid ${isEmergencyNear ? '#ef4444' : isConflictingSafe ? '#10b981' : '#334155'}`,
        borderRadius: 32, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: isEmergencyNear
          ? '0 0 50px rgba(239, 68, 68, 0.65)'
          : isConflictingSafe
          ? '0 0 35px rgba(16, 185, 129, 0.35)'
          : '0 20px 50px rgba(0,0,0,0.8)',
        position: 'relative',
        transition: 'all 0.3s ease'
      }}>
        {/* Top Alert Banner */}
        <div style={{
          padding: '16px 18px',
          background: isEmergencyNear
            ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
            : isConflictingSafe
            ? 'linear-gradient(135deg, #064e3b 0%, #0f172a 100%)'
            : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderBottom: `2px solid ${isEmergencyNear ? '#ef4444' : isConflictingSafe ? '#10b981' : '#334155'}`,
          zIndex: 10,
          transition: 'all 0.3s ease'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: 1.5,
              color: isEmergencyNear ? '#fef08a' : isConflictingSafe ? '#4ade80' : '#22c55e'
            }}>
              {statusBadge}
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 900,
              background: isEmergencyNear ? 'rgba(0,0,0,0.45)' : 'rgba(16, 185, 129, 0.2)',
              color: isEmergencyNear ? '#fff' : '#4ade80',
              padding: '2px 8px',
              borderRadius: 12,
              border: `1px solid ${isEmergencyNear ? '#f87171' : '#10b981'}`
            }}>
              {distancePill}
            </span>
          </div>

          <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1.25 }}>
            {bannerTitle}
          </div>
          <div style={{ fontSize: 11, color: isEmergencyNear ? '#fee2e2' : '#94a3b8', marginTop: 4, fontWeight: 600 }}>
            {subBanner}
          </div>
        </div>

        {/* 2D Google Map View */}
        <div style={{ flex: 1, position: 'relative' }}>
          <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />
        </div>

        {/* Bottom Controls */}
        <div style={{ padding: 14, background: '#020617', borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Lane & Road Info Badge */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#0f172a', padding: '6px 10px', borderRadius: 8, border: '1px solid #1e293b', fontSize: 10
          }}>
            <span style={{ color: '#64748b', fontWeight: 800 }}>ACTIVE COMMUTER POSITION:</span>
            <span style={{ color: isEmergencyNear ? '#f87171' : '#38bdf8', fontWeight: 800 }}>
              {activePreset.roadName}
            </span>
          </div>

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
