import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, TransformControls } from '@react-three/drei';
import * as THREE from 'three';

const BLE_RADIUS = 35;
const NORMAL_SPEED = 8; // units per second
const WRAP_X = 40;
const START_X = -80;
const STOP_LINE_X = -15; // Where cars stop for Red Light

export function TrafficManager({ ambulancePosition, isPreempted, signalState }) {
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'KeyE') {
        setEditMode(prev => !prev);
        console.log("🛠️ EDIT MODE TOGGLED");
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const car1 = useGLTF('/car1.glb');
  const car2 = useGLTF('/car2.glb');
  const car3 = useGLTF('/car3.glb');

  const models = [
    { scene: car1.scene, yOffsetRot: Math.PI },
    { scene: car2.scene, yOffsetRot: 0       },
    { scene: car3.scene, yOffsetRot: 0       },
  ];

  // Initialize a continuous stream of cars across 4 lanes
  const vehiclesRef = useRef(null);
  
  if (!vehiclesRef.current) {
    const cars = [];
    const lanes = [
      { z: -8.8,  type: 'lane1', pullOverZ: -8.8 }, // Far left lane (next to fence)
      { z: -6.8,  type: 'lane2', pullOverZ: -7.7 }, // Middle left lane
      { z: -5.0,  type: 'lane3', pullOverZ: -6.4 }, // Middle right lane (Ambulance Path)
      { z: -3.1,  type: 'lane4', pullOverZ: -2.1 }, // Far right lane (next to median)
    ];

    // DETERMINISTIC 20 CAR GENERATION
    const initialCars = [];
    let idCount = 1;
    for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
      for (let i = 0; i < 5; i++) {
        const lane = lanes[laneIdx];
        // Spawn them tightly queued starting right behind the stop line
        const xPos = -20 - (i * 11) - (laneIdx * 2); 
        initialCars.push({
          id: idCount++,
          type: lane.type,
          modelIdx: idCount % 3, 
          x: xPos,
          homeZ: lane.z,
          pullOverZ: lane.pullOverZ
        });
      }
    }

    initialCars.forEach((c) => {
      cars.push({
        id: c.id,
        modelIdx: c.modelIdx,
        pos: new THREE.Vector3(c.x, 0, c.homeZ),
        homeZ: c.homeZ,
        pullOverZ: c.pullOverZ,
        targetZ: c.homeZ,
        rotY: 0,
        type: c.type,
        receivesBLE: false,
        speed: 0, // start stopped at red light
        state: 'IDLE_QUEUE', // NEW: Explicit State Machine
      });
    });
    vehiclesRef.current = cars;
  }

  const meshRefs = useRef(vehiclesRef.current.map(() => React.createRef()));
  const beaconRefs = useRef(vehiclesRef.current.map(() => React.createRef()));

  useFrame((_, delta) => {
    if (editMode) return;

    const ambPos = new THREE.Vector3(ambulancePosition.x, 0, ambulancePosition.z);
    const ax = ambulancePosition.x;
    const phase = ax < 10 ? 1 : ax < 35 ? 2 : 3;

    const corridorActive = isPreempted && phase < 3;

    // First pass: determine state and target variables for everyone
    vehiclesRef.current.forEach((veh) => {
      const distToAmb = veh.pos.x - ambPos.x;
      
      // ── 0. RED LIGHT CHECK ──
      // Always stop at a red light if we are driving, even during preemption
      if (signalState === 'RED' && (veh.state === 'DRIVING_GREEN' || veh.state === 'SLOWING_FORWARD')) {
        if (veh.pos.x > STOP_LINE_X - 10 && veh.pos.x < STOP_LINE_X + 2) {
          veh.state = 'IDLE_QUEUE';
        }
      }

      // ── 1. EXPLICIT STATE MACHINE TRANSITIONS ──
      if (isPreempted) {
        if (veh.state === 'IDLE_QUEUE' || veh.state === 'DRIVING_GREEN') {
          // Ambulance is approaching from behind within 35 units (and hasn't fully passed)
          if (distToAmb > 0 && distToAmb < 35 && ambPos.x < veh.pos.x + 25) {
            if (signalState === 'GREEN') {
              veh.state = 'SLOWING_FORWARD';
            } else {
              veh.state = 'YIELDING';
            }
          }
        } else if (veh.state === 'SLOWING_FORWARD') {
          // If ambulance has completely passed them, they resume normal speed
          if (ambPos.x > veh.pos.x + 30) {
            veh.state = 'DRIVING_GREEN';
          }
        } else if (veh.state === 'YIELDING') {
          // If ambulance has completely passed them by 30 units, they can resume
          if (ambPos.x > veh.pos.x + 30) {
            veh.state = 'RESUMING_LANE';
          }
        }
      } else {
        // No preemption (normal traffic)
        // Recovery: If they were stuck yielding/holding/slowing when ambulance reset, force them to resume
        if (veh.state === 'YIELDING' || veh.state === 'HOLDING') {
          veh.state = 'RESUMING_LANE';
        } else if (veh.state === 'SLOWING_FORWARD') {
          veh.state = 'DRIVING_GREEN';
        } else if (signalState === 'GREEN') {
          if (veh.state === 'IDLE_QUEUE') veh.state = 'DRIVING_GREEN';
        } else {
          // Signal is RED
          if (veh.pos.x > STOP_LINE_X - 10 && veh.pos.x < STOP_LINE_X + 2) {
            veh.state = 'IDLE_QUEUE';
          }
        }
      }

      // These physical transitions happen regardless of preemption status
      if (veh.state === 'YIELDING') {
        // Once they reach their pull over target, they hold position
        if (Math.abs(veh.pos.z - veh.pullOverZ) < 0.2) {
          veh.state = 'HOLDING';
        }
      }
      if (veh.state === 'RESUMING_LANE') {
        // Once they are back in their normal lane, they can drive normally
        if (Math.abs(veh.pos.z - veh.homeZ) < 0.2) {
          if (signalState === 'RED' && veh.pos.x > STOP_LINE_X - 10 && veh.pos.x < STOP_LINE_X + 2) {
            veh.state = 'IDLE_QUEUE';
          } else {
            veh.state = 'DRIVING_GREEN';
          }
        }
      }

      // ── 2. STATE BEHAVIORS (Choreographed Actions) ──
      let targetSpeed = NORMAL_SPEED;
      veh.receivesBLE = false;

      switch(veh.state) {
        case 'IDLE_QUEUE':
          targetSpeed = 0;
          veh.targetZ = veh.homeZ;
          break;
        case 'SLOWING_FORWARD':
          targetSpeed = NORMAL_SPEED * 0.4; // Slow down but keep driving straight
          veh.targetZ = veh.homeZ;
          veh.receivesBLE = true;
          break;
        case 'YIELDING':
          targetSpeed = 0; // Hard stop forward movement while steering sideways
          veh.targetZ = veh.pullOverZ;
          veh.receivesBLE = true;
          break;
        case 'HOLDING':
          targetSpeed = 0;
          veh.targetZ = veh.pullOverZ;
          veh.receivesBLE = true;
          break;
        case 'RESUMING_LANE':
          targetSpeed = NORMAL_SPEED * 0.4; // Drive slowly forward while merging back
          veh.targetZ = veh.homeZ;
          break;
        case 'DRIVING_GREEN':
          targetSpeed = NORMAL_SPEED;
          veh.targetZ = veh.homeZ;
          break;
      }

      // ── 3. ROBUST 2D COLLISION AVOIDANCE & YIELDING (Failsafe) ──
      // This prevents them from rear-ending each other during the RESUMING and DRIVING phases
      let blocked = false;
      let blockDist = Infinity;
      let leaderSpeed = 0;

      vehiclesRef.current.forEach((otherVeh) => {
        if (otherVeh.id !== veh.id) {
          const distZ = Math.abs(otherVeh.pos.z - veh.pos.z);
          const distX = otherVeh.pos.x - veh.pos.x;
          
          if (distX > 0 && distX < 13 && distZ < 1.8) {
            blocked = true;
            if (distX < blockDist) {
              blockDist = distX;
              leaderSpeed = otherVeh.speed || 0;
            }
          }
        }
      });

      if (blocked && veh.state !== 'IDLE_QUEUE' && veh.state !== 'HOLDING') {
        if (blockDist < 6) {
          targetSpeed = 0;
        } else {
          targetSpeed = Math.min(targetSpeed, leaderSpeed * 0.7);
        }
      }

      // Smooth acceleration/deceleration
      veh.speed = THREE.MathUtils.lerp(veh.speed, targetSpeed, delta * 3.0);

      // Move forward
      veh.pos.x += veh.speed * delta;

      // Wrap around seamlessly
      if (veh.pos.x > WRAP_X) {
        veh.pos.x = START_X;
        // Snap back to home lane when wrapping
        veh.pos.z = veh.homeZ; 
      }

      // Lateral movement (steering)
      const zDiff = Math.abs(veh.pos.z - veh.targetZ);
      
      // Calculate steering angle based on lateral movement
      if (veh.targetZ < veh.pos.z - 0.1) {
        // Pulling Left
        veh.rotY = THREE.MathUtils.lerp(veh.rotY, 0.15, delta * 2.5);
      } else if (veh.targetZ > veh.pos.z + 0.1) {
        // Pulling Right
        veh.rotY = THREE.MathUtils.lerp(veh.rotY, -0.15, delta * 2.5);
      } else {
        // Straightening out
        veh.rotY = THREE.MathUtils.lerp(veh.rotY, 0, delta * 4.0);
      }

      // Apply lateral movement (lane changes / pulling over) VERY smoothly and slowly for dramatic effect
      veh.pos.z = THREE.MathUtils.lerp(veh.pos.z, veh.targetZ, delta * 1.2);

      // ── 4. ABSOLUTE FOOTPATH PROTECTION ──
      // Mathematically guarantees no car can ever drift beyond the road edges!
      veh.pos.z = THREE.MathUtils.clamp(veh.pos.z, -8.8, -2.1);
    });

    // Update meshes imperatively
    vehiclesRef.current.forEach((veh, idx) => {
      const meshGroup = meshRefs.current[idx]?.current;
      const beaconMat = beaconRefs.current[idx]?.current;
      if (!meshGroup) return;

      const modelConfig = models[veh.modelIdx % models.length];
      meshGroup.position.copy(veh.pos);
      meshGroup.rotation.y = Math.PI / 2 + modelConfig.yOffsetRot + veh.rotY;

      if (beaconMat) {
        beaconMat.color.set(veh.receivesBLE ? '#10b981' : '#64748b');
      }
    });
  });

  // ── EDIT MODE RENDER ───────────────────────────────────────────────────────
  if (editMode) {
    return (
      <>
        {vehiclesRef.current.map((veh, idx) => {
          const modelConfig = models[veh.modelIdx % models.length];
          return (
            <React.Fragment key={`edit-${veh.id}`}>
              <group ref={meshRefs.current[idx]} position={veh.pos.toArray()}>
                <group
                  scale={[0.6, 0.6, 0.6]}
                  rotation={[0, Math.PI / 2 + modelConfig.yOffsetRot, 0]}
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

  // ── NORMAL RENDER ──────────────────────────────────────────────────────────
  return (
    <group>
      {vehiclesRef.current.map((veh, idx) => {
        const modelConfig = models[veh.modelIdx % models.length];
        return (
          <group
            key={veh.id}
            ref={meshRefs.current[idx]}
            position={veh.pos.toArray()}
            rotation={[0, Math.PI / 2 + modelConfig.yOffsetRot, 0]}
          >
            <group scale={[0.6, 0.6, 0.6]}>
              <primitive object={modelConfig.scene.clone(true)} />
            </group>
            {/* Floating V2V Beacon */}
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
