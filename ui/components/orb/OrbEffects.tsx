"use client";

import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

/** Selective bloom: core is bright (toneMapped false), shells/rings stay dim. */
export default function OrbEffects() {
  return (
    <EffectComposer>
      <Bloom intensity={0.9} luminanceThreshold={1.0} luminanceSmoothing={0.2} mipmapBlur />
      <Vignette darkness={0.55} offset={0.25} />
    </EffectComposer>
  );
}
