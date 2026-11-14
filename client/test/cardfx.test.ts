// Regression: hand-card faces stopped painting after fast hover sweeps (only the number badge, ATK/DEF peek and the
// Crest overlay stayed). The face sat in a `transform-style: preserve-3d` context with its own hover transform next to
// blend-mode overlays. These tests pin the flat structure that replaced it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The test runner (tsx, no root tsconfig) compiles .tsx with the classic JSX transform, which wants a global React.
(globalThis as { React?: typeof React }).React = React;
const { CardFx } = await import("../src/ui/hud/CardFx.js");
const { createElement } = React;

const css = readFileSync(new URL("../src/ui/styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const face = createElement("div", { className: "card-face" }, "face");
const render = (size: "hand" | "big", id = "skitterwing") => renderToStaticMarkup(createElement(CardFx, { id, size, enabled: true, children: face }));

test("hand cards: face and overlays sit flat in .cardfx with no tilt wrapper", () => {
  const html = render("hand");
  assert.match(html, /^<div class="cardfx"><div class="card-face">face<\/div><span class="cardfx-crest cardfx-gale"/);
  assert.doesNotMatch(html, /cardfx-tilt/);
});

test("big cards: one wrapper tilts face and overlays together", () => {
  const html = render("big");
  assert.match(html, /^<div class="cardfx"><div class="cardfx-tilt"><div class="card-face">face<\/div>.*cardfx-gloss.*<\/div><\/div>$/);
});

test("two copies of the same card both keep their face", () => {
  const a = render("hand"), b = render("hand");
  assert.equal(a, b);
  assert.match(a, /card-face/);
});

test("card CSS: no 3D sorting context, and the face is never transformed on its own", () => {
  assert.doesNotMatch(css, /preserve-3d/);
  for (const rule of css.match(/[^{}]*\{[^}]*\}/g) ?? []) {
    const [sel = "", body = ""] = rule.split("{");
    if (/\.card-face\b/.test(sel)) assert.doesNotMatch(body, /transform|transition|opacity|visibility/, `rule targets .card-face: ${sel.trim()}`);
  }
  assert.match(css, /\.cardfx \{[^}]*isolation: isolate/);
});
