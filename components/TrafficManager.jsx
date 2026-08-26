import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, TransformControls } from '@react-three/drei';
import * as THREE from 'three';

const NORMAL_SPEED = 7; // units per second
const SPAWN_DISTANCE = 50;

// ── INTERSECTION BOX ──
// The physical area where N/S and E/W roads overlap.
// Cars INSIDE this box must ALWAYS drive forward — never stop mid-junction.
// Derived from lane perpHome positions + road edge buffer.
const JX_MIN = -5.0;  // West edge of N/S road
const JX_MAX =  3.5;  // East edge of N/S road
const JZ_MIN = -9.5;  // South edge of E/W road
const JZ_MAX =  9.5;  // North edge of E/W road

export function TrafficManager({ ambulancePosition, isPreempted, nGreen=false, sGreen=false, eGreen=false, wGreen=false, nYellow=false, sYellow=false, eYellow=false, wYellow=false, isFrozen, editMode, boundaryMode }) {
  // ── ROAD BOUNDARIES (FOOTPATH PROTECTION) ──
  const [boundaries, setBoundaries] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('semtos_boundaries');
      if (saved) return JSON.parse(saved);
    }
    return {
      top: -9.58,       // Z-axis boundary for Eastbound edge (Left)
      bottom: -1.24,    // Z-axis boundary for Eastbound edge (Right)
      westTop: 9.58,    // Z-axis boundary for Westbound edge (Right)
      westBottom: 1.24, // Z-axis boundary for Westbound edge (Left)
      left: -3.69,      // X-axis boundary for Southbound edge
      right: 3.44,      // X-axis boundary for Northbound edge
    };
  });

  useEffect(() => {
    localStorage.setItem('semtos_boundaries', JSON.stringify(boundaries));
  }, [boundaries]);

  const car1 = useGLTF('/car1.glb');
  const car2 = useGLTF('/car2.glb');
  const car3 = useGLTF('/car3.glb');

  const models = [
    { scene: car1.scene, yOffsetRot: Math.PI },
    { scene: car2.scene, yOffsetRot: 0       },
    { scene: car3.scene, yOffsetRot: 0       },
  ];

  const vehiclesRef = useRef(null);
  
  if (!vehiclesRef.current) {
    const cars = [];
    const lanes = [
      // NORTHBOUND (Moving -Z). Stop BEFORE junction south edge (z=11).
      // perpHome X must be between 0 and right=3.44.
      // Spread lanes 1.5 units apart so bodies don't overlap.
      { dir: 'N', axis: 'z', perpAxis: 'x', sign: -1, perpHome: 2.5, pullOverPerp: 3.1, stopLine: 11, wrapPos: -SPAWN_DISTANCE - 20, startPos: SPAWN_DISTANCE },
      { dir: 'N', axis: 'z', perpAxis: 'x', sign: -1, perpHome: 1.0, pullOverPerp: 2.5, stopLine: 11, wrapPos: -SPAWN_DISTANCE - 20, startPos: SPAWN_DISTANCE },

      // SOUTHBOUND (Moving +Z). Stop BEFORE junction north edge (z=-11).
      // perpHome X must be between left=-3.69 and 0.
      // Old -4.0 was OUTSIDE boundary — now fixed to -3.1.
      { dir: 'S', axis: 'z', perpAxis: 'x', sign: 1, perpHome: -3.1, pullOverPerp: -3.4, stopLine: -11, wrapPos: SPAWN_DISTANCE, startPos: -SPAWN_DISTANCE - 10 },
      { dir: 'S', axis: 'z', perpAxis: 'x', sign: 1, perpHome: -1.8, pullOverPerp: -3.2, stopLine: -11, wrapPos: SPAWN_DISTANCE, startPos: -SPAWN_DISTANCE - 10 },

      // EASTBOUND (Moving +X). Stop BEFORE junction west edge.
      // Z must stay within top=-9.58 … bottom=-1.24.
      { dir: 'E', axis: 'x', perpAxis: 'z', sign: 1, perpHome: -7.5, pullOverPerp: -9.0, stopLine: -7, wrapPos: SPAWN_DISTANCE, startPos: -SPAWN_DISTANCE - 10 },
      { dir: 'E', axis: 'x', perpAxis: 'z', sign: 1, perpHome: -4.5, pullOverPerp: -2.0, stopLine: -7, wrapPos: SPAWN_DISTANCE, startPos: -SPAWN_DISTANCE - 10 },

      // WESTBOUND (Moving -X). Stop BEFORE junction east edge.
      // Z must stay within westBottom=1.24 … westTop=9.58.
      { dir: 'W', axis: 'x', perpAxis: 'z', sign: -1, perpHome: 4.5, pullOverPerp: 1.5, stopLine: 6, wrapPos: -SPAWN_DISTANCE - 10, startPos: SPAWN_DISTANCE },
      { dir: 'W', axis: 'x', perpAxis: 'z', sign: -1, perpHome: 7.5, pullOverPerp: 9.0, stopLine: 6, wrapPos: -SPAWN_DISTANCE - 10, startPos: SPAWN_DISTANCE },
    ];

    let idCount = 1;
    for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
      const lane = lanes[laneIdx];
      // Eastbound approach gets 9 cars for visual density (long straight road).
      // N/S approaches get only 3 cars each so they stay within the visible road bounds.
      // E/W westbound get 4 cars.
      const carCount = (lane.dir === 'E') ? 9 : (lane.dir === 'N' || lane.dir === 'S') ? 3 : 4;
      // Use a lane-index stagger (5 units) so adjacent-lane cars don't line up exactly.
      const laneStagger = (laneIdx % 2) * 5;
      // Spacing: 7 units for E lane (9 cars), 8 units for others (tight-but-visible queue)
      const spacing = (lane.dir === 'E') ? 7 : 8;

      for (let i = 0; i < carCount; i++) {
        // posParallel: each car sits behind the stop line by (2 + stagger + i*spacing) units
        const posParallel = lane.stopLine - (lane.sign * (2 + laneStagger + i * spacing));

        cars.push({
          id: idCount++,
          type: lane.dir,
          modelIdx: idCount % 3,
          axis: lane.axis,
          perpAxis: lane.perpAxis,
          sign: lane.sign,
          homePerp: lane.perpHome,
          pullOverPerp: lane.pullOverPerp,
          targetPerp: lane.perpHome,
          wrapPos: lane.wrapPos,
          startPos: lane.startPos,
          stopLine: lane.stopLine,
          pos: new THREE.Vector3(
            lane.axis === 'x' ? posParallel : lane.perpHome,
            0.2,   // Raise slightly above road surface to avoid sinking
            lane.axis === 'z' ? posParallel : lane.perpHome
          ),
          rotY: 0,
          receivesBLE: false,
          speed: 0,
          state: 'IDLE_QUEUE',
        });
      }
    }
    vehiclesRef.current = cars;
  }

  const meshRefs = useRef(vehiclesRef.current.map(() => React.createRef()));
  const beaconRefs = useRef(vehiclesRef.current.map(() => React.createRef()));

  useFrame((_, delta) => {
    if (editMode || boundaryMode || isFrozen) return;

    const ambPos = new THREE.Vector3(ambulancePosition.x, 0, ambulancePosition.z);

    vehiclesRef.current.forEach((veh) => {

      // ══════════════════════════════════════════════════════════════════
      // 0. JUNCTION GEOMETRY
      // Is this car physically inside the intersection box right now?
      // If YES → it MUST keep driving forward no matter what the signal is.
      // ══════════════════════════════════════════════════════════════════
      const inJunction = (
        veh.pos.x > JX_MIN && veh.pos.x < JX_MAX &&
        veh.pos.z > JZ_MIN && veh.pos.z < JZ_MAX
      );

      // Distance to stop line: positive = car is BEFORE line, negative = past it
      const distToStopLine = (veh.stopLine - veh.pos[veh.axis]) * veh.sign;

      // "Approaching" = before the line and within braking zone (never in the junction)
      const approaching = !inJunction && distToStopLine >= 0 && distToStopLine < 22;

      // ══════════════════════════════════════════════════════════════════
      // 1. JUNCTION CLEARANCE  (HIGHEST PRIORITY — overrides everything)
      // Once a car crosses its stop line it OWNS the junction until clear.
      // No signal change may halt it in the middle of the intersection.
      // ══════════════════════════════════════════════════════════════════
      if (inJunction && (veh.state === 'IDLE_QUEUE' || veh.state === 'SLOWING_FORWARD')) {
        veh.state = 'DRIVING_GREEN';
      }

      // Per-arm signal state — driven by independent booleans from useTrafficSignal
      let isMyLightGreen  = false;
      let isMyLightYellow = false;
      let isMyLightRed    = true;

      if (veh.type === 'N') { isMyLightGreen = nGreen; isMyLightYellow = nYellow; }
      else if (veh.type === 'S') { isMyLightGreen = sGreen; isMyLightYellow = sYellow; }
      else if (veh.type === 'E') { isMyLightGreen = eGreen; isMyLightYellow = eYellow; }
      else if (veh.type === 'W') { isMyLightGreen = wGreen; isMyLightYellow = wYellow; }
      isMyLightRed = !isMyLightGreen && !isMyLightYellow;

      // ══════════════════════════════════════════════════════════════════
      // 3. STATE MACHINE  (only active when outside the junction)
      // ══════════════════════════════════════════════════════════════════
      if (!inJunction) {
        // Determine if this specific car should pull over for the ambulance
        let shouldYield = false;
        if (isPreempted && veh.type === 'E') {
          const distToAmb = veh.pos.distanceTo(ambPos);
          
          // Cars at the back (x < -20) yield to form the corridor, but ONLY 
          // when the ambulance's BLE dome reaches them (distToAmb <= 14).
          // Stop yielding once the ambulance has passed them by a safe distance (30 units).
          if (distToAmb <= 14 && veh.pos.x < -20 && ambPos.x <= veh.pos.x + 30) {
             shouldYield = true;
          }
        }

        if (shouldYield) {
          if (veh.state === 'IDLE_QUEUE' || veh.state === 'DRIVING_GREEN' || veh.state === 'SLOWING_FORWARD') {
            veh.state = 'YIELDING';
          }
        } else {
          // ── Normal signal logic (applies to non-yielding cars) ──
          if (veh.state === 'YIELDING' || veh.state === 'HOLDING') {
            // Ambulance passed, resume lane
            veh.state = 'RESUMING_LANE';

          } else if (isMyLightGreen) {
            // GREEN: release any queued / braking cars
            if (veh.state === 'IDLE_QUEUE' || veh.state === 'SLOWING_FORWARD') {
              veh.state = 'DRIVING_GREEN';
            }

          } else if (isMyLightYellow) {
            // YELLOW: brake only if there is room to stop safely before the line.
            if (veh.state === 'DRIVING_GREEN' && approaching && distToStopLine > 8) {
              veh.state = 'SLOWING_FORWARD';
            }

          } else {
            // RED: begin smooth braking when approaching
            if (veh.state === 'DRIVING_GREEN' && approaching) {
              veh.state = 'SLOWING_FORWARD';
            }
            // Snap to fully stopped once within 2 units of the line
            if (veh.state === 'SLOWING_FORWARD' && distToStopLine < 2) {
              veh.state = 'IDLE_QUEUE';
            }
          }
        }
      }

      // Physical state completions
      if (veh.state === 'YIELDING' && Math.abs(veh.pos[veh.perpAxis] - veh.pullOverPerp) < 0.2) {
        veh.state = 'HOLDING';
      }
      if (veh.state === 'RESUMING_LANE' && Math.abs(veh.pos[veh.perpAxis] - veh.homePerp) < 0.2) {
        veh.state = (isMyLightRed && !inJunction) ? 'IDLE_QUEUE' : 'DRIVING_GREEN';
      }

      // ══════════════════════════════════════════════════════════════════
      // 4. SPEED CALCULATION
      // ══════════════════════════════════════════════════════════════════
      let targetSpeed = NORMAL_SPEED;
      veh.receivesBLE = false;

      if (veh.state === 'IDLE_QUEUE') {
        targetSpeed = 0;
        veh.targetPerp = veh.homePerp;

      } else if (veh.state === 'SLOWING_FORWARD') {
        // Proportional braking: speed ramps from NORMAL down to 0 over 18 units
        const brakeFactor = THREE.MathUtils.clamp(distToStopLine / 18, 0, 1);
        targetSpeed = NORMAL_SPEED * brakeFactor;
        veh.targetPerp = veh.homePerp;
        veh.receivesBLE = true;
        if (distToStopLine <= 1.5) {
          targetSpeed = 0;
          veh.state = 'IDLE_QUEUE';
        }

      } else if (veh.state === 'YIELDING') {
        targetSpeed = 0;
        veh.targetPerp = veh.pullOverPerp;
        veh.receivesBLE = true;

      } else if (veh.state === 'HOLDING') {
        targetSpeed = 0;
        veh.targetPerp = veh.pullOverPerp;
        veh.receivesBLE = true;

      } else if (veh.state === 'RESUMING_LANE') {
        targetSpeed = NORMAL_SPEED * 0.4;
        veh.targetPerp = veh.homePerp;

      } else { // DRIVING_GREEN
        targetSpeed = NORMAL_SPEED;
        veh.targetPerp = veh.homePerp;
      }

      // ══════════════════════════════════════════════════════════════════
      // 5. COLLISION AVOIDANCE
      // ══════════════════════════════════════════════════════════════════
      let blocked   = false;
      let blockDist = Infinity;
      let leaderSpeed = 0;

      vehiclesRef.current.forEach((other) => {
        if (other.id === veh.id) return;

        if (other.type === veh.type) {
          // ── Same direction: car-following / tailgate prevention ──
          const dPerp     = Math.abs(other.pos[veh.perpAxis] - veh.pos[veh.perpAxis]);
          const dParallel = (other.pos[veh.axis] - veh.pos[veh.axis]) * veh.sign;

          // Direct same-lane tailgate
          if (dParallel > 0 && dParallel < 14 && dPerp < 1.8) {
            blocked = true;
            if (dParallel < blockDist) { blockDist = dParallel; leaderSpeed = other.speed || 0; }
          }

        } else {
          // ── Cross direction: prevent T-bones during phase transitions ──
          // Only applies if we are just about to enter the box AND the other car's
          // signal direction conflicts (i.e. they shouldn't be there but are).
          if (!inJunction && veh.state === 'DRIVING_GREEN' && approaching && distToStopLine < 10) {
            const otherInJunction = (
              other.pos.x > JX_MIN && other.pos.x < JX_MAX &&
              other.pos.z > JZ_MIN && other.pos.z < JZ_MAX
            );
            // Only block if the other car is in the junction AND moving fast (not already stopped)
            // AND we do NOT have priority (i.e. the light just changed and there's a straggler)
            // Skip this block entirely when it's pure EW_GREEN — N/S will have stopped already.
            const otherIsNS = (other.type === 'N' || other.type === 'S');
            const otherIsEW = (other.type === 'E' || other.type === 'W');
            const weAreEW   = (veh.type === 'E' || veh.type === 'W');
            const weAreNS   = (veh.type === 'N' || veh.type === 'S');
            // Only check for T-bone if the other direction would be red now
            const otherConflicts = (weAreEW && otherIsNS && (nGreen || sGreen)) ||
                                   (weAreNS && otherIsEW && (eGreen || wGreen));
            if (otherInJunction && other.speed > 0.4 && !otherConflicts) {
              blocked = true;
              if (distToStopLine < blockDist) { blockDist = distToStopLine; leaderSpeed = 0; }
            }
          }
        }
      });

      if (blocked && veh.state !== 'IDLE_QUEUE' && veh.state !== 'HOLDING') {
        if (blockDist < 7) {
          targetSpeed = 0;
        } else {
          // Exactly match the leader's speed to prevent rubber-banding (pausing and resuming)
          targetSpeed = Math.min(targetSpeed, leaderSpeed);
        }
      }

      // ══════════════════════════════════════════════════════════════════
      // 6. PHYSICS
      // ══════════════════════════════════════════════════════════════════
      veh.speed = THREE.MathUtils.lerp(veh.speed, targetSpeed, delta * 4.5);
      veh.pos[veh.axis] += veh.speed * delta * veh.sign;

      // Wrap-around: car exits the road, re-enter at spawn point driving
      if (veh.sign === 1 && veh.pos[veh.axis] > veh.wrapPos) {
        veh.pos[veh.axis]     = veh.startPos;
        veh.pos[veh.perpAxis] = veh.homePerp;
        veh.pos.y             = 0.2;
        veh.state = 'DRIVING_GREEN'; // Will brake naturally as it approaches
        veh.speed = 0;
      } else if (veh.sign === -1 && veh.pos[veh.axis] < veh.wrapPos) {
        veh.pos[veh.axis]     = veh.startPos;
        veh.pos[veh.perpAxis] = veh.homePerp;
        veh.pos.y             = 0.2;
        veh.state = 'DRIVING_GREEN';
        veh.speed = 0;
      }

      // ══════════════════════════════════════════════════════════════════
      // 7. LATERAL MOVEMENT + BOUNDARY PROTECTION
      // ══════════════════════════════════════════════════════════════════
      let safeTargetPerp = veh.targetPerp;
      if (veh.axis === 'x') {
        if (veh.type === 'E') {
          safeTargetPerp = THREE.MathUtils.clamp(safeTargetPerp, boundaries.top + 0.5, boundaries.bottom - 0.5);
        } else {
          safeTargetPerp = THREE.MathUtils.clamp(safeTargetPerp, boundaries.westBottom + 0.5, boundaries.westTop - 0.5);
        }
      } else {
        safeTargetPerp = THREE.MathUtils.clamp(safeTargetPerp, boundaries.left + 0.5, boundaries.right - 0.5);
      }

      const targetDelta = safeTargetPerp - veh.pos[veh.perpAxis];
      let steerTarget = 0;
      if (Math.abs(targetDelta) > 0.1) {
        if (veh.axis === 'x') {
          steerTarget = (targetDelta > 0 ? -0.15 : 0.15) * veh.sign;
        } else {
          steerTarget = (targetDelta > 0 ? 0.15 : -0.15) * veh.sign;
        }
      }
      veh.rotY = THREE.MathUtils.lerp(veh.rotY, steerTarget, delta * 2.5);
      veh.pos[veh.perpAxis] = THREE.MathUtils.lerp(veh.pos[veh.perpAxis], safeTargetPerp, delta * 1.2);

      // Absolute footpath clamp (last resort boundary enforcement)
      if (veh.axis === 'x') {
        if (veh.type === 'E') {
          veh.pos.z = THREE.MathUtils.clamp(veh.pos.z, boundaries.top + 0.5, boundaries.bottom - 0.5);
        } else {
          veh.pos.z = THREE.MathUtils.clamp(veh.pos.z, boundaries.westBottom + 0.5, boundaries.westTop - 0.5);
        }
      } else {
        veh.pos.x = THREE.MathUtils.clamp(veh.pos.x, boundaries.left + 0.5, boundaries.right - 0.5);
      }
    });



    vehiclesRef.current.forEach((veh, idx) => {
      const meshGroup = meshRefs.current[idx]?.current;
      const beaconMat = beaconRefs.current[idx]?.current;
      if (!meshGroup) return;

      const modelConfig = models[veh.modelIdx % models.length];
      meshGroup.position.copy(veh.pos);

      let baseRot = 0;
      if (veh.type === 'E') baseRot = Math.PI / 2;
      if (veh.type === 'W') baseRot = -Math.PI / 2;
      if (veh.type === 'S') baseRot = 0;
      if (veh.type === 'N') baseRot = Math.PI;

      meshGroup.rotation.y = baseRot + modelConfig.yOffsetRot + veh.rotY;

      if (beaconMat) {
        beaconMat.color.set(veh.receivesBLE ? '#10b981' : '#64748b');
      }
    });
  });

  // ── BOUNDARY MODE RENDER ───────────────────────────────────────────────────
  if (boundaryMode) {
    return (
      <group>
        {/* Render a faint overlay of the vehicles so they aren't completely invisible */}
        {vehiclesRef.current.map((veh, idx) => {
          const modelConfig = models[veh.modelIdx % models.length];
          let baseRot = 0;
          if (veh.type === 'E') baseRot = Math.PI / 2;
          if (veh.type === 'W') baseRot = -Math.PI / 2;
          if (veh.type === 'S') baseRot = 0;
          if (veh.type === 'N') baseRot = Math.PI;

          return (
            <group key={`ghost-${veh.id}`} position={veh.pos.toArray()} rotation={[0, baseRot + modelConfig.yOffsetRot, 0]}>
              <group scale={[0.6, 0.6, 0.6]}>
                <primitive object={modelConfig.scene.clone(true)} />
              </group>
            </group>
          );
        })}

        {/* TOP BOUNDARY (Eastbound Z limit - Left) */}
        <TransformControls mode="translate" showX={false} showY={false} showZ={true} 
          position={[0, 0.1, boundaries.top]}
          onMouseUp={(e) => {
            const z = e.target.object.position.z;
            setBoundaries(prev => ({ ...prev, top: z }));
            console.log(`🚧 BOUNDARY EAST TOP UPDATED → Z: ${z.toFixed(2)}`);
          }}
        >
          <mesh>
            <boxGeometry args={[100, 0.5, 0.5]} />
            <meshBasicMaterial color="#ef4444" opacity={0.5} transparent />
          </mesh>
        </TransformControls>

        {/* BOTTOM BOUNDARY (Eastbound Z limit - Right) */}
        <TransformControls mode="translate" showX={false} showY={false} showZ={true} 
          position={[0, 0.1, boundaries.bottom]}
          onMouseUp={(e) => {
            const z = e.target.object.position.z;
            setBoundaries(prev => ({ ...prev, bottom: z }));
            console.log(`🚧 BOUNDARY EAST BOTTOM UPDATED → Z: ${z.toFixed(2)}`);
          }}
        >
          <mesh>
            <boxGeometry args={[100, 0.5, 0.5]} />
            <meshBasicMaterial color="#ef4444" opacity={0.5} transparent />
          </mesh>
        </TransformControls>

        {/* WEST TOP BOUNDARY (Westbound Z limit - Right) */}
        <TransformControls mode="translate" showX={false} showY={false} showZ={true} 
          position={[0, 0.1, boundaries.westTop]}
          onMouseUp={(e) => {
            const z = e.target.object.position.z;
            setBoundaries(prev => ({ ...prev, westTop: z }));
            console.log(`🚧 BOUNDARY WEST TOP UPDATED → Z: ${z.toFixed(2)}`);
          }}
        >
          <mesh>
            <boxGeometry args={[100, 0.5, 0.5]} />
            <meshBasicMaterial color="#eab308" opacity={0.5} transparent />
          </mesh>
        </TransformControls>

        {/* WEST BOTTOM BOUNDARY (Westbound Z limit - Left) */}
        <TransformControls mode="translate" showX={false} showY={false} showZ={true} 
          position={[0, 0.1, boundaries.westBottom]}
          onMouseUp={(e) => {
            const z = e.target.object.position.z;
            setBoundaries(prev => ({ ...prev, westBottom: z }));
            console.log(`🚧 BOUNDARY WEST BOTTOM UPDATED → Z: ${z.toFixed(2)}`);
          }}
        >
          <mesh>
            <boxGeometry args={[100, 0.5, 0.5]} />
            <meshBasicMaterial color="#eab308" opacity={0.5} transparent />
          </mesh>
        </TransformControls>

        {/* LEFT BOUNDARY (Southbound X limit) */}
        <TransformControls mode="translate" showX={true} showY={false} showZ={false} 
          position={[boundaries.left, 0.1, 0]}
          onMouseUp={(e) => {
            const x = e.target.object.position.x;
            setBoundaries(prev => ({ ...prev, left: x }));
            console.log(`🚧 BOUNDARY LEFT UPDATED → X: ${x.toFixed(2)}`);
          }}
        >
          <mesh>
            <boxGeometry args={[0.5, 0.5, 100]} />
            <meshBasicMaterial color="#3b82f6" opacity={0.5} transparent />
          </mesh>
        </TransformControls>

        {/* RIGHT BOUNDARY (Northbound X limit) */}
        <TransformControls mode="translate" showX={true} showY={false} showZ={false} 
          position={[boundaries.right, 0.1, 0]}
          onMouseUp={(e) => {
            const x = e.target.object.position.x;
            setBoundaries(prev => ({ ...prev, right: x }));
            console.log(`🚧 BOUNDARY RIGHT UPDATED → X: ${x.toFixed(2)}`);
          }}
        >
          <mesh>
            <boxGeometry args={[0.5, 0.5, 100]} />
            <meshBasicMaterial color="#3b82f6" opacity={0.5} transparent />
          </mesh>
        </TransformControls>
      </group>
    );
  }

  if (editMode) {
    return (
      <>
        {vehiclesRef.current.map((veh, idx) => {
          const modelConfig = models[veh.modelIdx % models.length];
          let baseRot = 0;
          if (veh.type === 'E') baseRot = Math.PI / 2;
          if (veh.type === 'W') baseRot = -Math.PI / 2;
          if (veh.type === 'S') baseRot = 0;
          if (veh.type === 'N') baseRot = Math.PI;

          return (
            <React.Fragment key={`edit-${veh.id}`}>
              <group ref={meshRefs.current[idx]} position={veh.pos.toArray()}>
                <group
                  scale={[0.6, 0.6, 0.6]}
                  rotation={[0, baseRot + modelConfig.yOffsetRot, 0]}
                >
                  <primitive object={modelConfig.scene.clone(true)} />
                </group>
                <mesh position={[0, 2.2, 0]}>
                  <sphereGeometry args={[0.22, 12, 12]} />
                  <meshBasicMaterial color="#ef4444" />
                </mesh>
              </group>

              <TransformControls
                object={meshRefs.current[idx]}
                mode="translate"
                showY={false}
                onMouseUp={() => {
                  const g = meshRefs.current[idx]?.current;
                  if (g) {
                    const { x, z } = g.position;
                    console.log(
                      `✅ Car ${veh.id} [${veh.type}] → X: ${x.toFixed(2)}, Z: ${z.toFixed(2)}`
                    );
                  }
                }}
              />
            </React.Fragment>
          );
        })}
      </>
    );
  }

  return (
    <group>
      {vehiclesRef.current.map((veh, idx) => {
        const modelConfig = models[veh.modelIdx % models.length];
        let baseRot = 0;
        if (veh.type === 'E') baseRot = Math.PI / 2;
        if (veh.type === 'W') baseRot = -Math.PI / 2;
        if (veh.type === 'S') baseRot = 0;
        if (veh.type === 'N') baseRot = Math.PI;

        return (
          <group
            key={veh.id}
            ref={meshRefs.current[idx]}
            position={veh.pos.toArray()}
            rotation={[0, baseRot + modelConfig.yOffsetRot + veh.rotY, 0]}
          >
            <group scale={[0.6, 0.6, 0.6]}>
              <primitive object={modelConfig.scene.clone(true)} />
            </group>
            <mesh position={[0, 2.2, 0]}>
              <sphereGeometry args={[0.16, 12, 12]} />
              <meshBasicMaterial ref={beaconRefs.current[idx]} color="#64748b" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

useGLTF.preload('/car1.glb');
useGLTF.preload('/car2.glb');
useGLTF.preload('/car3.glb');
