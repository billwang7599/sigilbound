/** Colour ramps (dark → light). A small, warm palette in the spirit of farm-sim pixel art. */
import type { Affinity, FieldId } from "@sigilbound/engine";

export type Ramp = [outline: string, shadow: string, base: string, light: string];

export const AFFINITY: Record<Affinity, { body: Ramp; accent: Ramp; frame: string; frameDark: string }> = {
  fire: { body: ["#3b1414", "#a2321f", "#e0602c", "#f9a65a"], accent: ["#3b1414", "#d99a22", "#f6cf4a", "#fff3a6"], frame: "#c4552d", frameDark: "#6b2418" },
  water: { body: ["#14223b", "#1f5a8c", "#3a93c4", "#8fd3ea"], accent: ["#14223b", "#2a7f7a", "#4fc0a8", "#b6f0d8"], frame: "#3878a8", frameDark: "#1d3c5c" },
  earth: { body: ["#231a12", "#5f4a2c", "#8f7445", "#c5ab72"], accent: ["#231a12", "#3f6b2a", "#6aa040", "#b4d873"], frame: "#7a6236", frameDark: "#3d2f1a" },
  air: { body: ["#252238", "#6a6a9c", "#a7b3d8", "#eef1fb"], accent: ["#252238", "#4f8ab0", "#8fcbe3", "#dff6ff"], frame: "#7f8dbd", frameDark: "#3b3f63" },
  neutral: { body: ["#222222", "#6b6258", "#a0968a", "#d8d0c2"], accent: ["#222222", "#8a6c3a", "#c49a52", "#f0d79a"], frame: "#8a8070", frameDark: "#403a32" },
};

export const UI = {
  ink: "#1c1a24",
  paper: "#f4e8c8",
  paperDark: "#d9c49a",
  wood: "#7a4f2c",
  woodDark: "#4a2e18",
  woodLight: "#a8703f",
  gold: "#f2c14e",
  red: "#d9483b",
  green: "#6abe30",
  blue: "#5b9bd5",
  shadow: "#00000055",
  highlight: "#ffe66d",
  target: "#ff6b5b",
};

export const FIELD_TILES: Record<FieldId, { base: string; specks: string[]; label: string }> = {
  crossroads: { base: "#7caa4a", specks: ["#6a9640", "#8fbd57", "#c9b27a", "#b59c66"], label: "#2c3d1a" },
  volcano: { base: "#4a2a26", specks: ["#5e322b", "#3a1f1c", "#e0602c", "#f6a23a"], label: "#ffcf7a" },
  deep_lake: { base: "#2f6f9e", specks: ["#285f88", "#3c84b6", "#8fd3ea", "#24557a"], label: "#dff6ff" },
  old_forest: { base: "#3f6b2a", specks: ["#335a22", "#4f7f33", "#2a4a1c", "#7a5a32"], label: "#e6f5c0" },
  mountain_pass: { base: "#8a8378", specks: ["#77706a", "#9d968a", "#5f5953", "#b8b1a4"], label: "#2a2622" },
  storm_peak: { base: "#5d6788", specks: ["#4f587a", "#7480a3", "#c7d0ea", "#3c4361"], label: "#eef1fb" },
};
