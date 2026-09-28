"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Torus, Icosahedron, MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";
import OrbEffects from "./OrbEffects";

/**
 * Orb core copied from clutchd-deck ThreeHero:
 * Canvas + Float + Icosahedron MeshDistortMaterial + Torus GlowRing.
 * Bloom is selective: core emissiveIntensity 2–3 toneMapped={false}, shells dim.
 */
function GlowRing({ amplitude }: { amplitude: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.x = state.clock.elapsedTime * (0.15 + amplitude * 0.4);
    ref.current.rotation.z = state.clock.elapsedTime * 0.1;
  });
  return (
    <Float speed={1.5} floatIntensity={0.5}>
      <Torus ref={ref} args={[2.2, 0.04, 16, 200]}>
        <meshStandardMaterial
          color="#3b82f6"
          emissive="#1d4ed8"
          emissiveIntensity={1}
          transparent
          opacity={0.6}
        />
      </Torus>
      <Torus args={[2.8, 0.02, 16, 200]} rotation={[Math.PI / 4, 0, 0]}>
        <meshStandardMaterial
          color="#6366f1"
          emissive="#4f46e5"
          emissiveIntensity={1}
          transparent
          opacity={0.3}
        />
      </Torus>
    </Float>
  );
}

function Core({ amplitude }: { amplitude: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<{ emissiveIntensity: number } | null>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.x = state.clock.elapsedTime * 0.3;
    ref.current.rotation.y = state.clock.elapsedTime * 0.4;
    const s = 1 + amplitude * 0.35;
    ref.current.scale.setScalar(s);
    if (matRef.current) {
      matRef.current.emissiveIntensity = 2 + Math.min(1, Math.max(0, amplitude)) * 1;
    }
  });
  return (
    <Float speed={2} floatIntensity={0.8}>
      <Icosahedron ref={ref} args={[1.2, 1]}>
        <MeshDistortMaterial
          onUpdate={(m) => {
            matRef.current = m;
          }}
          color="#bfdbfe"
          emissive="#60a5fa"
          emissiveIntensity={2.4}
          metalness={0.5}
          roughness={0.2}
          distort={0.25}
          speed={1.5}
          transparent
          opacity={0.85}
          toneMapped={false}
        />
      </Icosahedron>
    </Float>
  );
}

export default function OrbScene({ amplitude = 0.12 }: { amplitude?: number }) {
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 0, 7], fov: 50 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={1.5} />
        <pointLight position={[5, 5, 5]} intensity={4} color="#ffffff" />
        <pointLight position={[-5, -5, 5]} intensity={3} color="#93c5fd" />
        <spotLight position={[0, 10, 0]} intensity={3} color="#ffffff" penumbra={1} />
        <Core amplitude={amplitude} />
        <GlowRing amplitude={amplitude} />
        <OrbEffects />
      </Canvas>
    </div>
  );
}
