import { STATIONS } from "./levels";
import type { Metrics, ScreenHit, Sim } from "./sim";
import type { Car, CarStyle, Level } from "./types";

const PAINT: Record<CarStyle, { body: string; glass: string; trim: string }> = {
  myvi: { body: "#f0c414", glass: "#b7e4ef", trim: "#a37f0a" },
  axia: { body: "#f4f1ea", glass: "#9fd0e4", trim: "#b7b1a4" },
  kelisa: { body: "#3cba78", glass: "#d5f3ea", trim: "#1d7a4a" },
  vellfire: { body: "#23262b", glass: "#8aa8b8", trim: "#0e1013" },
  saga: { body: "#c5ccd4", glass: "#d5edf5", trim: "#8d97a3" },
  waja: { body: "#8d3030", glass: "#e4d8c8", trim: "#5c1c1c" },
  kancil: { body: "#e09a3a", glass: "#f6ead4", trim: "#a86a16" },
  tow: { body: "#e07a3d", glass: "#1c1f1a", trim: "#8a3e12" },
  lowered: { body: "#3d5ea8", glass: "#d5dde8", trim: "#1b2744" },
  king: { body: "#f0c414", glass: "#1c1f1a", trim: "#141612" },
};

const SKY = ["#24312b", "#2a2824", "#312820", "#2c241f"];

export function drawFrame(canvas: HTMLCanvasElement, sim: Sim) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bw = Math.max(1, Math.round(rect.width * dpr));
  const bh = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx || rect.width < 2 || rect.height < 2) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width;
  const h = rect.height;
  const level = sim.viewLevel();
  const state = sim.viewState();
  const layout = layoutFor(w, h, level);
  sim.metrics = layout;

  const shake = sim.reduced ? 0 : sim.trauma * sim.trauma;
  const sx = Math.sin(sim.t * 41) * shake * 7;
  const sy = Math.cos(sim.t * 37) * shake * 5;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(sx, sy);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, SKY[level.station] ?? SKY[0]!);
  sky.addColorStop(0.42, "#1c211c");
  sky.addColorStop(1, "#12140f");
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, w + 40, h + 40);

  drawAwnings(ctx, layout, level);
  drawRoad(ctx, layout, level, sim);
  drawExit(ctx, layout, level, sim.t);

  const cellHits: ScreenHit[] = [];
  for (let r = 0; r < level.h; r++) {
    for (let c = 0; c < level.w; c++) {
      cellHits.push({ kind: "cell", c, r, poly: tile(layout, c, r, c + 1, r + 1) });
    }
  }

  for (const blocker of state.blockers) {
    if (blocker.kind === "crate") drawCrate(ctx, layout, blocker.c, blocker.r);
  }

  if (sim.ghost) {
    const car = state.cars.find((item) => item.id === sim.ghost?.id);
    if (car) drawCar(ctx, layout, car, sim.ghost.c, sim.ghost.r, sim, 0.35, false);
  }

  const ordered = [...state.cars].filter((car) => {
    if (!car.gone) return true;
    const vis = sim.visual.get(car.id);
    return !!vis && vis.flee > -0.15;
  });
  ordered.sort((a, b) => {
    const va = sim.visual.get(a.id);
    const vb = sim.visual.get(b.id);
    return (va ? va.c + va.r : 0) - (vb ? vb.c + vb.r : 0);
  });

  const carHits: ScreenHit[] = [];
  for (const car of ordered) {
    const vis = sim.visual.get(car.id) ?? { c: car.c, r: car.r, squash: 0, flee: 0 };
    const poly = drawCar(ctx, layout, car, vis.c, vis.r, sim, car.gone ? 0.85 : 1, car.id === sim.selected);
    if (!car.gone && sim.screen === "play") carHits.push({ kind: "car", id: car.id, poly });
  }

  for (const blocker of state.blockers) {
    if (blocker.kind === "rider") drawRider(ctx, layout, blocker.c, blocker.r, sim.t);
    if (blocker.kind === "aunty") drawAunty(ctx, layout, blocker.c, blocker.r, sim.t);
  }

  if (sim.tow && sim.screen === "play") drawTow(ctx, layout, sim, sim.tow.c, sim.tow.r, sim.t, sim.sami > 0);

  if (sim.uncle && sim.uncle.t < 0.85) {
    const car = state.cars.find((item) => item.id === sim.uncle?.carId);
    const u = sim.uncle.t / 0.85;
    const fromC = -0.6;
    const toC = car?.c ?? 2;
    const toR = car?.r ?? level.exitRow;
    drawPerson(ctx, layout, fromC + (toC - fromC) * u, 0.2 + (toR - 0.2) * u, sim.t, true, true);
  }

  for (const p of sim.particles) {
    const pt = project(layout, p.c, p.r);
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, p.s, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.font = "700 13px Outfit, sans-serif";
  ctx.textAlign = "center";
  for (const f of sim.floaters) {
    const pt = project(layout, f.c, f.r);
    ctx.globalAlpha = Math.max(0, f.life / f.max);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, pt.x, pt.y);
    ctx.globalAlpha = 1;
  }

  if (sim.kopiLeft > 0 && sim.screen === "play") {
    ctx.fillStyle = "rgba(20, 22, 18, 0.18)";
    ctx.fillRect(-20, -20, w + 40, h + 40);
    ctx.strokeStyle = "rgba(224, 122, 61, 0.45)";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, w - 16, h - 16);
  }

  ctx.restore();
  sim.hits = [...carHits.reverse(), ...cellHits];
}

function layoutFor(w: number, h: number, level: Level): Metrics {
  const top = Math.max(168, h * 0.24);
  const bottom = Math.max(108, h * 0.15);
  const cell = Math.max(26, Math.min((w - 28) / level.w, (h - top - bottom) / level.h));
  const gridW = cell * level.w;
  const gridH = cell * level.h;
  const ox = (w - gridW) / 2;
  const oy = top + Math.max(0, (h - top - bottom - gridH) / 2);
  return { tw: cell, th: cell, ox, oy, w, h };
}

function project(L: Metrics, c: number, r: number) {
  return { x: L.ox + c * L.tw, y: L.oy + r * L.th };
}

function tile(L: Metrics, c0: number, r0: number, c1: number, r1: number) {
  const x0 = L.ox + c0 * L.tw;
  const y0 = L.oy + r0 * L.th;
  const x1 = L.ox + c1 * L.tw;
  const y1 = L.oy + r1 * L.th;
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

type Kind = "hatch" | "egg" | "kei" | "sedan" | "sharp" | "mpv" | "stance" | "king" | "tow";

const LOOK: Record<CarStyle, { kind: Kind; girth: number; fit: number }> = {
  myvi: { kind: "hatch", girth: 0.72, fit: 0.92 },
  axia: { kind: "egg", girth: 0.62, fit: 0.8 },
  kelisa: { kind: "kei", girth: 0.78, fit: 0.9 },
  saga: { kind: "sedan", girth: 0.7, fit: 0.94 },
  waja: { kind: "sharp", girth: 0.7, fit: 0.94 },
  vellfire: { kind: "mpv", girth: 0.84, fit: 0.96 },
  kancil: { kind: "kei", girth: 0.56, fit: 0.7 },
  lowered: { kind: "stance", girth: 0.78, fit: 0.94 },
  king: { kind: "king", girth: 0.74, fit: 0.92 },
  tow: { kind: "tow", girth: 0.78, fit: 0.94 },
};

const TAG: Record<CarStyle, string> = {
  myvi: "MYVI",
  axia: "AXIA",
  kelisa: "KELISA",
  saga: "SAGA",
  waja: "WAJA",
  vellfire: "VELLFIRE",
  kancil: "KANCIL",
  lowered: "STANCE",
  king: "KING",
  tow: "TOW",
};

function drawAwnings(ctx: CanvasRenderingContext2D, L: Metrics, level: Level) {
  const shops = STATIONS[level.station]?.shops ?? STATIONS[0].shops;
  const total = L.tw * level.w;
  const y = L.oy - 36;
  const slice = total / shops.length;
  ctx.fillStyle = "#3a342c";
  ctx.fillRect(L.ox - 8, y, total + 16, 32);
  shops.forEach((name, i) => {
    const x = L.ox + i * slice;
    ctx.fillStyle = i % 2 === 0 ? "#1f8a5b" : "#e07a3d";
    ctx.fillRect(x + 3, y + 3, slice - 6, 7);
    ctx.fillStyle = "#241e18";
    ctx.fillRect(x + 3, y + 12, slice - 6, 16);
    ctx.fillStyle = "#f6f1e7";
    ctx.font = "600 10px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, x + slice / 2, y + 20, slice - 12);
  });
  ctx.textBaseline = "alphabetic";
}

function drawRoad(ctx: CanvasRenderingContext2D, L: Metrics, level: Level, sim: Sim) {
  const gw = L.tw * level.w;
  const gh = L.th * level.h;
  ctx.fillStyle = "#4a4338";
  ctx.fillRect(L.ox - 10, L.oy - 10, gw + 20, gh + 20);
  const selected = sim.viewState().cars.find((car) => car.id === sim.selected && !car.gone);

  for (let r = 0; r < level.h; r++) {
    for (let c = 0; c < level.w; c++) {
      const slope = level.slopes.some((s) => s.c === c && s.r === r);
      const towLane = !!level.tow && c === level.tow.c;
      const exit = r === level.exitRow;
      const lane =
        selected &&
        ((selected.axis === "h" && r === selected.r) || (selected.axis === "v" && c === selected.c));
      ctx.fillStyle = slope ? "#3a3424" : towLane ? "#3a2a22" : exit ? "#34382a" : (c + r) % 2 === 0 ? "#2c312b" : "#343a32";
      ctx.fillRect(L.ox + c * L.tw, L.oy + r * L.th, L.tw, L.th);
      if (lane && sim.screen === "play") {
        ctx.fillStyle = "rgba(230, 179, 37, 0.18)";
        ctx.fillRect(L.ox + c * L.tw, L.oy + r * L.th, L.tw, L.th);
      }
      if (slope) {
        const mid = project(L, c + 0.5, r + 0.5);
        ctx.fillStyle = "#e6b325";
        ctx.beginPath();
        ctx.moveTo(mid.x, mid.y + 7);
        ctx.lineTo(mid.x - 6, mid.y - 3);
        ctx.lineTo(mid.x + 6, mid.y - 3);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  ctx.strokeStyle = "rgba(246, 241, 231, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= level.w; c++) {
    ctx.moveTo(L.ox + c * L.tw, L.oy);
    ctx.lineTo(L.ox + c * L.tw, L.oy + gh);
  }
  for (let r = 0; r <= level.h; r++) {
    ctx.moveTo(L.ox, L.oy + r * L.th);
    ctx.lineTo(L.ox + gw, L.oy + r * L.th);
  }
  ctx.stroke();

  ctx.strokeStyle = "#e6b325";
  ctx.lineWidth = 2;
  ctx.strokeRect(L.ox + 1, L.oy + level.exitRow * L.th + 1, gw - 2, L.th - 2);

  if (sim.screen === "play" && level.tow) {
    ctx.fillStyle = "rgba(224, 122, 61, 0.14)";
    ctx.fillRect(L.ox + level.tow.c * L.tw, L.oy, L.tw, gh);
  }
}

function drawExit(ctx: CanvasRenderingContext2D, L: Metrics, level: Level, t: number) {
  const y = L.oy + level.exitRow * L.th;
  const x = L.ox + level.w * L.tw;
  const mid = y + L.th / 2;
  ctx.fillStyle = "#1f8a5b";
  ctx.beginPath();
  ctx.moveTo(x - 2, y + 6);
  ctx.lineTo(x + 16, mid);
  ctx.lineTo(x - 2, y + L.th - 6);
  ctx.closePath();
  ctx.fill();
  const pulse = 0.45 + Math.sin(t * 4) * 0.2;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = "#f6f1e7";
  ctx.font = "700 11px Outfit, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  if (x + 22 < L.w - 4) ctx.fillText("MAKAN", x + 18, mid);
  ctx.globalAlpha = 1;
  ctx.textBaseline = "alphabetic";
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  L: Metrics,
  car: Car,
  c: number,
  r: number,
  sim: Sim,
  alpha: number,
  selected: boolean,
) {
  const style = car.role === "player" && sim.screen === "play" ? sim.playerStyle() : car.style;
  const paint = PAINT[style];
  const look = LOOK[style];
  const along = car.len;
  const length = L.tw * along * look.fit;
  const width = L.tw * look.girth;
  const mid = project(
    L,
    c + (car.axis === "h" ? along : 1) / 2,
    r + (car.axis === "v" ? along : 1) / 2,
  );
  const ang = car.axis === "h" ? 0 : Math.PI / 2;
  const squash = sim.visual.get(car.id)?.squash ?? 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(mid.x + 2, mid.y + 5);
  ctx.rotate(ang);
  ctx.fillStyle = "rgba(8, 10, 8, 0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 0, length * 0.42, width * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(mid.x, mid.y);
  ctx.rotate(ang);
  if (squash > 0) ctx.scale(1 - squash * 0.06, 1 + squash * 0.08);
  paintLocal(ctx, look.kind, paint, length, width, car.role === "player");
  if (selected && !car.gone) {
    ctx.strokeStyle = "#e6b325";
    ctx.lineWidth = 2;
    rounded(ctx, -length / 2 - 3, -width / 2 - 3, length + 6, width + 6, 10);
    ctx.stroke();
    ctx.fillStyle = "#f6f1e7";
    ctx.beginPath();
    ctx.moveTo(length * 0.58, 0);
    ctx.lineTo(length * 0.46, -width * 0.18);
    ctx.lineTo(length * 0.46, width * 0.18);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  if (car.locked && car.phone) {
    drawTag(ctx, mid.x, mid.y, car.phone.code, true);
  } else {
    const name = car.role === "player" ? "YOU" : TAG[style];
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    ctx.font = "700 10px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#141612";
    ctx.strokeText(name, mid.x - ux * length * 0.28, mid.y - uy * length * 0.28);
    ctx.fillStyle = "#f6f1e7";
    ctx.fillText(name, mid.x - ux * length * 0.28, mid.y - uy * length * 0.28);
    ctx.textBaseline = "alphabetic";
  }

  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const vx = -uy;
  const vy = ux;
  const hl = length / 2 + 10;
  const hw = width / 2 + 10;
  return [
    { x: mid.x + ux * hl + vx * hw, y: mid.y + uy * hl + vy * hw },
    { x: mid.x - ux * hl + vx * hw, y: mid.y - uy * hl + vy * hw },
    { x: mid.x - ux * hl - vx * hw, y: mid.y - uy * hl - vy * hw },
    { x: mid.x + ux * hl - vx * hw, y: mid.y + uy * hl - vy * hw },
  ];
}

function paintLocal(
  ctx: CanvasRenderingContext2D,
  kind: Kind,
  paint: { body: string; glass: string; trim: string },
  length: number,
  width: number,
  driver: boolean,
) {
  const glass = "#10242e";
  const axle = length * (kind === "egg" ? 0.22 : 0.32);
  const track = kind === "stance" ? width * 0.62 : width * 0.5;
  const wr = kind === "stance" ? width * 0.24 : kind === "egg" ? width * 0.16 : width * 0.2;

  ctx.fillStyle = paint.body;
  if (kind === "egg") {
    ctx.beginPath();
    ctx.ellipse(0, 0, length * 0.32, width * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "sharp") {
    const nose = length / 2;
    const tail = -length / 2;
    const half = width * 0.42;
    ctx.beginPath();
    ctx.moveTo(tail, -half * 0.7);
    ctx.lineTo(tail + length * 0.16, -half);
    ctx.lineTo(nose - length * 0.22, -half);
    ctx.quadraticCurveTo(nose + length * 0.02, 0, nose - length * 0.22, half);
    ctx.lineTo(tail + length * 0.16, half);
    ctx.lineTo(tail, half * 0.7);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "hatch" || kind === "king") {
    const nose = length * 0.46;
    const tail = -length / 2;
    const half = width * 0.42;
    ctx.beginPath();
    ctx.moveTo(tail + 6, -half);
    ctx.lineTo(length * 0.12, -half);
    ctx.quadraticCurveTo(nose, -half * 0.15, nose, 0);
    ctx.quadraticCurveTo(nose, half * 0.15, length * 0.12, half);
    ctx.lineTo(tail + 6, half);
    ctx.quadraticCurveTo(tail, half, tail, 0);
    ctx.quadraticCurveTo(tail, -half, tail + 6, -half);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "tow") {
    ctx.fillStyle = "#3a3f34";
    rounded(ctx, -length / 2, -width * 0.42, length * 0.58, width * 0.84, 3);
    ctx.fill();
    ctx.fillStyle = paint.body;
    rounded(ctx, length * 0.02, -width * 0.4, length * 0.48, width * 0.8, 8);
    ctx.fill();
  } else if (kind === "kei") {
    rounded(ctx, -length / 2, -width * 0.46, length, width * 0.92, 5);
    ctx.fill();
  } else {
    const rad = kind === "mpv" ? 6 : 10;
    rounded(ctx, -length / 2, -width * 0.42, length, width * 0.84, rad);
    ctx.fill();
  }

  if (kind === "sedan" || kind === "sharp" || kind === "stance") {
    ctx.fillStyle = shade(paint.body, -28);
    ctx.fillRect(length * 0.02, -width * 0.36, length * 0.4, width * 0.72);
    ctx.fillStyle = glass;
    rounded(ctx, -length * 0.34, -width * 0.3, length * 0.32, width * 0.6, 3);
    ctx.fill();
    ctx.strokeStyle = shade(paint.body, -40);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-length * 0.36, -width * 0.34);
    ctx.lineTo(-length * 0.36, width * 0.34);
    ctx.stroke();
  } else if (kind === "kei") {
    ctx.fillStyle = glass;
    rounded(ctx, -length * 0.34, -width * 0.34, length * 0.52, width * 0.68, 2);
    ctx.fill();
  } else if (kind === "mpv") {
    ctx.fillStyle = glass;
    rounded(ctx, -length * 0.36, -width * 0.3, length * 0.55, width * 0.6, 2);
    ctx.fill();
    ctx.strokeStyle = "#d5dde8";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-length * 0.3, -width * 0.18);
    ctx.lineTo(length * 0.1, -width * 0.18);
    ctx.moveTo(-length * 0.3, width * 0.18);
    ctx.lineTo(length * 0.1, width * 0.18);
    ctx.stroke();
  } else if (kind === "egg") {
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.ellipse(-length * 0.02, 0, length * 0.16, width * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "tow") {
    ctx.fillStyle = glass;
    rounded(ctx, length * 0.12, -width * 0.24, length * 0.22, width * 0.48, 3);
    ctx.fill();
  } else {
    ctx.fillStyle = glass;
    rounded(ctx, -length * 0.08, -width * 0.28, length * 0.34, width * 0.56, 6);
    ctx.fill();
    rounded(ctx, -length * 0.4, -width * 0.22, length * 0.14, width * 0.44, 4);
    ctx.fill();
    if (kind === "king") {
      ctx.fillStyle = "#141612";
      rounded(ctx, -length * 0.16, -width * 0.26, length * 0.28, width * 0.52, 4);
      ctx.fill();
      ctx.fillStyle = glass;
      rounded(ctx, -length * 0.02, -width * 0.16, length * 0.12, width * 0.32, 3);
      ctx.fill();
      ctx.fillStyle = "#141612";
      ctx.fillRect(-length * 0.5, -width * 0.46, length * 0.08, width * 0.92);
    }
  }

  ctx.fillStyle = "#f4f7f2";
  if (kind === "kei") {
    ctx.beginPath();
    ctx.arc(length * 0.42, -width * 0.24, width * 0.16, 0, Math.PI * 2);
    ctx.arc(length * 0.42, width * 0.24, width * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#141612";
    ctx.beginPath();
    ctx.arc(length * 0.44, -width * 0.24, width * 0.06, 0, Math.PI * 2);
    ctx.arc(length * 0.44, width * 0.24, width * 0.06, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "egg") {
    ctx.beginPath();
    ctx.arc(length * 0.24, -width * 0.22, width * 0.1, 0, Math.PI * 2);
    ctx.arc(length * 0.24, width * 0.22, width * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "mpv" || kind === "tow") {
    rounded(ctx, length * 0.4, -width * 0.24, length * 0.07, width * 0.48, 2);
    ctx.fill();
  } else {
    rounded(ctx, length * 0.34, -width * 0.28, length * 0.1, width * 0.12, 2);
    ctx.fill();
    rounded(ctx, length * 0.34, width * 0.16, length * 0.1, width * 0.12, 2);
    ctx.fill();
  }

  ctx.fillStyle = "#c4312a";
  if (kind !== "tow") {
    const back = kind === "egg" ? -length * 0.28 : -length * 0.46;
    rounded(ctx, back, -width * 0.3, length * 0.07, width * 0.12, 2);
    ctx.fill();
    rounded(ctx, back, width * 0.18, length * 0.07, width * 0.12, 2);
    ctx.fill();
  }

  if (kind === "sharp") {
    ctx.strokeStyle = "#141612";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const i of [-1, 0, 1]) {
      ctx.moveTo(length * 0.26, i * width * 0.09);
      ctx.lineTo(length * 0.4, i * width * 0.09);
    }
    ctx.stroke();
  }
  if (kind === "stance") {
    ctx.fillStyle = paint.trim;
    ctx.fillRect(-length * 0.48, -width * 0.5, length * 0.06, width);
  }
  if (kind === "kei") {
    ctx.strokeStyle = "#141612";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -width * 0.1);
    ctx.lineTo(length * 0.08, -width * 0.62);
    ctx.stroke();
  }

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) wheel(ctx, sx * axle, sy * track, wr, kind === "stance" || kind === "king");
  }

  if (!driver) return;
  const dx = kind === "sedan" || kind === "sharp" || kind === "stance" ? -length * 0.16 : kind === "egg" ? 0 : length * 0.02;
  const dy = width * 0.14;
  const head = Math.max(4, width * 0.13);
  ctx.fillStyle = "#e7b48a";
  ctx.beginPath();
  ctx.arc(dx, dy, head, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#141612";
  ctx.fillRect(dx - head, dy - head * 1.2, head * 2, head * 0.75);
  ctx.strokeStyle = "#f6f1e7";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(dx, dy + head * 0.85, head * 0.75, 0, Math.PI * 2);
  ctx.stroke();
}

function wheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fancy: boolean) {
  ctx.fillStyle = "#141612";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fancy ? "#e6b325" : "#3a3f34";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.48, 0, Math.PI * 2);
  ctx.fill();
}

function drawTag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, paper: boolean) {
  ctx.save();
  ctx.font = paper ? "700 15px Outfit, sans-serif" : "700 10px Outfit, sans-serif";
  const tw = ctx.measureText(text).width;
  const pad = paper ? 8 : 5;
  const bw = tw + pad * 2;
  const bh = paper ? 20 : 14;
  ctx.fillStyle = paper ? "#e6b325" : "rgba(20, 22, 18, 0.82)";
  rounded(ctx, x - bw / 2, y - bh / 2, bw, bh, 4);
  ctx.fill();
  ctx.fillStyle = paper ? "#141612" : "#f6f1e7";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

function drawCrate(ctx: CanvasRenderingContext2D, L: Metrics, c: number, r: number) {
  const p = project(L, c + 0.5, r + 0.5);
  const s = L.tw * 0.34;
  ctx.fillStyle = "rgba(8,10,8,0.3)";
  ctx.fillRect(p.x - s + 2, p.y - s + 3, s * 2, s * 2);
  ctx.fillStyle = "#a8743c";
  rounded(ctx, p.x - s, p.y - s, s * 2, s * 2, 3);
  ctx.fill();
  ctx.strokeStyle = "#6a4a28";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - s + 3, p.y - s + 3);
  ctx.lineTo(p.x + s - 3, p.y + s - 3);
  ctx.moveTo(p.x + s - 3, p.y - s + 3);
  ctx.lineTo(p.x - s + 3, p.y + s - 3);
  ctx.stroke();
  ctx.fillStyle = "#3cba78";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawRider(ctx: CanvasRenderingContext2D, L: Metrics, c: number, r: number, t: number) {
  const p = project(L, c + 0.5, r + 0.5);
  const bob = Math.sin(t * 6) * 1.2;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.fillStyle = "rgba(8,10,8,0.3)";
  ctx.beginPath();
  ctx.ellipse(1, 8, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#141612";
  ctx.beginPath();
  ctx.arc(-7, 4, 4, 0, Math.PI * 2);
  ctx.arc(8, 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a2e28";
  rounded(ctx, -8, -2, 16, 7, 2);
  ctx.fill();
  ctx.fillStyle = "#1f8a5b";
  rounded(ctx, -5, -12, 10, 12, 3);
  ctx.fill();
  ctx.fillStyle = "#f0c9a0";
  ctx.beginPath();
  ctx.arc(0, -16, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e07a3d";
  ctx.beginPath();
  ctx.arc(8, -6, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAunty(ctx: CanvasRenderingContext2D, L: Metrics, c: number, r: number, t: number) {
  drawPerson(ctx, L, c + 0.28, r + 0.35, t, false, false);
  const p = project(L, c + 0.72, r + 0.62);
  ctx.fillStyle = "#c5ccd4";
  rounded(ctx, p.x - 7, p.y - 6, 14, 10, 2);
  ctx.fill();
  ctx.fillStyle = "#3cba78";
  ctx.fillRect(p.x - 5, p.y - 12, 10, 6);
}

function drawTow(
  ctx: CanvasRenderingContext2D,
  L: Metrics,
  sim: Sim,
  c: number,
  r: number,
  t: number,
  flash: boolean,
) {
  const fake: Car = {
    id: "tow-visual",
    name: "Tow",
    axis: "v",
    len: 2,
    c,
    r,
    role: "traffic",
    weight: "heavy",
    locked: false,
    style: "tow",
  };
  drawCar(ctx, L, fake, c, r, sim, 1, false);
  const lamp = project(L, c + 0.5, r + 0.35);
  ctx.fillStyle = flash || Math.sin(t * 18) > 0 ? "#e6b325" : "#8a3e12";
  ctx.beginPath();
  ctx.arc(lamp.x, lamp.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawPerson(
  ctx: CanvasRenderingContext2D,
  L: Metrics,
  c: number,
  r: number,
  t: number,
  running: boolean,
  uncle: boolean,
) {
  const p = project(L, c + 0.45, r + 0.55);
  const bob = Math.sin(t * (running ? 14 : 3)) * (running ? 2 : 0.6);
  ctx.fillStyle = "rgba(8,10,8,0.28)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 10, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = uncle ? "#8d3030" : "#f4f1ea";
  rounded(ctx, p.x - 5, p.y - 8 + bob, 10, 14, 3);
  ctx.fill();
  ctx.fillStyle = "#e7b48a";
  ctx.beginPath();
  ctx.arc(p.x, p.y - 14 + bob, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#141612";
  ctx.fillRect(p.x - 5, p.y - 18 + bob, 10, 3);
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}
