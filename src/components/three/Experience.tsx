"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { Engine } from "./engine/Engine";
import type { ModelCatalog } from "./engine/gallery";
import { BASE_DPR } from "./engine/quality";

type Dpr = number | [number, number];

interface Props {
  models: ModelCatalog;
  fontFamily: string;
  onProgress: (p: number) => void;
  onReady: (engine: Engine) => void;
}

function Director({ models, fontFamily, onProgress, onReady, onDpr }: Props & { onDpr: (dpr: Dpr) => void }) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const engine = new Engine(gl);
    engineRef.current = engine;
    engine.onDpr = onDpr;
    engine.setSize(size.width, size.height, dpr);
    let alive = true;
    engine
      .load({ onProgress: (p) => alive && onProgress(p) }, fontFamily, models)
      .then(() => alive && onReady(engine))
      .catch((err) => console.error("[ink-gallery] caricamento fallito", err));
    return () => {
      alive = false;
      engine.onDpr = undefined;
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
  // si parte dal DPR di base; la regia lo alza solo se la misura del dispositivo lo consente
  const [dpr, setDpr] = useState<Dpr>(BASE_DPR);
  return (
    <Canvas
      className="gl"
      flat
      dpr={dpr}
      gl={{ antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" }}
      frameloop="always"
    >
      <Director {...props} onDpr={setDpr} />
    </Canvas>
  );
}
