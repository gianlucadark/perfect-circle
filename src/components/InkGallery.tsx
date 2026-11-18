"use client";

import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Engine } from "./three/engine/Engine";
import { OUTRO_CAPTION, STATIONS } from "./three/engine/stations";

const Experience = dynamic(() => import("./three/Experience"), { ssr: false });

/** titolo diviso in parole e lettere per la rivelazione a cascata */
function Split({ text }: { text: string }) {
  let i = 0;
  return (
    <span aria-hidden>
      {text.split(" ").map((word, wi) => (
        <Fragment key={wi}>
          {wi > 0 && " "}
          <span className="w">
            {[...word].map((ch) => (
              <span key={i} className="ch" style={{ "--i": i++ } as CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

export default function InkGallery() {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [sound, setSound] = useState(false);
  const [font, setFont] = useState<string | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const capsRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fam = getComputedStyle(document.body).getPropertyValue("--font-display").trim();
    setFont(fam || "Georgia, serif");
  }, []);

  // cursore personalizzato
  useEffect(() => {
    const el = cursorRef.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let cx = x;
    let cy = y;
    let raf = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      const t = e.target as HTMLElement;
      el.classList.toggle("is-link", !!t.closest("button, a"));
    };
    const tick = () => {
      cx += (x - cx) * 0.18;
      cy += (y - cy) * 0.18;
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, []);

  const onReady = useCallback((engine: Engine) => {
    engineRef.current = engine;
    if (capsRef.current) engine.bindCaptions(Array.from(capsRef.current.querySelectorAll<HTMLElement>("[data-station]")));
    setReady(true);
  }, []);

  const enter = (withSound: boolean) => {
    engineRef.current?.begin(withSound);
    setSound(withSound);
    setEntered(true);
  };

  const toggleSound = () => {
    const e = engineRef.current;
    if (!e) return;
    if (!sound) e.drone.start();
    else e.drone.setOn(false);
    setSound(!sound);
  };

  const pct = Math.round(progress * 100);

  return (
    <>
      {font && <Experience fontFamily={font} onProgress={setProgress} onReady={onReady} />}

      <div className={`loader ${entered ? "is-gone" : ""} ${ready ? "is-ready" : ""}`} aria-hidden={entered}>
        <svg className="loader__ring" viewBox="0 0 200 200" aria-hidden>
          <defs>
            <filter id="ink">
              <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
              <feDisplacementMap in="SourceGraphic" scale="5" />
            </filter>
          </defs>
          <circle cx="100" cy="100" r="84" className="loader__track" />
          <circle
            cx="100"
            cy="100"
            r="84"
            className="loader__stroke"
            filter="url(#ink)"
            style={{ strokeDashoffset: 528 * (1 - (ready ? 1 : progress * 0.96)) }}
          />
        </svg>
        <div className="loader__center">
          <span className="loader__pct">{ready ? "" : `${pct}`}</span>
          <p className="loader__title">
            Perfect Circle
            <em>Ink Gallery</em>
          </p>
        </div>
        <div className="loader__actions">
          <button className="btn" disabled={!ready} onClick={() => enter(true)}>
            Entra con il suono
          </button>
          <button className="btn btn--ghost" disabled={!ready} onClick={() => enter(false)}>
            Entra in silenzio
          </button>
        </div>
        <p className="loader__note">Consigliate le cuffie</p>
      </div>

      <header className="nav">
        <span className="nav__brand">
          Perfect Circle <i className="nav__extra">— Tattoo Studio</i>
        </span>
        <span className="nav__place">Terracina</span>
        <button className="nav__sound" onClick={toggleSound} aria-pressed={sound}>
          <span className="eq" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          Suono {sound ? "on" : "off"}
        </button>
      </header>

      <section className="hero" aria-label="Perfect Circle">
        <h1 className="hero__title">
          <span className="hero__word hero__word--l">Perfect</span>
          <span className="hero__word hero__word--r">Circle</span>
        </h1>
        <p className="hero__kicker">Il cerchio è la soglia</p>
        <p className="hero__sub">Una galleria d&apos;inchiostro, pietra e luce. Perfect Circle Tattoo Studio, Terracina.</p>
        <div className="hero__cue">
          <span>Scorri per attraversare</span>
          <i />
        </div>
      </section>

      <div className="captions" ref={capsRef}>
        {STATIONS.map((s, i) =>
          s.title ? (
            <article key={s.id} data-station={i} className={`cap cap--${s.align ?? "left"}`}>
              {s.index && <span className="cap__index">{s.index}</span>}
              <h2 className="cap__title" aria-label={s.title}>
                <Split text={s.title} />
              </h2>
              {s.body && <p className="cap__body">{s.body}</p>}
              {s.meta && <p className="cap__meta">{s.meta}</p>}
            </article>
          ) : null,
        )}
        <article data-station="outro" className="cap cap--center cap--end" data-end>
          <h2 className="cap__title" aria-label={OUTRO_CAPTION.title}>
            <Split text={OUTRO_CAPTION.title} />
          </h2>
          <p className="cap__body">{OUTRO_CAPTION.body}</p>
        </article>
      </div>

      <div className="meter" aria-hidden>
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" className="meter__track" />
          <circle cx="20" cy="20" r="17" className="meter__fill" />
        </svg>
      </div>

      <div className="cursor" ref={cursorRef} aria-hidden>
        <i />
      </div>
    </>
  );
}
