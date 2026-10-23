"use client";

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  useV2XSubscriber,
  twinToLngLat,
  twinHeadingToBearing,
  buildTwinRoadGeoJSON,
  ORIGIN_LNG,
  ORIGIN_LAT,
} from '../../../hooks/useV2XSync';

// High-resolution Map Style with Carto Dark base + Esri World Imagery Satellite toggle
const MAP_BASE_STYLE = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: 'Carto Dark Matter',
    },
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Esri World Imagery',
    },
    'carto-labels': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      paint: { 'raster-brightness-max': 0.85, 'raster-contrast': 0.1 },
    },
    {
      id: 'satellite-imagery-layer',
      type: 'raster',
      source: 'esri-satellite',
      layout: { visibility: 'none' },
      paint: {
        'raster-brightness-max': 0.9,
        'raster-contrast': 0.15,
      },
    },
    {
      id: 'hybrid-road-labels',
      type: 'raster',
      source: 'carto-labels',
      paint: { 'raster-opacity': 0.75 },
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

  // Markers
  const carMarkersRef = useRef(new Map());
  const signalMarkersRef = useRef(new Map());
  const wpMarkersRef = useRef(new Map());
  const ambMarkersRef = useRef(new Map());

  // UI States
  const [activeUnit, setActiveUnit] = useState('AMB_B'); // 'AMB_B' (Detour) or 'AMB_A' (South Corridor)
  const [cameraLock, setCameraLock] = useState('FOLLOW'); // 'FOLLOW' | 'JUNCTION' | 'DETOUR_OVERVIEW' | 'FREE'
  const [mapTheme, setMapTheme] = useState('FSD_DARK'); // 'FSD_DARK' | 'SATELLITE_DECK' | 'CYBER_GRID'
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [liveGpsActive, setLiveGpsActive] = useState(false);
  const [userGpsCoord, setUserGpsCoord] = useState(null);

  const selectedCase = snapshot.selectedCase || 1;
  const signals = useMemo(() => snapshot.signals || {}, [snapshot.signals]);

  // Keyboard shortcuts
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

  // Real GPS Geolocation tracker
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

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_BASE_STYLE,
      center: [ORIGIN_LNG, ORIGIN_LAT],
      zoom: 18.2,
      pitch: 52,
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

      // 1. Road Deck Source
      map.addSource('twin-road-polygons', {
        type: 'geojson',
        data: initialRoadGeo.polygons,
      });

      // Concrete Sidewalk / Curb Deck Buffer
      map.addLayer({
        id: 'twin-sidewalk-deck',
        type: 'fill',
        source: 'twin-road-polygons',
        filter: ['==', ['get', 'kind'], 'sidewalk_deck'],
        paint: {
          'fill-color': '#1e293b',
          'fill-opacity': 0.88,
        },
      });

      // Asphalt Road Deck
      map.addLayer({
        id: 'twin-road-fill',
        type: 'fill',
        source: 'twin-road-polygons',
        filter: ['!=', ['get', 'kind'], 'sidewalk_deck'],
        paint: {
          'fill-color': [
            'match',
            ['get', 'kind'],
            'junction_box', '#0d131f',
            'detour_road', '#0b111e',
            '#0a0f1d',
          ],
          'fill-opacity': 0.95,
        },
      });

      // Subtle Outer Road Edge Casing
      map.addLayer({
        id: 'twin-road-casing',
        type: 'line',
        source: 'twin-road-polygons',
        paint: {
          'line-color': '#334155',
          'line-width': 1.5,
          'line-opacity': 0.7,
        },
      });

      // 2. Road Markings & Corridors
      map.addSource('twin-road-lines', {
        type: 'geojson',
        data: initialRoadGeo.lines,
      });

      // Anti-Gridlock Yellow Box Junction Diagonal Hatch
      map.addLayer({
        id: 'twin-yellow-box',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'yellow_box'],
        paint: {
          'line-color': '#eab308',
          'line-width': 1.8,
          'line-opacity': 0.55,
        },
      });

      // Zebra Crosswalk Stripes
      map.addLayer({
        id: 'twin-zebra-crosswalk',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'zebra_crosswalk'],
        paint: {
          'line-color': '#f8fafc',
          'line-width': 3.5,
          'line-dasharray': [1, 0.8],
          'line-opacity': 0.85,
        },
      });

      // Dashed Lane Dividers
      map.addLayer({
        id: 'twin-lane-dashes',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'lane_dash'],
        paint: {
          'line-color': '#94a3b8',
          'line-width': 1.5,
          'line-dasharray': [3, 3],
          'line-opacity': 0.75,
        },
      });

      // Double Solid Yellow Center Medians
      map.addLayer({
        id: 'twin-medians',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'median'],
        paint: {
          'line-color': '#facc15',
          'line-width': 2.2,
          'line-opacity': 0.95,
        },
      });

      // Solid Stop Bars
      map.addLayer({
        id: 'twin-stop-lines',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'stop_line'],
        paint: {
          'line-color': '#ffffff',
          'line-width': 4.5,
          'line-opacity': 0.95,
        },
      });

      // Case 01 West->East Preemption Corridor
      map.addLayer({
        id: 'twin-case1-corridor',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'amb_corridor_case1'],
        paint: {
          'line-color': '#10b981',
          'line-width': 12,
          'line-opacity': 0.45,
          'line-blur': 3,
        },
      });

      // Case 03 Ambulance A South->North Priority Corridor
      map.addLayer({
        id: 'twin-amb-a-corridor',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'amb_a_corridor'],
        paint: {
          'line-color': '#3b82f6',
          'line-width': 12,
          'line-opacity': 0.5,
          'line-blur': 3,
        },
      });

      // Case 03 Detour Navigation Ribbon (Multi-layer glowing route line)
      map.addLayer({
        id: 'twin-amb-b-detour-glow',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'amb_b_detour'],
        paint: {
          'line-color': '#00f5ff',
          'line-width': 18,
          'line-opacity': 0.38,
          'line-blur': 5,
        },
      });

      map.addLayer({
        id: 'twin-amb-b-detour-core',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'amb_b_detour'],
        paint: {
          'line-color': '#00f5ff',
          'line-width': 5.5,
          'line-dasharray': [3, 1.5],
          'line-opacity': 0.95,
        },
      });

      // East Approach Gridlock Blockade Zone
      map.addLayer({
        id: 'twin-east-blockade',
        type: 'line',
        source: 'twin-road-lines',
        filter: ['==', ['get', 'kind'], 'east_blockade'],
        paint: {
          'line-color': '#ef4444',
          'line-width': 16,
          'line-opacity': 0.35,
          'line-blur': 2,
        },
      });

      // BLE Signal Preemption Radar Dome
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
          'fill-opacity': 0.12,
        },
      });

      map.addLayer({
        id: 'ble-dome-stroke',
        type: 'line',
        source: 'ble-dome-source',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-dasharray': [3, 2],
          'line-opacity': 0.8,
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

  // Map Theme Switcher
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const isSat = mapTheme === 'SATELLITE_DECK';
    const isCyber = mapTheme === 'CYBER_GRID';

    if (map.getLayer('satellite-imagery-layer')) {
      map.setLayoutProperty('satellite-imagery-layer', 'visibility', isSat ? 'visible' : 'none');
    }
    if (map.getLayer('carto-dark-layer')) {
      map.setLayoutProperty('carto-dark-layer', 'visibility', isSat ? 'none' : 'visible');
    }

    if (map.getLayer('twin-road-fill')) {
      map.setPaintProperty(
        'twin-road-fill',
        'fill-color',
        isCyber
          ? '#040d1a'
          : isSat
          ? '#090d16'
          : '#0a0f1d'
      );
      map.setPaintProperty(
        'twin-road-fill',
        'fill-opacity',
        isSat ? 0.94 : 0.98
      );
    }
  }, [mapTheme]);

  // Synchronize Simulation State & Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    // 1. Update Road Geometry
    const roadGeo = buildTwinRoadGeoJSON(
      selectedCase,
      Boolean(snapshot.ambulanceB?.detourActive || snapshot.isSimulationRunning)
    );
    map.getSource('twin-road-polygons')?.setData(roadGeo.polygons);
    map.getSource('twin-road-lines')?.setData(roadGeo.lines);

    // 2. Update BLE Preemption Radar Dome
    const bleFeatures = [];
    if (selectedCase === 1 && snapshot.ambulancePosition) {
      const c = twinToLngLat(snapshot.ambulancePosition.x, snapshot.ambulancePosition.z);
      const circle = createGeoCircle(c, 14);
      circle.properties = { color: '#10b981' };
      bleFeatures.push(circle);
    } else if (selectedCase === 3) {
      if (snapshot.ambulanceA?.position) {
        const cA = twinToLngLat(snapshot.ambulanceA.position.x, snapshot.ambulanceA.position.z);
        const circleA = createGeoCircle(cA, 28);
        circleA.properties = { color: '#3b82f6' };
        bleFeatures.push(circleA);
      }
      if (snapshot.ambulanceB?.position) {
        const cB = twinToLngLat(snapshot.ambulanceB.position.x, snapshot.ambulanceB.position.z);
        const circleB = createGeoCircle(cB, 14);
        circleB.properties = { color: '#00f5ff' };
        bleFeatures.push(circleB);
      }
    }
    map.getSource('ble-dome-source')?.setData({
      type: 'FeatureCollection',
      features: bleFeatures,
    });

    // 3. Mini 3D-Styled Traffic Signal Head Markers on Sidewalks
    const poleConfigs = [
      { id: 'NORTH_ARM', label: 'N', x: -6.8, z: -10.5, green: signals.sGreen, yellow: signals.sYellow },
      { id: 'SOUTH_ARM', label: 'S', x:  6.8, z:  10.5, green: signals.nGreen, yellow: signals.nYellow },
      { id: 'EAST_ARM',  label: 'E', x:  8.5, z:  -8.0, green: signals.wGreen, yellow: signals.wYellow },
      { id: 'WEST_ARM',  label: 'W', x: -8.0, z:   8.0, green: signals.eGreen, yellow: signals.eYellow },
    ];

    poleConfigs.forEach((pole) => {
      const lngLat = twinToLngLat(pole.x, pole.z);
      const activeColor = pole.green ? '#22c55e' : pole.yellow ? '#facc15' : '#ef4444';

      let marker = signalMarkersRef.current.get(pole.id);
      if (!marker) {
        const el = document.createElement('div');
        el.style.pointerEvents = 'none';
        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(lngLat)
          .addTo(map);
        signalMarkersRef.current.set(pole.id, marker);
      } else {
        marker.setLngLat(lngLat);
      }

      marker.getElement().innerHTML = `
        <div style="
          background: #020617;
          border: 1.5px solid ${activeColor};
          box-shadow: 0 0 10px ${activeColor}88;
          border-radius: 999px;
          padding: 3px 5px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2.5px;
        ">
          <div style="width: 5px; height: 5px; border-radius: 50%; background: ${pole.green ? '#22c55e' : '#334155'}; ${pole.green ? 'box-shadow: 0 0 6px #22c55e;' : ''}"></div>
          <div style="width: 5px; height: 5px; border-radius: 50%; background: ${pole.yellow ? '#facc15' : '#334155'}; ${pole.yellow ? 'box-shadow: 0 0 6px #facc15;' : ''}"></div>
          <div style="width: 5px; height: 5px; border-radius: 50%; background: ${!pole.green && !pole.yellow ? '#ef4444' : '#334155'}; ${!pole.green && !pole.yellow ? 'box-shadow: 0 0 6px #ef4444;' : ''}"></div>
        </div>
      `;
    });

    // 4. Case 03 Sleek Numbered Waypoint Pins (①, ②, ③, ④)
    const waypoints = [
      { id: 'WP1', num: '1', title: 'Turn Right (North)', x: 47.0, z: -2.89, idx: 1 },
      { id: 'WP2', num: '2', title: 'Turn Left (Parallel West)', x: 47.0, z: -60.0, idx: 2 },
      { id: 'WP3', num: '3', title: 'Turn Left (South Return)', x: -87.0, z: -60.0, idx: 3 },
      { id: 'WP4', num: '4', title: 'Rejoin Main Avenue', x: -87.0, z: -2.89, idx: 4 },
    ];

    waypoints.forEach((wp) => {
      let marker = wpMarkersRef.current.get(wp.id);
      const lngLat = twinToLngLat(wp.x, wp.z);

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

      const circleColor = isDone ? '#22c55e' : isNext ? '#00f5ff' : '#475569';
      const textColor = isDone ? '#020617' : isNext ? '#020617' : '#cbd5e1';
      const bg = isDone ? '#22c55e' : isNext ? '#00f5ff' : 'rgba(15, 23, 42, 0.9)';

      if (!marker) {
        const el = document.createElement('div');
        el.style.pointerEvents = 'none';
        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(lngLat)
          .addTo(map);
        wpMarkersRef.current.set(wp.id, marker);
      } else {
        marker.setLngLat(lngLat);
      }

      marker.getElement().innerHTML = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
          ${isNext ? '<div style="position: absolute; inset: -4px; border-radius: 50%; border: 2px solid #00f5ff; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite; opacity: 0.75;"></div>' : ''}
          <div style="
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: ${bg};
            border: 2px solid ${circleColor};
            box-shadow: 0 0 14px ${circleColor}aa;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: monospace;
            font-size: 11px;
            font-weight: 900;
            color: ${textColor};
          ">
            ${isDone ? '✓' : wp.num}
          </div>
          ${isNext ? `
            <div style="
              margin-top: 4px;
              background: rgba(2, 6, 23, 0.92);
              border: 1px solid #00f5ff;
              color: #00f5ff;
              font-family: monospace;
              font-size: 8px;
              font-weight: 800;
              padding: 2px 6px;
              border-radius: 4px;
              white-space: nowrap;
              box-shadow: 0 0 8px rgba(0, 245, 255, 0.4);
            ">
              ${wp.title}
            </div>
          ` : ''}
        </div>
      `;
    });

    // 5. Sleek Civilian Vehicles (Aerodynamic pods without messy overlapping text tags)
    const activeCarIds = new Set();
    const vehicles = snapshot.vehicles || [];

    vehicles.forEach((veh) => {
      activeCarIds.add(veh.id);
      const lngLat = twinToLngLat(veh.x, veh.z);
      const bearing = twinHeadingToBearing(veh.type, veh.rotY, false, 0);

      const isYielding = veh.state === 'YIELDING' || veh.state === 'HOLDING';
      const isEastBlockade = selectedCase === 3 && veh.type === 'W' && veh.x >= 10 && veh.x <= 44;
      const isMoving = veh.speed > 0.4;

      const bodyColor = isYielding
        ? '#f59e0b'
        : isEastBlockade
        ? '#dc2626'
        : isMoving
        ? '#38bdf8'
        : '#64748b';

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
          .setLngLat(lngLat)
          .setRotation(bearing)
          .addTo(map);
        carMarkersRef.current.set(veh.id, marker);
      } else {
        marker.setLngLat(lngLat);
        marker.setRotation(bearing);
      }

      marker.getElement().innerHTML = `
        <div style="
          position: relative;
          width: 12px;
          height: 22px;
          border-radius: 5px;
          background: ${bodyColor};
          border: 1px solid rgba(255, 255, 255, 0.6);
          box-shadow: 0 0 ${isYielding ? '10px #f59e0b' : isEastBlockade ? '8px #dc2626' : '6px rgba(0,0,0,0.8)'};
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 2px 1px;
        ">
          <!-- Windshield & Roof Glass -->
          <div style="width: 8px; height: 4px; border-radius: 2px; background: #0f172a; margin-top: 2px;"></div>
          <div style="width: 7px; height: 3px; border-radius: 1px; background: #1e293b; margin-bottom: 2px;"></div>
        </div>
      `;
    });

    for (const [id, marker] of carMarkersRef.current.entries()) {
      if (!activeCarIds.has(id)) {
        marker.remove();
        carMarkersRef.current.delete(id);
      }
    }

    // 6. Prominent Hero Ambulance Markers
    const activeAmbUnits = [];
    if (selectedCase === 1 && snapshot.ambulancePosition) {
      activeAmbUnits.push({
        id: 'AMB_1',
        label: 'AMB-108',
        sub: 'WEST CORRIDOR',
        color: '#10b981',
        pos: snapshot.ambulancePosition,
      });
    } else if (selectedCase === 3) {
      if (snapshot.ambulanceA?.position) {
        activeAmbUnits.push({
          id: 'AMB_A',
          label: 'AMB-A',
          sub: 'SOUTH PRIORITY',
          color: '#3b82f6',
          pos: snapshot.ambulanceA.position,
        });
      }
      if (snapshot.ambulanceB?.position) {
        activeAmbUnits.push({
          id: 'AMB_B',
          label: 'AMB-B',
          sub: 'DETOUR',
          color: '#00f5ff',
          pos: snapshot.ambulanceB.position,
        });
      }
    }

    const activeAmbIds = new Set();
    activeAmbUnits.forEach((u) => {
      activeAmbIds.add(u.id);
      const lngLat =
        liveGpsActive && userGpsCoord
          ? userGpsCoord
          : twinToLngLat(u.pos.x, u.pos.z);
      const bearing = twinHeadingToBearing(null, 0, true, u.pos.rotation || 0);

      let marker = ambMarkersRef.current.get(u.id);
      if (!marker) {
        const el = document.createElement('div');
        el.style.zIndex = '50';
        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(lngLat)
          .addTo(map);
        ambMarkersRef.current.set(u.id, marker);
      } else {
        marker.setLngLat(lngLat);
      }

      marker.getElement().innerHTML = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; pointer-events: none;">
          <!-- Elevated Callout Tag -->
          <div style="
            background: rgba(2, 6, 23, 0.95);
            border: 1.5px solid ${u.color};
            color: #ffffff;
            font-family: monospace;
            font-size: 10px;
            font-weight: 900;
            padding: 3px 8px;
            border-radius: 6px;
            margin-bottom: 6px;
            white-space: nowrap;
            box-shadow: 0 4px 18px ${u.color}88;
            letter-spacing: 0.8px;
          ">
            🚑 ${u.label} • ${u.sub}
          </div>

          <!-- Vehicle Icon with Heading Rotation -->
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: ${u.color};
            border: 2.5px solid #ffffff;
            box-shadow: 0 0 24px ${u.color};
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(${bearing}deg);
          ">
            <span style="color: #020617; font-size: 16px; font-weight: 900; line-height: 1;">▲</span>
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

    // 7. Camera Follow Tracker
    if (cameraLock === 'FOLLOW') {
      let focusPos = snapshot.ambulancePosition;
      if (selectedCase === 3) {
        focusPos =
          activeUnit === 'AMB_A'
            ? snapshot.ambulanceA?.position
            : snapshot.ambulanceB?.position;
      }
      if (focusPos) {
        const center = twinToLngLat(focusPos.x, focusPos.z);
        const bearing = twinHeadingToBearing(null, 0, true, focusPos.rotation || 0);
        map.easeTo({
          center,
          bearing,
          pitch: 54,
          zoom: 18.5,
          duration: 120,
          easing: (t) => t,
        });
      }
    } else if (cameraLock === 'JUNCTION') {
      map.easeTo({
        center: [ORIGIN_LNG, ORIGIN_LAT],
        bearing: 0,
        pitch: 45,
        zoom: 18.2,
        duration: 350,
      });
    } else if (cameraLock === 'DETOUR_OVERVIEW') {
      map.easeTo({
        center: twinToLngLat(-20, -32),
        bearing: 0,
        pitch: 38,
        zoom: 17.2,
        duration: 350,
      });
    }
  }, [snapshot, selectedCase, signals, activeUnit, cameraLock, liveGpsActive, userGpsCoord]);

  // Derived Telemetry & Turn-by-Turn Maneuvers
  const telemetry = useMemo(() => {
    if (selectedCase === 1) {
      const pos = snapshot.ambulancePosition || { x: -120, z: -6.0 };
      const dist = Math.max(0, Math.round(-pos.x));
      const yieldingCount = (snapshot.vehicles || []).filter(
        (v) => v.state === 'YIELDING' || v.state === 'HOLDING'
      ).length;

      let icon = '↑';
      let title = 'PROCEED STRAIGHT (WEST MAIN AVE)';
      let sub = 'Direct green wave corridor preempted to central junction';

      if (pos.x < -85) {
        title = `In ${Math.abs(Math.round(pos.x - -85))}m • Approach Sensor Trigger`;
        sub = 'West corridor green wave will engage at X = -85m';
      } else if (pos.x < 15) {
        icon = '🟢';
        title = 'GREEN WAVE PREEMPTION ACTIVE';
        sub = 'Cross-traffic held at red • 9 Eastbound civilian cars yielding';
      } else {
        icon = '✅';
        title = 'INTERSECTION CLEARED';
        sub = 'Junction crossed • Sequential post-clearance release in progress';
      }

      return {
        unitName: 'AMB-108 (WEST CORRIDOR)',
        icon,
        title,
        sub,
        distanceMeters: dist,
        coordsText: `X: ${pos.x.toFixed(1)}m | Z: ${pos.z.toFixed(1)}m`,
        yieldingCount,
        statusBadge: snapshot.isPreempted ? 'GREEN WAVE ACTIVE' : snapshot.signalPhase,
        badgeColor: '#10b981',
      };
    } else {
      const isAmbA = activeUnit === 'AMB_A';
      const unit = isAmbA ? snapshot.ambulanceA : snapshot.ambulanceB;
      const pos = unit?.position || { x: 0, z: 0 };
      const yieldingCount = (snapshot.vehicles || []).filter(
        (v) => v.state === 'YIELDING' || v.state === 'HOLDING'
      ).length;

      let icon = '🔄';
      let title = 'Dual-Ambulance Convergence Detected';
      let sub = 'Ambulance A granted South right-of-way • Ambulance B detour armed';

      if (isAmbA) {
        icon = '↑';
        if (pos.z > 0) {
          title = 'PROCEED NORTH (SOUTH PRIORITY CORRIDOR)';
          sub = 'Full green wave priority • Bowring Hospital emergency delivery';
        } else {
          icon = '✅';
          title = 'SOUTH CORRIDOR COMPLETED';
          sub = 'Junction cleared • Proceeding onward to hospital';
        }
      } else {
        const wp = snapshot.ambulanceB?.currentWaypointIdx || 0;
        if (wp === 0) {
          icon = '↱';
          title = `In ${Math.max(0, Math.round(pos.x - 47))}m • Turn Right into North Side Street (WP1)`;
          sub = 'Bypassing 10-car East approach gridlock blockade';
        } else if (wp === 1) {
          icon = '↰';
          title = `In ${Math.max(0, Math.round(Math.abs(pos.z - -60)))}m • Turn Left into Parallel West Ave (WP2)`;
          sub = 'North Side Street transit • Cruising at 48 km/h';
        } else if (wp === 2) {
          icon = '↰';
          title = `In ${Math.max(0, Math.round(pos.x - -87))}m • Turn Left into South Return Street (WP3)`;
          sub = 'Parallel West Avenue transit • Clear detour corridor';
        } else if (wp === 3) {
          icon = '↱';
          title = 'Turn Right onto Main Avenue (WP4)';
          sub = 'Rejoining Main East-West Avenue past congested junction';
        } else {
          icon = '✅';
          title = 'GRIDLOCK BYPASS COMPLETE';
          sub = 'Proceeding Westbound on Main Avenue • 0 sec delay';
        }
      }

      return {
        unitName: isAmbA ? 'AMBULANCE A (CARDIAC - SOUTH)' : 'AMBULANCE B (TRAUMA - DETOUR)',
        icon,
        title,
        sub,
        distanceMeters: isAmbA ? Math.max(0, Math.round(pos.z)) : Math.round(Math.hypot(pos.x, pos.z)),
        coordsText: `X: ${pos.x.toFixed(1)}m | Z: ${pos.z.toFixed(1)}m`,
        yieldingCount,
        statusBadge: isAmbA ? 'SOUTH GREEN WAVE' : '5-LEG NORTH DETOUR',
        badgeColor: isAmbA ? '#3b82f6' : '#00f5ff',
      };
    }
  }, [snapshot, selectedCase, activeUnit]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#020617', fontFamily: 'monospace', color: '#f8fafc' }}>
      {/* MapLibre Canvas Viewport */}
      <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* ── TOP NAVIGATION BAR ── */}
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
        background: 'rgba(9, 13, 24, 0.88)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: 14,
        padding: '10px 18px',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
      }}>
        {/* Brand & Sync Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href="/"
            style={{
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 800,
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
          >
            ← 3D TWIN CMD
          </a>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#f8fafc', letterSpacing: 1.2 }}>
              🛰️ SEMTOS EMERGENCY COCKPIT
            </div>
            <div style={{ fontSize: 10, color: isLiveTwinConnected ? '#22c55e' : '#f59e0b', fontWeight: 700 }}>
              {isLiveTwinConnected
                ? `● LIVE 1:1 TWIN SYNC (${snapshot.vehicles?.length || 0} VEHICLES)`
                : `● STANDALONE V2X ENGINE (${snapshot.vehicles?.length || 0} VEHICLES)`}
            </div>
          </div>
        </div>

        {/* Case & Cockpit Unit Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: '#020617', padding: 3, borderRadius: 8, border: '1px solid #1e293b' }}>
            <button
              onClick={() => sendCommand('SWITCH_CASE', { caseId: 1 })}
              style={{
                background: selectedCase === 1 ? '#10b981' : 'transparent',
                color: selectedCase === 1 ? '#020617' : '#94a3b8',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 11,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              CASE 01 (SINGLE AMB)
            </button>
            <button
              onClick={() => sendCommand('SWITCH_CASE', { caseId: 3 })}
              style={{
                background: selectedCase === 3 ? '#00f5ff' : 'transparent',
                color: selectedCase === 3 ? '#020617' : '#94a3b8',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 11,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              CASE 03 (DUAL AMB & DETOUR)
            </button>
          </div>

          {selectedCase === 3 && (
            <div style={{ display: 'flex', background: '#020617', padding: 3, borderRadius: 8, border: '1px solid #334155' }}>
              <button
                onClick={() => { setActiveUnit('AMB_B'); setCameraLock('FOLLOW'); }}
                style={{
                  background: activeUnit === 'AMB_B' ? '#00f5ff' : 'transparent',
                  color: activeUnit === 'AMB_B' ? '#020617' : '#7dd3fc',
                  border: 'none',
                  borderRadius: 6,
                  padding: '5px 10px',
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
                  color: activeUnit === 'AMB_A' ? '#ffffff' : '#93c5fd',
                  border: 'none',
                  borderRadius: 6,
                  padding: '5px 10px',
                  fontSize: 10,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                🚑 AMB A (SOUTH)
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
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            📱 PHONE HUD
          </a>
        </div>
      </div>

      {/* ── APPLE MAPS / TESLA STYLE TURN-BY-TURN NAVIGATION CARD ── */}
      <div style={{
        position: 'fixed',
        top: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 35,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: 'rgba(9, 13, 24, 0.92)',
        border: `1.5px solid ${telemetry.badgeColor}`,
        borderRadius: 16,
        padding: '12px 24px',
        boxShadow: `0 12px 40px rgba(0,0,0,0.8), 0 0 20px ${telemetry.badgeColor}44`,
        backdropFilter: 'blur(20px)',
        minWidth: 420,
        maxWidth: '92vw',
      }}>
        {/* Maneuver Arrow Icon */}
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: telemetry.badgeColor,
          color: '#020617',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 900,
          boxShadow: `0 0 16px ${telemetry.badgeColor}`,
          flexShrink: 0,
        }}>
          {telemetry.icon}
        </div>

        {/* Action Headline & Subtitle */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', letterSpacing: 0.5, lineHeight: 1.3 }}>
            {telemetry.title}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>
            {telemetry.sub}
          </div>
        </div>

        {/* Status Pill */}
        <div style={{
          background: 'rgba(2, 6, 23, 0.8)',
          border: `1px solid ${telemetry.badgeColor}`,
          padding: '4px 10px',
          borderRadius: 8,
          fontSize: 10,
          fontWeight: 800,
          color: telemetry.badgeColor,
          whiteSpace: 'nowrap',
        }}>
          {telemetry.statusBadge}
        </div>
      </div>

      {/* ── LEFT FLOATING TELEMETRY DOCK ── */}
      <div style={{
        position: 'fixed',
        top: 160,
        left: 14,
        zIndex: 35,
        width: 300,
        background: 'rgba(9, 13, 24, 0.90)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: 14,
        padding: isSidebarOpen ? 14 : 10,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'all 0.3s ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: '#38bdf8', letterSpacing: 1 }}>
            LIVE COCKPIT TELEMETRY
          </span>
          <button
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            style={{
              background: '#1e293b',
              border: 'none',
              color: '#94a3b8',
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            {isSidebarOpen ? '◄ HIDE' : '►'}
          </button>
        </div>

        {isSidebarOpen && (
          <>
            <button
              onClick={() => sendCommand('DISPATCH')}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#020617',
                border: 'none',
                borderRadius: 8,
                padding: '10px 0',
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: 1.2,
                cursor: 'pointer',
                boxShadow: '0 0 16px rgba(16, 185, 129, 0.4)',
              }}
            >
              ▶ DISPATCH AMBULANCE [ENTER]
            </button>

            {/* Quick Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: 9, color: '#64748b' }}>DIST TO JUNCTION</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#38bdf8' }}>{telemetry.distanceMeters} m</div>
              </div>
              <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: 9, color: '#64748b' }}>CARS YIELDING</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b' }}>{telemetry.yieldingCount} cars</div>
              </div>
            </div>

            {/* 4-Way Traffic Signal Status */}
            <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>4-WAY SIGNALS</span>
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

            {/* Case 03 Detour Waypoint Stepper */}
            {selectedCase === 3 && (
              <div style={{ background: '#020617', border: '1px solid rgba(0, 245, 255, 0.25)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#00f5ff', marginBottom: 6 }}>
                  AMB B DETOUR ROUTE (5 LEGS)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[
                    { id: 1, name: 'WP1: Turn Right (North St)' },
                    { id: 2, name: 'WP2: Turn Left (Parallel Ave)' },
                    { id: 3, name: 'WP3: Turn Left (Return St)' },
                    { id: 4, name: 'WP4: Rejoin Main Avenue' },
                  ].map((wp) => {
                    const cur = snapshot.ambulanceB?.currentWaypointIdx || 0;
                    const done = cur >= wp.id;
                    const active = cur + 1 === wp.id;
                    return (
                      <div
                        key={wp.id}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: 9,
                          fontWeight: 800,
                          background: done ? 'rgba(34, 197, 94, 0.2)' : active ? 'rgba(0, 245, 255, 0.2)' : '#090d16',
                          color: done ? '#4ade80' : active ? '#00f5ff' : '#64748b',
                          borderLeft: `3px solid ${done ? '#22c55e' : active ? '#00f5ff' : '#334155'}`,
                        }}
                      >
                        {done ? '✓ ' : active ? '▶ ' : '○ '}{wp.name}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Map Legend */}
            <div style={{ fontSize: 10, color: '#94a3b8', borderTop: '1px solid #1e293b', paddingTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <div><span style={{ color: '#38bdf8' }}>■</span> Moving Car</div>
              <div><span style={{ color: '#f59e0b' }}>■</span> BLE Yielding</div>
              <div><span style={{ color: '#64748b' }}>■</span> Red Queue</div>
              <div><span style={{ color: '#ef4444' }}>■</span> Gridlock Jam</div>
            </div>
          </>
        )}
      </div>

      {/* ── BOTTOM FLOATING CONTROLS (CAMERA & MAP THEME) ── */}
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
        background: 'rgba(9, 13, 24, 0.92)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: 14,
        padding: '8px 16px',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
      }}>
        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 800 }}>CAMERA:</span>
        {[
          { id: 'FOLLOW', label: '🎯 FOLLOW AMB' },
          { id: 'JUNCTION', label: '🚦 JUNCTION (0,0)' },
          { id: 'DETOUR_OVERVIEW', label: '🗺️ MACRO OVERVIEW' },
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

        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 800 }}>THEME:</span>
        {[
          { id: 'FSD_DARK', label: '🏎️ FSD DARK (PRO)' },
          { id: 'SATELLITE_DECK', label: '🛰️ SATELLITE DECK' },
          { id: 'CYBER_GRID', label: '🌐 CYBER GRID' },
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

        <button
          onClick={() => setLiveGpsActive((prev) => !prev)}
          style={{
            background: liveGpsActive ? '#ef4444' : '#1e293b',
            color: '#fff',
            border: '1px solid #475569',
            borderRadius: 6,
            padding: '5px 10px',
            fontSize: 10,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {liveGpsActive ? '📡 GPS: ACTIVE' : '📍 USE GPS'}
        </button>
      </div>
    </div>
  );
}
