import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

// ── Case 3 Waypoint & Kinematics Configuration ──────────────────────────────
// Ambulance A (Main South Approach):
const AMB_A_START_Z = 90.0;
const AMB_A_LANE_X  = 2.2;
const AMB_A_END_Z   = -120.0;
const AMB_A_SPEED   = 0.55; // units per tick (~11 u/s)

// Ambulance B (East Approach & North Block Detour):
const AMB_B_START_X = 90.0;
const AMB_B_LANE_Z  = -2.89; // East approach westbound lane
const AMB_B_SPEED   = 0.60; // units per tick (~12 u/s)

// Detour Waypoints mapped from user Free-Roam Camera Telemetry:
// WP 0: East approach driving West (-X)
// WP 1: Right turn into North Side Street (X <= 47.0) -> facing North (-Z)
// WP 2: Left turn into Parallel West Avenue (Z <= -60.0) -> facing West (-X)
// WP 3: Left turn into South Side Street (X <= -85.0) -> facing South (+Z)
// WP 4: Right turn into Main Avenue (Z >= -2.89) -> facing West (-X), exiting West
const DETOUR_WAYPOINTS = [
  { id: 1, name: 'North Side Street Turn',  triggerAxis: 'x', triggerVal: 47.0,  condition: '<=', targetRot: 0,            nextDir: 'N' },
  { id: 2, name: 'Parallel West Ave Turn',  triggerAxis: 'z', triggerVal: -60.0, condition: '<=', targetRot: Math.PI / 2,  nextDir: 'W' },
  { id: 3, name: 'South Return Street Turn', triggerAxis: 'x', triggerVal: -87.0, condition: '<=', targetRot: Math.PI,       nextDir: 'S' },
  { id: 4, name: 'Main Avenue Re-entry',    triggerAxis: 'z', triggerVal: -2.89, condition: '>=', targetRot: Math.PI / 2,  nextDir: 'W' },
];

export function useCase3TrafficStream() {
  const [state, setState] = useState({
    ambulanceA: {
      id: 'AMB_A',
      name: 'Ambulance A (Cardiac - South)',
      priority: 'LEVEL 1 - CRITICAL',
      position: { x: AMB_A_LANE_X, y: 0.65, z: AMB_A_START_Z, rotation: 0 },
      distanceToJunction: 90.0,
      status: 'IDLE_STANDBY',
      etaToJunction: 7.5,
    },
    ambulanceB: {
      id: 'AMB_B',
      name: 'Ambulance B (Trauma - East)',
      priority: 'LEVEL 1 - CRITICAL',
      position: { x: AMB_B_START_X, y: 0.65, z: AMB_B_LANE_Z, rotation: Math.PI / 2 },
      distanceToJunction: 90.0,
      status: 'IDLE_STANDBY',
      currentWaypointIdx: 0,
      waypointName: 'Awaiting Dispatch',
      detourActive: false,
    },
    deadlockDetected: false,
    trafficCycleActive: false,
    isSimulationRunning: false,
    isFrozen: false,
    activeCamFollow: 'detour', // 'detour' (Amb B), 'corridor' (Amb A), 'overview'
    signals: {
      phase: 'ALL_RED',
      phaseLabel: 'STANDBY — ALL RED',
      sGreen: false,
      sYellow: false,
      nGreen: false,
      nYellow: false,
      eGreen: false,
      eYellow: false,
      wGreen: false,
      wYellow: false,
      timeRemaining: 15,
      activeArm: 'NONE',
    },
    metrics: {
      directJunctionDelaySec: 48,
      macroDetourDurationSec: 18,
      netTimeSavedSec: 30,
      co2ReductionPct: 64,
    },
    auditLogs: [],
  });

  const simRunningRef = useRef(false);
  const isFrozenRef   = useRef(false);
  const trafficCycleActiveRef = useRef(false);
  const cycleArmIndexRef = useRef(0);
  const cycleTimerRef = useRef(15.0);

  // Normal traffic orchestration arm sequence
  const CYCLE_SEQUENCE = [
    { arm: 'WEST',  phase: 'W_RELEASE', label: 'EAST APPROACH (WESTBOUND) GREEN — FLUSHING GRIDLOCK' },
    { arm: 'NORTH', phase: 'N_RELEASE', label: 'NORTH APPROACH (SOUTHBOUND) GREEN' },
    { arm: 'EAST',  phase: 'E_RELEASE', label: 'WEST APPROACH (EASTBOUND) GREEN' },
    { arm: 'SOUTH', phase: 'S_RELEASE', label: 'SOUTH APPROACH (NORTHBOUND) GREEN' },
  ];

  // Position & rotation refs for smooth tick updates
  const posARef = useRef({ x: AMB_A_LANE_X, y: 0.55, z: AMB_A_START_Z, rotation: 0 });
  const posBRef = useRef({ x: AMB_B_START_X, y: 0.55, z: AMB_B_LANE_Z, rotation: Math.PI / 2 });
  const wpIndexBRef = useRef(0);
  const rotTargetBRef = useRef(Math.PI / 2);

  const addLog = useCallback((msg, type = 'info') => {
    setState(prev => {
      const logs = [...prev.auditLogs, {
        id: Date.now() + Math.random(),
        timestamp: '[' + new Date().toTimeString().split(' ')[0] + ']',
        message: msg,
        type,
      }];
      if (logs.length > 50) logs.shift();
      return { ...prev, auditLogs: logs };
    });
  }, []);

  const dispatchCase3 = useCallback(() => {
    if (simRunningRef.current && !trafficCycleActiveRef.current) return;
    simRunningRef.current = true;
    trafficCycleActiveRef.current = false;
    cycleArmIndexRef.current = 0;
    cycleTimerRef.current = 15.0;
    wpIndexBRef.current = 0;
    rotTargetBRef.current = Math.PI / 2;

    posARef.current = { x: AMB_A_LANE_X, y: 0.55, z: AMB_A_START_Z, rotation: 0 };
    posBRef.current = { x: AMB_B_START_X, y: 0.55, z: AMB_B_LANE_Z, rotation: Math.PI / 2 };

    addLog('Dual dispatch triggered: Ambulance A (South) & Ambulance B (East) en route.', 'warning');
    addLog('AI CONFLICT DETECTOR: Equal priority emergency convergence at Junction (0,0)!', 'danger');
    addLog('DEADLOCK RESOLVED: Ambulance A granted South Green Corridor. Ambulance B assigned Macro-Detour via North Block.', 'success');

    setState(prev => ({
      ...prev,
      trafficCycleActive: false,
      isSimulationRunning: true,
      deadlockDetected: true,
      signals: {
        phase: 'S_GREEN_CORRIDOR',
        phaseLabel: 'SOUTH CORRIDOR GREEN (AMBULANCE A)',
        sGreen: true,
        sYellow: false,
        nGreen: true,
        nYellow: false,
        eGreen: false,
        eYellow: false,
        wGreen: false,
        wYellow: false,
        timeRemaining: 15,
        activeArm: 'SOUTH',
      },
      ambulanceA: {
        ...prev.ambulanceA,
        status: 'CORRIDOR_ACTIVE',
        position: { ...posARef.current },
      },
      ambulanceB: {
        ...prev.ambulanceB,
        status: 'DETOUR_ACTIVE',
        detourActive: true,
        currentWaypointIdx: 0,
        waypointName: 'Leg 1: East Approach -> WP 1',
        position: { ...posBRef.current },
      },
    }));
  }, [addLog]);

  // Key listeners for Case 3
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        dispatchCase3();
      }
      if (e.code === 'KeyF') {
        isFrozenRef.current = !isFrozenRef.current;
        setState(prev => ({ ...prev, isFrozen: isFrozenRef.current }));
        addLog(`System ${isFrozenRef.current ? 'PAUSED' : 'RESUMED'}.`);
      }
      if (e.code === 'Digit1') {
        setState(prev => ({ ...prev, activeCamFollow: 'corridor' }));
      }
      if (e.code === 'Digit2') {
        setState(prev => ({ ...prev, activeCamFollow: 'detour' }));
      }
      if (e.code === 'Digit3') {
        setState(prev => ({ ...prev, activeCamFollow: 'overview' }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatchCase3, addLog]);

  // ── Main simulation tick loop (50ms physics / 200ms HUD throttle) ───────────
  // The ref-based position values (posARef, posBRef) update every 50ms tick for
  // smooth 3D motion.  React setState is throttled to 200ms (5Hz) so the component
  // tree only re-renders 5× per second instead of 20×, eliminating micro-stutters.
  useEffect(() => {
    addLog('Case 03 initialized. Press [ENTER] to dispatch converging ambulances.');

    let lastHudUpdate = 0; // timestamp of last setState call (ms)

    const interval = setInterval(() => {
      if (!simRunningRef.current || isFrozenRef.current) return;

      // ────────────────────────────────────────────────────────────────────────
      // 0. Post-Clearance Normal Traffic Signal Orchestration (Case 1 Functionality)
      // ────────────────────────────────────────────────────────────────────────
      if (trafficCycleActiveRef.current) {
        cycleTimerRef.current -= 0.05;
        if (cycleTimerRef.current <= 0) {
          cycleArmIndexRef.current = (cycleArmIndexRef.current + 1) % CYCLE_SEQUENCE.length;
          cycleTimerRef.current = 15.0;
          const nextCycle = CYCLE_SEQUENCE[cycleArmIndexRef.current];
          addLog(`Signal phase transition: ${nextCycle.label}`, 'info');
        }

        const currentCycle = CYCLE_SEQUENCE[cycleArmIndexRef.current];
        const isYellow = cycleTimerRef.current <= 2.5;

        let nG = false, sG = false, eG = false, wG = false;
        let nY = false, sY = false, eY = false, wY = false;

        if (currentCycle.arm === 'WEST') {
          // East approach (Westbound cars, Type W) get green
          wG = !isYellow;
          wY = isYellow;
        } else if (currentCycle.arm === 'NORTH') {
          // North approach (Southbound cars, Type S) get green
          sG = !isYellow;
          sY = isYellow;
        } else if (currentCycle.arm === 'EAST') {
          // West approach (Eastbound cars, Type E) get green
          eG = !isYellow;
          eY = isYellow;
        } else if (currentCycle.arm === 'SOUTH') {
          // South approach (Northbound cars, Type N) get green
          nG = !isYellow;
          nY = isYellow;
        }

        setState(prev => ({
          ...prev,
          deadlockDetected: false,
          trafficCycleActive: true,
          signals: {
            phase: currentCycle.phase,
            phaseLabel: currentCycle.label,
            timeRemaining: Math.ceil(cycleTimerRef.current),
            activeArm: currentCycle.arm,
            nGreen: nG,
            nYellow: nY,
            sGreen: sG,
            sYellow: sY,
            eGreen: eG,
            eYellow: eY,
            wGreen: wG,
            wYellow: wY,
          },
          ambulanceA: {
            ...prev.ambulanceA,
            status: 'DELIVERED',
            position: { ...posARef.current },
          },
          ambulanceB: {
            ...prev.ambulanceB,
            status: 'DELIVERED',
            position: { ...posBRef.current },
          },
        }));
        return;
      }

      const now = Date.now();

      // ────────────────────────────────────────────────────────────────────────
      // 1. Advance Ambulance A (South -> North along -Z)
      // ────────────────────────────────────────────────────────────────────────
      let currentZA = posARef.current.z;
      if (currentZA > AMB_A_END_Z) {
        currentZA -= AMB_A_SPEED;
      }
      const distA = Math.max(0, currentZA);

      // Elevation for Ambulance A (South approach bridges)
      let currentYA = 0.55;
      if (currentZA > 45) {
        const t = THREE.MathUtils.clamp((currentZA - 45) / 45, 0, 1);
        currentYA = THREE.MathUtils.lerp(0.55, 0.72, t);
      } else if (currentZA < -15) {
        const t = THREE.MathUtils.clamp((-15 - currentZA) / 35, 0, 1);
        currentYA = THREE.MathUtils.lerp(0.55, 0.75, t);
      }
      posARef.current = { x: AMB_A_LANE_X, y: currentYA, z: currentZA, rotation: 0 };

      // ────────────────────────────────────────────────────────────────────────
      // 2. Advance Ambulance B along Detour Waypoint Path
      // ────────────────────────────────────────────────────────────────────────
      let { x: currentXB, z: currentZB, rotation: rotB } = posBRef.current;
      const wpIdx = wpIndexBRef.current;
      let wpName = 'Approaching Junction';

      if (wpIdx === 0) {
        wpName = 'Leg 1: Westbound Approach -> Turn 1 (X: 47)';
        currentXB -= AMB_B_SPEED;
        rotTargetBRef.current = Math.PI / 2;
        if (currentXB <= DETOUR_WAYPOINTS[0].triggerVal) {
          wpIndexBRef.current = 1;
          rotTargetBRef.current = DETOUR_WAYPOINTS[0].targetRot;
          addLog('Ambulance B reached Waypoint 1 (X: 47.0) — Turning Right onto North Side Street.', 'info');
        }
      } else if (wpIdx === 1) {
        wpName = 'Leg 2: North Side Street -> Turn 2 (Z: -60)';
        currentZB -= AMB_B_SPEED;
        rotTargetBRef.current = 0;
        if (currentZB <= DETOUR_WAYPOINTS[1].triggerVal) {
          wpIndexBRef.current = 2;
          rotTargetBRef.current = DETOUR_WAYPOINTS[1].targetRot;
          addLog('Ambulance B reached Waypoint 2 (Z: -60.0) — Turning Left onto Parallel West Avenue.', 'info');
        }
      } else if (wpIdx === 2) {
        wpName = 'Leg 3: Parallel West Avenue -> Turn 3 (X: -85)';
        currentXB -= AMB_B_SPEED;
        rotTargetBRef.current = Math.PI / 2;
        if (currentXB <= DETOUR_WAYPOINTS[2].triggerVal) {
          wpIndexBRef.current = 3;
          rotTargetBRef.current = DETOUR_WAYPOINTS[2].targetRot;
          currentXB = -87.0;
          addLog('Ambulance B reached Waypoint 3 (X: -87.0) — Turning Left onto South Return Street.', 'info');
        }
      } else if (wpIdx === 3) {
        wpName = 'Leg 4: South Return Street -> Rejoining Main Ave';
        currentXB = -87.0;
        currentZB += AMB_B_SPEED;
        rotTargetBRef.current = Math.PI;
        if (currentZB >= DETOUR_WAYPOINTS[3].triggerVal) {
          wpIndexBRef.current = 4;
          rotTargetBRef.current = DETOUR_WAYPOINTS[3].targetRot;
          currentZB = -2.89;
          addLog('Ambulance B returned to Main Avenue past Junction — Bypass Complete!', 'success');
        }
      } else {
        wpName = 'Leg 5: Westbound Departure (Bypass Complete)';
        currentZB = -2.89;
        currentXB -= AMB_B_SPEED;
        rotTargetBRef.current = Math.PI / 2;
      }

      // Smoothly interpolate rotation
      rotB = THREE.MathUtils.lerp(rotB, rotTargetBRef.current, 0.2);

      // Dynamic elevation Y across detour waypoints:
      let currentYB = 0.55;
      if (wpIdx === 1) {
        const t = THREE.MathUtils.clamp((currentZB - (-2.89)) / (-60.0 - (-2.89)), 0, 1);
        currentYB = THREE.MathUtils.lerp(0.55, 2.05, t);
      } else if (wpIdx === 2) {
        currentYB = 2.05;
      } else if (wpIdx === 3) {
        const t = THREE.MathUtils.clamp((currentZB - (-60.0)) / (-2.89 - (-60.0)), 0, 1);
        currentYB = THREE.MathUtils.lerp(2.05, 0.55, t);
      } else {
        currentYB = 0.55;
      }

      posBRef.current = { x: currentXB, y: currentYB, z: currentZB, rotation: rotB };

      // Check if both ambulances have cleared their operational zones past the junction
      const ambACleared = currentZA <= -40.0;
      const ambBCleared = (wpIdx >= 4 || currentXB <= -90.0);

      if (ambACleared && ambBCleared && !trafficCycleActiveRef.current) {
        trafficCycleActiveRef.current = true;
        cycleArmIndexRef.current = 0; // Starts with WEST (flushing East approach gridlock)
        cycleTimerRef.current = 15.0;
        addLog('Dual emergency clearance confirmed: Ambulances delivered past junction.', 'success');
        addLog('Initiating Case 1 Normal Traffic Orchestration — Flushing queued East Approach traffic.', 'info');
      }

      // Smooth 50ms tick sync — matching Case 1 kinematics
      setState(prev => ({
        ...prev,
        ambulanceA: {
          ...prev.ambulanceA,
          position: { ...posARef.current },
          distanceToJunction: distA,
          status: ambACleared ? 'CLEARED' : 'CORRIDOR_ACTIVE',
        },
        ambulanceB: {
          ...prev.ambulanceB,
          position: { ...posBRef.current },
          currentWaypointIdx: wpIdx,
          waypointName: wpName,
          status: ambBCleared ? 'CLEARED' : 'DETOUR_ACTIVE',
        },
      }));
    }, 50);

    return () => clearInterval(interval);
  }, [addLog]);

  const setCamFollow = useCallback((camType) => {
    setState(prev => ({ ...prev, activeCamFollow: camType }));
  }, []);

  return {
    ...state,
    posARef,
    posBRef,
    dispatchCase3,
    setCamFollow,
  };
}

