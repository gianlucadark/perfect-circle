"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Engine } from "./engine/Engine";

interface Props {
  fontFamily: string;
  onProgress: (p: number) => void;
  onReady: (engine: Engine) => void;
}

function Director({ fontFamily, onProgress, onReady }: Props) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const engine = new Engine(gl);
    engineRef.current = engine;
    engine.setSize(size.width, size.height, dpr);
    let alive = true;
    engine
      .load({ onProgress: (p) => alive && onProgress(p) }, fontFamily)
      .then(() => alive && onReady(engine))
      .catch((err) => console.error("[ink-gallery] caricamento fallito", err));
    return () => {
      alive = false;
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useEffect(() => {
    engineRef.current?.setSize(size.width, size.height, dpr);
  }, [size.width, size.height, dpr]);

  // priorità 1: la regia gestisce il rendering al posto di R3F
  useFrame((_, dt) => engineRef.current?.frame(dt), 1);
  return null;
}

export default function Experience(props: Props) {
  return (
    <Canvas
      className="gl"
      flat
      dpr={[1, 1.25]}
      gl={{ antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" }}
      frameloop="always"
    >
      <Director {...props} />
    </Canvas>
  );
}
