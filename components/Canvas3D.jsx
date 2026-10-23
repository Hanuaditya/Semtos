import React, { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useProgress, PointerLockControls, TransformControls, useGLTF, Center, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CityScene } from './CityScene';
import { Ambulance3D } from './Ambulance3D';
import { TrafficManager } from './TrafficManager';
import { ComputerVisionOverlay } from './ComputerVisionOverlay';

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center zIndexRange={[100, 0]}>
      <div className="flex flex-col items-center justify-center p-8 bg-slate-900/90 border border-emerald-500/50 rounded-lg shadow-2xl backdrop-blur-xl w-72">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <div className="text-emerald-400 font-mono font-bold tracking-widest text-sm text-center">
          LOADING DIGITAL TWIN
        </div>
        <div className="text-slate-300 font-mono text-xl mt-3 font-bold">
          {progress.toFixed(0)}%
        </div>
      </div>
    </Html>
  );
}

function CameraTrackerBridge({ textRef }) {
  useFrame((state) => {
    if (textRef && textRef.current) {
      const { x, y, z } = state.camera.position;
      
      const vector = new THREE.Vector3(0, 0, -1);
      vector.applyQuaternion(state.camera.quaternion);
      
      let heading = "";
      if (Math.abs(vector.x) > Math.abs(vector.z)) {
          heading = vector.x > 0 ? "EAST (+X)" : "WEST (-X)";
      } else {
          heading = vector.z > 0 ? "SOUTH (+Z)" : "NORTH (-Z)";
      }

      textRef.current.innerText = `X: ${x.toFixed(2)} | Y: ${y.toFixed(2)} | Z: ${z.toFixed(2)} | FACING: ${heading}`;
    }
  });

  return null;
}

export function FreeRoamFlightCamera() {
  const { camera, gl } = useThree();
  const keys = useRef({ w: false, a: false, s: false, d: false, space: false, shift: false });
  const isDragging = useRef(false);
  const prevMouse = useRef({ x: 0, y: 0 });
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  useEffect(() => {
    const dom = gl.domElement;
    euler.current.setFromQuaternion(camera.quaternion);

    try {
      dom.requestPointerLock?.();
    } catch (_) {}

    const onKeyDown = (e) => {
      if (e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'Escape') {
        if (document.pointerLockElement) {
          document.exitPointerLock?.();
        }
        return;
      }

      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.w = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.s = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.a = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.d = true;
      if (e.code === 'Space' || e.code === 'KeyE') keys.current.space = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') keys.current.shift = true;
    };

    const onKeyUp = (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.w = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.s = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.a = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.d = false;
      if (e.code === 'Space' || e.code === 'KeyE') keys.current.space = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') keys.current.shift = false;
    };

    const onClick = () => {
      if (document.pointerLockElement !== dom) {
        dom.requestPointerLock?.();
      }
    };

    const onMouseDown = (e) => {
      isDragging.current = true;
      prevMouse.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      euler.current.setFromQuaternion(camera.quaternion);

      if (document.pointerLockElement === dom) {
        const movementX = e.movementX || 0;
        const movementY = e.movementY || 0;

        euler.current.y -= movementX * 0.0025;
        euler.current.x -= movementY * 0.0025;
        euler.current.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, euler.current.x));
        camera.quaternion.setFromEuler(euler.current);
        return;
      }

      if (isDragging.current) {
        const dx = e.clientX - prevMouse.current.x;
        const dy = e.clientY - prevMouse.current.y;
        prevMouse.current = { x: e.clientX, y: e.clientY };

        euler.current.y -= dx * 0.003;
        euler.current.x -= dy * 0.003;
        euler.current.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, euler.current.x));
        camera.quaternion.setFromEuler(euler.current);
      }
    };

    const onMouseUp = () => {
      isDragging.current = false;
    };

    const onWheel = (e) => {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(forward, -e.deltaY * 0.03);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    dom.addEventListener('click', onClick);
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      if (document.pointerLockElement === dom) {
        document.exitPointerLock?.();
      }
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('click', onClick);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    const moveSpeed = (keys.current.shift ? 45 : 30) * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0);

    if (keys.current.w) camera.position.addScaledVector(forward, moveSpeed);
    if (keys.current.s) camera.position.addScaledVector(forward, -moveSpeed);
    if (keys.current.d) camera.position.addScaledVector(right, moveSpeed);
    if (keys.current.a) camera.position.addScaledVector(right, -moveSpeed);
    if (keys.current.space) camera.position.addScaledVector(up, moveSpeed);
    if (keys.current.shift && !keys.current.w) camera.position.addScaledVector(up, -moveSpeed);
  });

  return null;
}

export function CinematicCamera({ ambulancePosition }) {
  const currentLookAt = useRef(new THREE.Vector3(0, 3, 0));

  useFrame((state, delta) => {
    const targetPosition = new THREE.Vector3();
    const targetLookAt = new THREE.Vector3();

    // PHASE 1: Fixed corner view watching side-street arrival
    if (ambulancePosition.x < -80) {
      targetPosition.set(-103.50, 3.33, -2.89);
      targetLookAt.set(ambulancePosition.x, 2, ambulancePosition.z);
    } 
    // PHASE 2: IMMEDIATE FOLLOW - Lock behind ambulance as soon as it turns
    else if (ambulancePosition.x >= -80 && ambulancePosition.x < -25) {
      targetPosition.set(ambulancePosition.x - 18, 6, -2.89);
      targetLookAt.set(ambulancePosition.x + 10, 2, -2.89);
    } 
    // PHASE 3: Intersection Hero Shot (Hold position to show Green Signal)
    else if (ambulancePosition.x >= -25 && ambulancePosition.x < 10) {
      targetPosition.set(-25, 8, -2.89);
      targetLookAt.set(ambulancePosition.x, 2, ambulancePosition.z);
    }
    // PHASE 4: Bird's-Eye Command Center View
    else {
      targetPosition.set(0.03, 80.57, -1.22);
      targetLookAt.set(0.03, 0, -1.22);
    }

    // Smooth camera position and lookAt interpolation
    state.camera.position.lerp(targetPosition, delta * 2.0);
    currentLookAt.current.lerp(targetLookAt, delta * 2.5);
    state.camera.lookAt(currentLookAt.current);
  });

  return null;
}

export function AmbulanceApproachCamera({ ambulancePosition, isSimulationRunning = false }) {
  const currentLookAt = useRef(new THREE.Vector3(-30.0, 1.2, -6.0));

  useFrame((state, delta) => {
    // Overhead CCTV gantry camera position
    const targetPosition = new THREE.Vector3(2.5, 8.5, -5.5);
    
    // Focus down the open avenue to watch the flush and ambulance approach
    let targetLookAt;
    const ambPos = ambulancePosition || { x: 0, z: 0 };
    if (!isSimulationRunning || ambPos.x <= -85) {
      targetLookAt = new THREE.Vector3(-30.0, 1.2, -6.0);
    } else {
      targetLookAt = new THREE.Vector3(ambPos.x, 1.5, ambPos.z);
    }

    state.camera.position.lerp(targetPosition, delta * 3.0);
    currentLookAt.current.lerp(targetLookAt, delta * 3.5);
    state.camera.lookAt(currentLookAt.current);
  });

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Case 3 Specialized Cameras
// ──────────────────────────────────────────────────────────────────────────────
export function Case3DetourCamera({ ambulanceB }) {
  const currentLookAt = useRef(new THREE.Vector3(47, 2, -10));

  useFrame((state, delta) => {
    if (!ambulanceB || !ambulanceB.position) return;
    const dt = Math.min(delta, 0.05);
    const { x, y, z } = ambulanceB.position;
    const targetPosition = new THREE.Vector3();
    const targetLookAt = new THREE.Vector3(x, y + 1.6, z);

    const wp = ambulanceB.currentWaypointIdx || 0;
    if (wp === 0) {
      // Leg 1: East approach trailing behind vehicle looking West (-X)
      // Clamped to 87.0 so the camera never clips into the building facade behind X = 90
      targetPosition.set(Math.min(x + 9, 87.0), y + 4.5, z);
    } else if (wp === 1) {
      // Leg 2: In North side street, camera trailing behind looking North (-Z)
      targetPosition.set(x, y + 6.0, z + 14);
    } else if (wp === 2) {
      // Leg 3: In Parallel West Avenue, camera trailing behind looking West (-X)
      targetPosition.set(x + 14, y + 6.0, z);
    } else if (wp === 3) {
      // Leg 4: In South return street, camera trailing behind looking South (+Z)
      targetPosition.set(x, y + 6.0, z - 14);
    } else {
      // Leg 5: Re-entered Main Avenue, cruising West
      targetPosition.set(x + 14, y + 6.0, z);
    }

    state.camera.position.x = THREE.MathUtils.damp(state.camera.position.x, targetPosition.x, 3.5, dt);
    state.camera.position.y = THREE.MathUtils.damp(state.camera.position.y, targetPosition.y, 3.5, dt);
    state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, targetPosition.z, 3.5, dt);

    currentLookAt.current.x = THREE.MathUtils.damp(currentLookAt.current.x, targetLookAt.x, 4.0, dt);
    currentLookAt.current.y = THREE.MathUtils.damp(currentLookAt.current.y, targetLookAt.y, 4.0, dt);
    currentLookAt.current.z = THREE.MathUtils.damp(currentLookAt.current.z, targetLookAt.z, 4.0, dt);
    state.camera.lookAt(currentLookAt.current);
  });

  return null;
}

export function Case3CorridorCamera({ ambulanceA }) {
  const currentLookAt = useRef(new THREE.Vector3(2.2, 2, 0));

  useFrame((state, delta) => {
    if (!ambulanceA || !ambulanceA.position) return;
    const dt = Math.min(delta, 0.05);
    const { x, y, z } = ambulanceA.position;
    // Clamped to 87.0 so camera never clips into perimeter bridge / wall behind Z = 90
    const targetPosition = new THREE.Vector3(x, y + 6.0, Math.min(z + 10.0, 87.0));
    const targetLookAt = new THREE.Vector3(x, y + 1.8, z - 12.0);

    state.camera.position.x = THREE.MathUtils.damp(state.camera.position.x, targetPosition.x, 3.5, dt);
    state.camera.position.y = THREE.MathUtils.damp(state.camera.position.y, targetPosition.y, 3.5, dt);
    state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, targetPosition.z, 3.5, dt);

    currentLookAt.current.x = THREE.MathUtils.damp(currentLookAt.current.x, targetLookAt.x, 4.0, dt);
    currentLookAt.current.y = THREE.MathUtils.damp(currentLookAt.current.y, targetLookAt.y, 4.0, dt);
    currentLookAt.current.z = THREE.MathUtils.damp(currentLookAt.current.z, targetLookAt.z, 4.0, dt);
    state.camera.lookAt(currentLookAt.current);
  });

  return null;
}

export function Case3OverviewCamera() {
  const currentLookAt = useRef(new THREE.Vector3(-10, 0, -32));

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const targetPosition = new THREE.Vector3(-10, 115, -32);
    const targetLookAt = new THREE.Vector3(-10, 0, -33);

    state.camera.position.x = THREE.MathUtils.damp(state.camera.position.x, targetPosition.x, 2.5, dt);
    state.camera.position.y = THREE.MathUtils.damp(state.camera.position.y, targetPosition.y, 2.5, dt);
    state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, targetPosition.z, 2.5, dt);

    currentLookAt.current.x = THREE.MathUtils.damp(currentLookAt.current.x, targetLookAt.x, 3.0, dt);
    currentLookAt.current.y = THREE.MathUtils.damp(currentLookAt.current.y, targetLookAt.y, 3.0, dt);
    currentLookAt.current.z = THREE.MathUtils.damp(currentLookAt.current.z, targetLookAt.z, 3.0, dt);
    state.camera.lookAt(currentLookAt.current);
  });

  return null;
}

function NeonDetourSegment({ position, rotation, length, width = 1.9, baseTexture }) {
  const tex = React.useMemo(() => {
    if (!baseTexture) return null;
    const t = baseTexture.clone();
    t.needsUpdate = true;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, Math.max(1, Math.round(length / 4.2)));
    return t;
  }, [baseTexture, length]);

  useFrame((_, delta) => {
    if (tex) {
      tex.offset.y -= delta * 1.5;
    }
  });

  if (!tex) return null;

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, length]} />
      <meshBasicMaterial map={tex} transparent opacity={0.92} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function NeonDetourRibbon() {
  // Create high-res glowing cyan arrow ribbon texture with animated forward chevrons
  const baseTexture = React.useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Translucent electric cyan core fill
    ctx.fillStyle = 'rgba(0, 195, 255, 0.45)';
    ctx.fillRect(6, 0, 116, 256);

    // Glowing outer laser borders
    ctx.fillStyle = '#00f5ff';
    ctx.fillRect(4, 0, 7, 256);
    ctx.fillRect(117, 0, 7, 256);

    // High-contrast white/cyan chevrons pointing along +Y
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#00f5ff';
    ctx.shadowBlur = 18;

    [64, 192].forEach((cy) => {
      ctx.beginPath();
      ctx.moveTo(26, cy + 30);
      ctx.lineTo(64, cy - 24);
      ctx.lineTo(102, cy + 30);
      ctx.stroke();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);

  if (!baseTexture) return null;

  // Detour Segments (Matching the 5 legs of the North Block bypass):
  // 1. East Approach: X: 90 -> 47 (L=43), Y=0.04, Z=-2.89, heading West (-X)
  // 2. North Side Street: Z: -2.89 -> -60.0 (L=57.11), sloped Y: 0.04 -> 2.04, X=47, heading North (-Z)
  // 3. Parallel West Avenue: X: 47 -> -87 (L=134), Y=2.04, Z=-60.0, heading West (-X)
  // 4. South Return Street: Z: -60.0 -> -2.89 (L=57.11), sloped Y: 2.04 -> 0.04, X=-87, heading South (+Z)
  // 5. Main Avenue Rejoin/Departure: X: -87 -> -135 (L=48), Y=0.04, Z=-2.89, heading West (-X)

  const Y_MAIN = 0.20;
  const Y_ELEVATED = 2.05;
  const pitchAngle = Math.atan2(Y_ELEVATED - Y_MAIN, 57.11);
  const width = 1.9;

  return (
    <group>
      {/* ── Segment 1: East Approach heading West (-X) ── */}
      <NeonDetourSegment
        position={[(90 + 47) / 2, Y_MAIN, -2.89]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        length={43}
        width={width}
        baseTexture={baseTexture}
      />

      {/* ── Segment 2: North Side Street heading North (-Z) (slopes up from 0.20 to Y = 2.05) ── */}
      <NeonDetourSegment
        position={[47, (Y_MAIN + Y_ELEVATED) / 2, (-2.89 - 60) / 2]}
        rotation={[-Math.PI / 2 + pitchAngle, 0, 0]}
        length={57.11}
        width={width}
        baseTexture={baseTexture}
      />

      {/* ── Segment 3: Parallel West Avenue heading West (-X) (elevated at Y = 2.05) ── */}
      <NeonDetourSegment
        position={[(47 - 87) / 2, Y_ELEVATED, -60.0]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        length={134}
        width={width}
        baseTexture={baseTexture}
      />

      {/* ── Segment 4: South Return Street heading South (+Z) (slopes down from 2.05 to Y = 0.20) ── */}
      <NeonDetourSegment
        position={[-87, (Y_ELEVATED + Y_MAIN) / 2, (-60 - 2.89) / 2]}
        rotation={[-Math.PI / 2 + pitchAngle, 0, Math.PI]}
        length={57.11}
        width={width}
        baseTexture={baseTexture}
      />

      {/* ── Segment 5: Main Avenue Westbound Departure (-X) ── */}
      <NeonDetourSegment
        position={[(-87 - 135) / 2, Y_MAIN, -2.89]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        length={48}
        width={width}
        baseTexture={baseTexture}
      />

      {/* ── Pulsing Waypoint Beacons (Turn 1 & Branch Points matching reference screenshot) ── */}
      {/* Turn 1 Branch Point: X: 47, Z: -2.89 (Amber outer ring, cyan inner core) */}
      <mesh position={[47.0, 0.22, -2.89]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.2, 1.8, 32]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[47.0, 0.22, -2.89]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.9, 32]} />
        <meshBasicMaterial color="#00f5ff" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Turn 2: X: 47, Z: -60.0 */}
      <mesh position={[47.0, 2.06, -60.0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.0, 1.6, 32]} />
        <meshBasicMaterial color="#00f5ff" transparent opacity={0.75} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Turn 3: X: -87, Z: -60.0 */}
      <mesh position={[-87.0, 2.06, -60.0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.0, 1.6, 32]} />
        <meshBasicMaterial color="#00f5ff" transparent opacity={0.75} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Turn 4 Rejoin: X: -87, Z: -2.89 */}
      <mesh position={[-87.0, 0.22, -2.89]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.0, 1.6, 32]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.75} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Traffic Light Overlay – 4 poles, one per road arm, real R/Y/G state
// Positions sit at the four corners facing oncoming traffic.
// ──────────────────────────────────────────────────────────────────────────────
function TrafficLightPole({ position, rotation, nsGreen, nsYellow, ewGreen, ewYellow, isNS }) {
  const gap = 0.22;
  const green  = isNS ? nsGreen  : ewGreen;
  const yellow = isNS ? nsYellow : ewYellow;
  const red    = !green && !yellow;

  const redCol    = red    ? '#ef4444' : '#2d1515';
  const yellowCol = yellow ? '#facc15' : '#2d2510';
  const greenCol  = green  ? '#22c55e' : '#0d2010';

  return (
    <group position={position} rotation={rotation}>
      {/* Pole */}
      <mesh position={[0, -1.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 8]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {/* Housing */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.22, 0.75, 0.18]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {/* RED bulb */}
      <mesh position={[0, gap, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={redCol} />
      </mesh>
      {/* Point light for active bulb */}
      {red && <pointLight color="#ef4444" intensity={8} distance={12} />}
      {/* YELLOW bulb */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={yellowCol} />
      </mesh>
      {yellow && <pointLight color="#facc15" intensity={6} distance={10} />}
      {/* GREEN bulb */}
      <mesh position={[0, -gap, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={greenCol} />
      </mesh>
      {green && <pointLight color="#22c55e" intensity={14} distance={18} />}
    </group>
  );
}

export function TrafficLightOverlay({ nGreen=false, sGreen=false, eGreen=false, wGreen=false, nYellow=false, sYellow=false, eYellow=false, wYellow=false }) {
  // Signals facing each approach:
  // North approach pole (Z=-9.5) faces southbound traffic -> sGreen, sYellow
  // South approach pole (Z=9.5) faces northbound traffic -> nGreen, nYellow
  // East approach pole (X=12.0) faces westbound traffic -> wGreen, wYellow
  // West approach pole (X=-12.0) faces eastbound traffic -> eGreen, eYellow
  const nProps = { nsGreen: sGreen, nsYellow: sYellow, ewGreen: false,  ewYellow: false,  isNS: true  };
  const sProps = { nsGreen: nGreen, nsYellow: nYellow, ewGreen: false,  ewYellow: false,  isNS: true  };
  const eProps = { nsGreen: false,  nsYellow: false,   ewGreen: wGreen, ewYellow: wYellow, isNS: false };
  const wProps = { nsGreen: false,  nsYellow: false,   ewGreen: eGreen, ewYellow: eYellow, isNS: false };

  return (
    <group>
      {/* North arm – signal faces south-bound traffic */}
      <TrafficLightPole {...nProps} position={[-4.2, 4.2, -9.5]}  rotation={[0, 0, 0]} />
      {/* South arm – signal faces north-bound traffic */}
      <TrafficLightPole {...sProps} position={[3.8,  4.2,  9.5]}  rotation={[0, Math.PI, 0]} />
      {/* East arm – signal faces west-bound traffic */}
      <TrafficLightPole {...eProps} position={[12.0, 4.2, -1.5]}  rotation={[0, -Math.PI / 2, 0]} />
      {/* West arm – signal faces east-bound traffic (ambulance road) */}
      <TrafficLightPole {...wProps} position={[-12.0, 4.2, 7.5]}  rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
}


export function CctvOverlay() {
  const { scene: cctvScene } = useGLTF('/cctv.glb');

  return (
    <group position={[-4.91, 3.65, -2.80]} rotation={[0, 26 * (Math.PI / 180), 0]}>
      <Center>
        <primitive object={cctvScene} scale={0.351} />
      </Center>
    </group>
  );
}

export function Canvas3D({
  selectedCase = 1,
  vehiclesRef: externalVehiclesRef,
  ambulancePosition,
  ambulanceA,
  ambulanceB,
  activeCamFollow = 'detour',
  onSetCamFollow,
  isSimulationRunning = false,
  isPreempted,
  isFrozen,
  signalPhase,
  nGreen=false, sGreen=false, eGreen=false, wGreen=false,
  nYellow=false, sYellow=false, eYellow=false, wYellow=false
}) {
  const [isFreeRoam, setIsFreeRoam] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [boundaryMode, setBoundaryMode] = useState(false);
  const [isRoadCam, setIsRoadCam] = useState(false);
  const [localCamMode, setLocalCamMode] = useState(activeCamFollow || 'detour');

  const cvCanvasRef = useRef(null);
  const camTrackerTextRef = useRef(null);
  const localVehiclesRef = useRef([]);
  const vehiclesRef = externalVehiclesRef || localVehiclesRef;

  useEffect(() => {
    setLocalCamMode(activeCamFollow);
  }, [activeCamFollow]);

  const setCameraMode = (mode) => {
    setLocalCamMode(mode);
    setIsRoadCam(false);
    setIsFreeRoam(false);
    setEditMode(false);
    setBoundaryMode(false);
    if (onSetCamFollow) onSetCamFollow(mode);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'KeyV' || e.key === 'v' || e.key === 'V') {
        setIsRoadCam((prev) => !prev);
        setIsFreeRoam(false);
        setEditMode(false);
        setBoundaryMode(false);
      }
      if (e.code === 'KeyC' || e.key === 'c' || e.key === 'C') {
        setIsFreeRoam((prev) => !prev);
        setIsRoadCam(false);
      }
      if (e.code === 'Digit1') {
        setCameraMode('detour');
      }
      if (e.code === 'Digit2') {
        setCameraMode('corridor');
      }
      if (e.code === 'Digit3') {
        setCameraMode('overview');
      }
      if (e.code === 'KeyE' || e.key === 'e' || e.key === 'E') {
        setEditMode(prev => !prev);
        setBoundaryMode(false);
        setIsRoadCam(false);
      }
      if (e.code === 'KeyB' || e.key === 'b' || e.key === 'B') {
        setBoundaryMode(prev => !prev);
        setEditMode(false);
        setIsRoadCam(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSetCamFollow]);

  const showOrbitControls = editMode || boundaryMode;

  const modeLabel = isFrozen
    ? 'FROZEN (Press F to Unfreeze)'
    : isRoadCam
    ? 'CCTV ROAD CAM (AI Vision Active)'
    : editMode
    ? 'EDIT MODE (Unlocked)'
    : boundaryMode
    ? 'BOUNDARY MODE (Unlocked)'
    : isFreeRoam
    ? 'FREE ROAM ([WASD] Fly | [Mouse] Look | [Ctrl] Unlock Mouse | [C] Exit)'
    : selectedCase === 3
    ? localCamMode === 'corridor'
      ? 'CAM: AMBULANCE A CORRIDOR (South)'
      : localCamMode === 'overview'
      ? 'CAM: TACTICAL TOP-DOWN OVERVIEW'
      : 'CAM: AMBULANCE B MACRO-DETOUR'
    : 'CINEMATIC';

  // Primary position to pass to TrafficManager for yield evaluation
  const primaryAmbPos = selectedCase === 3
    ? (ambulanceA?.position || { x: 2.2, y: 0.5, z: 90.0 })
    : (ambulancePosition || { x: -120, y: 0.5, z: -6.0 });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ powerPreference: "high-performance", antialias: true, stencil: false }}
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ position: [0, 50, 150], fov: 45 }}
      >
        {/* Dark Mode Atmosphere */}
        <color attach="background" args={['#020617']} />
        <fog attach="fog" args={['#020617', 50, 400]} />
        
        {/* Adequate Lighting */}
        <ambientLight intensity={0.5} />
        
        {/* Main Directional Light with Shadows */}
        <directionalLight 
          position={[150, 200, 100]} 
          intensity={1.5} 
          castShadow 
          shadow-camera-left={-150}
          shadow-camera-right={150}
          shadow-camera-top={150}
          shadow-camera-bottom={-150}
          shadow-mapSize={[2048, 2048]} 
        />

        {/* Fill light */}
        <directionalLight position={[-100, 50, -100]} intensity={0.3} />

        <Suspense fallback={<Loader />}>
          <CityScene isPreempted={isPreempted} />
          
          {selectedCase === 3 ? (
            <>
              {/* Dual Ambulances for Case 3 */}
              <Ambulance3D position={ambulanceA?.position} ringColor="#3b82f6" label="AMB A (PRIORITY)" />
              <Ambulance3D position={ambulanceB?.position} ringColor="#f59e0b" label="AMB B (DETOUR)" />
              {/* Futuristic glowing cyan detour corridor with forward chevrons (shown when dispatched) */}
              {(isSimulationRunning || ambulanceB?.detourActive) && <NeonDetourRibbon />}
            </>
          ) : (
            /* Single Ambulance for Case 1 */
            <Ambulance3D position={ambulancePosition} ringColor="#3b82f6" />
          )}

          <TrafficLightOverlay
            nGreen={nGreen} sGreen={sGreen} eGreen={eGreen} wGreen={wGreen}
            nYellow={nYellow} sYellow={sYellow} eYellow={eYellow} wYellow={wYellow}
          />
          <CctvOverlay />
          <TrafficManager
            selectedCase={selectedCase}
            ambulancePosition={primaryAmbPos}
            isPreempted={isPreempted}
            nGreen={nGreen} sGreen={sGreen} eGreen={eGreen} wGreen={wGreen}
            nYellow={nYellow} sYellow={sYellow} eYellow={eYellow} wYellow={wYellow}
            isFrozen={isFrozen}
            editMode={editMode}
            boundaryMode={boundaryMode}
            externalVehiclesRef={vehiclesRef}
          />
          <ComputerVisionOverlay
            canvasRef={cvCanvasRef}
            vehiclesRef={vehiclesRef}
            ambulancePosition={primaryAmbPos}
            isSimulationRunning={isSimulationRunning}
            isPreempted={isPreempted}
            isActive={isRoadCam}
          />
        </Suspense>

        {/* ── DEV TOOL: Click anywhere on the road to log exact 3D coordinates ── */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01, 0]}
          visible={false}
          onClick={(e) => {
            e.stopPropagation();
            const { x, y, z } = e.point;
            console.log(`ROAD POINT → X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}, Z: ${z.toFixed(2)}`);
          }}
        >
          <planeGeometry args={[500, 500]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        <CameraTrackerBridge textRef={camTrackerTextRef} />

        {/* Camera Selection */}
        {showOrbitControls ? (
          <OrbitControls makeDefault />
        ) : isFreeRoam ? (
          <FreeRoamFlightCamera />
        ) : isRoadCam ? (
          <AmbulanceApproachCamera ambulancePosition={primaryAmbPos} isSimulationRunning={isSimulationRunning} />
        ) : selectedCase === 3 ? (
          localCamMode === 'corridor' ? (
            <Case3CorridorCamera ambulanceA={ambulanceA} />
          ) : localCamMode === 'overview' ? (
            <Case3OverviewCamera />
          ) : (
            <Case3DetourCamera ambulanceB={ambulanceB} />
          )
        ) : (
          <CinematicCamera ambulancePosition={ambulancePosition} />
        )}
      </Canvas>

      {/* ── 2D HUD OVERLAYS (Positioned over Canvas) ── */}
      <div style={{ position: 'fixed', top: '72px', right: '20px', pointerEvents: 'auto', zIndex: 50 }}>
        <div className="bg-black/90 text-emerald-400 p-3 rounded-lg border border-emerald-500 font-mono text-sm whitespace-nowrap shadow-2xl backdrop-blur-md">
          <div className="mb-2 text-xs text-emerald-500 font-bold flex items-center justify-between gap-4">
            <span>MODE: <span className="text-white font-semibold">{modeLabel}</span></span>
            <button
              onClick={() => {
                setIsRoadCam(prev => !prev);
                setIsFreeRoam(false);
                setEditMode(false);
                setBoundaryMode(false);
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-bold border transition ${
                isRoadCam 
                  ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_10px_#22c55e]'
                  : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/80'
              }`}
            >
              {isRoadCam ? '👁️ CCTV ACTIVE' : '📷 [V] ROAD CAM'}
            </button>
          </div>

          {/* Quick Camera Navigation Buttons */}
          {selectedCase === 3 && (
            <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-emerald-900/60 text-[11px]">
              <span className="text-slate-400 text-[10px]">CAM:</span>
              <button
                onClick={() => setCameraMode('detour')}
                className={`px-2 py-0.5 rounded font-bold border text-[10px] transition ${
                  !isRoadCam && !isFreeRoam && localCamMode === 'detour'
                    ? 'bg-amber-500 text-black border-amber-400'
                    : 'bg-slate-900 text-amber-300 border-amber-500/40 hover:bg-amber-950/50'
                }`}
              >
                [1] DETOUR CAM (AMB B)
              </button>
              <button
                onClick={() => setCameraMode('corridor')}
                className={`px-2 py-0.5 rounded font-bold border text-[10px] transition ${
                  !isRoadCam && !isFreeRoam && localCamMode === 'corridor'
                    ? 'bg-blue-500 text-white border-blue-400'
                    : 'bg-slate-900 text-blue-300 border-blue-500/40 hover:bg-blue-950/50'
                }`}
              >
                [2] CORRIDOR CAM (AMB A)
              </button>
              <button
                onClick={() => setCameraMode('overview')}
                className={`px-2 py-0.5 rounded font-bold border text-[10px] transition ${
                  !isRoadCam && !isFreeRoam && localCamMode === 'overview'
                    ? 'bg-purple-500 text-white border-purple-400'
                    : 'bg-slate-900 text-purple-300 border-purple-500/40 hover:bg-purple-950/50'
                }`}
              >
                [3] OVERVIEW
              </button>
            </div>
          )}

          <div className="text-xs text-slate-400 mb-1 flex items-center gap-2">
            <span>[ENTER] Dispatch</span> |
            <span className="cursor-pointer hover:text-white" onClick={() => setIsFreeRoam(prev => !prev)}>[C] Free Roam</span> |
            <span>[F] Freeze</span> |
            <span className="cursor-pointer hover:text-white" onClick={() => setIsRoadCam(prev => !prev)}>[V] Road Cam</span>
          </div>
          <strong>CAMERA:</strong> <span ref={camTrackerTextRef} className="text-slate-200">Loading...</span>
        </div>
      </div>

      {/* ── 2D FULLSCREEN COMPUTER VISION CANVAS ── */}
      <canvas
        ref={cvCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 40,
          display: isRoadCam ? 'block' : 'none',
        }}
      />
    </div>
  );
}
