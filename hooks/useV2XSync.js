// hooks/useV2XSync.js
"use client";

import { useEffect, useRef, useState, useCallback } from 'react';

const CHANNEL_NAME = 'SEMTOS_V2X_LIVE_BUS_V1';
const ALT_CHANNEL_NAME = 'semtos_v2x_channel';
const STORAGE_KEY = 'SEMTOS_V2X_LATEST_SNAPSHOT_V1';
const CMD_STORAGE_KEY = 'SEMTOS_V2X_LATEST_CMD_V1';

// ── Sub-Meter Calibrated Google Maps Road Nodes (Bengaluru M.G. Road Corridor) ──
// Anchored at the true 4-way asphalt intersection of Mahatma Gandhi Rd, Brigade Rd (South), and Kamaraj Rd (North)
export const ORIGIN_LNG = 77.608850;
export const ORIGIN_LAT = 12.974650;

export const GOOGLE_ROAD_NODES = {
  // Main Avenue (Mahatma Gandhi Road: West <-> East)
  W_EXIT:   [77.602010, 12.977720], // X = -135 (M.G. Road West near Anil Kumble Circle)
  WP4:      [77.604100, 12.976780], // X = -87  (M.G. Road West Rejoin)
  W_QUEUE:  [77.605900, 12.975980], // X = -70  (M.G. Road Opposite Metro Station)
  W_MID:    [77.607400, 12.975300], // X = -35  (M.G. Road Frontage near Barton Centre)
  J0:       [77.608850, 12.974650], // X = 0    (True M.G. Road & Brigade Rd / Kamaraj Rd 4-Way Signal)
  WP1:      [77.609800, 12.974250], // X = +47  (M.G. Road East Detour Turnoff)
  E_START:  [77.610700, 12.973900], // X = +90  (M.G. Road East Approach near Mayo Hall)
  E_FAR:    [77.612000, 12.973400], // X = +120 (Trinity / 1 MG Lido Approach)

  // Cross Corridor (Brigade Road South <-> J0 <-> Kamaraj Road North)
  S_START:  [77.607800, 12.972000], // Z = +90  (Brigade Road South near Residency Rd)
  S_MID:    [77.608300, 12.973300], // Z = +45  (Brigade Road Mid)
  S_NEAR:   [77.608650, 12.974100], // Z = +22  (Brigade Road Stop Line Approach)
  N_NEAR:   [77.609000, 12.975200], // Z = -20  (Kamaraj Road South Entrance)
  N_MID:    [77.609200, 12.975900], // Z = -40  (Kamaraj Road Mid)
  N_UPPER:  [77.609350, 12.976500], // Z = -60  (Kamaraj Road Upper)
  N_FAR:    [77.609450, 12.976900], // Z = -90  (Kamaraj Road North)
  N_END:    [77.609500, 12.977200], // Z = -120 (Kamaraj Road & Cubbon Road Junction)

  // Case 03 5-Leg North Block Detour (East Bypass -> Cubbon Rd -> Anil Kumble / St. Mark's Connector)
  WP1_MID:  [77.609300, 12.975800], // Leg 2 Midpoint (Northbound Connector to Cubbon Rd)
  WP2:      [77.609500, 12.977200], // X = +47, Z = -60 (Cubbon Rd & Kamaraj Rd Corner)
  LEG3_M1:  [77.607800, 12.977700], // Cubbon Road North of Parade Ground East
  LEG3_M2:  [77.605800, 12.978250], // Cubbon Road Center
  LEG3_M3:  [77.603800, 12.978700], // Cubbon Road West
  WP3:      [77.602420, 12.978920], // X = -87, Z = -60 (Cubbon Rd & Central St Corner)
  WP3_MID:  [77.602200, 12.978300], // Leg 4 Midpoint (Central St Southbound Return)
};

const MAIN_AVE_STATIONS = [
  { x: -135, coord: GOOGLE_ROAD_NODES.W_EXIT },
  { x: -87,  coord: GOOGLE_ROAD_NODES.WP4 },
  { x: -70,  coord: GOOGLE_ROAD_NODES.W_QUEUE },
  { x: -35,  coord: GOOGLE_ROAD_NODES.W_MID },
  { x: 0,    coord: GOOGLE_ROAD_NODES.J0 },
  { x: 47,   coord: GOOGLE_ROAD_NODES.WP1 },
  { x: 90,   coord: GOOGLE_ROAD_NODES.E_START },
  { x: 120,  coord: GOOGLE_ROAD_NODES.E_FAR },
];

const CROSS_AVE_STATIONS = [
  { z: 90,   coord: GOOGLE_ROAD_NODES.S_START },
  { z: 45,   coord: GOOGLE_ROAD_NODES.S_MID },
  { z: 22,   coord: GOOGLE_ROAD_NODES.S_NEAR },
  { z: 0,    coord: GOOGLE_ROAD_NODES.J0 },
  { z: -20,  coord: GOOGLE_ROAD_NODES.N_NEAR },
  { z: -40,  coord: GOOGLE_ROAD_NODES.N_MID },
  { z: -60,  coord: GOOGLE_ROAD_NODES.N_UPPER },
  { z: -90,  coord: GOOGLE_ROAD_NODES.N_FAR },
  { z: -120, coord: GOOGLE_ROAD_NODES.N_END },
];

const DETOUR_LEG2_STATIONS = [
  { z: -2.89, coord: GOOGLE_ROAD_NODES.WP1 },
  { z: -31.5, coord: GOOGLE_ROAD_NODES.WP1_MID },
  { z: -60.0, coord: GOOGLE_ROAD_NODES.WP2 },
];

const DETOUR_LEG3_STATIONS = [
  { x: 47.0,  coord: GOOGLE_ROAD_NODES.WP2 },
  { x: 14.0,  coord: GOOGLE_ROAD_NODES.LEG3_M1 },
  { x: -20.0, coord: GOOGLE_ROAD_NODES.LEG3_M2 },
  { x: -53.0, coord: GOOGLE_ROAD_NODES.LEG3_M3 },
  { x: -87.0, coord: GOOGLE_ROAD_NODES.WP3 },
];

const DETOUR_LEG4_STATIONS = [
  { z: -60.0, coord: GOOGLE_ROAD_NODES.WP3 },
  { z: -31.5, coord: GOOGLE_ROAD_NODES.WP3_MID },
  { z: -2.89, coord: GOOGLE_ROAD_NODES.WP4 },
];

export function computeBearing([lon1, lat1], [lon2, lat2]) {
  const toRad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Displaces [lng, lat] by (forwardMeters along bearingDeg, rightMeters perpendicular to bearingDeg)
 */
export function displaceLngLat([lng, lat], bearingDeg, forwardMeters = 0, rightMeters = 0) {
  const rad = (bearingDeg * Math.PI) / 180;
  const perpRad = ((bearingDeg + 90) * Math.PI) / 180;
  const northM = forwardMeters * Math.cos(rad) + rightMeters * Math.cos(perpRad);
  const eastM = forwardMeters * Math.sin(rad) + rightMeters * Math.sin(perpRad);
  return [lng + eastM / 108460.0, lat + northM / 110630.0];
}

export function offsetLngLatPerpendicular([lng, lat], roadBearingDeg, lateralMeters) {
  if (!lateralMeters || Math.abs(lateralMeters) < 0.05) return [lng, lat];
  return displaceLngLat([lng, lat], roadBearingDeg, 0, lateralMeters);
}

function interpolateStations(stations, keyName, val) {
  const first = stations[0];
  const last = stations[stations.length - 1];
  const increasing = last[keyName] > first[keyName];

  for (let i = 0; i < stations.length - 1; i++) {
    const s1 = stations[i];
    const s2 = stations[i + 1];
    const v1 = s1[keyName];
    const v2 = s2[keyName];
    const inSeg = increasing ? (val >= v1 && val <= v2) : (val <= v1 && val >= v2);
    if (inSeg || i === stations.length - 2) {
      const span = v2 - v1 || 1;
      const t = Math.max(0, Math.min(1, (val - v1) / span));
      const lng = s1.coord[0] + (s2.coord[0] - s1.coord[0]) * t;
      const lat = s1.coord[1] + (s2.coord[1] - s1.coord[1]) * t;
      const bearing = computeBearing(s1.coord, s2.coord);
      return { coord: [lng, lat], bearing };
    }
  }
  return { coord: first.coord, bearing: computeBearing(first.coord, last.coord) };
}

/**
 * Master Piecewise Road-Snapped Projector:
 * Maps any 3D Twin (x, z) + vehicle/ambulance context onto the exact Google Maps road asphalt
 * and returns { lngLat: [lng, lat], bearing: degrees (0 = North, 90 = East) }.
 */
export function twinToRoadGeo(x = 0, z = 0, options = {}) {
  const {
    carType = null,        // 'E' | 'W' | 'N' | 'S'
    rotY = 0,              // lateral steering angle in radians
    isAmbulance = false,
    ambId = 'AMB_1',       // 'AMB_1' | 'AMB_A' | 'AMB_B'
    wpIdx = 0,             // Case 3 Ambulance B waypoint index (0..4)
  } = options;

  const steerDeg = -(Number(rotY) || 0) * (180 / Math.PI) * 0.55;

  // ── CASE A: Ambulance B on the 5-Leg North Block Detour ──
  if (isAmbulance && ambId === 'AMB_B') {
    if (wpIdx === 1 || (Math.abs(x - 47) < 4.5 && z < -4.5 && z > -58.5)) {
      const res = interpolateStations(DETOUR_LEG2_STATIONS, 'z', z);
      return { lngLat: res.coord, bearing: res.bearing };
    }
    if (wpIdx === 2 || z <= -55.0) {
      const res = interpolateStations(DETOUR_LEG3_STATIONS, 'x', x);
      return { lngLat: res.coord, bearing: res.bearing };
    }
    if (wpIdx === 3 || (Math.abs(x - (-87)) < 4.5 && z < -4.5)) {
      const res = interpolateStations(DETOUR_LEG4_STATIONS, 'z', z);
      return { lngLat: res.coord, bearing: res.bearing };
    }
    const res = interpolateStations(MAIN_AVE_STATIONS, 'x', x);
    const westboundBearing = (res.bearing + 180) % 360;
    const lateralMeters = (z / 9.5) * 3.8;
    return {
      lngLat: offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters),
      bearing: westboundBearing,
    };
  }

  // ── CASE B: Ambulance A on Brigade Road -> Kamaraj Road Priority Corridor ──
  if (isAmbulance && ambId === 'AMB_A') {
    const res = interpolateStations(CROSS_AVE_STATIONS, 'z', z);
    const lateralMeters = (x / 5.5) * 2.6;
    return {
      lngLat: offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters),
      bearing: res.bearing,
    };
  }

  // ── CASE C: Case 01 Single Ambulance on M.G. Road West->East Corridor ──
  if (isAmbulance) {
    const res = interpolateStations(MAIN_AVE_STATIONS, 'x', x);
    const lateralMeters = (z / 9.5) * 3.8;
    return {
      lngLat: offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters),
      bearing: res.bearing,
    };
  }

  // ── CASE D: Civilian Cars on M.G. Road ('E' Eastbound or 'W' Westbound) ──
  if (carType === 'E' || carType === 'W') {
    const res = interpolateStations(MAIN_AVE_STATIONS, 'x', x);
    const lateralMeters = (z / 9.5) * 4.0;
    const coords = offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters);
    const baseBearing = carType === 'E' ? res.bearing : (res.bearing + 180) % 360;
    return {
      lngLat: coords,
      bearing: (baseBearing + steerDeg + 360) % 360,
    };
  }

  // ── CASE E: Civilian Cars on Brigade Rd / Kamaraj Rd ('N' Northbound or 'S' Southbound) ──
  if (carType === 'N' || carType === 'S') {
    const res = interpolateStations(CROSS_AVE_STATIONS, 'z', z);
    const lateralMeters = (x / 5.4) * 3.0;
    const coords = offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters);
    const baseBearing = carType === 'N' ? res.bearing : (res.bearing + 180) % 360;
    return {
      lngLat: coords,
      bearing: (baseBearing + steerDeg + 360) % 360,
    };
  }

  // ── CASE F: Generic 3D Twin Point (Waypoints, Signal Poles, Camera Targets) ──
  if (Math.abs(z - (-60)) < 8) {
    const res = interpolateStations(DETOUR_LEG3_STATIONS, 'x', x);
    return { lngLat: res.coord, bearing: res.bearing };
  }
  if (Math.abs(x) <= 14 && Math.abs(z) > 12) {
    const res = interpolateStations(CROSS_AVE_STATIONS, 'z', z);
    const lateralMeters = (x / 5.4) * 3.0;
    return {
      lngLat: offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters),
      bearing: res.bearing,
    };
  }
  const res = interpolateStations(MAIN_AVE_STATIONS, 'x', x);
  const lateralMeters = (z / 9.5) * 4.0;
  return {
    lngLat: offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters),
    bearing: res.bearing,
  };
}

export function twinToLngLat(x = 0, z = 0, options = {}) {
  return twinToRoadGeo(x, z, options).lngLat;
}

export function twinHeadingToBearing(typeOrDir, rotY = 0, isAmbulance = false, ambRotation = 0, x = 0, z = 0, ambId = 'AMB_1', wpIdx = 0) {
  return twinToRoadGeo(x, z, {
    carType: typeOrDir,
    rotY,
    isAmbulance,
    ambId,
    wpIdx,
  }).bearing;
}

/**
 * Creates a 3D rectangular footprint polygon in [lng, lat] aligned with `bearingDeg`
 */
function createOrientedRectCoords(centerLngLat, bearingDeg, halfLenM, halfWidM, forwardShiftM = 0) {
  const c = forwardShiftM ? displaceLngLat(centerLngLat, bearingDeg, forwardShiftM, 0) : centerLngLat;
  const fl = displaceLngLat(c, bearingDeg, +halfLenM, -halfWidM);
  const fr = displaceLngLat(c, bearingDeg, +halfLenM, +halfWidM);
  const br = displaceLngLat(c, bearingDeg, -halfLenM, +halfWidM);
  const bl = displaceLngLat(c, bearingDeg, -halfLenM, -halfWidM);
  return [[fl, fr, br, bl, fl]];
}

/**
 * Generates True 3D Extruded Vehicle Polygons (chassis + cabin + emergency lightbar)
 * so every car and ambulance sits directly on the Google Maps road surface in 3D WebGL space
 * and is 100% locked parallel to the road at every camera rotation/pitch/globe angle!
 */
export function build3DVehiclesGeoJSON(vehicles = [], activeAmbUnits = [], selectedCase = 1) {
  const features = [];

  vehicles.forEach((veh) => {
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
      : '#f8fafc';

    const cabinColor = isYielding
      ? '#78350f'
      : isEastBlockade
      ? '#7f1d1d'
      : '#0f172a';

    // 1. Lower Car Chassis (4.5m long x 1.95m wide x 1.1m tall)
    features.push({
      type: 'Feature',
      properties: {
        color: bodyColor,
        base: 0,
        height: 1.15,
      },
      geometry: {
        type: 'Polygon',
        coordinates: createOrientedRectCoords(snapped.lngLat, snapped.bearing, 2.25, 0.98, 0),
      },
    });

    // 2. Upper Car Cabin / Greenhouse (2.3m long x 1.65m wide, 1.15m -> 1.75m)
    features.push({
      type: 'Feature',
      properties: {
        color: cabinColor,
        base: 1.15,
        height: 1.75,
      },
      geometry: {
        type: 'Polygon',
        coordinates: createOrientedRectCoords(snapped.lngLat, snapped.bearing, 1.15, 0.82, -0.2),
      },
    });

    // 3. Front Hood / Headlight Bar Indicator (shows exact forward direction in 3D)
    features.push({
      type: 'Feature',
      properties: {
        color: '#fef08a',
        base: 0.4,
        height: 1.25,
      },
      geometry: {
        type: 'Polygon',
        coordinates: createOrientedRectCoords(snapped.lngLat, snapped.bearing, 0.3, 0.85, +2.05),
      },
    });
  });

  // Render 3D Extruded Ambulance Units
  activeAmbUnits.forEach((u) => {
    // Ambulance Body (6.4m long x 2.35m wide x 2.6m tall)
    features.push({
      type: 'Feature',
      properties: {
        color: '#ffffff',
        base: 0,
        height: 2.6,
      },
      geometry: {
        type: 'Polygon',
        coordinates: createOrientedRectCoords(u.lngLat, u.bearing, 3.2, 1.18, 0),
      },
    });

    // Ambulance Emergency Roof Stripe & Lightbar
    features.push({
      type: 'Feature',
      properties: {
        color: u.color || '#ef4444',
        base: 2.6,
        height: 3.25,
      },
      geometry: {
        type: 'Polygon',
        coordinates: createOrientedRectCoords(u.lngLat, u.bearing, 1.8, 0.95, 0.4),
      },
    });
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Generates High-Density 3D Extruded Buildings along M.G. Road, Brigade Road, Church Street,
 * Kamaraj Road, and Cubbon Road so zooming in ALWAYS renders realistic 3D urban massing
 * alongside the global OpenFreeMap 3D building layer!
 */
export function buildBengaluru3DBuildingsGeoJSON() {
  const bldgs = [
    // South of M.G. Road (between Church St and M.G. Road, West of Brigade Rd)
    { lng: 77.60445, lat: 12.97562, brg: 105, l: 28, w: 14, h: 32, col: '#1e293b' },
    { lng: 77.60525, lat: 12.97542, brg: 105, l: 34, w: 15, h: 46, col: '#334155' }, // Barton Centre / 13th Floor
    { lng: 77.60612, lat: 12.97518, brg: 105, l: 32, w: 14, h: 28, col: '#1e293b' },
    { lng: 77.60695, lat: 12.97496, brg: 105, l: 30, w: 14, h: 36, col: '#334155' },
    { lng: 77.60755, lat: 12.97480, brg: 105, l: 22, w: 13, h: 30, col: '#1e293b' }, // SkyDeck / Brigade Corner West

    // South-East of Brigade Rd & M.G. Road (Cauvery Emporium / Mayo Hall Block)
    { lng: 77.60855, lat: 12.97452, brg: 105, l: 30, w: 15, h: 38, col: '#334155' },
    { lng: 77.60935, lat: 12.97430, brg: 105, l: 35, w: 16, h: 54, col: '#1e293b' }, // Utility Building Tower
    { lng: 77.61025, lat: 12.97405, brg: 105, l: 32, w: 15, h: 34, col: '#334155' },

    // North-East of Kamaraj Rd & M.G. Road (Commercial Street / Dickenson Rd Block)
    { lng: 77.60865, lat: 12.97538, brg: 16,  l: 22, w: 14, h: 26, col: '#1e293b' },
    { lng: 77.60882, lat: 12.97595, brg: 16,  l: 24, w: 14, h: 32, col: '#334155' },
    { lng: 77.60902, lat: 12.97652, brg: 16,  l: 24, w: 15, h: 29, col: '#1e293b' },
    { lng: 77.60955, lat: 12.97515, brg: 105, l: 28, w: 15, h: 40, col: '#334155' },
    { lng: 77.61035, lat: 12.97492, brg: 105, l: 28, w: 15, h: 35, col: '#1e293b' },

    // Along Brigade Road (West & East sides of Brigade Rd South Arm)
    { lng: 77.60742, lat: 12.97445, brg: 21,  l: 24, w: 12, h: 28, col: '#334155' },
    { lng: 77.60722, lat: 12.97390, brg: 21,  l: 26, w: 12, h: 34, col: '#1e293b' },
    { lng: 77.60812, lat: 12.97425, brg: 21,  l: 24, w: 12, h: 30, col: '#1e293b' },
    { lng: 77.60792, lat: 12.97368, brg: 21,  l: 26, w: 13, h: 36, col: '#334155' },

    // Along Cubbon Road North Side
    { lng: 77.60825, lat: 12.97768, brg: 108, l: 28, w: 14, h: 30, col: '#1e293b' },
    { lng: 77.60725, lat: 12.97808, brg: 108, l: 30, w: 14, h: 36, col: '#334155' },
    { lng: 77.60615, lat: 12.97852, brg: 108, l: 28, w: 14, h: 32, col: '#1e293b' },
    { lng: 77.60505, lat: 12.97895, brg: 108, l: 28, w: 14, h: 42, col: '#334155' },
  ];

  return {
    type: 'FeatureCollection',
    features: bldgs.map((b, i) => ({
      type: 'Feature',
      id: i + 1,
      properties: {
        height: b.h,
        base: 0,
        color: b.col,
      },
      geometry: {
        type: 'Polygon',
        coordinates: createOrientedRectCoords([b.lng, b.lat], b.brg, b.l, b.w, 0),
      },
    })),
  };
}

/**
 * Builds GeoJSON features for the exact Google Maps Road Corridors:
 */
export function buildTwinRoadGeoJSON(selectedCase = 1, detourActive = false) {
  const N = GOOGLE_ROAD_NODES;
  const lines = [
    // Base M.G. Road Corridor Casing
    {
      type: 'Feature',
      properties: { kind: 'main_road_line', name: 'M.G. Road Corridor' },
      geometry: {
        type: 'LineString',
        coordinates: [N.W_EXIT, N.WP4, N.W_QUEUE, N.W_MID, N.J0, N.WP1, N.E_START, N.E_FAR],
      },
    },
    // Base Brigade Road -> Kamaraj Road Cross Corridor Casing
    {
      type: 'Feature',
      properties: { kind: 'cross_road_line', name: 'Brigade Rd & Kamaraj Rd Corridor' },
      geometry: {
        type: 'LineString',
        coordinates: [N.S_START, N.S_MID, N.S_NEAR, N.J0, N.N_NEAR, N.N_MID, N.N_UPPER, N.N_FAR, N.N_END],
      },
    },
  ];

  if (selectedCase === 1) {
    lines.push({
      type: 'Feature',
      properties: {
        kind: 'amb_corridor_case1',
        name: 'Case 01 M.G. Road Green Preemption Corridor',
      },
      geometry: {
        type: 'LineString',
        coordinates: [N.W_EXIT, N.WP4, N.W_QUEUE, N.W_MID, N.J0, N.WP1, N.E_START],
      },
    });
  } else if (selectedCase === 3) {
    // Ambulance A South->North Brigade Rd to Kamaraj Rd Priority Green Wave
    lines.push({
      type: 'Feature',
      properties: {
        kind: 'amb_a_corridor',
        name: 'Ambulance A Brigade Rd -> Kamaraj Rd Priority Green Wave',
      },
      geometry: {
        type: 'LineString',
        coordinates: [N.S_START, N.S_MID, N.S_NEAR, N.J0, N.N_NEAR, N.N_MID, N.N_UPPER, N.N_FAR, N.N_END],
      },
    });

    // Ambulance B 5-Leg Macro-Detour along East Bypass -> Cubbon Rd -> Anil Kumble / St. Mark's -> M.G. Rd
    lines.push({
      type: 'Feature',
      properties: {
        kind: 'amb_b_detour',
        active: detourActive ? 1 : 0,
        name: 'Ambulance B 5-Leg North Block Detour (Cubbon Rd Bypass)',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          N.E_START,
          N.WP1,
          N.WP1_MID,
          N.WP2,
          N.LEG3_M1,
          N.LEG3_M2,
          N.LEG3_M3,
          N.WP3,
          N.WP3_MID,
          N.WP4,
          N.W_EXIT,
        ],
      },
    });

    // East Approach Dense Gridlock Blockade Zone (X: 12..43 between J0 and WP1)
    const bStart = twinToRoadGeo(12, -3.5, { carType: 'W' }).lngLat;
    const bEnd = twinToRoadGeo(43, -3.5, { carType: 'W' }).lngLat;
    lines.push({
      type: 'Feature',
      properties: {
        kind: 'east_blockade',
        name: 'East Approach Gridlock Blockade (10 Cars Queued)',
      },
      geometry: {
        type: 'LineString',
        coordinates: [bStart, bEnd],
      },
    });
  }

  return {
    polygons: { type: 'FeatureCollection', features: [] },
    lines: { type: 'FeatureCollection', features: lines },
  };
}

export function createDefaultSnapshot(selectedCase = 1) {
  const cars = [];
  let idCount = 1;

  if (selectedCase === 3) {
    const nLanes = [
      { perpHome: 1.2, pullOverPerp: 1.0, zPositions: [16.0, 36.0, 58.0] },
      { perpHome: 3.4, pullOverPerp: 5.0, zPositions: [19.0, 42.0, 66.0] },
    ];
    nLanes.forEach((lane) => {
      lane.zPositions.forEach((zPos) => {
        cars.push({
          id: idCount++,
          type: 'N',
          x: lane.perpHome,
          z: zPos,
          homePerp: lane.perpHome,
          pullOverPerp: lane.pullOverPerp,
          rotY: 0,
          speed: 0,
          state: 'IDLE_QUEUE',
          receivesBLE: false,
        });
      });
    });

    const sLanes = [
      { perpHome: -3.1, stopLine: -11, sign: 1, carCount: 3, stagger: 0 },
      { perpHome: -1.8, stopLine: -11, sign: 1, carCount: 3, stagger: 4 },
    ];
    sLanes.forEach((lane) => {
      for (let i = 0; i < lane.carCount; i++) {
        const zPos = lane.stopLine - lane.sign * (3 + lane.stagger + i * 8);
        cars.push({
          id: idCount++,
          type: 'S',
          x: lane.perpHome,
          z: zPos,
          homePerp: lane.perpHome,
          pullOverPerp: -3.4,
          rotY: 0,
          speed: 0,
          state: 'IDLE_QUEUE',
          receivesBLE: false,
        });
      }
    });

    const westApproachLanes = [
      { perpHome: 1.8, xPositions: [-13.0, -23.0, -35.0, -48.0] },
      { perpHome: 3.5, xPositions: [-16.0, -27.0, -39.0, -53.0] },
      { perpHome: 5.2, xPositions: [-19.0, -31.0, -44.0, -59.0] },
    ];
    westApproachLanes.forEach((lane) => {
      lane.xPositions.forEach((xPos) => {
        cars.push({
          id: idCount++,
          type: 'E',
          x: xPos,
          z: lane.perpHome,
          homePerp: lane.perpHome,
          pullOverPerp: lane.perpHome,
          rotY: 0,
          speed: 0,
          state: 'IDLE_QUEUE',
          receivesBLE: false,
        });
      });
    });

    const calibratedEastCars = [
      { id: 26, x: 16.20, z: -1.80 },
      { id: 27, x: 25.98, z: -2.43 },
      { id: 29, x: 42.00, z: -2.35 },
      { id: 31, x: 20.85, z: -3.69 },
      { id: 32, x: 26.82, z: -5.06 },
      { id: 34, x: 42.72, z: -5.77 },
      { id: 35, x: 15.65, z: -5.20 },
      { id: 36, x: 21.43, z: -5.54 },
      { id: 37, x: 30.77, z: -4.88 },
      { id: 38, x: 38.87, z: -5.15 },
    ];
    calibratedEastCars.forEach((c) => {
      cars.push({
        id: c.id,
        type: 'W',
        x: c.x,
        z: c.z,
        homePerp: c.z,
        pullOverPerp: c.z,
        rotY: 0,
        speed: 0,
        state: 'IDLE_QUEUE',
        receivesBLE: false,
      });
    });
  } else {
    const lanes = [
      { dir: 'N', axis: 'z', sign: -1, perpHome: 2.5, pullOverPerp: 3.1, stopLine: 11 },
      { dir: 'N', axis: 'z', sign: -1, perpHome: 1.0, pullOverPerp: 2.5, stopLine: 11 },
      { dir: 'S', axis: 'z', sign: 1, perpHome: -3.1, pullOverPerp: -3.4, stopLine: -11 },
      { dir: 'S', axis: 'z', sign: 1, perpHome: -1.8, pullOverPerp: -3.2, stopLine: -11 },
      { dir: 'E', axis: 'x', sign: 1, perpHome: -7.5, pullOverPerp: -9.0, stopLine: -7 },
      { dir: 'E', axis: 'x', sign: 1, perpHome: -4.5, pullOverPerp: -2.0, stopLine: -7 },
      { dir: 'W', axis: 'x', sign: -1, perpHome: 4.5, pullOverPerp: 1.5, stopLine: 6 },
      { dir: 'W', axis: 'x', sign: -1, perpHome: 7.5, pullOverPerp: 9.0, stopLine: 6 },
    ];

    for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
      const lane = lanes[laneIdx];
      const carCount = lane.dir === 'E' ? 9 : lane.dir === 'N' || lane.dir === 'S' ? 3 : 4;
      const laneStagger = (laneIdx % 2) * 5;
      const spacing = lane.dir === 'E' ? 7 : 8;

      for (let i = 0; i < carCount; i++) {
        const posParallel = lane.stopLine - lane.sign * (2 + laneStagger + i * spacing);
        cars.push({
          id: idCount++,
          type: lane.dir,
          x: lane.axis === 'x' ? posParallel : lane.perpHome,
          z: lane.axis === 'z' ? posParallel : lane.perpHome,
          homePerp: lane.perpHome,
          pullOverPerp: lane.pullOverPerp,
          rotY: 0,
          speed: 0,
          state: 'IDLE_QUEUE',
          receivesBLE: false,
        });
      }
    }
  }

  return {
    timestamp: Date.now(),
    source: 'FALLBACK_INIT',
    selectedCase,
    isSimulationRunning: false,
    isPreempted: false,
    isFrozen: false,
    deadlockDetected: false,
    trafficCycleActive: false,
    signalPhase: 'ALL_RED',
    timeRemaining: 15,
    signals: {
      nGreen: false, sGreen: false, eGreen: false, wGreen: false,
      nYellow: false, sYellow: false, eYellow: false, wYellow: false,
    },
    ambulancePosition: { x: -120, y: 0.5, z: -6.0, rotation: -Math.PI / 2 },
    ambulanceA: {
      id: 'AMB_A',
      name: 'Ambulance A (Cardiac - South)',
      status: 'IDLE_STANDBY',
      position: { x: 2.2, y: 0.65, z: 90.0, rotation: 0 },
      distanceToJunction: 90.0,
    },
    ambulanceB: {
      id: 'AMB_B',
      name: 'Ambulance B (Trauma - East)',
      status: 'IDLE_STANDBY',
      currentWaypointIdx: 0,
      waypointName: 'Awaiting Dispatch',
      detourActive: false,
      position: { x: 90.0, y: 0.65, z: -2.89, rotation: Math.PI / 2 },
    },
    vehicles: cars,
    auditLogs: [
      { id: 1, timestamp: '[READY]', message: 'Google Maps Satellite + 3D Buildings Road-Snapped Engine Ready.' },
    ],
  };
}

/**
 * Publisher Hook used inside src/app/page.js (3D Twin Command Center)
 */
export function useV2XPublisher(props = {}) {
  const {
    selectedCase = 1,
    vehiclesRef,
    case1Stream,
    case1Signal,
    case3,
    onRemoteCommand,
  } = props;

  const channelRef = useRef(null);
  const altChannelRef = useRef(null);
  const cmdCallbackRef = useRef(onRemoteCommand);

  useEffect(() => {
    cmdCallbackRef.current = onRemoteCommand;
  }, [onRemoteCommand]);

  const stateRef = useRef({});
  useEffect(() => {
    const isSimRunning = props.isSimulationRunning !== undefined
      ? props.isSimulationRunning
      : (selectedCase === 1 ? case1Stream?.isSimulationRunning : case3?.isSimulationRunning);

    const isPreempted = props.isPreempted !== undefined
      ? props.isPreempted
      : (selectedCase === 1 ? case1Signal?.isPreempted : (case3?.deadlockDetected && !case3?.trafficCycleActive));

    const isFrozen = props.isFrozen !== undefined
      ? props.isFrozen
      : (selectedCase === 1 ? case1Stream?.isFrozen : case3?.isFrozen);

    const deadlockDetected = props.deadlockDetected !== undefined
      ? props.deadlockDetected
      : (selectedCase === 3 ? Boolean(case3?.deadlockDetected) : false);

    const trafficCycleActive = props.trafficCycleActive !== undefined
      ? props.trafficCycleActive
      : (selectedCase === 3 ? Boolean(case3?.trafficCycleActive) : false);

    const signalPhase = props.signalPhase !== undefined
      ? props.signalPhase
      : (selectedCase === 1 ? case1Signal?.signalPhase : case3?.signals?.phase);

    const timeRemaining = props.timeRemaining !== undefined
      ? props.timeRemaining
      : (selectedCase === 1 ? case1Signal?.timeRemaining : case3?.signals?.timeRemaining);

    const signals = props.signals !== undefined
      ? props.signals
      : {
          nGreen: selectedCase === 1 ? case1Signal?.nGreen : case3?.signals?.nGreen,
          sGreen: selectedCase === 1 ? case1Signal?.sGreen : case3?.signals?.sGreen,
          eGreen: selectedCase === 1 ? case1Signal?.eGreen : case3?.signals?.eGreen,
          wGreen: selectedCase === 1 ? case1Signal?.wGreen : case3?.signals?.wGreen,
          nYellow: selectedCase === 1 ? case1Signal?.nYellow : case3?.signals?.nYellow,
          sYellow: selectedCase === 1 ? case1Signal?.sYellow : case3?.signals?.sYellow,
          eYellow: selectedCase === 1 ? case1Signal?.eYellow : case3?.signals?.eYellow,
          wYellow: selectedCase === 1 ? case1Signal?.wYellow : case3?.signals?.wYellow,
        };

    const ambulancePosition = props.ambulancePosition !== undefined
      ? props.ambulancePosition
      : case1Stream?.ambulancePosition;

    const ambulanceA = props.ambulanceA !== undefined
      ? props.ambulanceA
      : case3?.ambulanceA;

    const ambulanceB = props.ambulanceB !== undefined
      ? props.ambulanceB
      : case3?.ambulanceB;

    const auditLogs = props.auditLogs !== undefined
      ? props.auditLogs
      : (selectedCase === 1 ? case1Stream?.auditLogs : case3?.auditLogs);

    stateRef.current = {
      selectedCase,
      isSimulationRunning: isSimRunning,
      isPreempted,
      isFrozen,
      deadlockDetected,
      trafficCycleActive,
      signalPhase,
      timeRemaining,
      signals,
      ambulancePosition,
      ambulanceA,
      ambulanceB,
      auditLogs,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
    const altBc = 'BroadcastChannel' in window ? new BroadcastChannel(ALT_CHANNEL_NAME) : null;
    channelRef.current = bc;
    altChannelRef.current = altBc;

    const handleMessage = (event) => {
      const data = event?.data;
      if (data && (data.type === 'SEMTOS_REMOTE_CMD' || data.type === 'COMMAND') && cmdCallbackRef.current) {
        cmdCallbackRef.current(data.command, data.payload || {});
      }
    };

    if (bc) bc.addEventListener('message', handleMessage);
    if (altBc) altBc.addEventListener('message', handleMessage);

    const handleStorage = (e) => {
      if (e.key === CMD_STORAGE_KEY && e.newValue && cmdCallbackRef.current) {
        try {
          const parsed = JSON.parse(e.newValue);
          cmdCallbackRef.current(parsed.command, parsed.payload || {});
        } catch (_) {}
      }
    };
    window.addEventListener('storage', handleStorage);

    let tickCount = 0;
    const interval = setInterval(() => {
      const s = stateRef.current;
      const rawCars = vehiclesRef?.current || [];

      const serializedCars = rawCars.map((c) => ({
        id: c.id,
        type: c.type,
        x: Number((c.pos?.x ?? c.x ?? 0).toFixed(2)),
        z: Number((c.pos?.z ?? c.z ?? 0).toFixed(2)),
        rotY: Number((c.rotY ?? 0).toFixed(3)),
        speed: Number((c.speed ?? 0).toFixed(2)),
        state: c.state || 'IDLE_QUEUE',
        receivesBLE: Boolean(c.receivesBLE),
      }));

      const snapshot = {
        timestamp: Date.now(),
        source: 'LIVE_3D_TWIN',
        selectedCase: s.selectedCase,
        isSimulationRunning: s.isSimulationRunning,
        isPreempted: s.isPreempted,
        isFrozen: s.isFrozen,
        deadlockDetected: s.deadlockDetected,
        trafficCycleActive: s.trafficCycleActive,
        signalPhase: s.signalPhase,
        timeRemaining: s.timeRemaining,
        signals: s.signals,
        ambulancePosition: s.ambulancePosition,
        ambulanceA: s.ambulanceA,
        ambulanceB: s.ambulanceB,
        vehicles: serializedCars,
        auditLogs: (s.auditLogs || []).slice(0, 18),
      };

      if (bc) {
        bc.postMessage({ type: 'SEMTOS_SNAPSHOT', snapshot });
      }
      if (altBc) {
        altBc.postMessage({ type: 'SNAPSHOT', payload: snapshot });
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      } catch (_) {}

      // Periodic LAN sync with /api/v2x
      tickCount++;
      if (tickCount % 4 === 0) {
        try {
          fetch('/api/v2x', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'SNAPSHOT', payload: snapshot }),
          }).catch(() => {});

          fetch('/api/v2x?consumeCommands=1', { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data?.commands && Array.isArray(data.commands) && cmdCallbackRef.current) {
                data.commands.forEach((c) => {
                  cmdCallbackRef.current(c.command, c.payload || {});
                });
              }
            })
            .catch(() => {});
        } catch (_) {}
      }
    }, 65);

    return () => {
      clearInterval(interval);
      if (bc) {
        bc.removeEventListener('message', handleMessage);
        bc.close();
      }
      if (altBc) {
        altBc.removeEventListener('message', handleMessage);
        altBc.close();
      }
      window.removeEventListener('storage', handleStorage);
    };
  }, [vehiclesRef]);
}

/**
 * Subscriber Hook used inside /ambulance and /driver
 */
export function useV2XSubscriber() {
  const [snapshot, setSnapshot] = useState(() => createDefaultSnapshot(1));
  const [isLiveTwinConnected, setIsLiveTwinConnected] = useState(false);
  const lastLiveTimestampRef = useRef(0);
  const channelRef = useRef(null);
  const altChannelRef = useRef(null);

  const localSimRef = useRef(createDefaultSnapshot(1));
  const localCase3ClockRef = useRef(0);

  const sendCommand = useCallback((command, payload = {}) => {
    if (typeof window === 'undefined') return;

    const msg = {
      type: 'SEMTOS_REMOTE_CMD',
      command,
      payload,
      timestamp: Date.now(),
    };

    if (channelRef.current) {
      try {
        channelRef.current.postMessage(msg);
      } catch (_) {}
    }
    if (altChannelRef.current) {
      try {
        altChannelRef.current.postMessage({ type: 'COMMAND', command, payload });
      } catch (_) {}
    }
    try {
      localStorage.setItem(CMD_STORAGE_KEY, JSON.stringify(msg));
    } catch (_) {}

    fetch('/api/v2x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'COMMAND', command, payload }),
    }).catch(() => {});

    const sim = localSimRef.current;
    if (command === 'SET_CASE' || command === 'SWITCH_CASE') {
      const nextCase = payload.caseNumber || payload.caseId || 1;
      localSimRef.current = createDefaultSnapshot(nextCase);
      localCase3ClockRef.current = 0;
      setSnapshot({ ...localSimRef.current });
    } else if (command === 'DISPATCH') {
      const reset = createDefaultSnapshot(sim.selectedCase);
      reset.isSimulationRunning = true;
      reset.trafficCycleActive = false;
      if (reset.selectedCase === 3) {
        reset.ambulanceA.status = 'EN_ROUTE';
        reset.ambulanceB.status = 'EN_ROUTE';
      }
      localCase3ClockRef.current = 0;
      localSimRef.current = reset;
      setSnapshot({ ...reset });
    } else if (command === 'FREEZE') {
      sim.isFrozen = !sim.isFrozen;
      setSnapshot({ ...sim });
    } else if (command === 'NORMAL_CYCLE') {
      const reset = createDefaultSnapshot(sim.selectedCase);
      reset.trafficCycleActive = true;
      reset.signalPhase = 'N_GREEN';
      reset.signals = {
        nGreen: true, sGreen: false, eGreen: false, wGreen: false,
        nYellow: false, sYellow: false, eYellow: false, wYellow: false,
      };
      localSimRef.current = reset;
      setSnapshot({ ...reset });
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Date.now() - (parsed.timestamp || 0) < 2500) {
          lastLiveTimestampRef.current = parsed.timestamp;
          setIsLiveTwinConnected(true);
          setSnapshot(parsed);
        }
      }
    } catch (_) {}

    const bc = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
    const altBc = 'BroadcastChannel' in window ? new BroadcastChannel(ALT_CHANNEL_NAME) : null;
    channelRef.current = bc;
    altChannelRef.current = altBc;

    const onMessage = (event) => {
      const data = event?.data;
      if (data && data.type === 'SEMTOS_SNAPSHOT' && data.snapshot) {
        lastLiveTimestampRef.current = Date.now();
        setIsLiveTwinConnected(true);
        setSnapshot(data.snapshot);
      } else if (data && data.type === 'SNAPSHOT' && data.payload) {
        lastLiveTimestampRef.current = Date.now();
        setIsLiveTwinConnected(true);
        setSnapshot(data.payload);
      }
    };

    if (bc) bc.addEventListener('message', onMessage);
    if (altBc) altBc.addEventListener('message', onMessage);

    const standAloneTimer = setInterval(() => {
      const age = Date.now() - lastLiveTimestampRef.current;
      if (age < 1500) {
        setIsLiveTwinConnected(true);
        return;
      }

      // Try LAN polling fallback
      fetch('/api/v2x', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.snapshot && Date.now() - (data.lastUpdated || 0) < 2500) {
            lastLiveTimestampRef.current = Date.now();
            setIsLiveTwinConnected(true);
            setSnapshot(data.snapshot);
          }
        })
        .catch(() => {});

      if (Date.now() - lastLiveTimestampRef.current < 2000) {
        return;
      }
      setIsLiveTwinConnected(false);

      const sim = localSimRef.current;
      if (sim.isFrozen) return;

      const dt = 0.08;

      if (sim.selectedCase === 1) {
        if (sim.isSimulationRunning) {
          let nextX = sim.ambulancePosition.x + 17.5 * dt;
          const dist = Math.abs(nextX);
          const preempt = nextX < 18 && dist <= 105;
          sim.isPreempted = preempt;

          if (preempt) {
            sim.signalPhase = 'EW_PREEMPT';
            sim.signals = {
              nGreen: false, sGreen: false, eGreen: true, wGreen: false,
              nYellow: false, sYellow: false, eYellow: false, wYellow: false,
            };
          } else {
            sim.signalPhase = 'NORMAL_CYCLE';
            sim.signals = {
              nGreen: false, sGreen: false, eGreen: false, wGreen: true,
              nYellow: false, sYellow: false, eYellow: false, wYellow: false,
            };
          }

          if (nextX > 110) {
            nextX = -120;
            sim.isSimulationRunning = false;
            sim.isPreempted = false;
          }
          sim.ambulancePosition = { ...sim.ambulancePosition, x: nextX };
        } else {
          const phaseIdx = Math.floor((Date.now() / 6000) % 4);
          sim.signalPhase = 'NORMAL_CYCLE';
          sim.signals = {
            nGreen: phaseIdx === 0,
            sGreen: phaseIdx === 1,
            eGreen: phaseIdx === 2,
            wGreen: phaseIdx === 3,
            nYellow: false, sYellow: false, eYellow: false, wYellow: false,
          };
        }

        const ambX = sim.ambulancePosition.x;
        const ambZ = sim.ambulancePosition.z;

        sim.vehicles.forEach((v) => {
          const distToAmb = Math.hypot(v.x - ambX, v.z - ambZ);
          v.receivesBLE = sim.isSimulationRunning && distToAmb <= 35;

          const isGreen =
            (v.type === 'N' && sim.signals.nGreen) ||
            (v.type === 'S' && sim.signals.sGreen) ||
            (v.type === 'E' && sim.signals.eGreen) ||
            (v.type === 'W' && sim.signals.wGreen);

          if (v.type === 'E' && v.receivesBLE && v.x > ambX - 5) {
            v.state = 'YIELDING';
            v.z += (v.pullOverPerp - v.z) * 0.18;
            v.rotY = (v.pullOverPerp - v.z) * -0.15;
            v.speed = isGreen ? 6 : 0;
          } else {
            v.state = isGreen ? 'MOVING' : 'IDLE_QUEUE';
            v.z += (v.homePerp - v.z) * 0.12;
            v.rotY = 0;
            v.speed = isGreen ? 12 : 0;
          }

          if (v.speed > 0) {
            if (v.type === 'E') {
              v.x += v.speed * dt;
              if (v.x > 95) v.x = -95;
            } else if (v.type === 'W') {
              v.x -= v.speed * dt;
              if (v.x < -95) v.x = 95;
            } else if (v.type === 'N') {
              v.z -= v.speed * dt;
              if (v.z < -85) v.z = 85;
            } else if (v.type === 'S') {
              v.z += v.speed * dt;
              if (v.z > 85) v.z = -85;
            }
          }
        });
      } else if (sim.selectedCase === 3) {
        if (sim.isSimulationRunning) {
          localCase3ClockRef.current += dt;
          const t = localCase3ClockRef.current;

          if (t >= 1.2 && !sim.deadlockDetected) {
            sim.deadlockDetected = true;
            sim.isPreempted = true;
            sim.ambulanceB.detourActive = true;
            sim.signalPhase = 'S_GREEN_CORRIDOR';
            sim.signals = {
              nGreen: true, sGreen: true, eGreen: false, wGreen: false,
              nYellow: false, sYellow: false, eYellow: false, wYellow: false,
            };
          }

          const nextAz = sim.ambulanceA.position.z - 16.5 * dt;
          sim.ambulanceA.position = {
            x: 2.2,
            y: 0.65,
            z: nextAz,
            rotation: 0,
          };
          sim.ambulanceA.distanceToJunction = Math.max(0, Math.round(nextAz));
          if (nextAz < -95) sim.ambulanceA.status = 'CLEARED';

          const waypoints = [
            { x: 47.0, z: -2.89, rot: Math.PI / 2, label: 'Leg 1: M.G. Rd East -> WP1 Turnoff (X: 47)' },
            { x: 47.0, z: -60.0, rot: 0, label: 'Leg 2: North Bypass -> WP2 Cubbon Rd (Z: -60)' },
            { x: -87.0, z: -60.0, rot: Math.PI / 2, label: 'Leg 3: Cubbon Rd Westbound -> WP3 (X: -87)' },
            { x: -87.0, z: -2.89, rot: Math.PI, label: 'Leg 4: St. Marks / Anil Kumble Return -> WP4' },
            { x: -135.0, z: -2.89, rot: Math.PI / 2, label: 'Leg 5: M.G. Road Westbound Exit' },
          ];

          const wpIdx = sim.ambulanceB.currentWaypointIdx || 0;
          if (wpIdx < waypoints.length) {
            const target = waypoints[wpIdx];
            const dx = target.x - sim.ambulanceB.position.x;
            const dz = target.z - sim.ambulanceB.position.z;
            const d = Math.hypot(dx, dz);
            const step = 19.5 * dt;

            sim.ambulanceB.waypointName = target.label;
            sim.ambulanceB.position.rotation = target.rot;

            if (d <= step) {
              sim.ambulanceB.position.x = target.x;
              sim.ambulanceB.position.z = target.z;
              sim.ambulanceB.currentWaypointIdx = wpIdx + 1;
            } else {
              sim.ambulanceB.position.x += (dx / d) * step;
              sim.ambulanceB.position.z += (dz / d) * step;
            }
          } else {
            sim.ambulanceB.status = 'CLEARED';
          }

          if (sim.ambulanceA.status === 'CLEARED' && sim.ambulanceB.status === 'CLEARED') {
            sim.isSimulationRunning = false;
            sim.deadlockDetected = false;
            sim.isPreempted = false;
            sim.trafficCycleActive = true;
            sim.signals = {
              nGreen: false, sGreen: false, eGreen: false, wGreen: true,
              nYellow: false, sYellow: false, eYellow: false, wYellow: false,
            };
          }

          const ambAz = sim.ambulanceA.position.z;
          sim.vehicles.forEach((v) => {
            if (v.type === 'N') {
              const distA = Math.abs(v.z - ambAz);
              v.receivesBLE = distA < 48 && ambAz > -25;
              if (v.receivesBLE) {
                v.state = 'YIELDING';
                v.x += (v.pullOverPerp - v.x) * 0.2;
                v.rotY = v.pullOverPerp > v.homePerp ? -0.18 : 0.18;
              } else {
                v.x += (v.homePerp - v.x) * 0.12;
                v.rotY = 0;
              }
              if (ambAz < v.z - 16 && sim.signals.nGreen) {
                v.speed = 11.5;
                v.z -= v.speed * dt;
                if (v.z < -95) v.z = 85;
              } else {
                v.speed = 0;
              }
            }
          });
        } else if (sim.trafficCycleActive) {
          sim.vehicles.forEach((v) => {
            if (v.type === 'W') {
              v.speed = 11.0;
              v.state = 'MOVING';
              v.x -= v.speed * dt;
              if (v.x < -95) v.x = 85;
            }
          });
        }
      }

      setSnapshot({
        ...sim,
        timestamp: Date.now(),
        vehicles: sim.vehicles.map((c) => ({ ...c })),
        ambulancePosition: { ...sim.ambulancePosition },
        ambulanceA: { ...sim.ambulanceA, position: { ...sim.ambulanceA.position } },
        ambulanceB: { ...sim.ambulanceB, position: { ...sim.ambulanceB.position } },
      });
    }, 80);

    return () => {
      clearInterval(standAloneTimer);
      if (bc) {
        bc.removeEventListener('message', onMessage);
        bc.close();
      }
      if (altBc) {
        altBc.removeEventListener('message', onMessage);
        altBc.close();
      }
    };
  }, []);

  return {
    snapshot,
    isLiveTwinConnected,
    sendCommand,
  };
}
