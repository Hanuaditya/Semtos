import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function Ambulance3D({ position }) {
  const group = useRef();
  const beaconRef = useRef();
  const bleRingRef = useRef();

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
    
    // Create a high-frequency flashing strobe effect for the emergency beacon
    if (beaconRef.current) {
      const time = state.clock.getElapsedTime();
      // Fast strobe effect: swap between Red and Blue
      const isRed = Math.sin(time * 25) > 0;
      beaconRef.current.material.color.set(isRed ? '#ef4444' : '#3b82f6');
      beaconRef.current.material.emissive.set(isRed ? '#ef4444' : '#3b82f6');
      beaconRef.current.material.emissiveIntensity = 4;
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
      <group scale={[0.6, 0.6, 0.6]}>
        {/* Main Ambulance Body */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[2.5, 2.5, 6]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.3} metalness={0.1} />
        </mesh>
        
        {/* Red Stripes */}
        <mesh position={[1.26, 1.5, 0]} rotation={[0, Math.PI/2, 0]}>
          <planeGeometry args={[6, 0.8]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
        <mesh position={[-1.26, 1.5, 0]} rotation={[0, -Math.PI/2, 0]}>
          <planeGeometry args={[6, 0.8]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>

        {/* Windshield */}
        <mesh position={[0, 2, -3.01]}>
          <planeGeometry args={[2.2, 1.2]} />
          <meshStandardMaterial color="#020617" roughness={0.1} metalness={0.9} />
        </mesh>

        {/* Flashing Light Beacon on Roof */}
        <mesh ref={beaconRef} position={[0, 2.8, -1]}>
          <boxGeometry args={[1.5, 0.3, 0.6]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={4} />
        </mesh>
        
        {/* Wheels */}
        {[-1.3, 1.3].map((x, i) => 
          [-2, 2].map((z, j) => (
            <mesh key={`${i}-${j}`} position={[x, 0.5, z]} rotation={[0, 0, Math.PI/2]} castShadow>
              <cylinderGeometry args={[0.6, 0.6, 0.4, 32]} />
              <meshStandardMaterial color="#0f172a" roughness={0.8} />
            </mesh>
          ))
        )}
      </group>

      {/* Glowing BLE Signal Radius Overlay — pulsing ring on the ground */}
      <mesh ref={bleRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.45, 0]}>
        <ringGeometry args={[28, 30, 64]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}
