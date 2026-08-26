import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export function Ambulance3D({ position }) {
  const group = useRef();
  const bleRingRef = useRef();
  const { scene } = useGLTF('/ambulance.glb');

  useFrame((state) => {
    // Smoothly interpolate the position based on the data stream
    if (group.current) {
      group.current.position.lerp(
        new THREE.Vector3(position.x, position.y, position.z),
        0.2
      );
      
      // Smoothly rotate the ambulance as it turns the corner
      if (position.rotation !== undefined) {
        group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, position.rotation, 0.2);
      }
    }
    
    // Pulse the BLE ring: oscillate opacity to simulate outgoing signal waves
    if (bleRingRef.current) {
      const time = state.clock.getElapsedTime();
      bleRingRef.current.material.opacity = 0.08 + 0.12 * Math.abs(Math.sin(time * 1.8));
    }
  });

  // Apply initial position and rotation
  return (
    <group ref={group} position={[position.x, position.y, position.z]} rotation={[0, position.rotation || 0, 0]}>
      {/* 3D Ambulance Model */}
      <primitive object={scene} scale={0.194} position={[0, 0, 0]} rotation={[0, Math.PI, 0]} />

      {/* Glowing BLE Signal Radius Overlay — pulsing ring on the ground */}
      <mesh ref={bleRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.45, 0]}>
        <ringGeometry args={[12, 14, 64]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

useGLTF.preload('/ambulance.glb');

