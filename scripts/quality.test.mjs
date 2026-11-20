import test from "node:test";
import assert from "node:assert/strict";
import { AdaptiveQuality, planQuality } from "../src/components/three/engine/quality.ts";

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

test("an increase that costs fluidity is undone and never retried in that phase", () => {
  const quality = new AdaptiveQuality(true);
  run(quality, "portal", 60, 2.0);
  assert.ok(Math.abs(quality.portalScale - 0.7) < 1e-9);
  run(quality, "portal", 45, 1.0);
  assert.equal(quality.portalScale, 0.65);
  run(quality, "portal", 60, 20);
  assert.equal(quality.portalScale, 0.65);
  // the ceiling belongs to the phase: the gallery can still recover
  quality.galleryScale = 0.8;
  run(quality, "gallery", 60, 5);
  assert.equal(quality.galleryScale, 1);
});

test("configured ranges bound adaptation and report when nothing is left to reduce", () => {
  const quality = new AdaptiveQuality(true);
  quality.configure({ portal: 0.625, portalMax: 0.625, portalMin: 0.22, gallery: 1, galleryMin: 0.625 });
  run(quality, "gallery", 20, 10);
  assert.equal(quality.galleryScale, 0.625);
  assert.equal(quality.starved, true);
  assert.equal(quality.portalScale, 0.625);
});

// one frame in four misses vsync (~48 fps average)
function rough(quality, phase, seconds) {
  for (let i = 0; i < 48 * seconds; i++) quality.sample(i % 4 === 3 ? 1 / 30 : 1 / 60, phase);
}

test("above the base DPR nothing adapts: lost fluidity asks to return to the base DPR", () => {
  const strict = { portal: 0.625, portalMax: 0.625, portalMin: 0.22, gallery: 1, galleryMin: 0.6, strict: true };
  const quality = new AdaptiveQuality(true);
  quality.configure(strict);
  run(quality, "gallery", 60, 10);
  quality.sample(0.8, "gallery"); // an isolated hitch (GC, texture upload) is not lost fluidity
  run(quality, "gallery", 60, 2);
  assert.equal(quality.starved, false);
  rough(quality, "gallery", 1.0);
  assert.equal(quality.starved, false); // a single rough window is tolerated
  run(quality, "gallery", 60, 2);
  rough(quality, "gallery", 1.0);
  assert.equal(quality.starved, false); // not consecutive
  rough(quality, "gallery", 2.0);
  assert.equal(quality.starved, true);
  assert.equal(quality.galleryScale, 1);
  const slow = new AdaptiveQuality(true);
  slow.configure(strict);
  run(slow, "portal", 30, 1.0);
  assert.equal(slow.starved, true);
});

const sample = (ms, extra = {}) => ({
  costs: { post: ms.post, hero: ms.hero, heroQuarter: ms.heroQ, gallery: ms.gallery, galleryQuarter: ms.galleryQ, cross: ms.cross },
  dpr: 1.25, outputPx: 488 * 1055, portalPx: 488 * 1055, galleryPx: 488 * 1055,
  base: 1.25, device: 3, mobile: true, ...extra,
});
const fast = { post: 0.6, hero: 2.5, heroQ: 1.0, gallery: 1.8, galleryQ: 1.0, cross: 3.5 };

test("a fast phone gets a sharper canvas and a portal at full resolution from the start", () => {
  const plan = planQuality(sample(fast));
  assert.equal(plan.dpr, 2);
  assert.equal(plan.portal, 1.25);
  // the DPR never exceeds the screen
  assert.equal(planQuality(sample(fast, { device: 1.5 })).dpr, 1.5);
});

test("fixed costs (CPU, shadows) do not count against resolution", () => {
  // same full-resolution cost, but mostly fixed: only the second device can afford more pixels
  const perPixel = { post: 1, hero: 4, heroQ: 1.75, gallery: 11, galleryQ: 3.5, cross: 12 };
  const fixed = { post: 1, hero: 4, heroQ: 1.75, gallery: 11, galleryQ: 9, cross: 12 };
  assert.equal(planQuality(sample(perPixel)).dpr, 1.25);
  assert.ok(planQuality(sample(fixed)).dpr > 1.25);
});

test("a mid phone keeps the canvas DPR but starts the portal as high as the hero budget allows", () => {
  const plan = planQuality(sample({ post: 1.5, hero: 14, heroQ: 5, gallery: 6, galleryQ: 3.5, cross: 18 }));
  assert.equal(plan.dpr, 1.25);
  assert.ok(plan.portal > 0.65 * 1.25 && plan.portal < 1.25);
});

test("slow devices, desktops and invalid measures keep the historical settings", () => {
  assert.deepEqual(planQuality(sample({ post: 3, hero: 40, heroQ: 12, gallery: 20, galleryQ: 9, cross: 60 })), { dpr: 1.25, portal: 0.8125 });
  assert.equal(planQuality(sample(fast, { mobile: false, dpr: 1, base: 1, device: 1 })).dpr, 1);
  assert.deepEqual(planQuality(sample({ ...fast, post: NaN })), { dpr: 1.25, portal: 0.8125 });
});
