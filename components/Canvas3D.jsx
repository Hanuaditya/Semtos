import React, { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useProgress, PointerLockControls } from '@react-three/drei';
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

export function CameraTracker({ isFreeRoam }) {
  const textRef = useRef();

  useFrame((state) => {
    if (textRef.current) {
      const { x, y, z } = state.camera.position;
      textRef.current.innerText = `X: ${x.toFixed(2)} | Y: ${y.toFixed(2)} | Z: ${z.toFixed(2)}`;
    }
  });

  return (
    // Fixed syntax to anchor cleanly to the top right corner
    <Html style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 50 }}>
      <div className="bg-black/80 text-emerald-400 p-3 rounded border border-emerald-500 font-mono text-sm whitespace-nowrap shadow-lg">
        <div className="mb-1 text-xs text-emerald-600 font-bold">
          MODE: {isFreeRoam ? 'FREE ROAM (Click to lock mouse)' : 'CINEMATIC'} (Press 'C' to toggle)
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

export function TrafficLightOverlay({ signalState }) {
  // Corrected coordinates: Raised Y to 3.82, shifted X to -4.56, adjusted Z to -1.62
  const signalPos = [-4.61, 3.8, -1.7];

  return (
    <group position={signalPos}>
      {/* 1. Point light source illuminating the intersection */}
      <pointLight 
        color={signalState === 'GREEN' ? "#10b981" : "#ef4444"} 
        intensity={signalState === 'GREEN' ? 15 : 6} 
        distance={20} 
      />

      {/* 2. Scaled bulb mesh centered inside top lens */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshBasicMaterial color={signalState === 'GREEN' ? "#a7f3d0" : "#475569"} />
      </mesh>
      <mesh position={[0, -0.6, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color={signalState === 'RED' ? "#fca5a5" : "#475569"} />
      </mesh>
    </group>
  );
}

export function Canvas3D({ ambulancePosition, isPreempted, signalState }) {
  const [isFreeRoam, setIsFreeRoam] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'KeyC') {
        setIsFreeRoam((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Canvas shadows camera={{ position: [0, 50, 150], fov: 45 }}>
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
        <TrafficLightOverlay signalState={signalState} />
        <TrafficManager 
          ambulancePosition={ambulancePosition} 
          isPreempted={isPreempted}
          signalState={signalState} 
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

      <CameraTracker isFreeRoam={isFreeRoam} />


      {isFreeRoam ? (
        <MinecraftControls />
      ) : (
        <CinematicCamera ambulancePosition={ambulancePosition} />
      )}
    </Canvas>
  );
}
