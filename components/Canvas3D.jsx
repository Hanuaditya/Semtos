import React, { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useProgress, PointerLockControls, TransformControls, useGLTF, Center, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CityScene } from './CityScene';
import { Ambulance3D } from './Ambulance3D';
import { TrafficManager } from './TrafficManager';

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

export function CameraTracker({ isFreeRoam, editMode, boundaryMode }) {
  const textRef = useRef();

  useFrame((state) => {
    if (textRef.current) {
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

  return (
    // Fixed syntax to anchor cleanly to the top right corner
    <Html style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 50 }}>
      <div className="bg-black/80 text-emerald-400 p-3 rounded border border-emerald-500 font-mono text-sm whitespace-nowrap shadow-lg">
        <div className="mb-1 text-xs text-emerald-600 font-bold">
          MODE: {editMode ? 'EDIT MODE (Unlocked)' : boundaryMode ? 'BOUNDARY MODE (Unlocked)' : isFreeRoam ? 'FREE ROAM (Locked)' : 'CINEMATIC'} (Press 'C' to toggle Free Roam)
        </div>
        <strong>CAMERA:</strong> <span ref={textRef}>Loading...</span>
      </div>
    </Html>
  );
}

export function MinecraftControls() {
  const { camera } = useThree();
  const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false, space: false, shift: false });

  useEffect(() => {
    const down = (e) => {
      if (e.code === 'KeyW') setKeys(k => ({...k, w: true}));
      if (e.code === 'KeyA') setKeys(k => ({...k, a: true}));
      if (e.code === 'KeyS') setKeys(k => ({...k, s: true}));
      if (e.code === 'KeyD') setKeys(k => ({...k, d: true}));
      if (e.code === 'Space') setKeys(k => ({...k, space: true}));
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') setKeys(k => ({...k, shift: true}));
    };
    const up = (e) => {
      if (e.code === 'KeyW') setKeys(k => ({...k, w: false}));
      if (e.code === 'KeyA') setKeys(k => ({...k, a: false}));
      if (e.code === 'KeyS') setKeys(k => ({...k, s: false}));
      if (e.code === 'KeyD') setKeys(k => ({...k, d: false}));
      if (e.code === 'Space') setKeys(k => ({...k, space: false}));
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') setKeys(k => ({...k, shift: false}));
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); }
  }, []);

  useFrame((_, delta) => {
    const speed = 60 * delta;
    
    // camera.translateZ moves forward/backward relative to where camera is looking
    if (keys.w) camera.translateZ(-speed);
    if (keys.s) camera.translateZ(speed);
    if (keys.a) camera.translateX(-speed);
    if (keys.d) camera.translateX(speed);
    
    // Y axis is world up, not local up
    if (keys.space) camera.position.y += speed;
    if (keys.shift) camera.position.y -= speed;
  });

  return <PointerLockControls />;
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

// ──────────────────────────────────────────────────────────────────────────────
// Traffic Light Overlay – 4 poles, one per road arm, real R/Y/G state
// Positions are tuned to sit at the four corners of the intersection.
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
  // Each pole gets its own independent R/Y/G state
  const nProps = { nsGreen: nGreen, nsYellow: nYellow, ewGreen: false,  ewYellow: false,  isNS: true  };
  const sProps = { nsGreen: sGreen, nsYellow: sYellow, ewGreen: false,  ewYellow: false,  isNS: true  };
  const eProps = { nsGreen: false,  nsYellow: false,   ewGreen: eGreen, ewYellow: eYellow, isNS: false };
  const wProps = { nsGreen: false,  nsYellow: false,   ewGreen: wGreen, ewYellow: wYellow, isNS: false };

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

export function Canvas3D({ ambulancePosition, isPreempted, isFrozen, signalPhase, nGreen=false, sGreen=false, eGreen=false, wGreen=false, nYellow=false, sYellow=false, eYellow=false, wYellow=false }) {
  const [isFreeRoam, setIsFreeRoam] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [boundaryMode, setBoundaryMode] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'KeyC') {
        setIsFreeRoam((prev) => !prev);
      }
      if (e.code === 'KeyE') {
        setEditMode(prev => !prev);
        setBoundaryMode(false);
        console.log("🛠️ EDIT MODE TOGGLED");
      }
      if (e.code === 'KeyB') {
        setBoundaryMode(prev => !prev);
        setEditMode(false);
        console.log("🚧 BOUNDARY MODE TOGGLED");
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showOrbitControls = editMode || boundaryMode;

  return (
    <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 50, 150], fov: 45 }}>
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
        <Ambulance3D position={ambulancePosition} />
        <TrafficLightOverlay
          nGreen={nGreen} sGreen={sGreen} eGreen={eGreen} wGreen={wGreen}
          nYellow={nYellow} sYellow={sYellow} eYellow={eYellow} wYellow={wYellow}
        />
        <CctvOverlay />
        <TrafficManager
          ambulancePosition={ambulancePosition}
          isPreempted={isPreempted}
          nGreen={nGreen} sGreen={sGreen} eGreen={eGreen} wGreen={wGreen}
          nYellow={nYellow} sYellow={sYellow} eYellow={eYellow} wYellow={wYellow}
          isFrozen={isFrozen}
          editMode={editMode}
          boundaryMode={boundaryMode}
        />
      </Suspense>

      {/* ── DEV TOOL: Click anywhere on the road to log exact 3D coordinates ──
           Open F12 → Console, then click the asphalt to get X, Y, Z readouts.
           Set visible={false} to hide the plane without removing the listener.  */}
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

      <CameraTracker isFreeRoam={isFreeRoam} editMode={editMode} boundaryMode={boundaryMode} />

      {/* Use OrbitControls when editing so the mouse isn't locked! */}
      {showOrbitControls ? (
        <OrbitControls makeDefault />
      ) : isFreeRoam ? (
        <MinecraftControls />
      ) : (
        <CinematicCamera ambulancePosition={ambulancePosition} />
      )}
    </Canvas>
  );
}
