import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export function Ambulance3D({ position, ringColor = "#3b82f6", label = null }) {
  const group = useRef();
  const bleRingRef = useRef();
  const { scene } = useGLTF('/ambulance.glb');

  const clonedScene = React.useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child.isMesh) child.frustumCulled = true;
    });
    return clone;
  }, [scene]);

  useFrame((state) => {
    if (group.current && position) {
      const targetY = position.y !== undefined ? position.y : 0.55;
      group.current.position.lerp(
        new THREE.Vector3(position.x, targetY, position.z),
        0.25
      );

      if (position.rotation !== undefined) {
        group.current.rotation.y = THREE.MathUtils.lerp(
          group.current.rotation.y,
          position.rotation,
          0.25
        );
      }
    }

    if (bleRingRef.current) {
      const time = state.clock.getElapsedTime();
      bleRingRef.current.material.opacity = 0.08 + 0.14 * Math.abs(Math.sin(time * 2.2));
    }
  });

  if (!position) return null;

  const initialY = position.y !== undefined ? position.y : 0.55;

  return (
    <group ref={group} position={[position.x, initialY, position.z]} rotation={[0, position.rotation || 0, 0]}>
      <primitive object={clonedScene} scale={0.194} position={[0, 0, 0]} rotation={[0, Math.PI, 0]} />

      {/* Glowing BLE Signal Radius Overlay */}
      <mesh ref={bleRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[12, 14, 64]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Optional In-World Beacon Label */}
      {label && (
        <group position={[0, 3.2, 0]}>
          <pointLight color={ringColor} intensity={2.5} distance={6} />
        </group>
      )}
    </group>
  );
}

useGLTF.preload('/ambulance.glb');
