// src/app/ambulance/page.js
"use client";

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  useV2XSubscriber,
  twinToRoadGeo,
  buildTwinRoadGeoJSON,
  GOOGLE_ROAD_NODES,
  ORIGIN_LNG,
  ORIGIN_LAT,
} from '../../../hooks/useV2XSync';

// ── Google Maps Free Tile Servers (Hybrid Satellite + Labels, Pure Satellite, Street Roadmap) ──
// Zero "API KEY REQUIRED" watermarks; supports optional NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const GOOGLE_API_KEY =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    ? `&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
    : '';

const GOOGLE_MAPS_STYLE = {
  version: 8,
  sources: {
    'google-hybrid': {
      type: 'raster',
      tiles: [
        `https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}${GOOGLE_API_KEY}`,
        `https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}${GOOGLE_API_KEY}`,
        `https://mt2.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}${GOOGLE_API_KEY}`,
        `https://mt3.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}${GOOGLE_API_KEY}`,
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: 'Google Maps Satellite Hybrid',
    },
    'google-satellite': {
      type: 'raster',
      tiles: [
        `https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}${GOOGLE_API_KEY}`,
        `https://mt1.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}${GOOGLE_API_KEY}`,
      ],
      tileSize: 256,
      maxzoom: 20,
    },
    'google-roadmap': {
      type: 'raster',
      tiles: [
        `https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}${GOOGLE_API_KEY}`,
        `https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}${GOOGLE_API_KEY}`,
      ],
      tileSize: 256,
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'google-roadmap-layer',
      type: 'raster',
      source: 'google-roadmap',
      layout: { visibility: 'none' },
    },
    {
      id: 'google-satellite-layer',
      type: 'raster',
      source: 'google-satellite',
      layout: { visibility: 'none' },
    },
    {
      id: 'google-hybrid-layer',
      type: 'raster',
      source: 'google-hybrid',
      paint: {
        'raster-contrast': 0.08,
        'raster-brightness-max': 0.96,
      },
    },
  ],
};

function createGeoCircle(centerLngLat, radiusMeters, points = 48) {
  const [lng, lat] = centerLngLat;
  const coords = [];
  const dLat = radiusMeters / 110630.0;
  const dLng = radiusMeters / 108460.0;
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * (Math.PI * 2);
    coords.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}

export default function AmbulanceDriverSatelliteDashboard() {
  const { snapshot, isLiveTwinConnected, sendCommand } = useV2XSubscriber();

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapReadyRef = useRef(false);

  const carMarkersRef = useRef(new Map());
  const signalMarkersRef = useRef(new Map());
  const wpMarkersRef = useRef(new Map());
  const ambMarkersRef = useRef(new Map());

  const [activeUnit, setActiveUnit] = useState('AMB_B');
  // Default to DETOUR_OVERVIEW so the driver sees the entire road network without disorienting camera spin
  const [cameraLock, setCameraLock] = useState('DETOUR_OVERVIEW'); // 'DETOUR_OVERVIEW' | 'FOLLOW' | 'JUNCTION' | 'FREE'
  const [mapTheme, setMapTheme] = useState('GOOGLE_HYBRID'); // 'GOOGLE_HYBRID' | 'GOOGLE_SATELLITE' | 'GOOGLE_STREETS'
  const [liveGpsActive, setLiveGpsActive] = useState(false);
  const [userGpsCoord, setUserGpsCoord] = useState(null);

  const selectedCase = snapshot.selectedCase || 1;
  const signals = useMemo(() => snapshot.signals || {}, [snapshot.signals]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        sendCommand('DISPATCH');
      } else if (e.code === 'KeyF') {
        sendCommand('FREEZE');
      } else if (e.code === 'KeyN') {
        sendCommand('NORMAL_CYCLE');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sendCommand]);

  useEffect(() => {
    if (!liveGpsActive || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserGpsCoord([pos.coords.longitude, pos.coords.latitude]);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [liveGpsActive]);

  // Initialize Google Maps Satellite Hybrid Viewport
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: GOOGLE_MAPS_STYLE,
      center: [77.6062, 12.9762],
      zoom: 16.2,
      pitch: 42,
      bearing: 0,
      antialias: true,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('dragstart', () => {
      setCameraLock('FREE');
    });

    map.on('load', () => {
      mapReadyRef.current = true;
      const initialRoadGeo = buildTwinRoadGeoJSON(1, false);

      map.addSource('twin-road-lines', {
        type: 'geojson',
        data: initialRoadGeo.lines,
      });

      // Base M.G. Road & Brigade Road subtle highlight
      map.addLayer({
        id: 'twin-main-road-casing',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['in', ['get', 'kind'], ['literal', ['main_road_line', 'cross_road_line']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0f172a',
          'line-width': 12,
          'line-opacity': 0.55,
        },
      });

      // Case 01 West->East Preemption Green Corridor along M.G. Road
      map.addLayer({
        id: 'twin-case1-corridor',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'amb_corridor_case1'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#10b981',
          'line-width': 8,
          'line-opacity': 0.75,
        },
      });

      // Case 03 Ambulance A South->North Priority Corridor along Brigade Road
      map.addLayer({
        id: 'twin-amb-a-corridor',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'amb_a_corridor'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 8,
          'line-opacity': 0.85,
        },
      });

      // Case 03 Ambulance B 5-Leg Detour (Kamaraj Rd -> Cubbon Rd -> Central St)
      map.addLayer({
        id: 'twin-amb-b-detour-glow',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'amb_b_detour'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#00f5ff',
          'line-width': 14,
          'line-opacity': 0.35,
          'line-blur': 4,
        },
      });

      map.addLayer({
        id: 'twin-amb-b-detour-core',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'amb_b_detour'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#00f5ff',
          'line-width': 5,
          'line-dasharray': [2, 1.5],
          'line-opacity': 0.95,
        },
      });

      // Case 03 East Approach Gridlock Blockade Zone on M.G. Road (between Kamaraj Rd & Brigade Rd)
      map.addLayer({
        id: 'twin-east-blockade',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'east_blockade'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ef4444',
          'line-width': 12,
          'line-opacity': 0.5,
        },
      });

      // BLE Preemption Dome Source
      map.addSource('ble-dome-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'ble-dome-fill',
        type: 'fill',
        source: 'ble-dome-source',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.16,
        },
      });

      map.addLayer({
        id: 'ble-dome-stroke',
        type: 'line',
        source: 'ble-dome-source',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-dasharray': [3, 2],
          'line-opacity': 0.9,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, []);

  // Switch between Google Hybrid (Satellite + Road Names), Google Pure Satellite, and Google Streets
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    if (map.getLayer('google-hybrid-layer')) {
      map.setLayoutProperty(
        'google-hybrid-layer',
        'visibility',
        mapTheme === 'GOOGLE_HYBRID' ? 'visible' : 'none'
      );
    }
    if (map.getLayer('google-satellite-layer')) {
      map.setLayoutProperty(
        'google-satellite-layer',
        'visibility',
        mapTheme === 'GOOGLE_SATELLITE' ? 'visible' : 'none'
      );
    }
    if (map.getLayer('google-roadmap-layer')) {
      map.setLayoutProperty(
        'google-roadmap-layer',
        'visibility',
        mapTheme === 'GOOGLE_STREETS' ? 'visible' : 'none'
      );
    }
  }, [mapTheme]);

  // Synchronize Road-Snapped Cars, Ambulances, Signals & Waypoints on Every Tick
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    // 1. Update Corridor & Detour Lines
    const roadGeo = buildTwinRoadGeoJSON(
      selectedCase,
      Boolean(snapshot.ambulanceB?.detourActive || snapshot.isSimulationRunning)
    );
    map.getSource('twin-road-lines')?.setData(roadGeo.lines);

    // 2. Update Road-Snapped Ambulances & BLE Preemption Domes
    const bleFeatures = [];
    const activeAmbUnits = [];

    if (selectedCase === 1 && snapshot.ambulancePosition) {
      const roadGeo1 = twinToRoadGeo(
        snapshot.ambulancePosition.x,
        snapshot.ambulancePosition.z,
        { isAmbulance: true, ambId: 'AMB_1' }
      );
      const circle = createGeoCircle(roadGeo1.lngLat, 38);
      circle.properties = { color: '#3b82f6' };
      bleFeatures.push(circle);

      activeAmbUnits.push({
        id: 'AMB_1',
        label: 'AMB-108 (M.G. ROAD)',
        color: '#3b82f6',
        lngLat: roadGeo1.lngLat,
        bearing: roadGeo1.bearing,
      });
    } else if (selectedCase === 3) {
      if (snapshot.ambulanceA?.position) {
        const roadGeoA = twinToRoadGeo(
          snapshot.ambulanceA.position.x,
          snapshot.ambulanceA.position.z,
          { isAmbulance: true, ambId: 'AMB_A' }
        );
        const circleA = createGeoCircle(roadGeoA.lngLat, 45);
        circleA.properties = { color: '#3b82f6' };
        bleFeatures.push(circleA);

        activeAmbUnits.push({
          id: 'AMB_A',
          label: 'AMB-A (BRIGADE RD PRIORITY)',
          color: '#3b82f6',
          lngLat: roadGeoA.lngLat,
          bearing: roadGeoA.bearing,
        });
      }
      if (snapshot.ambulanceB?.position) {
        const roadGeoB = twinToRoadGeo(
          snapshot.ambulanceB.position.x,
          snapshot.ambulanceB.position.z,
          {
            isAmbulance: true,
            ambId: 'AMB_B',
            wpIdx: snapshot.ambulanceB.currentWaypointIdx || 0,
          }
        );
        const circleB = createGeoCircle(roadGeoB.lngLat, 35);
        circleB.properties = { color: '#f59e0b' };
        bleFeatures.push(circleB);

        activeAmbUnits.push({
          id: 'AMB_B',
          label: 'AMB-B (CUBBON RD DETOUR)',
          color: '#f59e0b',
          lngLat: roadGeoB.lngLat,
          bearing: roadGeoB.bearing,
        });
      }
    }

    map.getSource('ble-dome-source')?.setData({
      type: 'FeatureCollection',
      features: bleFeatures,
    });

    // 3. Render 4-Way Signal Badges around Brigade Road & M.G. Road Junction (J0)
    const poleConfigs = [
      { id: 'NORTH_ARM', label: 'N', coord: twinToRoadGeo(0, -18, { carType: 'S' }).lngLat, green: signals.sGreen, yellow: signals.sYellow },
      { id: 'SOUTH_ARM', label: 'S', coord: twinToRoadGeo(0, 18,  { carType: 'N' }).lngLat, green: signals.nGreen, yellow: signals.nYellow },
      { id: 'EAST_ARM',  label: 'E', coord: twinToRoadGeo(12, 0,  { carType: 'W' }).lngLat, green: signals.wGreen, yellow: signals.wYellow },
      { id: 'WEST_ARM',  label: 'W', coord: twinToRoadGeo(-12, 0, { carType: 'E' }).lngLat, green: signals.eGreen, yellow: signals.eYellow },
    ];

    poleConfigs.forEach((pole) => {
      const color = pole.green ? '#22c55e' : pole.yellow ? '#facc15' : '#ef4444';
      let marker = signalMarkersRef.current.get(pole.id);
      if (!marker) {
        const el = document.createElement('div');
        el.style.pointerEvents = 'none';
        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(pole.coord)
          .addTo(map);
        signalMarkersRef.current.set(pole.id, marker);
      } else {
        marker.setLngLat(pole.coord);
      }

      marker.getElement().innerHTML = `
        <div style="
          background: rgba(2, 6, 23, 0.92);
          border: 1.5px solid ${color};
          box-shadow: 0 0 8px ${color};
          color: #fff;
          padding: 1px 5px;
          border-radius: 999px;
          font-family: monospace;
          font-size: 8px;
          font-weight: 900;
          display: flex;
          align-items: center;
          gap: 3px;
        ">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: ${color}; display: inline-block;"></span>
          <span>${pole.label}</span>
        </div>
      `;
    });

    // 4. Render Case 03 Real Google Maps Waypoint Beacons (WP1..WP4)
    const waypoints = [
      { id: 'WP1', label: 'WP1: Kamaraj Rd Turn', coord: GOOGLE_ROAD_NODES.WP1, idx: 1 },
      { id: 'WP2', label: 'WP2: Cubbon Rd Turn',  coord: GOOGLE_ROAD_NODES.WP2, idx: 2 },
      { id: 'WP3', label: 'WP3: Minsk Sq Turn',   coord: GOOGLE_ROAD_NODES.WP3, idx: 3 },
      { id: 'WP4', label: 'WP4: Anil Kumble Rejoin', coord: GOOGLE_ROAD_NODES.WP4, idx: 4 },
    ];

    waypoints.forEach((wp) => {
      let marker = wpMarkersRef.current.get(wp.id);
      if (selectedCase !== 3) {
        if (marker) {
          marker.remove();
          wpMarkersRef.current.delete(wp.id);
        }
        return;
      }

      const curWp = snapshot.ambulanceB?.currentWaypointIdx || 0;
      const isDone = curWp >= wp.idx;
      const isNext = curWp + 1 === wp.idx;
      const borderCol = isDone ? '#22c55e' : isNext ? '#f59e0b' : '#00f5ff';

      if (!marker) {
        const el = document.createElement('div');
        el.style.pointerEvents = 'none';
        marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(wp.coord)
          .addTo(map);
        wpMarkersRef.current.set(wp.id, marker);
      } else {
        marker.setLngLat(wp.coord);
      }

      marker.getElement().innerHTML = `
        <div style="
          background: rgba(2, 6, 23, 0.92);
          border: 1.5px solid ${borderCol};
          color: ${borderCol};
          padding: 2px 6px;
          border-radius: 5px;
          font-family: monospace;
          font-size: 9px;
          font-weight: 900;
          box-shadow: 0 0 10px ${borderCol}66;
          white-space: nowrap;
        ">
          ${isDone ? '✓ ' : '◈ '}${wp.label}
        </div>
      `;
    });

    // 5. Render All Civilian Cars Road-Snapped onto M.G. Road & Brigade Road
    const activeCarIds = new Set();
    const vehicles = snapshot.vehicles || [];

    vehicles.forEach((veh) => {
      activeCarIds.add(veh.id);
      const snapped = twinToRoadGeo(veh.x, veh.z, {
        carType: veh.type,
        rotY: veh.rotY,
        isAmbulance: false,
      });

      const isYielding = veh.state === 'YIELDING' || veh.state === 'HOLDING';
      const isMoving = veh.speed > 0.4;
      const isEastBlockade = selectedCase === 3 && veh.type === 'W' && veh.x >= 10 && veh.x <= 44;

      const bodyColor = isYielding
        ? '#f59e0b'
        : isEastBlockade
        ? '#ef4444'
        : veh.receivesBLE
        ? '#10b981'
        : isMoving
        ? '#38bdf8'
        : '#e2e8f0';

      let marker = carMarkersRef.current.get(veh.id);
      if (!marker) {
        const el = document.createElement('div');
        el.style.pointerEvents = 'none';
        marker = new maplibregl.Marker({
          element: el,
          anchor: 'center',
          rotationAlignment: 'map',
          pitchAlignment: 'map',
        })
          .setLngLat(snapped.lngLat)
          .setRotation(snapped.bearing)
          .addTo(map);
        carMarkersRef.current.set(veh.id, marker);
      } else {
        marker.setLngLat(snapped.lngLat);
        marker.setRotation(snapped.bearing);
      }

      const badgeHtml = isYielding
        ? `<div style="position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:#f59e0b;color:#000;font-family:monospace;font-size:7px;font-weight:900;padding:0.5px 3px;border-radius:2px;white-space:nowrap;">YIELD</div>`
        : '';

      marker.getElement().innerHTML = `
        <div style="position:relative;width:14px;height:24px;display:flex;align-items:center;justify-content:center;">
          ${badgeHtml}
          <svg width="14" height="24" viewBox="0 0 16 28" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.9));">
            <rect x="2" y="2" width="12" height="24" rx="4" fill="${bodyColor}" stroke="#020617" stroke-width="1.5"/>
            <rect x="3.5" y="6" width="9" height="6" rx="1.5" fill="#0f172a"/>
            <rect x="4" y="17" width="8" height="4" rx="1" fill="#1e293b"/>
            <circle cx="4.5" cy="3" r="1.3" fill="#fef08a"/>
            <circle cx="11.5" cy="3" r="1.3" fill="#fef08a"/>
          </svg>
        </div>
      `;
    });

    for (const [id, marker] of carMarkersRef.current.entries()) {
      if (!activeCarIds.has(id)) {
        marker.remove();
        carMarkersRef.current.delete(id);
      }
    }

    // 6. Render Active Ambulance Markers on Road
    const activeAmbIds = new Set();
    activeAmbUnits.forEach((u) => {
      activeAmbIds.add(u.id);
      const lngLat = liveGpsActive && userGpsCoord ? userGpsCoord : u.lngLat;

      let marker = ambMarkersRef.current.get(u.id);
      if (!marker) {
        const el = document.createElement('div');
        el.style.zIndex = '60';
        marker = new maplibregl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat(lngLat)
          .addTo(map);
        ambMarkersRef.current.set(u.id, marker);
      } else {
        marker.setLngLat(lngLat);
      }

      marker.getElement().innerHTML = `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;pointer-events:none;">
          <div style="
            background: rgba(2, 6, 23, 0.95);
            border: 1.5px solid ${u.color};
            color: #fff;
            font-family: monospace;
            font-size: 9px;
            font-weight: 900;
            padding: 2px 6px;
            border-radius: 4px;
            margin-bottom: 3px;
            white-space: nowrap;
            box-shadow: 0 0 12px ${u.color};
          ">
            🚑 ${u.label}
          </div>
          <div style="
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: ${u.color};
            border: 2.5px solid #ffffff;
            box-shadow: 0 0 20px ${u.color};
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(${u.bearing}deg);
          ">
            <span style="color:#fff;font-size:13px;font-weight:900;line-height:1;">▲</span>
          </div>
        </div>
      `;
    });

    for (const [id, marker] of ambMarkersRef.current.entries()) {
      if (!activeAmbIds.has(id)) {
        marker.remove();
        ambMarkersRef.current.delete(id);
      }
    }

    // 7. Smooth Camera Control (No disorienting bearing spin unless requested)
    if (cameraLock === 'FOLLOW') {
      const targetUnit =
        selectedCase === 3
          ? activeAmbUnits.find((u) => u.id === activeUnit) || activeAmbUnits[0]
          : activeAmbUnits[0];
      if (targetUnit) {
        map.easeTo({
          center: targetUnit.lngLat,
          zoom: 17.2,
          pitch: 45,
          bearing: 0,
          duration: 140,
          easing: (t) => t,
        });
      }
    } else if (cameraLock === 'JUNCTION') {
      map.easeTo({
        center: [ORIGIN_LNG, ORIGIN_LAT],
        zoom: 17.4,
        pitch: 45,
        bearing: 0,
        duration: 400,
      });
    } else if (cameraLock === 'DETOUR_OVERVIEW') {
      map.easeTo({
        center: [77.6062, 12.9762],
        zoom: 16.0,
        pitch: 38,
        bearing: 0,
        duration: 400,
      });
    }
  }, [snapshot, selectedCase, signals, activeUnit, cameraLock, liveGpsActive, userGpsCoord]);

  const telemetry = useMemo(() => {
    if (selectedCase === 1) {
      const pos = snapshot.ambulancePosition || { x: -120, z: -6.0 };
      const dist = Math.max(0, Math.round(-pos.x));
      const yieldingCount = (snapshot.vehicles || []).filter(
        (v) => v.state === 'YIELDING' || v.state === 'HOLDING'
      ).length;
      return {
        unitName: 'AMB-108 (M.G. ROAD CORRIDOR)',
        corridorStatus: snapshot.isPreempted
          ? 'GREEN WAVE ACTIVE (W_GREEN)'
          : snapshot.signalPhase,
        instruction:
          pos.x < -85
            ? 'Approaching Anil Kumble Circle -> Brigade Rd Corridor'
            : pos.x < 15
            ? 'PROCEED STRAIGHT ON M.G. ROAD — SIGNAL PREEMPTED GREEN'
            : 'Brigade Rd Junction Cleared — Sequential Release Active',
        distanceMeters: dist,
        coordsText: `Twin X: ${pos.x.toFixed(1)}m | Z: ${pos.z.toFixed(1)}m`,
        yieldingCount,
      };
    } else {
      const isAmbA = activeUnit === 'AMB_A';
      const unit = isAmbA ? snapshot.ambulanceA : snapshot.ambulanceB;
      const pos = unit?.position || { x: 0, z: 0 };
      const yieldingCount = (snapshot.vehicles || []).filter(
        (v) => v.state === 'YIELDING' || v.state === 'HOLDING'
      ).length;

      let instruction = 'Press DISPATCH [ENTER] to launch Dual Ambulance Preemption';
      if (isAmbA) {
        instruction =
          pos.z > 0
            ? 'PROCEED NORTH ON BRIGADE ROAD — DIRECT GREEN WAVE'
            : 'M.G. Road Junction Cleared — Proceeding North';
      } else {
        const wp = snapshot.ambulanceB?.currentWaypointIdx || 0;
        if (wp === 0) instruction = '⚠️ M.G. RD BLOCKED AHEAD — TURN RIGHT ONTO KAMARAJ RD AT WP1';
        else if (wp === 1) instruction = '↱ PROCEED NORTH ON KAMARAJ ROAD TO CUBBON RD (WP2)';
        else if (wp === 2) instruction = '↰ TURN LEFT ONTO CUBBON ROAD WESTBOUND TO MINSK SQ (WP3)';
        else if (wp === 3) instruction = '↰ TURN LEFT ONTO CENTRAL STREET SOUTH TO ANIL KUMBLE CIRCLE (WP4)';
        else instruction = '✅ BYPASS COMPLETE — PROCEED WEST ON M.G. ROAD';
      }

      return {
        unitName: unit?.name || 'Ambulance Unit',
        corridorStatus: isAmbA
          ? 'BRIGADE RD SOUTH GREEN CORRIDOR'
          : snapshot.ambulanceB?.waypointName || 'KAMARAJ -> CUBBON RD DETOUR',
        instruction,
        distanceMeters: isAmbA
          ? Math.max(0, Math.round(pos.z))
          : Math.round(Math.hypot(pos.x, pos.z)),
        coordsText: `Twin X: ${pos.x.toFixed(1)}m | Z: ${pos.z.toFixed(1)}m`,
        yieldingCount,
      };
    }
  }, [snapshot, selectedCase, activeUnit]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#020617', fontFamily: 'monospace', color: '#f8fafc' }}>
      <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* ── TOP NAVIGATION & CASE BAR ── */}
      <div style={{
        position: 'fixed',
        top: 14,
        left: 14,
        right: 14,
        zIndex: 40,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        background: 'rgba(2, 6, 23, 0.92)',
        border: '1.5px solid #334155',
        borderRadius: 12,
        padding: '10px 16px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a
            href="/"
            style={{
              background: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #475569',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 11,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            ← 3D TWIN CMD
          </a>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#10b981', letterSpacing: 1.5 }}>
              🛰️ SEMTOS GOOGLE MAPS SATELLITE COCKPIT
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>
              {isLiveTwinConnected ? (
                <span style={{ color: '#22c55e' }}>● ROAD-SNAPPED 1:1 SYNC WITH 3D TWIN ({snapshot.vehicles?.length || 0} CARS)</span>
              ) : (
                <span style={{ color: '#f59e0b' }}>● ROAD-SNAPPED STANDALONE SIMULATOR ({snapshot.vehicles?.length || 0} CARS)</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => sendCommand('SWITCH_CASE', { caseId: 1 })}
            style={{
              background: selectedCase === 1 ? '#22c55e' : '#0f172a',
              color: selectedCase === 1 ? '#020617' : '#94a3b8',
              border: '1px solid #22c55e',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            CASE 01 (M.G. RD PREEMPTION)
          </button>
          <button
            onClick={() => sendCommand('SWITCH_CASE', { caseId: 3 })}
            style={{
              background: selectedCase === 3 ? '#f59e0b' : '#0f172a',
              color: selectedCase === 3 ? '#020617' : '#94a3b8',
              border: '1px solid #f59e0b',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            CASE 03 (DUAL AMB & CUBBON RD DETOUR)
          </button>

          {selectedCase === 3 && (
            <div style={{ display: 'flex', gap: 4, marginLeft: 6, background: '#0f172a', padding: 3, borderRadius: 6, border: '1px solid #334155' }}>
              <button
                onClick={() => { setActiveUnit('AMB_B'); setCameraLock('FOLLOW'); }}
                style={{
                  background: activeUnit === 'AMB_B' ? '#f59e0b' : 'transparent',
                  color: activeUnit === 'AMB_B' ? '#000' : '#fcd34d',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                🚑 AMB B (DETOUR)
              </button>
              <button
                onClick={() => { setActiveUnit('AMB_A'); setCameraLock('FOLLOW'); }}
                style={{
                  background: activeUnit === 'AMB_A' ? '#3b82f6' : 'transparent',
                  color: activeUnit === 'AMB_A' ? '#fff' : '#93c5fd',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                🚑 AMB A (BRIGADE RD)
              </button>
            </div>
          )}

          <a
            href="/driver"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#fcd34d',
              border: '1px solid #f59e0b',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            📱 OPEN PHONE HUD
          </a>
        </div>
      </div>

      {/* ── TURN-BY-TURN NAVIGATION DIRECTIVE ── */}
      <div style={{
        position: 'fixed',
        top: 76,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 35,
        background: selectedCase === 3 && activeUnit === 'AMB_B'
          ? 'rgba(2, 6, 23, 0.94)'
          : 'rgba(6, 78, 59, 0.94)',
        border: `2px solid ${selectedCase === 3 && activeUnit === 'AMB_B' ? '#00f5ff' : '#10b981'}`,
        borderRadius: 12,
        padding: '10px 22px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
        textAlign: 'center',
        minWidth: 340,
        maxWidth: '90vw',
      }}>
        <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: 1.5, marginBottom: 2 }}>
          GOOGLE MAPS ROAD-SNAPPED NAVIGATION • {telemetry.unitName}
        </div>
        <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: 0.8 }}>
          {telemetry.instruction}
        </div>
      </div>

      {/* ── LEFT TELEMETRY & SIGNAL MATRIX PANEL ── */}
      <div style={{
        position: 'fixed',
        top: 148,
        left: 14,
        zIndex: 35,
        width: 310,
        background: 'rgba(2, 6, 23, 0.92)',
        border: '1.5px solid #334155',
        borderRadius: 12,
        padding: 14,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <button
          onClick={() => sendCommand('DISPATCH')}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#020617',
            border: '1px solid #34d399',
            borderRadius: 8,
            padding: '10px 0',
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: 1.2,
            cursor: 'pointer',
            boxShadow: '0 0 18px rgba(16, 185, 129, 0.4)',
          }}
        >
          ▶ DISPATCH AMBULANCE [ENTER]
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 8 }}>
            <div style={{ fontSize: 9, color: '#64748b' }}>DIST TO JUNCTION</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#38bdf8' }}>{telemetry.distanceMeters} m</div>
          </div>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 8 }}>
            <div style={{ fontSize: 9, color: '#64748b' }}>CARS YIELDING (BLE)</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b' }}>{telemetry.yieldingCount} cars</div>
          </div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 8 }}>
          <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>ROAD-SNAPPED TWIN TELEMETRY</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#e2e8f0' }}>{telemetry.coordsText}</div>
          <div style={{ fontSize: 10, color: '#10b981', marginTop: 2 }}>{telemetry.corridorStatus}</div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>BRIGADE & M.G. RD SIGNALS</span>
            <span style={{ color: '#38bdf8' }}>{snapshot.signalPhase}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
            {[
              { label: 'NORTH', green: signals.sGreen, yellow: signals.sYellow },
              { label: 'SOUTH', green: signals.nGreen, yellow: signals.nYellow },
              { label: 'EAST',  green: signals.wGreen, yellow: signals.wYellow },
              { label: 'WEST',  green: signals.eGreen, yellow: signals.eYellow },
            ].map((arm) => {
              const col = arm.green ? '#22c55e' : arm.yellow ? '#facc15' : '#ef4444';
              const icon = arm.green ? '🟢' : arm.yellow ? '🟡' : '🔴';
              return (
                <div key={arm.label} style={{ display: 'flex', alignItems: 'center', gap: 6, color: col, fontWeight: 800 }}>
                  <span>{icon}</span>
                  <span style={{ color: '#cbd5e1' }}>{arm.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {selectedCase === 3 && (
          <div style={{ background: '#0f172a', border: '1px solid #f59e0b55', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#f59e0b', marginBottom: 6 }}>
              AMB B GOOGLE MAPS DETOUR WAYPOINTS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {[
                { id: 1, name: 'WP1: Kamaraj Rd' },
                { id: 2, name: 'WP2: Cubbon Rd' },
                { id: 3, name: 'WP3: Minsk Sq' },
                { id: 4, name: 'WP4: Anil Kumble' },
              ].map((wp) => {
                const cur = snapshot.ambulanceB?.currentWaypointIdx || 0;
                const done = cur >= wp.id;
                const active = cur + 1 === wp.id;
                return (
                  <div
                    key={wp.id}
                    style={{
                      padding: '4px 6px',
                      borderRadius: 4,
                      fontSize: 9,
                      fontWeight: 800,
                      background: done ? '#22c55e' : active ? '#f59e0b' : '#1e293b',
                      color: done || active ? '#020617' : '#94a3b8',
                    }}
                  >
                    {wp.name}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ fontSize: 10, color: '#94a3b8', borderTop: '1px solid #1e293b', paddingTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <div><span style={{ color: '#38bdf8' }}>■</span> Moving Car</div>
          <div><span style={{ color: '#f59e0b' }}>■</span> BLE Yielding Car</div>
          <div><span style={{ color: '#e2e8f0' }}>■</span> Red Queue Car</div>
          <div><span style={{ color: '#ef4444' }}>■</span> East Gridlock Jam</div>
        </div>
      </div>

      {/* ── BOTTOM CAMERA & GOOGLE MAPS LAYER CONTROLS ── */}
      <div style={{
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 35,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(2, 6, 23, 0.94)',
        border: '1.5px solid #334155',
        borderRadius: 12,
        padding: '8px 14px',
        backdropFilter: 'blur(12px)',
      }}>
        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 800 }}>CAMERA:</span>
        {[
          { id: 'DETOUR_OVERVIEW', label: '🗺️ CORRIDOR OVERVIEW' },
          { id: 'FOLLOW', label: '🎯 FOLLOW AMBULANCE' },
          { id: 'JUNCTION', label: '🚦 BRIGADE RD JUNCTION' },
          { id: 'FREE', label: '🖐️ FREE PAN' },
        ].map((c) => (
          <button
            key={c.id}
            onClick={() => setCameraLock(c.id)}
            style={{
              background: cameraLock === c.id ? '#38bdf8' : '#1e293b',
              color: cameraLock === c.id ? '#020617' : '#cbd5e1',
              border: 'none',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 10,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {c.label}
          </button>
        ))}

        <span style={{ color: '#334155' }}>|</span>

        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 800 }}>GOOGLE MAPS:</span>
        {[
          { id: 'GOOGLE_HYBRID', label: '🛰️ GOOGLE SATELLITE + ROADS' },
          { id: 'GOOGLE_SATELLITE', label: '🌍 GOOGLE SATELLITE' },
          { id: 'GOOGLE_STREETS', label: '🗺️ GOOGLE STREETS' },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMapTheme(m.id)}
            style={{
              background: mapTheme === m.id ? '#10b981' : '#1e293b',
              color: mapTheme === m.id ? '#020617' : '#cbd5e1',
              border: 'none',
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 10,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
