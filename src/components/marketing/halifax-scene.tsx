import { cn } from "@/lib/utils";

/**
 * Original illustration: a row of Halifax "jellybean" houses at night.
 * One house (TARGET) is being investigated — scan frame, beam and evidence chips
 * are layered on top in HTML so they stay crisp and animatable.
 * Pure SVG, server-rendered, no images to download.
 */

type Roof = "gable" | "flat" | "mansard";
type House = { w: number; h: number; color: string; roof: Roof; cols: number };

const HOUSES: House[] = [
  { w: 118, h: 168, color: "#3d5a80", roof: "flat", cols: 2 },
  { w: 132, h: 214, color: "#e8706a", roof: "gable", cols: 2 },
  { w: 150, h: 186, color: "#e3b04b", roof: "mansard", cols: 3 },
  { w: 124, h: 236, color: "#4a7fd4", roof: "gable", cols: 2 },
  { w: 150, h: 252, color: "#2bb3a3", roof: "gable", cols: 3 }, // investigated
  { w: 128, h: 198, color: "#9b86d9", roof: "flat", cols: 2 },
  { w: 142, h: 222, color: "#e58bb0", roof: "mansard", cols: 3 },
  { w: 120, h: 178, color: "#6bbf8a", roof: "gable", cols: 2 },
  { w: 136, h: 230, color: "#e88d4f", roof: "flat", cols: 2 },
  { w: 124, h: 190, color: "#5b7bb5", roof: "gable", cols: 2 },
];
export const TARGET = 4;

const VB_W = 1440;
const VB_H = 340;
const GROUND = 330;
const GAP = 4;

function layout() {
  const total = HOUSES.reduce((s, h) => s + h.w, 0) + GAP * (HOUSES.length - 1);
  let x = (VB_W - total) / 2;
  return HOUSES.map((h) => {
    const r = { ...h, x, top: GROUND - h.h };
    x += h.w + GAP;
    return r;
  });
}
const LAID = layout();

/** Bounding box of the investigated house, as % of the scene — used to place the scan frame. */
export const TARGET_BOX = (() => {
  const t = LAID[TARGET]!;
  const roofTop = t.top - 58;
  return {
    left: (t.x / VB_W) * 100,
    width: (t.w / VB_W) * 100,
    top: (roofTop / VB_H) * 100,
    height: ((GROUND - roofTop) / VB_H) * 100,
  };
})();

/** Horizontal centre of the investigated house, as % of the scene width. */
export const TARGET_CENTER = TARGET_BOX.left + TARGET_BOX.width / 2;

// Deterministic "random" so server and client agree.
const lit = (i: number, j: number) => ((i * 7 + j * 13) % 5) < 2;

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${c(n >> 16)} ${c((n >> 8) & 255)} ${c(n & 255)})`;
}

function HouseShape({ h, i }: { h: (typeof LAID)[number]; i: number }) {
  const dark = shade(h.color, -0.22);
  const light = shade(h.color, 0.12);
  const floors = Math.max(2, Math.floor((h.h - 40) / 70));
  const winW = 18;
  const winH = 30;
  const colGap = (h.w - h.cols * winW) / (h.cols + 1);
  const isTarget = i === TARGET;
  return (
    <g>
      {h.roof === "gable" ? (
        <>
          <polygon points={`${h.x - 7},${h.top + 2} ${h.x + h.w / 2},${h.top - 56} ${h.x + h.w + 7},${h.top + 2}`} fill={dark} />
          <circle cx={h.x + h.w / 2} cy={h.top - 22} r={9} fill={lit(i, 9) || isTarget ? "#ffd98a" : "#0b1220"} opacity={0.9} />
        </>
      ) : h.roof === "mansard" ? (
        <polygon points={`${h.x - 4},${h.top + 2} ${h.x + 14},${h.top - 34} ${h.x + h.w - 14},${h.top - 34} ${h.x + h.w + 4},${h.top + 2}`} fill={dark} />
      ) : (
        <rect x={h.x - 6} y={h.top - 10} width={h.w + 12} height={12} rx={2} fill={dark} />
      )}
      <rect x={h.x} y={h.top} width={h.w} height={h.h} fill={h.color} />
      <rect x={h.x} y={h.top} width={5} height={h.h} fill={light} opacity={0.6} />
      <rect x={h.x + h.w - 5} y={h.top} width={5} height={h.h} fill={dark} opacity={0.5} />
      {Array.from({ length: floors }).map((_, f) =>
        Array.from({ length: h.cols }).map((__, c) => {
          const wx = h.x + colGap + c * (winW + colGap);
          const wy = h.top + 22 + f * 64;
          if (wy + winH > GROUND - 54 && c === Math.floor(h.cols / 2)) return null; // door spot
          if (wy + winH > GROUND - 10) return null;
          const on = isTarget || lit(i, f * 3 + c);
          return (
            <g key={`${f}-${c}`}>
              <rect x={wx - 3} y={wy - 3} width={winW + 6} height={winH + 6} rx={2} fill={light} />
              <rect x={wx} y={wy} width={winW} height={winH} rx={1.5} fill={on ? "url(#sl-win)" : "#0b1220"} />
              {on ? <rect x={wx - 10} y={wy - 10} width={winW + 20} height={winH + 20} fill="url(#sl-winglow)" /> : null}
              <line x1={wx} y1={wy + winH / 2} x2={wx + winW} y2={wy + winH / 2} stroke={light} strokeWidth={1.5} />
            </g>
          );
        }),
      )}
      <rect x={h.x + h.w / 2 - 13} y={GROUND - 48} width={26} height={48} rx={2} fill={dark} />
      <circle cx={h.x + h.w / 2 + 7} cy={GROUND - 24} r={1.8} fill="#ffd98a" />
      <rect x={h.x + h.w / 2 - 19} y={GROUND - 4} width={38} height={4} fill={shade(h.color, -0.35)} />
    </g>
  );
}

export function HalifaxHouses({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className={cn("block h-auto w-full", className)} aria-hidden>
      <defs>
        <linearGradient id="sl-win" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1c4" />
          <stop offset="1" stopColor="#ffc25e" />
        </linearGradient>
        <radialGradient id="sl-winglow">
          <stop offset="0" stopColor="#ffcf70" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffcf70" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sl-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060b14" stopOpacity="0" />
          <stop offset="0.55" stopColor="#060b14" stopOpacity="0.15" />
          <stop offset="1" stopColor="#060b14" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      {LAID.map((h, i) => (
        <HouseShape key={i} h={h} i={i} />
      ))}
      <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#sl-dusk)" />
      <rect x="0" y={GROUND} width={VB_W} height={VB_H - GROUND} fill="#05080f" />
    </svg>
  );
}

/** Deterministic twinkling star field. */
export function Stars({ count = 60 }: { count?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: count }).map((_, i) => {
        const x = (i * 73.13) % 100;
        const y = (i * 37.7) % 55;
        const s = (i % 3) + 1;
        return (
          <span
            key={i}
            className="sl-twinkle absolute rounded-full bg-white"
            style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animationDelay: `${(i % 7) * 0.6}s`, opacity: 0.25 + (i % 4) * 0.15 }}
          />
        );
      })}
    </div>
  );
}
