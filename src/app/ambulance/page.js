// src/app/ambulance/page.js
"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  useV2XSubscriber,
  twinToRoadGeo,
  buildTwinRoadGeoJSON,
  build3DVehiclesGeoJSON,
  buildBengaluru3DBuildingsGeoJSON,
  GOOGLE_ROAD_NODES,
  ORIGIN_LNG,
  ORIGIN_LAT,
} from '../../../hooks/useV2XSync';

// ── Google Maps Free Tile Servers + OpenFreeMap 3D Vector Building Tiles ──
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
      attribution: 'Google Maps Satellite Hybrid + 3D Buildings',
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
    // Free global OpenMapTiles vector source for real 3D building footprints in Bengaluru
    openfreemap: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
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
  const carBearingsRef = useRef(new Map());
  const signalMarkersRef = useRef(new Map());
  const wpMarkersRef = useRef(new Map());
  const ambMarkersRef = useRef(new Map());

  const [activeUnit, setActiveUnit] = useState('AMB_B');
  const [cameraLock, setCameraLock] = useState('JUNCTION'); // 'DETOUR_OVERVIEW' | 'FOLLOW' | 'JUNCTION' | 'FREE'
  const [mapTheme, setMapTheme] = useState('GOOGLE_HYBRID'); // 'GOOGLE_HYBRID' | 'GOOGLE_SATELLITE' | 'GOOGLE_STREETS'
  const [buildings3DEnabled, setBuildings3DEnabled] = useState(true);
  const [globeEnabled, setGlobeEnabled] = useState(true);
  const [liveGpsActive, setLiveGpsActive] = useState(false);
  const [userGpsCoord, setUserGpsCoord] = useState(null);

  const selectedCase = snapshot.selectedCase || 1;
  const signals = useMemo(() => snapshot.signals || {}, [snapshot.signals]);

  // Sync SVG car roof rotations whenever the user rotates the map camera
  const syncMarkerRotationsWithMap = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const mapBrg = map.getBearing() || 0;
    for (const [id, marker] of carMarkersRef.current.entries()) {
      const roadBrg = carBearingsRef.current.get(id) ?? 0;
      const svgEl = marker.getElement()?.querySelector('.semtos-car-rot');
      if (svgEl) {
        const screenDeg = (roadBrg - mapBrg + 360) % 360;
        svgEl.style.transform = `rotate(${screenDeg.toFixed(1)}deg)`;
      }
    }
  }, []);

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

  // Initialize Google Maps Satellite + 3D Buildings + Globe Viewport
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: GOOGLE_MAPS_STYLE,
      center: [ORIGIN_LNG, ORIGIN_LAT],
      zoom: 17.5,
      pitch: 58,
      bearing: -25,
      antialias: true,
    });

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }),
      'bottom-right'
    );

    map.on('dragstart', () => {
      setCameraLock('FREE');
    });

    map.on('rotate', () => {
      syncMarkerRotationsWithMap();
    });

    map.on('load', () => {
      mapReadyRef.current = true;

      // Enable 3D Globe Projection when supported by MapLibre GL
      try {
        if (typeof map.setProjection === 'function') {
          map.setProjection({ type: 'globe' });
        }
      } catch (_) {}

      const initialRoadGeo = buildTwinRoadGeoJSON(1, false);

      map.addSource('twin-road-lines', {
        type: 'geojson',
        data: initialRoadGeo.lines,
      });

      // Base M.G. Road & Brigade/Kamaraj Road highlight
      map.addLayer({
        id: 'twin-main-road-casing',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['in', ['get', 'kind'], ['literal', ['main_road_line', 'cross_road_line']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0f172a',
          'line-width': 14,
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
          'line-opacity': 0.8,
        },
      });

      // Case 03 Ambulance A South->North Priority Corridor (Brigade Rd -> Kamaraj Rd)
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

      // Case 03 Ambulance B 5-Leg Detour (East Bypass -> Cubbon Rd -> St. Mark's/Anil Kumble)
      map.addLayer({
        id: 'twin-amb-b-detour-glow',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'amb_b_detour'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#00f5ff',
          'line-width': 14,
          'line-opacity': 0.38,
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

      // Case 03 East Approach Gridlock Blockade Zone on M.G. Road
      map.addLayer({
        id: 'twin-east-blockade',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'east_blockade'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ef4444',
          'line-width': 13,
          'line-opacity': 0.55,
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

      // ── 3D EXTRUDED BUILDINGS (OpenFreeMap Global Vector Buildings + Local M.G. Road High-Rises) ──
      map.addSource('local-3d-buildings', {
        type: 'geojson',
        data: buildBengaluru3DBuildingsGeoJSON(),
      });

      map.addLayer({
        id: 'local-3d-buildings-layer',
        type: 'fill-extrusion',
        source: 'local-3d-buildings',
        minzoom: 14.5,
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.78,
        },
      });

      try {
        map.addLayer({
          id: 'openfreemap-3d-buildings',
          type: 'fill-extrusion',
          source: 'openfreemap',
          'source-layer': 'building',
          minzoom: 14.5,
          paint: {
            'fill-extrusion-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'render_height'], ['get', 'height'], 16],
              0, '#1e293b',
              25, '#334155',
              60, '#475569',
            ],
            'fill-extrusion-height': [
              'coalesce',
              ['get', 'render_height'],
              ['get', 'height'],
              18,
            ],
            'fill-extrusion-base': [
              'coalesce',
              ['get', 'render_min_height'],
              ['get', 'min_height'],
              0,
            ],
            'fill-extrusion-opacity': 0.75,
          },
        });
      } catch (_) {}

      // ── TRUE 3D EXTRUDED VEHICLES SOURCE & LAYER (100% Locked to Road Centerlines in 3D) ──
      map.addSource('vehicles-3d-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'vehicles-3d-extrusion',
        type: 'fill-extrusion',
        source: 'vehicles-3d-source',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'base'],
          'fill-extrusion-opacity': 0.96,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, [syncMarkerRotationsWithMap]);

  // Switch between Google Hybrid, Google Pure Satellite, and Google Streets
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

  // Toggle 3D Extruded Buildings On/Off
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const vis = buildings3DEnabled ? 'visible' : 'none';
    if (map.getLayer('local-3d-buildings-layer')) {
      map.setLayoutProperty('local-3d-buildings-layer', 'visibility', vis);
    }
    if (map.getLayer('openfreemap-3d-buildings')) {
      map.setLayoutProperty('openfreemap-3d-buildings', 'visibility', vis);
    }
  }, [buildings3DEnabled]);

  // Toggle Globe Projection On/Off
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    try {
      if (typeof map.setProjection === 'function') {
        map.setProjection({ type: globeEnabled ? 'globe' : 'mercator' });
      }
    } catch (_) {}
  }, [globeEnabled]);

  // Synchronize Road-Snapped Cars, Ambulances, 3D Extrusions, Signals & Waypoints on Every Tick
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

    // 3. Update True 3D Extruded Vehicles Layer
    const vehicles = snapshot.vehicles || [];
    map.getSource('vehicles-3d-source')?.setData(
      build3DVehiclesGeoJSON(vehicles, activeAmbUnits, selectedCase)
    );

    // 4. Render 4-Way Signal Badges around M.G. Road & Brigade/Kamaraj Junction (J0)
    const poleConfigs = [
      { id: 'NORTH_ARM', label: 'N', coord: twinToRoadGeo(0, -14, { carType: 'S' }).lngLat, green: signals.sGreen, yellow: signals.sYellow },
      { id: 'SOUTH_ARM', label: 'S', coord: twinToRoadGeo(0, 14,  { carType: 'N' }).lngLat, green: signals.nGreen, yellow: signals.nYellow },
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

    // 5. Render Case 03 Real Google Maps Waypoint Beacons (WP1..WP4)
    const waypoints = [
      { id: 'WP1', label: 'WP1: East Detour Turn',   coord: GOOGLE_ROAD_NODES.WP1, idx: 1 },
      { id: 'WP2', label: 'WP2: Cubbon Rd Turn',     coord: GOOGLE_ROAD_NODES.WP2, idx: 2 },
      { id: 'WP3', label: 'WP3: Anil Kumble Turn',   coord: GOOGLE_ROAD_NODES.WP3, idx: 3 },
      { id: 'WP4', label: 'WP4: M.G. Rd Rejoin',     coord: GOOGLE_ROAD_NODES.WP4, idx: 4 },
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

    // 6. Render Camera-Bearing-Compensated Vehicle Roof Markers & Yield Badges
    const activeCarIds = new Set();
    const mapBrg = map.getBearing() || 0;

    vehicles.forEach((veh) => {
      activeCarIds.add(veh.id);
      const snapped = twinToRoadGeo(veh.x, veh.z, {
        carType: veh.type,
        rotY: veh.rotY,
        isAmbulance: false,
      });

      carBearingsRef.current.set(veh.id, snapped.bearing);
      const screenDeg = (snapped.bearing - mapBrg + 360) % 360;

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
        })
          .setLngLat(snapped.lngLat)
          .addTo(map);
        carMarkersRef.current.set(veh.id, marker);
      } else {
        marker.setLngLat(snapped.lngLat);
      }

      const badgeHtml = isYielding
        ? `<div style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:#f59e0b;color:#000;font-family:monospace;font-size:7px;font-weight:900;padding:0.5px 3px;border-radius:2px;white-space:nowrap;z-index:20;">YIELD</div>`
        : '';

      marker.getElement().innerHTML = `
        <div style="position:relative;width:14px;height:24px;display:flex;align-items:center;justify-content:center;">
          ${badgeHtml}
          <div class="semtos-car-rot" style="transform:rotate(${screenDeg.toFixed(1)}deg);display:flex;align-items:center;justify-content:center;">
            <svg width="14" height="24" viewBox="0 0 16 28" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.9));">
              <rect x="2" y="2" width="12" height="24" rx="4" fill="${bodyColor}" stroke="#020617" stroke-width="1.5"/>
              <rect x="3.5" y="6" width="9" height="6" rx="1.5" fill="#0f172a"/>
              <rect x="4" y="17" width="8" height="4" rx="1" fill="#1e293b"/>
              <circle cx="4.5" cy="3" r="1.4" fill="#fef08a"/>
              <circle cx="11.5" cy="3" r="1.4" fill="#fef08a"/>
            </svg>
          </div>
        </div>
      `;
    });

    for (const [id, marker] of carMarkersRef.current.entries()) {
      if (!activeCarIds.has(id)) {
        marker.remove();
        carMarkersRef.current.delete(id);
        carBearingsRef.current.delete(id);
      }
    }

    // 7. Render Active Ambulance Callout Markers on Road
    const activeAmbIds = new Set();
    activeAmbUnits.forEach((u) => {
      activeAmbIds.add(u.id);
      const lngLat = liveGpsActive && userGpsCoord ? userGpsCoord : u.lngLat;
      const ambScreenDeg = (u.bearing - mapBrg + 360) % 360;

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
            transform: rotate(${ambScreenDeg.toFixed(1)}deg);
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

    // 8. Camera Tracking Modes
    if (cameraLock === 'FOLLOW') {
      const targetUnit =
        selectedCase === 1
          ? activeAmbUnits[0]
          : activeAmbUnits.find((a) => a.id === activeUnit) || activeAmbUnits[0];

      if (targetUnit) {
        map.easeTo({
          center: liveGpsActive && userGpsCoord ? userGpsCoord : targetUnit.lngLat,
          zoom: 17.8,
          pitch: 60,
          bearing: targetUnit.bearing,
          duration: 180,
          easing: (t) => t,
        });
      }
    } else if (cameraLock === 'JUNCTION') {
      map.easeTo({
        center: [ORIGIN_LNG, ORIGIN_LAT],
        zoom: 17.5,
        pitch: 58,
        bearing: -25,
        duration: 450,
      });
    } else if (cameraLock === 'DETOUR_OVERVIEW') {
      map.easeTo({
        center: [77.6074, 12.9760],
        zoom: 16.4,
        pitch: 50,
        bearing: -15,
        duration: 450,
      });
    }
  }, [snapshot, selectedCase, activeUnit, cameraLock, signals, liveGpsActive, userGpsCoord]);

  // Telemetry Calculations
  const telemetry = useMemo(() => {
    const vehicles = snapshot.vehicles || [];
    const yieldingCount = vehicles.filter(
      (v) => v.state === 'YIELDING' || v.state === 'HOLDING' || v.receivesBLE
    ).length;

    if (selectedCase === 1) {
      const x = snapshot.ambulancePosition?.x ?? -120;
      const dist = Math.max(0, Math.round(Math.abs(x)));
      return {
        unitName: 'AMB-108 (M.G. Road Corridor)',
        distToJunction: dist,
        yieldingCount,
        status: snapshot.isPreempted
          ? 'GREEN WAVE ACTIVE (M.G. ROAD)'
          : snapshot.isSimulationRunning
          ? 'EN ROUTE ON M.G. ROAD'
          : 'STANDBY AT ANIL KUMBLE CIRCLE',
        navInstruction:
          x < -15
            ? 'Approaching M.G. Road & Brigade Rd Signal'
            : x <= 15
            ? 'Crossing Brigade Rd Junction — Green Preempted'
            : 'Cleared Junction — Proceeding to Mayo Hall',
        subInstruction: `Twin X: ${x.toFixed(1)}m | Z: ${(snapshot.ambulancePosition?.z ?? -6).toFixed(1)}m`,
      };
    }

    if (activeUnit === 'AMB_A') {
      const z = snapshot.ambulanceA?.position?.z ?? 90;
      return {
        unitName: 'Ambulance A (Cardiac — Brigade Rd South)',
        distToJunction: Math.max(0, Math.round(z)),
        yieldingCount,
        status: snapshot.ambulanceA?.status || 'STANDBY',
        navInstruction:
          z > 12
            ? 'Proceed North on Brigade Road -> Green Wave Locked'
            : 'Cleared M.G. Road Junction -> Continuing onto Kamaraj Road',
        subInstruction: `Twin X: 2.2m | Z: ${z.toFixed(1)}m`,
      };
    }

    const posB = snapshot.ambulanceB?.position || { x: 90, z: -2.89 };
    const wpIdx = snapshot.ambulanceB?.currentWaypointIdx || 0;
    const distB = Math.round(Math.hypot(posB.x, posB.z));

    const wpDirectives = [
      'Leg 1: M.G. Rd Westbound -> Turn Right at WP1 (East Detour)',
      'Leg 2: North Bypass -> Proceed North to WP2 (Cubbon Rd)',
      'Leg 3: Cubbon Road Westbound -> Proceed to WP3 (Anil Kumble Turn)',
      'Leg 4: St. Marks / Anil Kumble Connector -> Proceed South to WP4',
      'Leg 5: Rejoined M.G. Road Westbound -> Clear of Gridlock',
    ];

    return {
      unitName: 'Ambulance B (Trauma — Cubbon Rd Macro-Detour)',
      distToJunction: distB,
      yieldingCount,
      status: snapshot.deadlockDetected ? 'CUBBON RD DETOUR ACTIVE' : snapshot.ambulanceB?.status || 'STANDBY',
      navInstruction: wpDirectives[Math.min(wpIdx, wpDirectives.length - 1)],
      subInstruction: `Twin X: ${posB.x.toFixed(1)}m | Z: ${posB.z.toFixed(1)}m`,
    };
  }, [snapshot, selectedCase, activeUnit]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-white select-none font-sans">
      {/* FULL-SCREEN GOOGLE MAPS SATELLITE + 3D BUILDINGS VIEWPORT */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* TOP NAVIGATION & CASE BAR */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 bg-slate-950/90 backdrop-blur-md border border-slate-800 px-3.5 py-2 rounded-xl pointer-events-auto shadow-2xl">
          <a
            href="/"
            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300 transition"
          >
            ← 3D TWIN CMD
          </a>
          <div className="h-4 w-[1px] bg-slate-800 mx-1" />
          <div>
            <div className="text-xs font-black tracking-wider text-emerald-400 font-mono flex items-center gap-2">
              <span>🛰️ SEMTOS GOOGLE MAPS 3D SATELLITE COCKPIT</span>
              <span
                className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                  isLiveTwinConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                {isLiveTwinConnected
                  ? `● LIVE 1:1 SYNC (${snapshot.vehicles?.length || 0} CARS)`
                  : `● ROAD-SNAPPED 3D SIMULATOR (${snapshot.vehicles?.length || 0} CARS)`}
              </span>
            </div>
          </div>
        </div>

        {/* CASE & UNIT SWITCHERS */}
        <div className="flex items-center gap-2 bg-slate-950/90 backdrop-blur-md border border-slate-800 p-1.5 rounded-xl pointer-events-auto shadow-2xl">
          <button
            onClick={() => sendCommand('SET_CASE', { caseNumber: 1 })}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition ${
              selectedCase === 1
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30'
                : 'text-slate-400 hover:text-white bg-slate-900'
            }`}
          >
            CASE 01 (M.G. RD PREEMPTION)
          </button>
          <button
            onClick={() => sendCommand('SET_CASE', { caseNumber: 3 })}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition ${
              selectedCase === 3
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                : 'text-slate-400 hover:text-white bg-slate-900'
            }`}
          >
            CASE 03 (DUAL AMB & CUBBON RD DETOUR)
          </button>

          {selectedCase === 3 && (
            <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-800">
              <button
                onClick={() => setActiveUnit('AMB_B')}
                className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-bold transition ${
                  activeUnit === 'AMB_B'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                🚑 AMB B (CUBBON RD)
              </button>
              <button
                onClick={() => setActiveUnit('AMB_A')}
                className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-bold transition ${
                  activeUnit === 'AMB_A'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                🚑 AMB A (BRIGADE RD)
              </button>
            </div>
          )}

          <a
            href="/driver"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold transition"
          >
            📱 OPEN PHONE HUD
          </a>
        </div>
      </div>

      {/* TURN-BY-TURN NAVIGATION BANNER */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 w-full max-w-xl px-4 pointer-events-none">
        <div
          className={`backdrop-blur-md border-2 rounded-2xl px-5 py-3 shadow-2xl transition-all ${
            snapshot.deadlockDetected
              ? 'bg-amber-950/90 border-amber-400 shadow-amber-500/20'
              : snapshot.isPreempted
              ? 'bg-emerald-950/90 border-emerald-400 shadow-emerald-500/20'
              : 'bg-slate-950/90 border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                GOOGLE MAPS ROAD-SNAPPED 3D NAVIGATION • {telemetry.unitName}
              </div>
              <div className="text-base font-black tracking-wide text-white mt-0.5">
                {telemetry.navInstruction}
              </div>
            </div>
            <div className="text-right font-mono">
              <div className="text-xl font-black text-emerald-400">{telemetry.distToJunction}m</div>
              <div className="text-[9px] text-slate-400 uppercase">TO SIGNAL</div>
            </div>
          </div>
        </div>
      </div>

      {/* LEFT TELEMETRY & CONTROLS PANEL */}
      <div className="absolute top-36 left-3 z-20 w-72 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-2xl space-y-3">
        <button
          onClick={() => sendCommand('DISPATCH')}
          className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-black text-xs tracking-wider shadow-lg shadow-emerald-500/25 transition"
        >
          ▶ DISPATCH AMBULANCE [ENTER]
        </button>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[10px] font-mono text-slate-400">DIST TO JUNCTION</div>
            <div className="text-lg font-black font-mono text-sky-400 mt-0.5">
              {telemetry.distToJunction} m
            </div>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[10px] font-mono text-slate-400">CARS YIELDING (BLE)</div>
            <div className="text-lg font-black font-mono text-amber-400 mt-0.5">
              {telemetry.yieldingCount} cars
            </div>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 font-mono text-xs space-y-1">
          <div className="text-[10px] text-slate-400">ROAD-SNAPPED 3D TELEMETRY</div>
          <div className="text-slate-200 font-bold">{telemetry.subInstruction}</div>
          <div className="text-[10px] text-emerald-400 font-bold">{telemetry.status}</div>
        </div>

        {/* 4-WAY SIGNAL STATUS */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-2">
            <span>M.G. & BRIGADE/KAMARAJ SIGNALS</span>
            <span className="text-sky-400 font-bold">{snapshot.signalPhase || 'IDLE'}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
            {[
              { label: 'NORTH (KAMARAJ)', green: signals.sGreen, yellow: signals.sYellow },
              { label: 'SOUTH (BRIGADE)', green: signals.nGreen, yellow: signals.nYellow },
              { label: 'EAST (M.G. RD)',  green: signals.wGreen, yellow: signals.wYellow },
              { label: 'WEST (M.G. RD)',  green: signals.eGreen, yellow: signals.eYellow },
            ].map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-2 bg-slate-950/80 px-2 py-1 rounded border border-slate-800"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    s.green
                      ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                      : s.yellow
                      ? 'bg-yellow-400'
                      : 'bg-red-500'
                  }`}
                />
                <span className="text-[9px] text-slate-300 font-bold">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CASE 3 5-LEG WAYPOINT CHECKLIST */}
        {selectedCase === 3 && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1">
            <div className="text-[10px] font-mono text-cyan-400 font-bold">
              AMB B CUBBON RD DETOUR WAYPOINTS
            </div>
            {[
              { idx: 1, name: 'WP1: East Detour Turn (X:47)' },
              { idx: 2, name: 'WP2: Cubbon Rd Turn (Z:-60)' },
              { idx: 3, name: 'WP3: Anil Kumble Turn (X:-87)' },
              { idx: 4, name: 'WP4: M.G. Rd Rejoin (Z:-2.89)' },
            ].map((w) => {
              const cur = snapshot.ambulanceB?.currentWaypointIdx || 0;
              const done = cur >= w.idx;
              const active = cur + 1 === w.idx && snapshot.isSimulationRunning;
              return (
                <div
                  key={w.idx}
                  className={`text-[10px] font-mono px-2 py-1 rounded flex items-center justify-between ${
                    done
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : active
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-950/60 text-slate-500'
                  }`}
                >
                  <span>{w.name}</span>
                  <span>{done ? '✓' : active ? '→' : '•'}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* VEHICLE LEGEND */}
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-400 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block" /> Moving 3D Car
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> BLE Yielding Car
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 inline-block" /> Red Queue Car
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> East Gridlock Jam
          </div>
        </div>
      </div>

      {/* BOTTOM CAMERA, GOOGLE MAPS LAYER, 3D BUILDINGS & GLOBE CONTROLS */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center gap-1.5 bg-slate-950/90 backdrop-blur-md border border-slate-800 px-3 py-2 rounded-2xl shadow-2xl">
        <span className="text-[10px] font-mono text-slate-400 mr-1">CAMERA:</span>
        {[
          { id: 'JUNCTION', label: '🚦 BRIGADE/KAMARAJ 3D' },
          { id: 'DETOUR_OVERVIEW', label: '🗺️ CORRIDOR OVERVIEW' },
          { id: 'FOLLOW', label: '🎯 FOLLOW AMBULANCE' },
          { id: 'FREE', label: '🖐️ FREE PAN' },
        ].map((c) => (
          <button
            key={c.id}
            onClick={() => setCameraLock(c.id)}
            className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold transition ${
              cameraLock === c.id
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {c.label}
          </button>
        ))}

        <div className="h-4 w-[1px] bg-slate-800 mx-1" />
        <span className="text-[10px] font-mono text-slate-400 mr-1">GOOGLE MAPS:</span>
        {[
          { id: 'GOOGLE_HYBRID', label: '🛰️ SATELLITE + ROADS' },
          { id: 'GOOGLE_SATELLITE', label: '🌍 PURE SATELLITE' },
          { id: 'GOOGLE_STREETS', label: '🗺️ GOOGLE STREETS' },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMapTheme(m.id)}
            className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold transition ${
              mapTheme === m.id
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {m.label}
          </button>
        ))}

        <div className="h-4 w-[1px] bg-slate-800 mx-1" />
        <button
          onClick={() => setBuildings3DEnabled((v) => !v)}
          className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold transition ${
            buildings3DEnabled
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
          }`}
        >
          🏢 3D BUILDINGS: {buildings3DEnabled ? 'ON' : 'OFF'}
        </button>

        <button
          onClick={() => setGlobeEnabled((v) => !v)}
          className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold transition ${
            globeEnabled
              ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
          }`}
        >
          🌐 GLOBE: {globeEnabled ? 'ON' : 'OFF'}
        </button>

        <button
          onClick={() => setLiveGpsActive((v) => !v)}
          className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold transition ${
            liveGpsActive
              ? 'bg-rose-500 text-white'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
          }`}
        >
          📍 {liveGpsActive ? 'DEVICE GPS ON' : 'USE DEVICE GPS'}
        </button>
      </div>
    </div>
  );
}
