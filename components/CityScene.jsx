import React, { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';

export function CityScene({ isPreempted }) {
  // Load the packed GLB model from the public directory
  const { scene } = useGLTF('/scene.glb');
  
  useEffect(() => {
    if (!scene) return;
    
    scene.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = true;
        const meshName = child.name?.toLowerCase() || '';
        
        // 1. Check by standard mesh name (The Dragnet)
        let isVehicle = [
          'car', 'taxi', 'bus', 'truck', 'vehicle', 'van', 'sedan', 
          'suv', 'auto', 'wheel', 'tire', 'motor', 'pickup', 'coupe'
        ].some(keyword => meshName.includes(keyword));

        // Hide the mesh if it triggers any of the vehicle checks
        if (isVehicle) {
          child.visible = false;
        }
        
        // Removed Material Overrides: The model remains pristine.
      }
    });
  }, [scene]); // No longer depends on isPreempted for material updates

  return (
    <group>
      <primitive 
        object={scene} 
        position={[0, 0, 0]} 
        scale={1} 
      />
    </group>
  );
}

// Preload the GLB to ensure instant availability
useGLTF.preload('/scene.glb');
