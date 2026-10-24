// hooks/useV2XSync.js
"use client";

import { useEffect, useRef, useState, useCallback } from 'react';

const CHANNEL_NAME = 'SEMTOS_V2X_LIVE_BUS_V1';
const STORAGE_KEY = 'SEMTOS_V2X_LATEST_SNAPSHOT_V1';
const CMD_STORAGE_KEY = 'SEMTOS_V2X_LATEST_CMD_V1';

// ── Precise Google Maps Road Centerline Coordinates (Bengaluru M.G. Road Corridor) ──
// Sub-meter calibrated to 100% asphalt road centerlines in Google Maps (Streets & Satellite)
export const ORIGIN_LNG = 77.608000;
export const ORIGIN_LAT = 12.975050; // J0 Central Intersection (M.G. Road & Brigade / Kamaraj Rd)

export const GOOGLE_ROAD_NODES = {
  // 1. Mahatma Gandhi Road (West <-> East)
  W_FAR_EXIT:   [77.600000, 12.976650], // CSI St. Mark's Cathedral (MG Rd West Exit)
  ANIL_KUMBLE:  [77.601800, 12.976520], // WP4: Anil Kumble Circle (MG Rd & Central St / St Mark's Rd)
  MG_MUSEUM:    [77.603600, 12.976150], // MG Rd near Museum Rd
  MG_BARTON:    [77.605400, 12.975650], // MG Rd (Barton Centre)
  MG_METRO:     [77.606800, 12.975300], // MG Rd Metro Station / Boulevard
  J0_BRIGADE:   [77.608000, 12.975050], // WP1: Central 4-Way Signal (MG Rd & Brigade Rd / Kamaraj Rd)
  MG_CAUV_EAST: [77.609400, 12.974750], // MG Rd East (near Shankara / Cauvery)
  MG_MAYO_HALL: [77.610700, 12.974450], // Mayo Hall Junction (MG Rd East)
  MG_CARIAPPA:  [77.612700, 12.974050], // MG Rd & FM Cariappa Rd (East Approach)

  // 2. Brigade Road (South) -> J0 -> Kamaraj Road (North)
  BRIGADE_RES:  [77.607080, 12.972330], // Brigade Rd & Residency Rd (South Start near Decathlon / Opera)
  BRIGADE_REST: [77.607500, 12.973700], // Brigade Rd & Rest House Rd
  BRIGADE_CHUR: [77.607900, 12.974550], // Brigade Rd & Church St
  KAMARAJ_S:    [77.608250, 12.976000], // Kamaraj Rd South (beside Parade Ground)
  KAMARAJ_M:    [77.608500, 12.976700], // Kamaraj Rd Mid
  CUBBON_KAM:   [77.608750, 12.977250], // WP2: Cubbon Rd & Kamaraj Rd Junction

  // 3. Cubbon Road (WP2 -> St. Andrew's -> WP3)
  CUBBON_QORV:  [77.607500, 12.977620], // Cubbon Rd East (QORVANTA / Army Public School)
  CUBBON_VEER:  [77.606600, 12.977920], // Cubbon Rd Mid (Veer Bhoomi)
  CUBBON_MID:   [77.605400, 12.978250], // Cubbon Rd North of Parade Ground
  CUBBON_ANDR:  [77.604300, 12.978700], // C.S.I. St. Andrew's Church, Cubbon Road
  CUBBON_LADY:  [77.603400, 12.979050], // Cubbon Rd & Lady Curzon Rd
  CUBBON_CENT:  [77.602380, 12.979350], // WP3: Cubbon Rd & Central St Corner (BRV Junction)

  // 4. Central Street (WP3 -> Anil Kumble Circle WP4)
  CENTRAL_N:    [77.602250, 12.978200], // Central St Upper (west of Parade Ground)
  CENTRAL_M:    [77.602050, 12.977400], // Central St Mid (BRV / Stadium)
  CENTRAL_S:    [77.601850, 12.976800], // Central St approaching MG Road
};

// ── Case 01 Main Avenue Stations (Mahatma Gandhi Road: X = -120 -> +150) ──
export const CASE1_MG_STATIONS = [
  { x: -135, coord: GOOGLE_ROAD_NODES.W_FAR_EXIT },
  { x: -120, coord: GOOGLE_ROAD_NODES.ANIL_KUMBLE },
  { x: -80,  coord: GOOGLE_ROAD_NODES.MG_MUSEUM },
  { x: -40,  coord: GOOGLE_ROAD_NODES.MG_BARTON },
  { x: -20,  coord: GOOGLE_ROAD_NODES.MG_METRO },
  { x: 0,    coord: GOOGLE_ROAD_NODES.J0_BRIGADE },
  { x: 40,   coord: GOOGLE_ROAD_NODES.MG_CAUV_EAST },
  { x: 85,   coord: GOOGLE_ROAD_NODES.MG_MAYO_HALL },
  { x: 150,  coord: GOOGLE_ROAD_NODES.MG_CARIAPPA },
];

// ── Case 03 Ambulance A Corridor Stations (Brigade Rd South -> J0 -> Kamaraj Rd North: Z = +90 -> -120) ──
export const CASE3_AMBA_STATIONS = [
  { z: 90,   coord: GOOGLE_ROAD_NODES.BRIGADE_RES },
  { z: 50,   coord: GOOGLE_ROAD_NODES.BRIGADE_REST },
  { z: 22,   coord: GOOGLE_ROAD_NODES.BRIGADE_CHUR },
  { z: 0,    coord: GOOGLE_ROAD_NODES.J0_BRIGADE },
  { z: -35,  coord: GOOGLE_ROAD_NODES.KAMARAJ_S },
  { z: -70,  coord: GOOGLE_ROAD_NODES.KAMARAJ_M },
  { z: -120, coord: GOOGLE_ROAD_NODES.CUBBON_KAM },
];

// ── Case 03 Ambulance B 5-Leg Real-Road Detour Stations ──
// Leg 1 (wpIdx === 0, X: 90 -> 47): M.G. Road East (Cariappa Rd -> Mayo Hall -> Kamaraj Rd Turnoff)
export const CASE3_LEG1_STATIONS = [
  { x: 90.0, coord: GOOGLE_ROAD_NODES.MG_CARIAPPA },
  { x: 70.0, coord: GOOGLE_ROAD_NODES.MG_MAYO_HALL },
  { x: 55.0, coord: GOOGLE_ROAD_NODES.MG_CAUV_EAST },
  { x: 47.0, coord: GOOGLE_ROAD_NODES.J0_BRIGADE }, // WP1 Turnoff
];

// Leg 2 (wpIdx === 1, Z: -2.89 -> -60.0): Kamaraj Road (M.G. Road -> Cubbon Road)
export const CASE3_LEG2_STATIONS = [
  { z: -2.89, coord: GOOGLE_ROAD_NODES.J0_BRIGADE },
  { z: -22.0, coord: GOOGLE_ROAD_NODES.KAMARAJ_S },
  { z: -42.0, coord: GOOGLE_ROAD_NODES.KAMARAJ_M },
  { z: -60.0, coord: GOOGLE_ROAD_NODES.CUBBON_KAM }, // WP2 Turn
];

// Leg 3 (wpIdx === 2, X: 47.0 -> -87.0): Cubbon Road (Kamaraj Rd -> St. Andrew's Church -> Central St)
export const CASE3_LEG3_STATIONS = [
  { x: 47.0,  coord: GOOGLE_ROAD_NODES.CUBBON_KAM },
  { x: 25.0,  coord: GOOGLE_ROAD_NODES.CUBBON_QORV },
  { x: 5.0,   coord: GOOGLE_ROAD_NODES.CUBBON_VEER },
  { x: -20.0, coord: GOOGLE_ROAD_NODES.CUBBON_MID },
  { x: -45.0, coord: GOOGLE_ROAD_NODES.CUBBON_ANDR },
  { x: -65.0, coord: GOOGLE_ROAD_NODES.CUBBON_LADY },
  { x: -87.0, coord: GOOGLE_ROAD_NODES.CUBBON_CENT }, // WP3 Turn
];

// Leg 4 (wpIdx === 3, Z: -60.0 -> -2.89): Central Street (Cubbon Rd -> Anil Kumble Circle)
export const CASE3_LEG4_STATIONS = [
  { z: -60.0, coord: GOOGLE_ROAD_NODES.CUBBON_CENT },
  { z: -40.0, coord: GOOGLE_ROAD_NODES.CENTRAL_N },
  { z: -22.0, coord: GOOGLE_ROAD_NODES.CENTRAL_M },
  { z: -10.0, coord: GOOGLE_ROAD_NODES.CENTRAL_S },
  { z: -2.89, coord: GOOGLE_ROAD_NODES.ANIL_KUMBLE }, // WP4 Rejoin
];

// Leg 5 (wpIdx >= 4, X: -87.0 -> -135.0): M.G. Road Westbound Exit (Anil Kumble Circle -> St. Mark's Cathedral)
export const CASE3_LEG5_STATIONS = [
  { x: -87.0,  coord: GOOGLE_ROAD_NODES.ANIL_KUMBLE },
  { x: -135.0, coord: GOOGLE_ROAD_NODES.W_FAR_EXIT },
];

export function computeBearing([lon1, lat1], [lon2, lat2]) {
  const toRad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function interpolateStations(stations, keyName, val) {
  const first = stations[0];
  const last = stations[stations.length - 1];
  const increasing = last[keyName] > first[keyName];

  const minV = Math.min(first[keyName], last[keyName]);
  const maxV = Math.max(first[keyName], last[keyName]);
  const clamped = Math.max(minV, Math.min(maxV, val));

  for (let i = 0; i < stations.length - 1; i++) {
    const s1 = stations[i];
    const s2 = stations[i + 1];
    const v1 = s1[keyName];
    const v2 = s2[keyName];
    const inSeg = increasing ? (clamped >= v1 && clamped <= v2) : (clamped <= v1 && clamped >= v2);
    if (inSeg || i === stations.length - 2) {
      const span = v2 - v1 || 1;
      const t = Math.max(0, Math.min(1, (clamped - v1) / span));
      const lng = s1.coord[0] + (s2.coord[0] - s1.coord[0]) * t;
      const lat = s1.coord[1] + (s2.coord[1] - s1.coord[1]) * t;
      const bearing = computeBearing(s1.coord, s2.coord);
      return { coord: [lng, lat], bearing };
    }
  }
  return { coord: first.coord, bearing: computeBearing(first.coord, last.coord) };
}

/**
 * Maps any 3D Twin coordinate (x, z) onto the EXACT 2D Google Maps road centerline.
 */
export function twinToRoadGeo(x = 0, z = 0, options = {}) {
  const {
    ambId = 'AMB_1', // 'AMB_1' | 'AMB_A' | 'AMB_B'
    wpIdx = 0,       // Case 3 Ambulance B waypoint index (0..4)
  } = options;

  // 1. Case 03 Ambulance B 5-Leg Real-Road Detour
  if (ambId === 'AMB_B') {
    if (wpIdx === 0) {
      const res = interpolateStations(CASE3_LEG1_STATIONS, 'x', x);
      return { lngLat: res.coord, bearing: res.bearing };
    }
    if (wpIdx === 1) {
      const res = interpolateStations(CASE3_LEG2_STATIONS, 'z', z);
      return { lngLat: res.coord, bearing: res.bearing };
    }
    if (wpIdx === 2) {
      const res = interpolateStations(CASE3_LEG3_STATIONS, 'x', x);
      return { lngLat: res.coord, bearing: res.bearing };
    }
    if (wpIdx === 3) {
      const res = interpolateStations(CASE3_LEG4_STATIONS, 'z', z);
      return { lngLat: res.coord, bearing: res.bearing };
    }
    const res = interpolateStations(CASE3_LEG5_STATIONS, 'x', x);
    return { lngLat: res.coord, bearing: res.bearing };
  }

  // 2. Case 03 Ambulance A (Priority Corridor: Brigade Road South -> J0 -> Kamaraj Road North)
  if (ambId === 'AMB_A') {
    const res = interpolateStations(CASE3_AMBA_STATIONS, 'z', z);
    return { lngLat: res.coord, bearing: res.bearing };
  }

  // 3. Case 01 Single Ambulance (AMB-108 on Mahatma Gandhi Road: West -> East)
  const res = interpolateStations(CASE1_MG_STATIONS, 'x', x);
  return { lngLat: res.coord, bearing: res.bearing };
}

/**
 * Builds the 2D Google Maps Dynamic Traffic Corridor & Green Wave Lines (GeoJSON FeatureCollection).
 */
export function buildRoadTrafficLinesGeoJSON(state) {
  const selectedCase = state?.selectedCase || 1;
  const sig = state?.signals || {};
  const features = [];

  if (selectedCase === 1) {
    const ambX = state?.case1?.ambulancePosition?.x ?? -120;
    const isRunning = Boolean(state?.case1?.isSimulationRunning);
    const phase = sig.phase || 'ALL_RED';

    // West Approach (Anil Kumble Circle -> Museum Rd -> Barton -> Metro -> J0):
    // Turns GREEN when preemption wave activates or when AMB-108 approaches
    const westGreen =
      phase === 'W_GREEN' ||
      phase === 'E_RESUME' ||
      Boolean(sig.eGreen) ||
      Boolean(sig.wGreen) ||
      (isRunning && ambX >= -90 && ambX <= 20);
    const westYellow = !westGreen && (Boolean(sig.eYellow) || Boolean(sig.wYellow));
    const westColor = westGreen ? '#22c55e' : westYellow ? '#facc15' : '#ef4444';

    features.push({
      type: 'Feature',
      properties: {
        id: 'c1-mg-west-traffic',
        color: westColor,
        width: 10,
        glowWidth: 20,
        status: westGreen ? 'GREEN WAVE ACTIVE (AMB-108)' : 'RED TRAFFIC QUEUE',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          GOOGLE_ROAD_NODES.ANIL_KUMBLE,
          GOOGLE_ROAD_NODES.MG_MUSEUM,
          GOOGLE_ROAD_NODES.MG_BARTON,
          GOOGLE_ROAD_NODES.MG_METRO,
          GOOGLE_ROAD_NODES.J0_BRIGADE,
        ],
      },
    });

    // M.G. Road East (J0 -> Cauvery -> Mayo Hall -> Cariappa Rd)
    const eastGreen = westGreen || phase === 'W_RELEASE' || Boolean(sig.wGreen);
    const eastYellow = !eastGreen && Boolean(sig.wYellow);
    features.push({
      type: 'Feature',
      properties: {
        id: 'c1-mg-east-traffic',
        color: eastGreen ? '#22c55e' : eastYellow ? '#facc15' : '#ef4444',
        width: 9,
        glowWidth: 18,
        status: eastGreen ? 'EAST CORRIDOR CLEAR' : 'EAST TRAFFIC QUEUE',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          GOOGLE_ROAD_NODES.J0_BRIGADE,
          GOOGLE_ROAD_NODES.MG_CAUV_EAST,
          GOOGLE_ROAD_NODES.MG_MAYO_HALL,
          GOOGLE_ROAD_NODES.MG_CARIAPPA,
        ],
      },
    });

    // Brigade Road South (Residency Rd -> Church St -> J0)
    const southGreen = Boolean(sig.nGreen) || phase === 'S_RELEASE';
    const southYellow = !southGreen && Boolean(sig.nYellow);
    features.push({
      type: 'Feature',
      properties: {
        id: 'c1-brigade-south-traffic',
        color: southGreen ? '#22c55e' : southYellow ? '#facc15' : '#ef4444',
        width: 8,
        glowWidth: 16,
        status: southGreen ? 'SOUTH ARM GREEN' : 'SOUTH ARM RED QUEUE',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          GOOGLE_ROAD_NODES.BRIGADE_RES,
          GOOGLE_ROAD_NODES.BRIGADE_REST,
          GOOGLE_ROAD_NODES.BRIGADE_CHUR,
          GOOGLE_ROAD_NODES.J0_BRIGADE,
        ],
      },
    });

    // Kamaraj Road North (Cubbon Rd -> J0)
    const northGreen = Boolean(sig.sGreen) || phase === 'N_RELEASE';
    const northYellow = !northGreen && Boolean(sig.sYellow);
    features.push({
      type: 'Feature',
      properties: {
        id: 'c1-kamaraj-north-traffic',
        color: northGreen ? '#22c55e' : northYellow ? '#facc15' : '#ef4444',
        width: 8,
        glowWidth: 16,
        status: northGreen ? 'NORTH ARM GREEN' : 'NORTH ARM RED QUEUE',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          GOOGLE_ROAD_NODES.CUBBON_KAM,
          GOOGLE_ROAD_NODES.KAMARAJ_M,
          GOOGLE_ROAD_NODES.KAMARAJ_S,
          GOOGLE_ROAD_NODES.J0_BRIGADE,
        ],
      },
    });

    return { type: 'FeatureCollection', features };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CASE 03: DUAL-AMBULANCE CONFLICT & 100% REAL-ROAD REROUTING GREEN WAVE
  // ══════════════════════════════════════════════════════════════════════════
  const c3 = state?.case3 || {};
  const isRunning = Boolean(c3.isSimulationRunning);
  const isNormalCycle = Boolean(c3.trafficCycleActive);
  const ambAZ = c3.ambulanceA?.position?.z ?? 90;
  const wpIdx = c3.ambulanceB?.currentWaypointIdx ?? 0;

  // 1. Blocked Central M.G. Road Segment (J0 -> Metro -> Barton -> Museum -> Anil Kumble):
  // Stays solid glowing RED to indicate the Eastbound gridlock that triggered the detour!
  const mgCentralGreen = isNormalCycle && (Boolean(sig.wGreen) || Boolean(sig.eGreen));
  const mgCentralYellow = isNormalCycle && !mgCentralGreen && (Boolean(sig.wYellow) || Boolean(sig.eYellow));
  features.push({
    type: 'Feature',
    properties: {
      id: 'c3-mg-central-blockade',
      color: mgCentralGreen ? '#22c55e' : mgCentralYellow ? '#facc15' : '#ef4444',
      width: 12,
      glowWidth: 24,
      status: mgCentralGreen ? 'M.G. ROAD FLUSHING (GREEN)' : '⛔ M.G. ROAD GRIDLOCK / DEADLOCK (BLOCKED)',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        GOOGLE_ROAD_NODES.J0_BRIGADE,
        GOOGLE_ROAD_NODES.MG_METRO,
        GOOGLE_ROAD_NODES.MG_BARTON,
        GOOGLE_ROAD_NODES.MG_MUSEUM,
        GOOGLE_ROAD_NODES.ANIL_KUMBLE,
      ],
    },
  });

  // 2. Ambulance A Priority Corridor (Brigade Rd South -> J0 -> Kamaraj Rd North):
  // Starts RED in standby; turns neon GREEN as Ambulance A is dispatched!
  const ambAGreen =
    (isRunning && !isNormalCycle && ambAZ <= 78) ||
    (isNormalCycle && (Boolean(sig.nGreen) || Boolean(sig.sGreen)));
  const ambAYellow = isNormalCycle && !ambAGreen && (Boolean(sig.nYellow) || Boolean(sig.sYellow));

  features.push({
    type: 'Feature',
    properties: {
      id: 'c3-amba-brigade-corridor',
      color: ambAGreen ? '#22c55e' : ambAYellow ? '#facc15' : '#ef4444',
      width: 10,
      glowWidth: 20,
      status: ambAGreen ? 'AMB-A PRIORITY GREEN CORRIDOR' : 'BRIGADE RD RED QUEUE',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        GOOGLE_ROAD_NODES.BRIGADE_RES,
        GOOGLE_ROAD_NODES.BRIGADE_REST,
        GOOGLE_ROAD_NODES.BRIGADE_CHUR,
        GOOGLE_ROAD_NODES.J0_BRIGADE,
        GOOGLE_ROAD_NODES.KAMARAJ_S,
        GOOGLE_ROAD_NODES.KAMARAJ_M,
        GOOGLE_ROAD_NODES.CUBBON_KAM,
      ],
    },
  });

  // 3. Ambulance B 5-Leg AI Reroute Green Wave:
  // When running, the assigned detour path is the active GREEN WAVE CORRIDOR!
  // In standby, it shows as an active planned path (#38bdf8 / #f59e0b).
  const detourGreenWave = isRunning && !isNormalCycle;

  // Leg 1: M.G. Road East Approach (Cariappa Rd -> Mayo Hall -> J0 Kamaraj Rd Turnoff)
  features.push({
    type: 'Feature',
    properties: {
      id: 'c3-ambb-leg1-mg-east',
      color: detourGreenWave || wpIdx >= 1 ? '#22c55e' : '#38bdf8',
      width: 10,
      glowWidth: 20,
      status: 'LEG 1: M.G. RD EAST APPROACH',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        GOOGLE_ROAD_NODES.MG_CARIAPPA,
        GOOGLE_ROAD_NODES.MG_MAYO_HALL,
        GOOGLE_ROAD_NODES.MG_CAUV_EAST,
        GOOGLE_ROAD_NODES.J0_BRIGADE,
      ],
    },
  });

  // Leg 2: Kamaraj Road (J0 M.G. Rd -> WP2 Cubbon Rd)
  features.push({
    type: 'Feature',
    properties: {
      id: 'c3-ambb-leg2-kamaraj',
      color: detourGreenWave || wpIdx >= 1 ? '#22c55e' : '#38bdf8',
      width: 10,
      glowWidth: 20,
      status: 'LEG 2: KAMARAJ RD NORTH DETOUR',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        GOOGLE_ROAD_NODES.J0_BRIGADE,
        GOOGLE_ROAD_NODES.KAMARAJ_S,
        GOOGLE_ROAD_NODES.KAMARAJ_M,
        GOOGLE_ROAD_NODES.CUBBON_KAM,
      ],
    },
  });

  // Leg 3: Cubbon Road (WP2 Kamaraj Rd -> St. Andrew's Church -> WP3 Central St)
  features.push({
    type: 'Feature',
    properties: {
      id: 'c3-ambb-leg3-cubbon',
      color: detourGreenWave || wpIdx >= 2 ? '#22c55e' : '#38bdf8',
      width: 10,
      glowWidth: 20,
      status: 'LEG 3: CUBBON RD WESTBOUND BYPASS',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        GOOGLE_ROAD_NODES.CUBBON_KAM,
        GOOGLE_ROAD_NODES.CUBBON_QORV,
        GOOGLE_ROAD_NODES.CUBBON_VEER,
        GOOGLE_ROAD_NODES.CUBBON_MID,
        GOOGLE_ROAD_NODES.CUBBON_ANDR,
        GOOGLE_ROAD_NODES.CUBBON_LADY,
        GOOGLE_ROAD_NODES.CUBBON_CENT,
      ],
    },
  });

  // Leg 4: Central Street Southbound (WP3 Central St -> West of Parade Ground -> WP4 Anil Kumble Circle)
  features.push({
    type: 'Feature',
    properties: {
      id: 'c3-ambb-leg4-central-st',
      color: detourGreenWave || wpIdx >= 3 ? '#22c55e' : '#38bdf8',
      width: 10,
      glowWidth: 20,
      status: 'LEG 4: CENTRAL ST RETURN TO M.G. RD',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        GOOGLE_ROAD_NODES.CUBBON_CENT,
        GOOGLE_ROAD_NODES.CENTRAL_N,
        GOOGLE_ROAD_NODES.CENTRAL_M,
        GOOGLE_ROAD_NODES.CENTRAL_S,
        GOOGLE_ROAD_NODES.ANIL_KUMBLE,
      ],
    },
  });

  // Leg 5: M.G. Road Westbound Exit (WP4 Anil Kumble Circle -> St. Mark's Cathedral)
  features.push({
    type: 'Feature',
    properties: {
      id: 'c3-ambb-leg5-mg-west',
      color: detourGreenWave || wpIdx >= 4 ? '#22c55e' : '#38bdf8',
      width: 10,
      glowWidth: 20,
      status: 'LEG 5: M.G. RD WEST EXIT (BYPASS COMPLETE)',
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        GOOGLE_ROAD_NODES.ANIL_KUMBLE,
        GOOGLE_ROAD_NODES.W_FAR_EXIT,
      ],
    },
  });

  return { type: 'FeatureCollection', features };
}

/**
 * Haversine distance in meters between two [lng, lat] points
 */
export function haversineMeters([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Publisher Hook — Used inside `src/app/page.js` to broadcast 20Hz live telemetry
 */
export function useV2XBroadcaster({
  selectedCase,
  case1Stream,
  case1Signal,
  case3,
  espIp,
  isWifiEnabled,
  lastWifiByteSent,
  serialLastByte,
  isSerialConnected,
  onRemoteCommand,
}) {
  const channelRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('BroadcastChannel' in window) {
      channelRef.current = new BroadcastChannel(CHANNEL_NAME);
    }
    return () => {
      channelRef.current?.close();
    };
  }, []);

  // Listen for remote commands from /ambulance or /driver tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleCommand = (cmd) => {
      if (!cmd || !cmd.action) return;
      if (onRemoteCommand) {
        onRemoteCommand(cmd.action, cmd);
      }
      if (cmd.action === 'DISPATCH') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }));
      } else if (cmd.action === 'FREEZE') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true }));
      } else if (cmd.action === 'NORMAL_CYCLE') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', key: 'n', bubbles: true }));
      }
    };

    let bc = null;
    if ('BroadcastChannel' in window) {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'SEMTOS_CMD') handleCommand(ev.data.payload);
      };
    }

    const onStorage = (ev) => {
      if (ev.key === CMD_STORAGE_KEY && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue);
          handleCommand(parsed);
        } catch (_) {}
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      bc?.close();
      window.removeEventListener('storage', onStorage);
    };
  }, [onRemoteCommand]);

  // 20Hz Telemetry Publisher
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const interval = setInterval(() => {
      const c1Pos = case1Stream?.ambulancePosition || { x: -120, y: 0.5, z: -6.0, rotation: -Math.PI / 2 };
      const c1Geo = twinToRoadGeo(c1Pos.x, c1Pos.z, { ambId: 'AMB_1' });

      const c3PosA = case3?.ambulanceA?.position || { x: 2.2, y: 0.55, z: 90, rotation: 0 };
      const c3PosB = case3?.ambulanceB?.position || { x: 90, y: 0.55, z: -2.89, rotation: Math.PI / 2 };
      const wpIdxB = case3?.ambulanceB?.currentWaypointIdx ?? 0;

      const c3GeoA = twinToRoadGeo(c3PosA.x, c3PosA.z, { ambId: 'AMB_A' });
      const c3GeoB = twinToRoadGeo(c3PosB.x, c3PosB.z, { ambId: 'AMB_B', wpIdx: wpIdxB });

      const payload = {
        timestamp: Date.now(),
        selectedCase,
        signals: selectedCase === 1 ? {
          phase: case1Signal?.phase || 'ALL_RED',
          signalPhase: case1Signal?.signalPhase || 'ALL_RED',
          nGreen: Boolean(case1Signal?.nGreen),
          sGreen: Boolean(case1Signal?.sGreen),
          eGreen: Boolean(case1Signal?.eGreen),
          wGreen: Boolean(case1Signal?.wGreen),
          nYellow: Boolean(case1Signal?.nYellow),
          sYellow: Boolean(case1Signal?.sYellow),
          eYellow: Boolean(case1Signal?.eYellow),
          wYellow: Boolean(case1Signal?.wYellow),
          timeRemaining: case1Signal?.timeRemaining ?? 15,
          isPreempted: Boolean(case1Signal?.isPreempted),
        } : {
          phase: case3?.signals?.phase || 'ALL_RED',
          signalPhase: case3?.signals?.phaseLabel || 'STANDBY',
          nGreen: Boolean(case3?.signals?.nGreen),
          sGreen: Boolean(case3?.signals?.sGreen),
          eGreen: Boolean(case3?.signals?.eGreen),
          wGreen: Boolean(case3?.signals?.wGreen),
          nYellow: Boolean(case3?.signals?.nYellow),
          sYellow: Boolean(case3?.signals?.sYellow),
          eYellow: Boolean(case3?.signals?.eYellow),
          wYellow: Boolean(case3?.signals?.wYellow),
          timeRemaining: case3?.signals?.timeRemaining ?? 15,
          isPreempted: Boolean(case3?.deadlockDetected && !case3?.trafficCycleActive),
        },
        case1: {
          isSimulationRunning: Boolean(case1Stream?.isSimulationRunning),
          isFrozen: Boolean(case1Stream?.isFrozen),
          ambulancePosition: c1Pos,
          ambulanceLngLat: c1Geo.lngLat,
          ambulanceBearing: c1Geo.bearing,
          distanceToJunction: Math.max(0, Math.round(0 - c1Pos.x)),
        },
        case3: {
          isSimulationRunning: Boolean(case3?.isSimulationRunning),
          isFrozen: Boolean(case3?.isFrozen),
          deadlockDetected: Boolean(case3?.deadlockDetected),
          trafficCycleActive: Boolean(case3?.trafficCycleActive),
          ambulanceA: {
            ...(case3?.ambulanceA || {}),
            position: c3PosA,
            lngLat: c3GeoA.lngLat,
            bearing: c3GeoA.bearing,
          },
          ambulanceB: {
            ...(case3?.ambulanceB || {}),
            position: c3PosB,
            currentWaypointIdx: wpIdxB,
            lngLat: c3GeoB.lngLat,
            bearing: c3GeoB.bearing,
          },
          metrics: case3?.metrics || {
            directJunctionDelaySec: 48,
            macroDetourDurationSec: 18,
            netTimeSavedSec: 30,
            co2ReductionPct: 64,
          },
        },
        hardware: {
          espIp: espIp || '192.168.4.1',
          isWifiEnabled: Boolean(isWifiEnabled),
          lastByte: lastWifiByteSent || serialLastByte || 'R',
          isSerialConnected: Boolean(isSerialConnected),
        },
      };

      try {
        channelRef.current?.postMessage({ type: 'SEMTOS_STATE', payload });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (_) {}
    }, 50);

    return () => clearInterval(interval);
  }, [
    selectedCase,
    case1Stream?.ambulancePosition,
    case1Stream?.isSimulationRunning,
    case1Stream?.isFrozen,
    case1Signal?.phase,
    case1Signal?.signalPhase,
    case1Signal?.nGreen,
    case1Signal?.sGreen,
    case1Signal?.eGreen,
    case1Signal?.wGreen,
    case1Signal?.nYellow,
    case1Signal?.sYellow,
    case1Signal?.eYellow,
    case1Signal?.wYellow,
    case1Signal?.timeRemaining,
    case1Signal?.isPreempted,
    case3,
    espIp,
    isWifiEnabled,
    lastWifiByteSent,
    serialLastByte,
    isSerialConnected,
  ]);
}

// Backward-compatible alias
export const useV2XPublisher = useV2XBroadcaster;

/**
 * Built-in Standalone 2D Road-Snapped Simulator Fallback
 */
function createInitialStandaloneState() {
  const c1Geo = twinToRoadGeo(-120, -6.0, { ambId: 'AMB_1' });
  const c3GeoA = twinToRoadGeo(2.2, 90.0, { ambId: 'AMB_A' });
  const c3GeoB = twinToRoadGeo(90.0, -2.89, { ambId: 'AMB_B', wpIdx: 0 });

  return {
    timestamp: Date.now(),
    selectedCase: 1,
    isStandaloneFallback: true,
    signals: {
      phase: 'ALL_RED',
      signalPhase: 'ALL_RED',
      nGreen: false,
      sGreen: false,
      eGreen: false,
      wGreen: false,
      nYellow: false,
      sYellow: false,
      eYellow: false,
      wYellow: false,
      timeRemaining: 15,
      isPreempted: false,
    },
    case1: {
      isSimulationRunning: false,
      isFrozen: false,
      ambulancePosition: { x: -120, y: 0.5, z: -6.0, rotation: -Math.PI / 2 },
      ambulanceLngLat: c1Geo.lngLat,
      ambulanceBearing: c1Geo.bearing,
      distanceToJunction: 120,
    },
    case3: {
      isSimulationRunning: false,
      isFrozen: false,
      deadlockDetected: false,
      trafficCycleActive: false,
      ambulanceA: {
        id: 'AMB_A',
        name: 'Ambulance A (Cardiac - Brigade Rd)',
        status: 'IDLE_STANDBY',
        position: { x: 2.2, y: 0.55, z: 90, rotation: 0 },
        lngLat: c3GeoA.lngLat,
        bearing: c3GeoA.bearing,
        distanceToJunction: 90,
      },
      ambulanceB: {
        id: 'AMB_B',
        name: 'Ambulance B (Trauma - M.G. Rd East)',
        status: 'IDLE_STANDBY',
        position: { x: 90, y: 0.55, z: -2.89, rotation: Math.PI / 2 },
        lngLat: c3GeoB.lngLat,
        bearing: c3GeoB.bearing,
        currentWaypointIdx: 0,
        waypointName: 'Awaiting Dispatch (M.G. Road East)',
        detourActive: false,
      },
      metrics: {
        directJunctionDelaySec: 48,
        macroDetourDurationSec: 18,
        netTimeSavedSec: 30,
        co2ReductionPct: 64,
      },
    },
    hardware: {
      espIp: '192.168.4.1',
      isWifiEnabled: false,
      lastByte: 'R',
      isSerialConnected: false,
    },
  };
}

/**
 * Subscriber Hook — Used inside `/ambulance` and `/driver` pages
 */
export function useV2XReceiver() {
  const [state, setState] = useState(createInitialStandaloneState);
  const lastExternalPacketRef = useRef(0);
  const standaloneRef = useRef({
    selectedCase: 1,
    running: false,
    frozen: false,
    c1X: -120,
    c3ZA: 90,
    c3XB: 90,
    c3ZB: -2.89,
    c3Wp: 0,
    c3NormalCycle: false,
    cycleArmIdx: 0,
    cycleTimer: 15.0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - (parsed.timestamp || 0) < 4000) {
          lastExternalPacketRef.current = Date.now();
          setState({ ...parsed, isStandaloneFallback: false });
        }
      }
    } catch (_) {}

    let bc = null;
    if ('BroadcastChannel' in window) {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'SEMTOS_STATE' && ev.data.payload) {
          lastExternalPacketRef.current = Date.now();
          setState({ ...ev.data.payload, isStandaloneFallback: false });
        }
      };
    }

    const onStorage = (ev) => {
      if (ev.key === STORAGE_KEY && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue);
          lastExternalPacketRef.current = Date.now();
          setState({ ...parsed, isStandaloneFallback: false });
        } catch (_) {}
      }
    };
    window.addEventListener('storage', onStorage);

    // Standalone 20Hz physics fallback loop when `/` is not open in another tab
    const fallbackTimer = setInterval(() => {
      if (Date.now() - lastExternalPacketRef.current < 1500) return;

      const s = standaloneRef.current;
      if (s.frozen) return;

      if (s.selectedCase === 1) {
        let phase = 'ALL_RED';
        let eGreen = false, wGreen = false, nGreen = false, sGreen = false;
        let isPreempted = false;

        if (s.running) {
          s.c1X += 0.55;
          if (s.c1X >= -85 && s.c1X < 15) {
            phase = 'W_GREEN';
            eGreen = true;
            wGreen = true;
            isPreempted = true;
          } else if (s.c1X >= 15) {
            phase = 'E_RESUME';
            eGreen = true;
          }
          if (s.c1X > 150) {
            s.c1X = -120;
            s.running = false;
          }
        }

        const c1Pos = { x: s.c1X, y: 0.5, z: -6.0, rotation: -Math.PI / 2 };
        const c1Geo = twinToRoadGeo(c1Pos.x, c1Pos.z, { ambId: 'AMB_1' });

        setState((prev) => ({
          ...prev,
          timestamp: Date.now(),
          selectedCase: 1,
          isStandaloneFallback: true,
          signals: {
            ...prev.signals,
            phase,
            signalPhase: phase,
            eGreen,
            wGreen,
            nGreen,
            sGreen,
            isPreempted,
          },
          case1: {
            isSimulationRunning: s.running,
            isFrozen: s.frozen,
            ambulancePosition: c1Pos,
            ambulanceLngLat: c1Geo.lngLat,
            ambulanceBearing: c1Geo.bearing,
            distanceToJunction: Math.max(0, Math.round(0 - s.c1X)),
          },
        }));
      } else {
        // Case 03 Standalone Physics
        let wpName = 'Awaiting Dispatch (M.G. Road East)';
        if (s.running && !s.c3NormalCycle) {
          if (s.c3ZA > -120) s.c3ZA -= 0.55;
          if (s.c3Wp === 0) {
            wpName = 'Leg 1: M.G. Rd East -> Turn 1 (Kamaraj Rd)';
            s.c3XB -= 0.55;
            if (s.c3XB <= 47.0) {
              s.c3XB = 47.0;
              s.c3Wp = 1;
            }
          } else if (s.c3Wp === 1) {
            wpName = 'Leg 2: Kamaraj Rd North -> Turn 2 (Cubbon Rd)';
            s.c3ZB -= 0.55;
            if (s.c3ZB <= -60.0) {
              s.c3ZB = -60.0;
              s.c3Wp = 2;
            }
          } else if (s.c3Wp === 2) {
            wpName = 'Leg 3: Cubbon Rd West -> Turn 3 (Central St)';
            s.c3XB -= 0.55;
            if (s.c3XB <= -87.0) {
              s.c3XB = -87.0;
              s.c3Wp = 3;
            }
          } else if (s.c3Wp === 3) {
            wpName = 'Leg 4: Central St South -> Anil Kumble Circle';
            s.c3ZB += 0.55;
            if (s.c3ZB >= -2.89) {
              s.c3ZB = -2.89;
              s.c3Wp = 4;
            }
          } else {
            wpName = 'Leg 5: M.G. Road Westbound Departure (Bypass Complete)';
            s.c3XB -= 0.55;
          }

          if (s.c3ZA <= -40 && (s.c3Wp >= 4 || s.c3XB <= -95)) {
            s.c3NormalCycle = true;
            s.cycleArmIdx = 0;
            s.cycleTimer = 15.0;
          }
        } else if (s.running && s.c3NormalCycle) {
          s.cycleTimer -= 0.05;
          if (s.cycleTimer <= 0) {
            s.cycleArmIdx = (s.cycleArmIdx + 1) % 4;
            s.cycleTimer = 15.0;
          }
          wpName = 'Delivered — Normal Traffic Cycle Active';
        }

        const c3GeoA = twinToRoadGeo(2.2, s.c3ZA, { ambId: 'AMB_A' });
        const c3GeoB = twinToRoadGeo(s.c3XB, s.c3ZB, { ambId: 'AMB_B', wpIdx: s.c3Wp });

        let sGreen = s.running && !s.c3NormalCycle;
        let nGreen = s.running && !s.c3NormalCycle;
        let wGreen = false;
        let eGreen = false;

        if (s.running && s.c3NormalCycle) {
          wGreen = s.cycleArmIdx === 0;
          sGreen = s.cycleArmIdx === 1;
          eGreen = s.cycleArmIdx === 2;
          nGreen = s.cycleArmIdx === 3;
        }

        setState((prev) => ({
          ...prev,
          timestamp: Date.now(),
          selectedCase: 3,
          isStandaloneFallback: true,
          signals: {
            ...prev.signals,
            phase: !s.running ? 'ALL_RED' : s.c3NormalCycle ? 'NORMAL_CYCLE' : 'S_GREEN_CORRIDOR',
            signalPhase: !s.running
              ? 'STANDBY — ALL RED'
              : s.c3NormalCycle
              ? 'POST-CLEARANCE NORMAL TRAFFIC CYCLE'
              : 'BRIGADE RD GREEN (AMB A) • KAMARAJ-CUBBON DETOUR (AMB B)',
            sGreen,
            nGreen,
            wGreen,
            eGreen,
            timeRemaining: Math.ceil(s.cycleTimer),
            isPreempted: s.running && !s.c3NormalCycle,
          },
          case3: {
            ...prev.case3,
            isSimulationRunning: s.running,
            isFrozen: s.frozen,
            deadlockDetected: s.running && !s.c3NormalCycle,
            trafficCycleActive: s.c3NormalCycle,
            ambulanceA: {
              ...prev.case3.ambulanceA,
              status: s.c3ZA <= -40 ? 'DELIVERED' : s.running ? 'CORRIDOR_ACTIVE' : 'IDLE_STANDBY',
              position: { x: 2.2, y: 0.55, z: s.c3ZA, rotation: 0 },
              lngLat: c3GeoA.lngLat,
              bearing: c3GeoA.bearing,
              distanceToJunction: Math.max(0, Math.round(s.c3ZA)),
            },
            ambulanceB: {
              ...prev.case3.ambulanceB,
              status: s.c3Wp >= 4 ? 'DELIVERED' : s.running ? 'DETOUR_ACTIVE' : 'IDLE_STANDBY',
              position: { x: s.c3XB, y: 0.55, z: s.c3ZB, rotation: 0 },
              lngLat: c3GeoB.lngLat,
              bearing: c3GeoB.bearing,
              currentWaypointIdx: s.c3Wp,
              waypointName: wpName,
              detourActive: s.running && !s.c3NormalCycle,
            },
          },
        }));
      }
    }, 50);

    return () => {
      bc?.close();
      window.removeEventListener('storage', onStorage);
      clearInterval(fallbackTimer);
    };
  }, []);

  const sendCommand = useCallback((action, extra = {}) => {
    const cmd = { action, ...extra, ts: Date.now() };
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel(CHANNEL_NAME);
        bc.postMessage({ type: 'SEMTOS_CMD', payload: cmd });
        bc.close();
      }
      localStorage.setItem(CMD_STORAGE_KEY, JSON.stringify(cmd));
    } catch (_) {}

    const s = standaloneRef.current;
    if (action === 'DISPATCH') {
      s.running = true;
      s.c1X = -120;
      s.c3ZA = 90;
      s.c3XB = 90;
      s.c3ZB = -2.89;
      s.c3Wp = 0;
      s.c3NormalCycle = false;
    } else if (action === 'FREEZE') {
      s.frozen = !s.frozen;
    } else if (action === 'SWITCH_CASE') {
      s.selectedCase = extra.caseId || 1;
      s.running = false;
      s.c1X = -120;
      s.c3ZA = 90;
      s.c3XB = 90;
      s.c3ZB = -2.89;
      s.c3Wp = 0;
      s.c3NormalCycle = false;
    }
  }, []);

  return { state, sendCommand };
}

// Backward-compatible alias
export const useV2XSubscriber = useV2XReceiver;
