"use client";

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Bengaluru Satellite Anchor (Orthogonal 4-Way Urban Intersection) ─────────
// Three.js Scene Origin (x: 0, z: 0) maps to this exact [lng, lat]:
export const ORIGIN_LNG = 77.594560;
export const ORIGIN_LAT = 12.971600;

// 1 scene unit = 1.0 meter on Earth's surface at 12.97° N latitude
const METERS_PER_DEG_LAT = 110630.0;
const METERS_PER_DEG_LNG = 108460.0; // 111320 * cos(12.9716 deg)

/**
 * Converts exact Three.js scene coordinates (x, z) to [lng, lat].
 * In SEMTOS 3D Twin:
 *   +X = East  -> +Longitude
 *   -X = West  -> -Longitude
 *   -Z = North -> +Latitude
 *   +Z = South -> -Latitude
 */
export function twinToLngLat(x = 0, z = 0) {
  const lng = ORIGIN_LNG + (Number(x) || 0) / METERS_PER_DEG_LNG;
  const lat = ORIGIN_LAT - (Number(z) || 0) / METERS_PER_DEG_LAT;
  return [lng, lat];
}

/**
 * Converts Three.js vehicle/ambulance rotation or direction into MapLibre bearing (0° = North, 90° = East, 180° = South, 270° = West)
 */
export function twinHeadingToBearing(typeOrDir, rotY = 0, isAmbulance = false, ambRotation = 0) {
  // Steer deflection in degrees
  const steerDeg = -(Number(rotY) || 0) * (180 / Math.PI) * 0.65;

  if (isAmbulance) {
    // In useTrafficStream.js (Case 1): rotation = -Math.PI / 2 (driving East +X -> 90 deg)
    // In useCase3TrafficStream.js:
    //   Amb A: rotation = 0 (driving North -Z -> 0 deg)
    //   Amb B:
    //     Leg 1 (West -X): targetRot = Math.PI / 2 -> 270 deg
    //     Leg 2 (North -Z): targetRot = 0 -> 0 deg
    //     Leg 3 (West -X): targetRot = Math.PI / 2 -> 270 deg
    //     Leg 4 (South +Z): targetRot = Math.PI -> 180 deg
    //     Leg 5 (West -X): targetRot = Math.PI / 2 -> 270 deg
    if (Math.abs(ambRotation - (-Math.PI / 2)) < 0.25) return 90;
    // Map continuous Three.js rotation (0 = North, +PI/2 = West, +PI = South) to compass bearing:
    const deg = ((-ambRotation * 180) / Math.PI + 360) % 360;
    return deg;
  }

  if (typeOrDir === 'E') return 90 + steerDeg;
  if (typeOrDir === 'W') return 270 + steerDeg;
  if (typeOrDir === 'N') return 0 + steerDeg;
  if (typeOrDir === 'S') return 180 + steerDeg;
  return 0;
}

/**
 * Builds GeoJSON features for the exact 3D Twin road network, lane markings, stop lines,
 * and Case 03 5-leg North Block Detour (WP1 -> WP2 -> WP3 -> WP4) so the Satellite Map
 * displays the exact road corridors from TrafficManager.jsx and Canvas3D.jsx.
 */
export function buildTwinRoadGeoJSON(selectedCase = 1, detourActive = false) {
  const rectPolygon = (x1, z1, x2, z2, props = {}) => ({
    type: 'Feature',
    properties: props,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        twinToLngLat(x1, z1),
        twinToLngLat(x2, z1),
        twinToLngLat(x2, z2),
        twinToLngLat(x1, z2),
        twinToLngLat(x1, z1),
      ]],
    },
  });

  const lineFeature = (coordsXZ, props = {}) => ({
    type: 'Feature',
    properties: props,
    geometry: {
      type: 'LineString',
      coordinates: coordsXZ.map(([x, z]) => twinToLngLat(x, z)),
    },
  });

  // 1. Road Asphalt Deck Polygons (exact bounds from TrafficManager.jsx & Canvas3D.jsx)
  const polygons = [
    // Sidewalk & Curb Deck Buffers (architectural realistic border)
    rectPolygon(-142, -11.5, 107, 11.5, { kind: 'sidewalk_deck', name: 'Main Avenue Sidewalk Border' }),
    rectPolygon(-7.5, -127, 7.5, 100, { kind: 'sidewalk_deck', name: 'Cross Avenue Sidewalk Border' }),
    // East-West Main Avenue (X: -140 to +105, Z: -9.8 to +9.8)
    rectPolygon(-140, -9.8, 105, 9.8, { kind: 'main_road', name: 'Main East-West Avenue' }),
    // North-South Cross Avenue (X: -5.8 to +5.8, Z: -125 to +98)
    rectPolygon(-5.8, -125, 5.8, 98, { kind: 'cross_road', name: 'North-South Corridor' }),
    // North Side Street (Leg 2 of Case 03 Detour: X: 43.2 to 50.8, Z: -63.8 to -2.89)
    rectPolygon(42.0, -65.0, 52.0, -1.5, { kind: 'sidewalk_deck', name: 'North Side St Sidewalk' }),
    rectPolygon(43.2, -63.8, 50.8, -2.0, { kind: 'detour_road', name: 'North Side Street (WP1 -> WP2)' }),
    // Parallel West Avenue (Leg 3 of Case 03 Detour: X: -90.8 to 50.8, Z: -63.8 to -56.2)
    rectPolygon(-92.0, -65.0, 52.0, -55.0, { kind: 'sidewalk_deck', name: 'Parallel West Ave Sidewalk' }),
    rectPolygon(-90.8, -63.8, 50.8, -56.2, { kind: 'detour_road', name: 'Parallel West Avenue (WP2 -> WP3)' }),
    // South Return Street (Leg 4 of Case 03 Detour: X: -90.8 to -83.2, Z: -63.8 to -2.0)
    rectPolygon(-92.0, -65.0, -82.0, -1.5, { kind: 'sidewalk_deck', name: 'South Return St Sidewalk' }),
    rectPolygon(-90.8, -63.8, -83.2, -2.0, { kind: 'detour_road', name: 'South Return Street (WP3 -> WP4)' }),
    // Central Junction Box (JX_MIN=-5.0..3.5, JZ_MIN=-9.5..9.5)
    rectPolygon(-5.8, -9.8, 5.8, 9.8, { kind: 'junction_box', name: 'Central Signalized Intersection (0,0)' }),
  ];

  // 2. Center Medians, Lane Dividers, Stop Lines & Crosswalks
  const lines = [
    // Outer Curb Edges
    lineFeature([[-140, -9.8], [105, -9.8]], { kind: 'curb_edge' }),
    lineFeature([[-140, 9.8], [105, 9.8]], { kind: 'curb_edge' }),
    lineFeature([[-5.8, -125], [-5.8, 98]], { kind: 'curb_edge' }),
    lineFeature([[5.8, -125], [5.8, 98]], { kind: 'curb_edge' }),

    // Main Avenue Center Median (Z = 0, West & East of junction)
    lineFeature([[-140, -0.15], [-6.5, -0.15]], { kind: 'median' }),
    lineFeature([[-140, 0.15], [-6.5, 0.15]], { kind: 'median' }),
    lineFeature([[7.5, -0.15], [105, -0.15]], { kind: 'median' }),
    lineFeature([[7.5, 0.15], [105, 0.15]], { kind: 'median' }),

    // North-South Center Median (X = -0.5, North & South of junction)
    lineFeature([[-0.65, -125], [-0.65, -10.5]], { kind: 'median' }),
    lineFeature([[-0.35, -125], [-0.35, -10.5]], { kind: 'median' }),
    lineFeature([[-0.65, 10.5], [-0.65, 98]], { kind: 'median' }),
    lineFeature([[-0.35, 10.5], [-0.35, 98]], { kind: 'median' }),

    // Dashed White Lane Dividers
    lineFeature([[-140, -5.0], [-8.0, -5.0]], { kind: 'lane_dash' }),
    lineFeature([[-140, 5.0], [-8.0, 5.0]], { kind: 'lane_dash' }),
    lineFeature([[9.0, -3.5], [105, -3.5]], { kind: 'lane_dash' }),
    lineFeature([[9.0, 3.5], [105, 3.5]], { kind: 'lane_dash' }),
    lineFeature([[2.2, 12.0], [2.2, 98]], { kind: 'lane_dash' }),
    lineFeature([[-2.4, -125], [-2.4, -12.0]], { kind: 'lane_dash' }),

    // 4 Stop Lines (solid thick white stop bars)
    lineFeature([[-6.5, -9.5], [-6.5, 9.5]], { kind: 'stop_line', arm: 'WEST' }),
    lineFeature([[7.5, -9.5], [7.5, 9.5]], { kind: 'stop_line', arm: 'EAST' }),
    lineFeature([[-5.5, 10.5], [5.5, 10.5]], { kind: 'stop_line', arm: 'SOUTH' }),
    lineFeature([[-5.5, -10.5], [5.5, -10.5]], { kind: 'stop_line', arm: 'NORTH' }),

    // Zebra Crosswalk Stripes (West, East, North, South)
    lineFeature([[-7.8, -9.2], [-7.8, 9.2]], { kind: 'zebra_crosswalk' }),
    lineFeature([[-8.4, -9.2], [-8.4, 9.2]], { kind: 'zebra_crosswalk' }),
    lineFeature([[8.8, -9.2], [8.8, 9.2]], { kind: 'zebra_crosswalk' }),
    lineFeature([[9.4, -9.2], [9.4, 9.2]], { kind: 'zebra_crosswalk' }),
    lineFeature([[-5.2, -11.8], [5.2, -11.8]], { kind: 'zebra_crosswalk' }),
    lineFeature([[-5.2, -12.4], [5.2, -12.4]], { kind: 'zebra_crosswalk' }),
    lineFeature([[-5.2, 11.8], [5.2, 11.8]], { kind: 'zebra_crosswalk' }),
    lineFeature([[-5.2, 12.4], [5.2, 12.4]], { kind: 'zebra_crosswalk' }),

    // Central Anti-Gridlock Yellow Box Junction Diagonal Lines
    lineFeature([[-5.5, -9.5], [5.5, 9.5]], { kind: 'yellow_box' }),
    lineFeature([[-5.5, 9.5], [5.5, -9.5]], { kind: 'yellow_box' }),
    lineFeature([[-5.5, 0], [0, 9.5]], { kind: 'yellow_box' }),
    lineFeature([[0, -9.5], [5.5, 0]], { kind: 'yellow_box' }),
    lineFeature([[-5.5, 0], [0, -9.5]], { kind: 'yellow_box' }),
    lineFeature([[0, 9.5], [5.5, 0]], { kind: 'yellow_box' }),
  ];

  // 3. Active Emergency Corridor & Case 03 5-Leg Macro-Detour Ribbon
  if (selectedCase === 1) {
    lines.push(
      lineFeature([[-120, -6.0], [100, -6.0]], {
        kind: 'amb_corridor_case1',
        name: 'Case 01 West->East Preemption Corridor (Z = -6.0)',
      })
    );
  } else if (selectedCase === 3) {
    // Ambulance A South->North Green Corridor (X = 2.2, Z: 90 -> -120)
    lines.push(
      lineFeature([[2.2, 90.0], [2.2, -120.0]], {
        kind: 'amb_a_corridor',
        name: 'Ambulance A Priority South->North Corridor (X = 2.2)',
      })
    );
    // Ambulance B 5-Leg North Block Macro-Detour (WP1 -> WP2 -> WP3 -> WP4 -> Exit)
    lines.push(
      lineFeature(
        [
          [90.0, -2.89],
          [47.0, -2.89],
          [47.0, -60.0],
          [-87.0, -60.0],
          [-87.0, -2.89],
          [-135.0, -2.89],
        ],
        {
          kind: 'amb_b_detour',
          active: detourActive ? 1 : 0,
          name: 'Ambulance B 5-Leg North Block Detour',
        }
      )
    );
    // East Approach Gridlock Blockade Zone (X: 10.0 to 43.0)
    lines.push(
      lineFeature([[10.0, -3.5], [43.0, -3.5]], {
        kind: 'east_blockade',
        name: 'East Approach Dense Gridlock Zone (X: 10..43)',
      })
    );
  }

  return {
    polygons: { type: 'FeatureCollection', features: polygons },
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
      }
    )});

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
      { id: 1, timestamp: '[READY]', message: 'V2X Satellite Telemetry Ready. Press DISPATCH [ENTER] to start.' },
    ],
  };
}

/**
 * Publisher Hook used inside src/app/page.js (3D Twin Command Center)
 * Broadcasts live vehicles + ambulances + signals to /ambulance and /driver
 * and listens for remote commands from /ambulance.
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

      // 1. Instant zero-latency BroadcastChannel push (20 FPS)
      if (channelRef.current) {
        try {
          channelRef.current.postMessage({ type: 'SNAPSHOT', payload: snapshot });
        } catch (_) {}
      }

      // 2. Every 3rd tick (~150ms), sync with /api/v2x for external phones on LAN/Wi-Fi
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
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, []);
}

/**
 * Subscriber Hook used inside /ambulance and /driver
 * Receives live 3D Twin telemetry via BroadcastChannel or /api/v2x.
 * Also includes a built-in standalone physics loop matching TrafficManager.jsx
 * so if the user opens /ambulance directly without the 3D Twin tab open,
 * dispatching still animates the exact same cars and ambulances!
 */
export function useV2XSubscriber() {
  const [snapshot, setSnapshot] = useState(() => createDefaultSnapshot(1));
  const [isLiveTwinConnected, setIsLiveTwinConnected] = useState(false);

  const lastTwinMsgTimeRef = useRef(0);
  const channelRef = useRef(null);
  const localSimRef = useRef(createDefaultSnapshot(1));

  const sendCommand = useCallback((command, payload = {}) => {
    // 1. Send over BroadcastChannel
    if (channelRef.current) {
      try {
        channelRef.current.postMessage({ type: 'COMMAND', command, payload });
      } catch (_) {}
    }
    // 2. Send to /api/v2x for LAN sync
    fetch('/api/v2x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'COMMAND', command, payload }),
    }).catch(() => {});

    // 3. Also apply to standalone fallback engine if 3D Twin tab isn't open
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

    // Poll /api/v2x every 200ms as fallback when BroadcastChannel isn't active (e.g. phone on Wi-Fi)
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

    // Standalone fallback kinematics loop when 3D Twin tab is not open
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
        // Update Case 1 E cars yielding & moving
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
        // Case 3 Fallback Kinematics
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
          s.ambulanceB.waypointName = 'Leg 2: North Side Street -> Turn 2 (Z: -60)';
          if (bPos.z <= -60.0) s.ambulanceB.currentWaypointIdx = 2;
        } else if (wp === 2) {
          bPos.x -= 0.6;
          bPos.rotation = Math.PI / 2;
          s.ambulanceB.waypointName = 'Leg 3: Parallel West Avenue -> Turn 3 (X: -87)';
          if (bPos.x <= -87.0) s.ambulanceB.currentWaypointIdx = 3;
        } else if (wp === 3) {
          bPos.z += 0.6;
          bPos.rotation = Math.PI;
          s.ambulanceB.waypointName = 'Leg 4: South Return Street -> Rejoining Main Ave';
          if (bPos.z >= -2.89) {
            bPos.z = -2.89;
            s.ambulanceB.currentWaypointIdx = 4;
          }
        } else {
          bPos.x -= 0.6;
          bPos.rotation = Math.PI / 2;
          s.ambulanceB.waypointName = 'Leg 5: Westbound Departure (Bypass Complete)';
        }

        // Update Northbound cars yielding to Ambulance A
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
