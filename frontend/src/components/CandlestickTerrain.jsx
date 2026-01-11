import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';

// Enhanced candlesticks with dramatic arrangement
function CandlestickInstances() {
  const greenRef = useRef();
  const redRef = useRef();
  const groupRef = useRef();
  
  const { greenMatrices, redMatrices, greenCount, redCount } = useMemo(() => {
    const green = [];
    const red = [];
    const tempMatrix = new THREE.Matrix4();
    const tempPosition = new THREE.Vector3();
    const tempScale = new THREE.Vector3();
    const tempQuaternion = new THREE.Quaternion();
    
    // More candlesticks with varied arrangement
    const gridSize = 10;
    const spacing = 1.4;
    
    for (let x = -gridSize / 2; x < gridSize / 2; x++) {
      for (let z = -gridSize / 2; z < gridSize / 2; z++) {
        const distFromCenter = Math.sqrt(x * x + z * z);
        
        // Skip some positions for organic feel
        if (Math.random() < 0.15) continue;
        
        // More dramatic height variation - peaks at center and edges
        const heightBase = 0.8 + 
          Math.sin(distFromCenter * 0.5) * 2.5 + 
          Math.cos(distFromCenter * 0.3) * 1.5 + 
          Math.sin(x * 0.8) * Math.cos(z * 0.8) * 1.2;
        const height = Math.max(0.5, heightBase + Math.random() * 2);
        
        // Color distribution - more red at suspicious edges
        const isGreen = distFromCenter > 4 ? Math.random() > 0.7 : Math.random() > 0.35;
        
        // Slight random offset for organic feel
        const offsetX = (Math.random() - 0.5) * 0.3;
        const offsetZ = (Math.random() - 0.5) * 0.3;
        
        tempPosition.set(x * spacing + offsetX, height / 2, z * spacing + offsetZ);
        tempScale.set(0.28, height, 0.28);
        tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
        
        if (isGreen) {
          green.push(tempMatrix.clone());
        } else {
          red.push(tempMatrix.clone());
        }
      }
    }
    
    return { 
      greenMatrices: green, 
      redMatrices: red,
      greenCount: green.length,
      redCount: red.length
    };
  }, []);

  React.useEffect(() => {
    if (greenRef.current) {
      greenMatrices.forEach((matrix, i) => {
        greenRef.current.setMatrixAt(i, matrix);
      });
      greenRef.current.instanceMatrix.needsUpdate = true;
    }
    if (redRef.current) {
      redMatrices.forEach((matrix, i) => {
        redRef.current.setMatrixAt(i, matrix);
      });
      redRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [greenMatrices, redMatrices]);

  // Smooth, slow rotation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.05;
      // Subtle vertical float
      groupRef.current.position.y = -2 + Math.sin(state.clock.elapsedTime * 0.25) * 0.15;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Green candlesticks with enhanced glow */}
      <instancedMesh ref={greenRef} args={[null, null, greenCount]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
          color="#00ff88"
          emissive="#00ff88"
          emissiveIntensity={0.35}
          metalness={0.9}
          roughness={0.1}
          envMapIntensity={2}
        />
      </instancedMesh>
      
      {/* Red candlesticks with enhanced glow */}
      <instancedMesh ref={redRef} args={[null, null, redCount]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
          color="#ff4757"
          emissive="#ff4757"
          emissiveIntensity={0.4}
          metalness={0.9}
          roughness={0.1}
          envMapIntensity={2}
        />
      </instancedMesh>
      
      {/* Enhanced base platform */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <cylinderGeometry args={[11, 12, 0.4, 64]} />
        <meshStandardMaterial 
          color="#08080f"
          metalness={0.98}
          roughness={0.15}
          emissive="#0a0a18"
          emissiveIntensity={0.2}
        />
      </mesh>
      
      {/* Outer ring glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]}>
        <ringGeometry args={[10.5, 11.5, 64]} />
        <meshBasicMaterial 
          color="#00ff88" 
          transparent 
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Inner subtle ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <ringGeometry args={[5, 5.3, 64]} />
        <meshBasicMaterial 
          color="#00ff88" 
          transparent 
          opacity={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Grid on platform */}
      <gridHelper args={[22, 22, '#151525', '#0c0c18']} position={[0, -0.28, 0]} />
    </group>
  );
}

// Enhanced particles with better movement
function DataParticles() {
  const ref = useRef();
  const count = 80;
  
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 7 + Math.random() * 5;
      pos[i * 3] = Math.cos(angle) * radius + (Math.random() - 0.5) * 3;
      pos[i * 3 + 1] = Math.random() * 12 - 4;
      pos[i * 3 + 2] = Math.sin(angle) * radius + (Math.random() - 0.5) * 3;
      
      // Color variation - mostly green, some red
      const isGreen = Math.random() > 0.25;
      colors[i * 3] = isGreen ? 0 : 1;
      colors[i * 3 + 1] = isGreen ? 1 : 0.28;
      colors[i * 3 + 2] = isGreen ? 0.53 : 0.34;
    }
    return { positions: pos, colors };
  }, []);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.02;
      
      // Animate upward
      const positions = ref.current.geometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] += 0.01;
        if (positions[i * 3 + 1] > 10) {
          positions[i * 3 + 1] = -4;
        }
      }
      ref.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={positions.colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.14}
        vertexColors
        transparent
        opacity={0.75}
        sizeAttenuation
      />
    </points>
  );
}

// Orbital data rings
function DataRings() {
  const ref = useRef();
  
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.z = state.clock.elapsedTime * 0.1;
    }
  });
  
  return (
    <group ref={ref}>
      <mesh rotation={[Math.PI / 4, 0, 0]} position={[0, 0, 0]}>
        <torusGeometry args={[14, 0.02, 8, 100]} />
        <meshBasicMaterial color="#00ff88" transparent opacity={0.2} />
      </mesh>
      <mesh rotation={[-Math.PI / 5, Math.PI / 6, 0]} position={[0, 0, 0]}>
        <torusGeometry args={[16, 0.015, 8, 100]} />
        <meshBasicMaterial color="#ff4757" transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

// Enhanced lighting and scene
function Scene() {
  const light1Ref = useRef();
  const light2Ref = useRef();
  
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    // Animate lights subtly
    if (light1Ref.current) {
      light1Ref.current.position.x = Math.sin(time * 0.15) * 4;
      light1Ref.current.intensity = 0.5 + Math.sin(time * 0.4) * 0.1;
    }
    if (light2Ref.current) {
      light2Ref.current.position.x = Math.cos(time * 0.12) * 5;
      light2Ref.current.intensity = 0.35 + Math.cos(time * 0.35) * 0.1;
    }
    
    // Smooth orbital camera movement
    if (state.camera) {
      state.camera.position.x = Math.sin(time * 0.06) * 1;
      state.camera.position.z = 13 + Math.cos(time * 0.05) * 0.5;
      state.camera.position.y = 8 + Math.sin(time * 0.04) * 0.3;
      state.camera.lookAt(0, -1, 0);
    }
  });

  return (
    <>
      {/* Enhanced lighting setup */}
      <ambientLight intensity={0.25} />
      <directionalLight 
        ref={light1Ref}
        position={[5, 15, 5]} 
        intensity={0.55}
        color="#ffffff"
        castShadow
      />
      <pointLight
        ref={light2Ref}
        position={[0, 10, 0]}
        intensity={0.45}
        color="#00ff88"
        distance={25}
      />
      <pointLight
        position={[-6, 8, -6]}
        intensity={0.3}
        color="#ff4757"
        distance={20}
      />
      
      {/* Enhanced stars */}
      <Stars 
        radius={120} 
        depth={50} 
        count={1000} 
        factor={4.5} 
        saturation={0.15}
        fade 
        speed={0.3}
      />
      
      {/* Main content */}
      <CandlestickInstances />
      <DataParticles />
      <DataRings />
      
      {/* Enhanced fog for depth */}
      <fog attach="fog" args={['#0a0a15', 12, 40]} />
    </>
  );
}

// Enhanced canvas with smooth camera
export default function CandlestickTerrain() {
  return (
    <div style={{ 
      position: 'absolute', 
      top: 0, 
      left: 0, 
      width: '100%', 
      height: '100%',
      background: 'radial-gradient(ellipse at 50% 30%, #0f0f1a 0%, #0a0a15 50%, #050508 100%)'
    }}>
      <Canvas
        camera={{ position: [0, 8, 13], fov: 48 }}
        dpr={[1, 2]}
        gl={{ 
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.3
        }}
        shadows
      >
        <Scene />
      </Canvas>
    </div>
  );
}
