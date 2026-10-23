// src/app/driver/page.js
"use client";

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  useV2XSubscriber,
  twinToRoadGeo,
  buildTwinRoadGeoJSON,
  build3DVehiclesGeoJSON,
  buildBengaluru3DBuildingsGeoJSON,
  ORIGIN_LNG,
  ORIGIN_LAT,
} from '../../../hooks/useV2XSync';

const GOOGLE_API_KEY =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    ? `&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
    : '';

const DRIVER_GOOGLE_STYLE = {
  version: 8,
  sources: {
    'google-hybrid': {
      type: 'raster',
      tiles: [
        `https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}${GOOGLE_API_KEY}`,
        `https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}${GOOGLE_API_KEY}`,
      ],
      tileSize: 256,
      maxzoom: 20,
    },
    openfreemap: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
    },
  },
  layers: [
    {
      id: 'google-hybrid-layer',
      type: 'raster',
      source: 'google-hybrid',
      paint: { 'raster-contrast': 0.08, 'raster-brightness-max': 0.95 },
    },
  ],
};

export default function PhoneUserCommuterDashboard() {
  const { snapshot, isLiveTwinConnected, sendCommand } = useV2XSubscriber();

  const [selectedCarId, setSelectedCarId] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const lastSpokenRef = useRef('');

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapReadyRef = useRef(false);
  const markersRef = useRef(new Map());

  const selectedCase = snapshot.selectedCase || 1;
  const vehicles = useMemo(() => snapshot.vehicles || [], [snapshot.vehicles]);

  const activeCar = useMemo(() => {
    if (!vehicles.length) return null;
    if (selectedCarId !== null) {
      const found = vehicles.find((v) => v.id === selectedCarId);
      if (found) return found;
    }
    const yieldingCar = vehicles.find((v) => v.receivesBLE || v.state === 'YIELDING');
    if (yieldingCar) return yieldingCar;
    if (selectedCase === 3) {
      return vehicles.find((v) => v.type === 'N') || vehicles[0];
    }
    return vehicles.find((v) => v.type === 'E') || vehicles[0];
  }, [vehicles, selectedCarId, selectedCase]);

  const alertInfo = useMemo(() => {
    if (!activeCar) {
      return {
        level: 'CLEAR',
        bannerTitle: 'NORMAL COMMUTE FLOW',
        actionText: 'PROCEED IN CURRENT LANE',
        subText: 'No emergency vehicles within 50m V2X BLE range.',
        distMeters: 999,
        pullDir: 'NONE',
      };
    }

    let ambX = snapshot.ambulancePosition?.x ?? -120;
    let ambZ = snapshot.ambulancePosition?.z ?? -6;
    let ambName = 'AMB-108 (M.G. Road)';

    if (selectedCase === 3) {
      const dA = Math.hypot(
        activeCar.x - (snapshot.ambulanceA?.position?.x ?? 2.2),
        activeCar.z - (snapshot.ambulanceA?.position?.z ?? 90)
      );
      const dB = Math.hypot(
        activeCar.x - (snapshot.ambulanceB?.position?.x ?? 90),
        activeCar.z - (snapshot.ambulanceB?.position?.z ?? -2.89)
      );
      if (dA <= dB) {
        ambX = snapshot.ambulanceA?.position?.x ?? 2.2;
        ambZ = snapshot.ambulanceA?.position?.z ?? 90;
        ambName = 'Ambulance A (Brigade Rd Priority)';
      } else {
        ambX = snapshot.ambulanceB?.position?.x ?? 90;
        ambZ = snapshot.ambulanceB?.position?.z ?? -2.89;
        ambName = 'Ambulance B (Cubbon Rd Detour)';
      }
    }

    const dist = Math.round(Math.hypot(activeCar.x - ambX, activeCar.z - ambZ));
    const isEastBlockade =
      selectedCase === 3 && activeCar.type === 'W' && activeCar.x >= 10 && activeCar.x <= 44;

    if (isEastBlockade && snapshot.deadlockDetected) {
      return {
        level: 'DIVERTED',
        bannerTitle: 'AI DETOUR ACTIVE ON CUBBON RD',
        actionText: 'HOLD POSITION IN EAST APPROACH QUEUE',
        subText: 'Ambulance B has been rerouted via Cubbon Road North Block.',
        distMeters: dist,
        pullDir: 'HOLD',
        ambName,
      };
    }

    if (activeCar.receivesBLE || activeCar.state === 'YIELDING') {
      const isLeftYield =
        activeCar.type === 'N'
          ? activeCar.x < 2.2
          : activeCar.type === 'E'
          ? activeCar.z < -6.0
          : true;

      return {
        level: 'EMERGENCY_YIELD',
        bannerTitle: `🚨 ${ambName.toUpperCase()} APPROACHING`,
        actionText: isLeftYield ? '⬅️ PULL OVER TO LEFT CURB NOW' : '➡️ PULL OVER TO RIGHT LANE NOW',
        subText: `Emergency BLE packet locked (${dist}m behind you). Clear the emergency lane immediately.`,
        distMeters: dist,
        pullDir: isLeftYield ? 'LEFT' : 'RIGHT',
        ambName,
      };
    }

    return {
      level: 'CLEAR',
      bannerTitle: 'GREEN CORRIDOR STANDBY',
      actionText: activeCar.speed > 0.4 ? 'PROCEED WITH CAUTION' : 'STOPPED AT RED SIGNAL',
      subText: `Nearest Ambulance (${ambName}): ${dist}m away.`,
      distMeters: dist,
      pullDir: 'NONE',
      ambName,
    };
  }, [activeCar, snapshot, selectedCase]);

  useEffect(() => {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (alertInfo.level === 'EMERGENCY_YIELD') {
      const text = `Emergency ambulance approaching ${alertInfo.distMeters} meters behind. ${alertInfo.actionText.replace(/[^a-zA-Z0-9 ]/g, '')}`;
      if (lastSpokenRef.current !== alertInfo.actionText) {
        lastSpokenRef.current = alertInfo.actionText;
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.08;
        window.speechSynthesis.speak(utter);
      }
    } else {
      lastSpokenRef.current = '';
    }
  }, [alertInfo, voiceEnabled]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: DRIVER_GOOGLE_STYLE,
      center: [ORIGIN_LNG, ORIGIN_LAT],
      zoom: 17.5,
      pitch: 56,
      bearing: -25,
      attributionControl: false,
    });

    map.on('load', () => {
      mapReadyRef.current = true;
      const geo = buildTwinRoadGeoJSON(1, false);
      map.addSource('driver-road-lines', { type: 'geojson', data: geo.lines });
      map.addLayer({
        id: 'driver-road-casing',
        type: 'line',
        source: 'driver-road-lines',
        paint: {
          'line-color': '#38bdf8',
          'line-width': 4,
          'line-opacity': 0.75,
        },
      });

      map.addSource('driver-3d-buildings', {
        type: 'geojson',
        data: buildBengaluru3DBuildingsGeoJSON(),
      });
      map.addLayer({
        id: 'driver-3d-buildings-layer',
        type: 'fill-extrusion',
        source: 'driver-3d-buildings',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.72,
        },
      });

      map.addSource('driver-3d-vehicles', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'driver-3d-vehicles-layer',
        type: 'fill-extrusion',
        source: 'driver-3d-vehicles',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.95,
        },
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const geo = buildTwinRoadGeoJSON(selectedCase, Boolean(snapshot.ambulanceB?.detourActive));
    map.getSource('driver-road-lines')?.setData(geo.lines);

    const activeAmbUnits = [];
    if (selectedCase === 1 && snapshot.ambulancePosition) {
      const r1 = twinToRoadGeo(snapshot.ambulancePosition.x, snapshot.ambulancePosition.z, {
        isAmbulance: true,
        ambId: 'AMB_1',
      });
      activeAmbUnits.push({ id: 'AMB_1', lngLat: r1.lngLat, bearing: r1.bearing, color: '#ef4444' });
    } else if (selectedCase === 3) {
      if (snapshot.ambulanceA?.position) {
        const rA = twinToRoadGeo(snapshot.ambulanceA.position.x, snapshot.ambulanceA.position.z, {
          isAmbulance: true,
          ambId: 'AMB_A',
        });
        activeAmbUnits.push({ id: 'AMB_A', lngLat: rA.lngLat, bearing: rA.bearing, color: '#3b82f6' });
      }
      if (snapshot.ambulanceB?.position) {
        const rB = twinToRoadGeo(snapshot.ambulanceB.position.x, snapshot.ambulanceB.position.z, {
          isAmbulance: true,
          ambId: 'AMB_B',
          wpIdx: snapshot.ambulanceB.currentWaypointIdx || 0,
        });
        activeAmbUnits.push({ id: 'AMB_B', lngLat: rB.lngLat, bearing: rB.bearing, color: '#f59e0b' });
      }
    }

    map.getSource('driver-3d-vehicles')?.setData(
      build3DVehiclesGeoJSON(vehicles, activeAmbUnits, selectedCase)
    );

    if (activeCar) {
      const snappedCar = twinToRoadGeo(activeCar.x, activeCar.z, {
        carType: activeCar.type,
        rotY: activeCar.rotY,
        isAmbulance: false,
      });

      let m = markersRef.current.get('MY_CAR');
      if (!m) {
        const el = document.createElement('div');
        m = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(snappedCar.lngLat)
          .addTo(map);
        markersRef.current.set('MY_CAR', m);
      } else {
        m.setLngLat(snappedCar.lngLat);
      }

      m.getElement().innerHTML = `
        <div style="
          padding: 2px 6px;
          border-radius: 999px;
          background: #10b981;
          border: 2px solid #fff;
          color: #020617;
          font-family: monospace;
          font-size: 9px;
          font-weight: 900;
          box-shadow: 0 0 14px #10b981;
          white-space: nowrap;
        ">YOU (#${activeCar.id})</div>
      `;

      map.easeTo({
        center: snappedCar.lngLat,
        zoom: 17.6,
        pitch: 58,
        bearing: snappedCar.bearing,
        duration: 220,
      });
    }
  }, [snapshot, activeCar, selectedCase, vehicles]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-3 font-sans select-none">
      {/* TOP BAR */}
      <div className="w-full max-w-md flex items-center justify-between bg-slate-900/90 border border-slate-800 px-3.5 py-2.5 rounded-2xl">
        <div className="flex items-center gap-2">
          <a
            href="/ambulance"
            className="px-2 py-1 rounded bg-slate-800 text-[10px] font-mono text-slate-300"
          >
            ← SATELLITE COCKPIT
          </a>
          <span className="text-xs font-black font-mono text-emerald-400">
            📱 V2X COMMUTER HUD
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          {isLiveTwinConnected ? '● 3D TWIN SYNC' : '● GOOGLE MAPS 3D SIM'}
        </span>
      </div>

      {/* MAIN PHONE CARD */}
      <div className="w-full max-w-md my-2 flex-1 flex flex-col justify-between bg-slate-900/90 border border-slate-800 rounded-3xl p-4 shadow-2xl space-y-3">
        {/* CASE & VEHICLE SELECTOR */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <button
              onClick={() => sendCommand('SET_CASE', { caseNumber: 1 })}
              className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold ${
                selectedCase === 1 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}
            >
              CASE 01
            </button>
            <button
              onClick={() => sendCommand('SET_CASE', { caseNumber: 3 })}
              className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold ${
                selectedCase === 3 ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}
            >
              CASE 03
            </button>
          </div>

          <select
            value={activeCar?.id || ''}
            onChange={(e) => setSelectedCarId(Number(e.target.value))}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-200"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                Car #{v.id} ({v.type} Approach) {v.receivesBLE ? '🚨 BLE' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* GIANT ALERT BANNER */}
        <div
          className={`rounded-2xl p-4 border-2 text-center transition-all ${
            alertInfo.level === 'EMERGENCY_YIELD'
              ? 'bg-red-950/90 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.35)] animate-pulse'
              : alertInfo.level === 'DIVERTED'
              ? 'bg-amber-950/90 border-amber-400'
              : 'bg-slate-950/90 border-slate-800'
          }`}
        >
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-300">
            {alertInfo.bannerTitle}
          </div>
          <div className="text-xl font-black tracking-wide text-white mt-1">
            {alertInfo.actionText}
          </div>
          <div className="text-xs text-slate-300 mt-1">{alertInfo.subText}</div>
        </div>

        {/* LIVE GOOGLE MAPS 3D MINI-MAP */}
        <div className="relative w-full h-64 rounded-2xl overflow-hidden border border-slate-800">
          <div ref={mapContainerRef} className="w-full h-full" />
          <div className="absolute top-2 left-2 bg-slate-950/85 px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-300">
            Car #{activeCar?.id || 1} • Road-Snapped 3D View
          </div>
        </div>

        {/* ACTION BAR */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={() => sendCommand('DISPATCH')}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-black text-xs"
          >
            ▶ DISPATCH EMERGENCY
          </button>
          <button
            onClick={() => setVoiceEnabled((v) => !v)}
            className={`px-3 py-2.5 rounded-xl font-mono text-xs font-bold border ${
              voiceEnabled
                ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {voiceEnabled ? '🔊 TTS ON' : '🔇 TTS OFF'}
          </button>
        </div>
      </div>
    </div>
  );
}
