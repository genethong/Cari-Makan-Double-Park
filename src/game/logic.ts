import type { Axis, Car, Level, PushResult, State } from "./types";

export function cellKey(c: number, r: number) {
  return `${c},${r}`;
}

export function inBoard(level: Level, c: number, r: number) {
  return c >= 0 && r >= 0 && c < level.w && r < level.h;
}

export function cellsOf(car: Pick<Car, "axis" | "len" | "c" | "r">) {
  const cells: { c: number; r: number }[] = [];
  for (let i = 0; i < car.len; i++) {
    cells.push(car.axis === "h" ? { c: car.c + i, r: car.r } : { c: car.c, r: car.r + i });
  }
  return cells;
}

export function createState(level: Level): State {
  return {
    cars: level.cars.map((c) => ({
      ...c,
      phone: c.phone ? { ...c.phone } : undefined,
      gone: false,
    })),
    blockers: level.blockers.map((b) => ({
      ...b,
      patrol: b.patrol ? { ...b.patrol } : undefined,
    })),
    character: { ...level.char },
    won: false,
  };
}

function shifted(car: Car, dir: 1 | -1) {
  return car.axis === "h" ? { c: car.c + dir, r: car.r } : { c: car.c, r: car.r + dir };
}

function isPlayerExit(level: Level, car: Car, c: number, r: number) {
  return car.role === "player" && r === level.exitRow && c >= level.w && c < level.w + 4;
}

type Hit = "free" | "wall" | "blocker" | { car: Car };

function classify(level: Level, state: State, car: Car, c: number, r: number): Hit {
  const cells = cellsOf({ ...car, c, r });
  let hit: Car | null = null;
  for (const cell of cells) {
    if (!inBoard(level, cell.c, cell.r)) {
      if (!isPlayerExit(level, car, cell.c, cell.r)) return "wall";
      continue;
    }
    if (state.blockers.some((b) => b.c === cell.c && b.r === cell.r)) return "blocker";
    for (const other of state.cars) {
      if (other.gone || other.id === car.id) continue;
      if (cellsOf(other).some((k) => k.c === cell.c && k.r === cell.r)) {
        if (hit && hit.id !== other.id) return "wall";
        hit = other;
      }
    }
  }
  return hit ? { car: hit } : "free";
}

function fullyOut(level: Level, car: Car) {
  return cellsOf(car).every((k) => k.c >= level.w);
}

function nudge(level: Level, state: State, carId: string, dir: 1 | -1, depth: number): boolean {
  if (depth > 4) return false;
  const car = state.cars.find((c) => c.id === carId && !c.gone);
  if (!car || car.locked) return false;
  const dest = shifted(car, dir);
  const hit = classify(level, state, car, dest.c, dest.r);
  if (hit === "wall" || hit === "blocker") return false;
  if (typeof hit === "object") {
    const other = hit.car;
    if (
      other.locked ||
      other.axis !== car.axis ||
      other.weight === "heavy" ||
      car.weight === "heavy"
    ) {
      return false;
    }
    if (roll(level, state, other.id, dir, depth + 1).steps <= 0) return false;
  }
  if (classify(level, state, car, dest.c, dest.r) !== "free") return false;
  car.c = dest.c;
  car.r = dest.r;
  if (car.role === "player" && fullyOut(level, car)) {
    car.gone = true;
    state.won = true;
  }
  return true;
}

function onSlope(level: Level, car: Car, dir: 1 | -1) {
  if (car.weight !== "light" || car.gone) return false;
  const cells = cellsOf(car);
  const lead = dir > 0 ? cells[cells.length - 1] : cells[0];
  if (!lead) return false;
  return level.slopes.some(
    (s) => s.c === lead.c && s.r === lead.r && s.axis === car.axis && s.dir === dir,
  );
}

export function roll(
  level: Level,
  state: State,
  carId: string,
  dir: 1 | -1,
  depth = 0,
): PushResult {
  if (!nudge(level, state, carId, dir, depth)) {
    return { steps: 0, bumped: true, won: state.won };
  }
  let steps = 1;
  let bumped = false;
  const car = () => state.cars.find((c) => c.id === carId);
  while (steps < 6) {
    const current = car();
    if (!current || current.gone || state.won || !onSlope(level, current, dir)) break;
    if (!nudge(level, state, carId, dir, depth)) {
      bumped = true;
      break;
    }
    steps++;
  }
  return { steps, bumped, won: state.won };
}

export function chebyshev(a: { c: number; r: number }, b: { c: number; r: number }) {
  return Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));
}

export function honk(state: State) {
  const player = state.cars.find((car) => car.role === "player" && !car.gone);
  const origins = player ? cellsOf(player) : [state.character];
  const removed: string[] = [];
  state.blockers = state.blockers.filter((blocker) => {
    if (!blocker.honkable) return true;
    const inLane = origins.some((cell) => cell.r === blocker.r || chebyshev(cell, blocker) <= 2);
    if (inLane) {
      removed.push(blocker.id);
      return false;
    }
    return true;
  });
  return removed;
}

export function dismissCar(state: State, carId: string) {
  const car = state.cars.find((c) => c.id === carId);
  if (!car || !car.locked) return false;
  car.locked = false;
  car.gone = true;
  return true;
}

export function canStand(level: Level, state: State, c: number, r: number) {
  if (!inBoard(level, c, r)) return false;
  if (state.blockers.some((b) => b.c === c && b.r === r && !b.honkable)) return false;
  return !state.cars.some(
    (car) => !car.gone && cellsOf(car).some((k) => k.c === c && k.r === r),
  );
}

export function validateLevel(level: Level) {
  const seen = new Map<string, string>();
  const problems: string[] = [];
  for (const car of level.cars) {
    for (const cell of cellsOf(car)) {
      if (!inBoard(level, cell.c, cell.r)) {
        problems.push(`${car.id} out of bounds ${cell.c},${cell.r}`);
      }
      const key = cellKey(cell.c, cell.r);
      const prev = seen.get(key);
      if (prev) problems.push(`${car.id} overlaps ${prev} at ${key}`);
      seen.set(key, car.id);
    }
    if (car.axis === "h" && car.r === level.exitRow && car.role !== "player") {
      problems.push(`${car.id} is a horizontal blocker stuck on the exit row`);
    }
  }
  for (const b of level.blockers) {
    if (!inBoard(level, b.c, b.r)) problems.push(`${b.id} out of bounds`);
    const key = cellKey(b.c, b.r);
    const prev = seen.get(key);
    if (prev) problems.push(`${b.id} overlaps ${prev}`);
    seen.set(key, b.id);
  }
  if (!canStand(level, createState(level), level.char.c, level.char.r)) {
    problems.push("character spawn is inside a car");
  }
  const player = level.cars.find((c) => c.role === "player");
  if (!player || player.axis !== "h" || player.r !== level.exitRow) {
    problems.push("player must be a horizontal car on the exit row");
  }
  return problems;
}

function cloneState(state: State): State {
  return {
    cars: state.cars.map((c) => ({ ...c })),
    blockers: state.blockers.map((b) => ({ ...b })),
    character: { ...state.character },
    won: state.won,
  };
}

function stateKey(state: State, trackChar: boolean) {
  const cars = state.cars
    .filter((c) => !c.gone)
    .map((c) => `${c.id}:${c.c},${c.r},${c.locked ? 1 : 0}`)
    .sort()
    .join("|");
  const blocks = state.blockers
    .map((b) => b.id)
    .sort()
    .join(",");
  const ch = trackChar ? `@${state.character.c},${state.character.r}` : "";
  return `${cars}#${blocks}${ch}`;
}

export function solve(level: Level, maxNodes = 80000): string[] | null {
  const start = createState(level);
  const trackChar = start.blockers.some((b) => b.honkable);
  const queue: { state: State; path: string[] }[] = [{ state: start, path: [] }];
  const seen = new Set<string>([stateKey(start, trackChar)]);
  let nodes = 0;
  while (queue.length && nodes < maxNodes) {
    const current = queue.shift()!;
    nodes++;
    if (current.state.won) return current.path;
    if (current.path.length > 24) continue;

    for (const car of current.state.cars) {
      if (car.gone || car.locked) continue;
      for (const dir of [1, -1] as const) {
        const next = cloneState(current.state);
        const result = roll(level, next, car.id, dir);
        if (result.steps <= 0) continue;
        const key = stateKey(next, trackChar);
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ state: next, path: [...current.path, `${car.id}:${dir > 0 ? "+" : "-"}`] });
      }
    }

    for (const car of current.state.cars) {
      if (!car.locked || car.gone) continue;
      const next = cloneState(current.state);
      dismissCar(next, car.id);
      const key = stateKey(next, trackChar);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ state: next, path: [...current.path, `call:${car.id}`] });
    }

    if (trackChar && current.state.blockers.some((blocker) => blocker.honkable)) {
      const next = cloneState(current.state);
      const removed = honk(next);
      if (removed.length) {
        const key = stateKey(next, trackChar);
        if (!seen.has(key)) {
          seen.add(key);
          queue.push({ state: next, path: [...current.path, "honk"] });
        }
      }
    }
  }
  return null;
}

export function axisUnit(axis: Axis): { x: number; y: number } {
  const v = axis === "h" ? { x: 1, y: 0.5 } : { x: -1, y: 0.5 };
  const len = Math.hypot(v.x, v.y);
  return { x: v.x / len, y: v.y / len };
}
