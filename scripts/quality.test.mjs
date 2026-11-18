import test from "node:test";
import assert from "node:assert/strict";
import { AdaptiveQuality } from "../src/components/three/engine/quality.ts";

function run(quality, phase, fps, seconds) {
  for (let i = 0; i < fps * seconds; i++) quality.sample(1 / fps, phase);
}

test("slow gallery adjusts the gallery immediately, preserving portal quality", () => {
  const quality = new AdaptiveQuality(true);
  run(quality, "gallery", 30, 1.1);
  assert.equal(quality.portalScale, 0.65);
  assert.equal(quality.galleryScale, 0.9);
});

test("slow portal never reduces an invisible gallery; both bounds are clamped", () => {
  const quality = new AdaptiveQuality(true);
  run(quality, "portal", 20, 30);
  assert.equal(quality.portalScale, 0.35);
  assert.equal(quality.galleryScale, 1);
  run(quality, "transition", 20, 30);
  assert.equal(quality.portalScale, 0.35);
  assert.equal(quality.galleryScale, 0.6);
});

test("recovery needs sustained headroom and never exceeds its resolution budget", () => {
  const quality = new AdaptiveQuality(true);
  run(quality, "portal", 60, 1.1);
  assert.equal(quality.portalScale, 0.65);
  run(quality, "portal", 60, 1.1);
  assert.ok(quality.portalScale > 0.65);
  run(quality, "portal", 60, 40);
  assert.equal(quality.portalScale, 1);
  const desktop = new AdaptiveQuality(false);
  run(desktop, "portal", 60, 40);
  assert.equal(desktop.portalScale, 0.72);
});

test("phase changes and tab resumes discard stale frame samples", () => {
  const quality = new AdaptiveQuality(true);
  run(quality, "portal", 30, 0.8);
  quality.sample(1 / 30, "gallery");
  assert.equal(quality.galleryScale, 1);
  quality.sample(5, "gallery");
  run(quality, "gallery", 60, 1.1);
  assert.equal(quality.galleryScale, 1);
  assert.equal(quality.portalScale, 0.65);
});

test("a stable transition retains detail instead of continually reducing resolution", () => {
  const quality = new AdaptiveQuality(false);
  run(quality, "transition", 40, 20);
  assert.equal(quality.portalScale, 0.6);
  assert.equal(quality.galleryScale, 1);
});

test("sustained very slow frames still reduce quality on weaker devices", () => {
  const quality = new AdaptiveQuality(true);
  run(quality, "portal", 3, 15);
  assert.equal(quality.portalScale, 0.35);
});
