// hooks/useV2XSync.js
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';

// ── 1. Real Google Maps Road Network Nodes in Bengaluru (M.G. Road Corridor) ──
// Central Junction (0, 0) = M.G. Road & Brigade Road Intersection
export const ORIGIN_LNG = 77.606620;
export const ORIGIN_LAT = 12.975220;

export const GOOGLE_ROAD_NODES = {
  // Main Avenue (M.G. Road: West <-> East)
  W_EXIT:   [77.59945, 12.97722], // X = -135 (Queen's Statue / Cubbon Park West)
  WP4:      [77.60180, 12.97657], // X = -87  (Anil Kumble Circle / Central St Rejoin)
  J0:       [77.60662, 12.97522], // X = 0    (M.G. Road & Brigade Road Central Signal)
  WP1:      [77.60925, 12.97448], // X = +47  (M.G. Road & Kamaraj Road Turnoff)
  E_START:  [77.61190, 12.97388], // X = +90  (Mayo Hall East Approach)
  E_FAR:    [77.61365, 12.97358], // X = +120 (1 MG Lido Mall)

  // Cross Corridor (Brigade Road South -> J0 -> North Connector)
  S_START:  [77.60582, 12.97125], // Z = +90  (Brigade Road South)
  S_MID:    [77.60622, 12.97320], // Z = +45  (Brigade Road Mid)
  N_MID:    [77.60710, 12.97685], // Z = -60  (North Cross Connector)
  N_END:    [77.60755, 12.97825], // Z = -120 (North Exit)

  // Case 03 5-Leg North Block Detour (Kamaraj Rd -> Cubbon Rd -> Central St)
  WP1_MID:  [77.60902, 12.97625], // Kamaraj Road Midpoint
  WP2:      [77.60878, 12.97798], // X = +47, Z = -60 (Kamaraj Rd & Cubbon Rd Corner)
  LEG3_M1:  [77.60650, 12.97832], // Cubbon Road East-Mid
  LEG3_M2:  [77.60440, 12.97864], // Cubbon Road West-Mid (Chinnaswamy North)
  WP3:      [77.60242, 12.97892], // X = -87, Z = -60 (Cubbon Rd & Central St / Minsk Sq)
  WP3_MID:  [77.60210, 12.97775], // Central Street Midpoint
};

// Polylines with corresponding 3D Twin axis stations
const MAIN_AVE_STATIONS = [
  { x: -135, coord: GOOGLE_ROAD_NODES.W_EXIT },
  { x: -87,  coord: GOOGLE_ROAD_NODES.WP4 },
  { x: 0,    coord: GOOGLE_ROAD_NODES.J0 },
  { x: 47,   coord: GOOGLE_ROAD_NODES.WP1 },
  { x: 90,   coord: GOOGLE_ROAD_NODES.E_START },
  { x: 120,  coord: GOOGLE_ROAD_NODES.E_FAR },
];

const CROSS_AVE_STATIONS = [
  { z: 90,   coord: GOOGLE_ROAD_NODES.S_START },
  { z: 45,   coord: GOOGLE_ROAD_NODES.S_MID },
  { z: 0,    coord: GOOGLE_ROAD_NODES.J0 },
  { z: -60,  coord: GOOGLE_ROAD_NODES.N_MID },
  { z: -120, coord: GOOGLE_ROAD_NODES.N_END },
];

const DETOUR_LEG2_STATIONS = [
  { z: -2.89, coord: GOOGLE_ROAD_NODES.WP1 },
  { z: -31.5, coord: GOOGLE_ROAD_NODES.WP1_MID },
  { z: -60.0, coord: GOOGLE_ROAD_NODES.WP2 },
];

const DETOUR_LEG3_STATIONS = [
  { x: 47.0,  coord: GOOGLE_ROAD_NODES.WP2 },
  { x: 2.0,   coord: GOOGLE_ROAD_NODES.LEG3_M1 },
  { x: -42.0, coord: GOOGLE_ROAD_NODES.LEG3_M2 },
  { x: -87.0, coord: GOOGLE_ROAD_NODES.WP3 },
];

const DETOUR_LEG4_STATIONS = [
  { z: -60.0, coord: GOOGLE_ROAD_NODES.WP3 },
  { z: -31.5, coord: GOOGLE_ROAD_NODES.WP3_MID },
  { z: -2.89, coord: GOOGLE_ROAD_NODES.WP4 },
];

function computeBearing([lon1, lat1], [lon2, lat2]) {
  const toRad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Shifts [lng, lat] laterally by `lateralMeters` perpendicular to `roadBearingDeg`.
 * Positive `lateralMeters` shifts to the right of `roadBearingDeg`; negative shifts left.
 */
export function offsetLngLatPerpendicular([lng, lat], roadBearingDeg, lateralMeters) {
  if (!lateralMeters || Math.abs(lateralMeters) < 0.05) return [lng, lat];
  const perpBearingRad = ((roadBearingDeg + 90) % 360) * (Math.PI / 180);
  const dLat = (lateralMeters * Math.cos(perpBearingRad)) / 110630.0;
  const dLng = (lateralMeters * Math.sin(perpBearingRad)) / 108460.0;
  return [lng + dLng, lat + dLat];
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
 * Takes any 3D Twin coordinate (x, z) + vehicle/ambulance context and returns:
 *   { lngLat: [lng, lat], bearing: degrees }
 * Guaranteed to lie 100% on the real Google Maps road network!
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
      // Leg 2: Kamaraj Road Northbound (WP1 -> WP2)
      const res = interpolateStations(DETOUR_LEG2_STATIONS, 'z', z);
      return { lngLat: res.coord, bearing: res.bearing };
    }
    if (wpIdx === 2 || z <= -55.0) {
      // Leg 3: Cubbon Road Westbound (WP2 -> WP3)
      const res = interpolateStations(DETOUR_LEG3_STATIONS, 'x', x);
      return { lngLat: res.coord, bearing: res.bearing };
    }
    if (wpIdx === 3 || (Math.abs(x - (-87)) < 4.5 && z < -4.5)) {
      // Leg 4: Central Street Southbound (WP3 -> WP4)
      const res = interpolateStations(DETOUR_LEG4_STATIONS, 'z', z);
      return { lngLat: res.coord, bearing: res.bearing };
    }
    // Leg 1 (East approach x: 90 -> 47) or Leg 5 (West exit x: -87 -> -135) on M.G. Road
    const res = interpolateStations(MAIN_AVE_STATIONS, 'x', x);
    // Westbound along M.G. Road is opposite to increasing X station order
    const westboundBearing = (res.bearing + 180) % 360;
    const lateralMeters = (z / 9.5) * 4.2;
    return {
      lngLat: offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters),
      bearing: westboundBearing,
    };
  }

  // ── CASE B: Ambulance A on Brigade Road South->North Priority Corridor ──
  if (isAmbulance && ambId === 'AMB_A') {
    const res = interpolateStations(CROSS_AVE_STATIONS, 'z', z);
    const lateralMeters = (x / 5.5) * 3.0;
    return {
      lngLat: offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters),
      bearing: res.bearing,
    };
  }

  // ── CASE C: Case 01 Single Ambulance on M.G. Road West->East Corridor ──
  if (isAmbulance) {
    const res = interpolateStations(MAIN_AVE_STATIONS, 'x', x);
    const lateralMeters = (z / 9.5) * 4.2;
    return {
      lngLat: offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters),
      bearing: res.bearing,
    };
  }

  // ── CASE D: Civilian Cars on M.G. Road ('E' Eastbound or 'W' Westbound) ──
  if (carType === 'E' || carType === 'W') {
    const res = interpolateStations(MAIN_AVE_STATIONS, 'x', x);
    // Scale 3D Twin lateral Z (-9.5..+9.5) to real M.G. Road half-width (-4.5m..+4.5m)
    const lateralMeters = (z / 9.5) * 4.5;
    const coords = offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters);
    const baseBearing = carType === 'E' ? res.bearing : (res.bearing + 180) % 360;
    return {
      lngLat: coords,
      bearing: (baseBearing + steerDeg + 360) % 360,
    };
  }

  // ── CASE E: Civilian Cars on Brigade Road ('N' Northbound or 'S' Southbound) ──
  if (carType === 'N' || carType === 'S') {
    const res = interpolateStations(CROSS_AVE_STATIONS, 'z', z);
    // Scale 3D Twin lateral X (-5.4..+5.4) to real Brigade Road half-width (-3.5m..+3.5m)
    const lateralMeters = (x / 5.4) * 3.5;
    const coords = offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters);
    // CROSS_AVE_STATIONS is ordered z: +90 (South) -> -120 (North), so res.bearing is Northbound
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
    const lateralMeters = (x / 5.4) * 3.5;
    return {
      lngLat: offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters),
      bearing: res.bearing,
    };
  }
  const res = interpolateStations(MAIN_AVE_STATIONS, 'x', x);
  const lateralMeters = (z / 9.5) * 4.5;
  return {
    lngLat: offsetLngLatPerpendicular(res.coord, res.bearing, lateralMeters),
    bearing: res.bearing,
  };
}

/**
 * Legacy helper wrapper so any call to twinToLngLat(x, z) automatically uses road-snapped coordinates
 */
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
 * Builds GeoJSON features for the exact Google Maps Road Corridors:
 *   - M.G. Road Main Corridor
 *   - Brigade Road South-North Priority Corridor (Case 03 Ambulance A)
 *   - Kamaraj Rd -> Cubbon Rd -> Central St 5-Leg Macro-Detour (Case 03 Ambulance B)
 *   - East Approach Gridlock Blockade Zone (between Kamaraj Rd WP1 and Brigade Rd J0)
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
        coordinates: [N.W_EXIT, N.WP4, N.J0, N.WP1, N.E_START, N.E_FAR],
      },
    },
    // Base Brigade Road Cross Corridor Casing
    {
      type: 'Feature',
      properties: { kind: 'cross_road_line', name: 'Brigade Road Corridor' },
      geometry: {
        type: 'LineString',
        coordinates: [N.S_START, N.S_MID, N.J0, N.N_MID, N.N_END],
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
        coordinates: [N.W_EXIT, N.WP4, N.J0, N.WP1, N.E_START],
      },
    });
  } else if (selectedCase === 3) {
    // Ambulance A South->North Brigade Road Green Corridor
    lines.push({
      type: 'Feature',
      properties: {
        kind: 'amb_a_corridor',
        name: 'Ambulance A Brigade Road Priority Green Wave',
      },
      geometry: {
        type: 'LineString',
        coordinates: [N.S_START, N.S_MID, N.J0, N.N_MID, N.N_END],
      },
    });

    // Ambulance B 5-Leg Macro-Detour along Kamaraj Rd -> Cubbon Rd -> Central St -> M.G. Rd
    lines.push({
      type: 'Feature',
      properties: {
        kind: 'amb_b_detour',
        active: detourActive ? 1 : 0,
        name: 'Ambulance B 5-Leg North Block Detour (Kamaraj Rd -> Cubbon Rd -> Central St)',
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
          N.WP3,
          N.WP3_MID,
          N.WP4,
          N.W_EXIT,
        ],
      },
    });

    // East Approach Dense Gridlock Blockade Zone (X: 10..43 between J0 and WP1)
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

/**
 * Generates a fallback deterministic snapshot matching TrafficManager.jsx
 * when /ambulance or /driver is opened before the 3D Twin tab is started.
 */
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
      { id: 1, timestamp: '[READY]', message: 'Google Maps Satellite Road-Snapped Engine Ready.' },
    ],
  };
}

/**
 * Publisher Hook used inside src/app/page.js (3D Twin Command Center)
 */
export function useV2XPublisher({
  selectedCase,
  vehiclesRef,
  case1Stream,
  case1Signal,
  case3,
  onRemoteCommand,
}) {
  const channelRef = useRef(null);
  const stateRef = useRef({});

  useEffect(() => {
    stateRef.current = {
      selectedCase,
      vehiclesRef,
      case1Stream,
      case1Signal,
      case3,
      onRemoteCommand,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('BroadcastChannel' in window) {
      const ch = new BroadcastChannel('semtos_v2x_channel');
      ch.onmessage = (event) => {
        const data = event.data;
        if (data?.type === 'COMMAND' && stateRef.current.onRemoteCommand) {
          stateRef.current.onRemoteCommand(data.command, data.payload || {});
        }
      };
      channelRef.current = ch;
    }

    let tickCount = 0;
    const interval = setInterval(async () => {
      const { selectedCase: sc, vehiclesRef: vRef, case1Stream: c1, case1Signal: s1, case3: c3 } = stateRef.current;
      if (!c1 || !s1 || !c3) return;

      const rawVehicles = vRef?.current || [];
      const serializedVehicles = rawVehicles.map((v) => ({
        id: v.id,
        type: v.type,
        x: Number((v.pos?.x ?? v.x ?? 0).toFixed(2)),
        z: Number((v.pos?.z ?? v.z ?? 0).toFixed(2)),
        homePerp: v.homePerp,
        pullOverPerp: v.pullOverPerp,
        rotY: Number((v.rotY || 0).toFixed(3)),
        speed: Number((v.speed || 0).toFixed(2)),
        state: v.state || 'IDLE_QUEUE',
        receivesBLE: Boolean(v.receivesBLE),
      }));

      const snapshot = {
        timestamp: Date.now(),
        source: 'LIVE_3D_TWIN',
        selectedCase: sc,
        isSimulationRunning: sc === 1 ? c1.isSimulationRunning : c3.isSimulationRunning,
        isPreempted: sc === 1 ? s1.isPreempted : (c3.deadlockDetected && !c3.trafficCycleActive),
        isFrozen: sc === 1 ? c1.isFrozen : c3.isFrozen,
        deadlockDetected: sc === 3 ? c3.deadlockDetected : false,
        trafficCycleActive: sc === 3 ? c3.trafficCycleActive : false,
        signalPhase: sc === 1 ? s1.signalPhase : c3.signals.phase,
        phaseLabel: sc === 1 ? s1.phase : c3.signals.phaseLabel,
        timeRemaining: sc === 1 ? s1.timeRemaining : c3.signals.timeRemaining,
        signals: {
          nGreen: sc === 1 ? s1.nGreen : c3.signals.nGreen,
          sGreen: sc === 1 ? s1.sGreen : c3.signals.sGreen,
          eGreen: sc === 1 ? s1.eGreen : c3.signals.eGreen,
          wGreen: sc === 1 ? s1.wGreen : c3.signals.wGreen,
          nYellow: sc === 1 ? s1.nYellow : c3.signals.nYellow,
          sYellow: sc === 1 ? s1.sYellow : c3.signals.sYellow,
          eYellow: sc === 1 ? s1.eYellow : c3.signals.eYellow,
          wYellow: sc === 1 ? s1.wYellow : c3.signals.wYellow,
        },
        ambulancePosition: c1.ambulancePosition,
        ambulanceA: c3.ambulanceA,
        ambulanceB: c3.ambulanceB,
        metrics: c3.metrics,
        vehicles: serializedVehicles,
        auditLogs: (sc === 1 ? c1.auditLogs : c3.auditLogs).slice(-15),
      };

      if (channelRef.current) {
        try {
          channelRef.current.postMessage({ type: 'SNAPSHOT', payload: snapshot });
        } catch (_) {}
      }

      tickCount++;
      if (tickCount % 3 === 0) {
        try {
          fetch('/api/v2x', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'SNAPSHOT', payload: snapshot }),
          }).catch(() => {});

          const res = await fetch('/api/v2x?consumeCommands=1', { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.commands) && data.commands.length > 0 && stateRef.current.onRemoteCommand) {
              data.commands.forEach((cmdObj) => {
                stateRef.current.onRemoteCommand(cmdObj.command, cmdObj.payload || {});
              });
            }
          }
        } catch (_) {}
      }
    }, 50);

    return () => {
      clearInterval(interval);
      if (channelRef.current) channelRef.current.close();
    };
  }, []);
}

/**
 * Subscriber Hook used inside /ambulance and /driver
 */
export function useV2XSubscriber() {
  const [snapshot, setSnapshot] = useState(() => createDefaultSnapshot(1));
  const [isLiveTwinConnected, setIsLiveTwinConnected] = useState(false);

  const lastTwinMsgTimeRef = useRef(0);
  const channelRef = useRef(null);
  const localSimRef = useRef(createDefaultSnapshot(1));

  const sendCommand = useCallback((command, payload = {}) => {
    if (channelRef.current) {
      try {
        channelRef.current.postMessage({ type: 'COMMAND', command, payload });
      } catch (_) {}
    }
    fetch('/api/v2x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'COMMAND', command, payload }),
    }).catch(() => {});

    if (Date.now() - lastTwinMsgTimeRef.current > 1200) {
      const s = localSimRef.current;
      if (command === 'SWITCH_CASE') {
        const nextCase = payload.caseId || (s.selectedCase === 1 ? 3 : 1);
        localSimRef.current = createDefaultSnapshot(nextCase);
        setSnapshot({ ...localSimRef.current });
      } else if (command === 'DISPATCH') {
        s.isSimulationRunning = true;
        if (s.selectedCase === 1) {
          s.ambulancePosition = { x: -120, y: 0.5, z: -6.0, rotation: -Math.PI / 2 };
          s.signalPhase = 'W_GREEN';
          s.isPreempted = true;
          s.signals = { nGreen: false, sGreen: false, eGreen: true, wGreen: false, nYellow: false, sYellow: false, eYellow: false, wYellow: false };
        } else {
          s.deadlockDetected = true;
          s.trafficCycleActive = false;
          s.isPreempted = true;
          s.signalPhase = 'S_GREEN_CORRIDOR';
          s.signals = { nGreen: true, sGreen: true, eGreen: false, wGreen: false, nYellow: false, sYellow: false, eYellow: false, wYellow: false };
          s.ambulanceA.position = { x: 2.2, y: 0.65, z: 90.0, rotation: 0 };
          s.ambulanceA.status = 'CORRIDOR_ACTIVE';
          s.ambulanceB.position = { x: 90.0, y: 0.65, z: -2.89, rotation: Math.PI / 2 };
          s.ambulanceB.currentWaypointIdx = 0;
          s.ambulanceB.detourActive = true;
          s.ambulanceB.status = 'DETOUR_ACTIVE';
          s.ambulanceB.waypointName = 'Leg 1: East Approach -> WP 1';
        }
        setSnapshot({ ...s });
      } else if (command === 'FREEZE') {
        s.isFrozen = !s.isFrozen;
        setSnapshot({ ...s });
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('BroadcastChannel' in window) {
      const ch = new BroadcastChannel('semtos_v2x_channel');
      ch.onmessage = (event) => {
        if (event.data?.type === 'SNAPSHOT' && event.data.payload) {
          lastTwinMsgTimeRef.current = Date.now();
          setIsLiveTwinConnected(true);
          setSnapshot(event.data.payload);
        }
      };
      channelRef.current = ch;
    }

    const pollInterval = setInterval(async () => {
      if (Date.now() - lastTwinMsgTimeRef.current < 400) return;
      try {
        const res = await fetch('/api/v2x', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.snapshot && Date.now() - data.lastUpdated < 2500) {
            lastTwinMsgTimeRef.current = Date.now();
            setIsLiveTwinConnected(true);
            setSnapshot(data.snapshot);
            return;
          }
        }
      } catch (_) {}

      if (Date.now() - lastTwinMsgTimeRef.current > 2000) {
        setIsLiveTwinConnected(false);
      }
    }, 200);

    const fallbackTick = setInterval(() => {
      if (Date.now() - lastTwinMsgTimeRef.current <= 1200) return;
      const s = localSimRef.current;
      if (!s.isSimulationRunning || s.isFrozen) return;

      if (s.selectedCase === 1) {
        s.ambulancePosition.x += 0.6;
        if (s.ambulancePosition.x >= 15 && s.isPreempted) {
          s.isPreempted = false;
          s.signalPhase = 'E_RESUME';
        }
        if (s.ambulancePosition.x > 130) {
          s.isSimulationRunning = false;
          s.ambulancePosition.x = -120;
          s.signalPhase = 'NORMAL_CYCLE';
        }
        s.vehicles.forEach((v) => {
          if (v.type === 'E') {
            const dist = Math.hypot(v.x - s.ambulancePosition.x, v.z - s.ambulancePosition.z);
            if (s.isPreempted && dist <= 14 && v.x < -20 && s.ambulancePosition.x <= v.x + 30) {
              v.state = 'YIELDING';
              v.receivesBLE = true;
              v.z += (v.pullOverPerp - v.z) * 0.15;
              v.speed = 0;
            } else {
              v.state = 'DRIVING_GREEN';
              v.receivesBLE = false;
              v.z += (v.homePerp - v.z) * 0.15;
              v.x += 0.35;
              if (v.x > 60) v.x = -70;
              v.speed = 7;
            }
          }
        });
      } else {
        if (s.ambulanceA.position.z > -120) {
          s.ambulanceA.position.z -= 0.55;
          s.ambulanceA.distanceToJunction = Math.max(0, s.ambulanceA.position.z);
        }
        const bPos = s.ambulanceB.position;
        const wp = s.ambulanceB.currentWaypointIdx;
        if (wp === 0) {
          bPos.x -= 0.6;
          bPos.rotation = Math.PI / 2;
          s.ambulanceB.waypointName = 'Leg 1: Westbound Approach -> Turn 1 (X: 47)';
          if (bPos.x <= 47.0) s.ambulanceB.currentWaypointIdx = 1;
        } else if (wp === 1) {
          bPos.z -= 0.6;
          bPos.rotation = 0;
          s.ambulanceB.waypointName = 'Leg 2: Kamaraj Rd North -> Turn 2 (Z: -60)';
          if (bPos.z <= -60.0) s.ambulanceB.currentWaypointIdx = 2;
        } else if (wp === 2) {
          bPos.x -= 0.6;
          bPos.rotation = Math.PI / 2;
          s.ambulanceB.waypointName = 'Leg 3: Cubbon Rd West -> Turn 3 (X: -87)';
          if (bPos.x <= -87.0) s.ambulanceB.currentWaypointIdx = 3;
        } else if (wp === 3) {
          bPos.z += 0.6;
          bPos.rotation = Math.PI;
          s.ambulanceB.waypointName = 'Leg 4: Central St South -> Rejoining M.G. Rd';
          if (bPos.z >= -2.89) {
            bPos.z = -2.89;
            s.ambulanceB.currentWaypointIdx = 4;
          }
        } else {
          bPos.x -= 0.6;
          bPos.rotation = Math.PI / 2;
          s.ambulanceB.waypointName = 'Leg 5: Westbound Departure (Bypass Complete)';
        }

        s.vehicles.forEach((v) => {
          if (v.type === 'N') {
            const dist = Math.hypot(v.x - s.ambulanceA.position.x, v.z - s.ambulanceA.position.z);
            if (v.z >= 25.0 && dist <= 28 && s.ambulanceA.position.z > v.z - 30) {
              v.state = 'YIELDING';
              v.receivesBLE = true;
              v.x += (v.pullOverPerp - v.x) * 0.15;
              v.speed = 0;
            } else {
              v.state = 'DRIVING_GREEN';
              v.receivesBLE = false;
              v.x += (v.homePerp - v.x) * 0.15;
              v.z -= 0.35;
              if (v.z < -70) v.z = 66;
              v.speed = 7;
            }
          }
        });
      }

      setSnapshot({ ...s, timestamp: Date.now() });
    }, 50);

    return () => {
      clearInterval(pollInterval);
      clearInterval(fallbackTick);
      if (channelRef.current) channelRef.current.close();
    };
  }, []);

  return {
    snapshot,
    isLiveTwinConnected,
    sendCommand,
  };
}
