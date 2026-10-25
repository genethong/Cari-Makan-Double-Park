import { audio } from "./audio";
import { LEVELS, levelById, nextLevelId } from "./levels";
import { cellsOf, chebyshev, createState, dismissCar, honk, roll } from "./logic";
import { CATALOG, defaultSave, flickBonus, hasPerk, writeSave, type Save } from "./save";
import type { Car, Level, State, Tow } from "./types";

export type Pt = { x: number; y: number };
export type ScreenHit =
  | { kind: "car"; id: string; poly: Pt[] }
  | { kind: "cell"; c: number; r: number; poly: Pt[] };

type Vis = { c: number; r: number; squash: number; flee: number };
type Drag = {
  pointerId: number;
  carId: string | null;
  x: number;
  y: number;
  ox: number;
  oy: number;
  acc: number;
  lastT: number;
  vel: number;
  moved: boolean;
  lock: 0 | 1 | -1;
};

export type Floater = { c: number; r: number; text: string; life: number; max: number; color: string };
export type Particle = {
  c: number;
  r: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  s: number;
};
export type Ghost = { id: string; c: number; r: number; ok: boolean };

export type Metrics = { tw: number; th: number; ox: number; oy: number; w: number; h: number };

export class Sim {
  save: Save = defaultSave();
  screen: "title" | "map" | "garage" | "play" = "title";
  level: Level = LEVELS[0]!;
  state: State = createState(LEVELS[0]!);
  attract: State = createState(LEVELS[0]!);
  phase: "intro" | "play" | "phone" | "uncle" | "win" | "fail" | "bumper" | "pause" = "intro";
  elapsed = 0;
  budget = 70;
  extendsUsed = 0;
  kopiLeft = 0;
  kopiCharges = 1;
  honkCd = 0;
  phone: null | { carId: string; left: number; total: number; entry: string; prompt: string; code: string; shake: number } =
    null;
  uncle: null | { carId: string; t: number; released: boolean } = null;
  tow: Tow | null = null;
  towTimer = 0;
  auntyTimer = 0;
  sami = 0;
  hitstop = 0;
  trauma = 0;
  particles: Particle[] = [];
  floaters: Floater[] = [];
  selected: string | null = null;
  drag: Drag | null = null;
  ghost: Ghost | null = null;
  hits: ScreenHit[] = [];
  metrics: Metrics | null = null;
  visual = new Map<string, Vis>();
  charVis = { c: 0, r: 5 };
  introT = 0;
  bumperT = 0;
  toast = "";
  toastT = 0;
  t = 0;
  winStars = 0;
  winRm = 0;
  reduced = false;
  msgAt = -1;
  onChange: () => void = () => {};
  private uiAcc = 0;

  boot(save: Save) {
    this.save = save;
    audio.setMuted(save.mute);
    this.reduced =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  go(screen: Sim["screen"]) {
    this.screen = screen;
    this.drag = null;
    this.ghost = null;
    this.onChange();
  }

  toggleMute() {
    this.save.mute = !this.save.mute;
    audio.setMuted(this.save.mute);
    writeSave(this.save);
    this.onChange();
  }

  startLevel(id: string) {
    if (!this.save.unlocked[id]) return;
    audio.unlock();
    this.level = levelById(id);
    this.state = createState(this.level);
    this.screen = "play";
    this.phase = "intro";
    this.elapsed = 0;
    this.budget = this.level.time;
    this.extendsUsed = 0;
    this.kopiLeft = 0;
    this.kopiCharges = hasPerk(this.save, "vip") ? 2 : 1;
    this.honkCd = 0;
    this.phone = null;
    this.uncle = null;
    this.tow = this.level.tow ? { ...this.level.tow } : null;
    this.towTimer = 0;
    this.auntyTimer = 0;
    this.sami = 0;
    this.selected = "you";
    this.drag = null;
    this.ghost = null;
    this.introT = 12;
    this.winStars = 0;
    this.winRm = 0;
    this.msgAt = -1;
    this.trauma = 0;
    this.visual.clear();
    for (const car of this.state.cars) {
      this.visual.set(car.id, { c: car.c, r: car.r, squash: 0, flee: 0 });
    }
    this.charVis = { ...this.state.character };
    this.particles = [];
    this.floaters = [];
    this.toast = "";
    this.onChange();
  }

  buy(id: string) {
    const item = CATALOG.find((c) => c.id === id);
    if (!item) return;
    audio.unlock();
    if (this.save.owned.includes(id)) {
      if (item.slot === "car") this.save.car = id;
      if (item.slot === "horn") this.save.horn = id;
      writeSave(this.save);
      this.onChange();
      return;
    }
    if (this.save.ringgit < item.price) {
      this.say("Not enough ringgit yet.");
      return;
    }
    this.save.ringgit -= item.price;
    this.save.owned.push(id);
    if (item.slot === "car") this.save.car = id;
    if (item.slot === "horn") this.save.horn = id;
    writeSave(this.save);
    audio.digit();
    this.onChange();
  }

  pressHonk() {
    if (this.phase !== "play" || this.honkCd > 0) return;
    audio.unlock();
    audio.honk(this.save.horn);
    buzz(12);
    this.honkCd = 2.4;
    const removed = honk(this.state);
    const you = this.state.cars.find((car) => car.role === "player" && !car.gone);
    const origins = you ? cellsOf(you) : [this.state.character];
    const nearAunty = this.state.blockers.some(
      (blocker) => blocker.kind === "aunty" && origins.some((cell) => chebyshev(cell, blocker) <= 2),
    );
    if (removed.length) {
      this.say("Horn. The rider moved.");
      this.puff(you?.c ?? 0, you?.r ?? 0, "#1f8a5b");
      this.trauma = Math.min(1, this.trauma + 0.2);
    } else if (nearAunty) {
      this.say("Aunty is not moving. Don't honk her.");
    } else if (this.state.blockers.some((blocker) => blocker.honkable)) {
      this.say("That rider is not in your lane.");
    } else {
      this.say("Lane is clear. Drive out.");
    }
    this.onChange();
  }

  pressKopi() {
    if (this.phase !== "play" || this.kopiCharges <= 0 || this.kopiLeft > 0) return;
    audio.unlock();
    this.kopiCharges -= 1;
    this.kopiLeft = 5;
    audio.kopi();
    this.say("Bullet time. Five seconds.");
    this.onChange();
  }

  phoneDigit(d: string) {
    if (!this.phone || this.phase !== "phone") return;
    audio.unlock();
    const phone = this.phone;
    phone.entry += d;
    phone.shake = 0;
    if (!phone.code.startsWith(phone.entry)) {
      phone.entry = "";
      phone.shake = 1;
      audio.wrong();
      buzz([16, 30, 16]);
      this.onChange();
      return;
    }
    audio.digit();
    if (phone.entry === phone.code) {
      audio.unlockCar();
      this.phase = "uncle";
      this.uncle = { carId: phone.carId, t: 0, released: false };
      this.phone = null;
      this.say("He's coming. Slowly.");
    }
    this.onChange();
  }

  closePhone() {
    if (this.phase !== "phone") return;
    this.phase = "play";
    this.phone = null;
    this.onChange();
  }

  skipIntro() {
    if (this.phase !== "intro") return;
    this.phase = "play";
    this.introT = 0;
    this.onChange();
  }

  pause() {
    if (this.phase !== "play" && this.phase !== "intro") return;
    this.phase = "pause";
    this.onChange();
  }

  resume() {
    if (this.phase !== "pause") return;
    this.phase = "play";
    this.onChange();
  }

  retry() {
    this.startLevel(this.level.id);
  }

  backToMap() {
    this.screen = "map";
    this.phase = "play";
    this.drag = null;
    this.onChange();
  }

  takeCall() {
    if (this.phase !== "fail") return;
    audio.unlock();
    if (hasPerk(this.save, "vip")) {
      this.grantTime();
      return;
    }
    this.phase = "bumper";
    this.bumperT = 3.2;
    this.onChange();
  }

  payTime() {
    if (this.phase !== "fail" || this.save.ringgit < 25) return;
    this.save.ringgit -= 25;
    writeSave(this.save);
    this.grantTime();
  }

  pointerDown(x: number, y: number, pointerId: number) {
    if (this.screen !== "play") return;
    audio.unlock();
    if (this.phase === "intro") {
      this.skipIntro();
      return;
    }
    if (this.phase !== "play" || !this.metrics) return;
    const hit = this.pick(x, y);
    const now = performance.now();
    if (hit?.kind === "car") {
      const car = this.car(hit.id);
      if (car && !car.gone) {
        this.selected = car.id;
        this.drag = {
          pointerId,
          carId: car.id,
          x,
          y,
          ox: x,
          oy: y,
          acc: 0,
          lastT: now,
          vel: 0,
          moved: false,
          lock: 0,
        };
        this.onChange();
        return;
      }
    }
    if (hit?.kind === "cell") {
      this.say("You're in the yellow car. Drag a car straight.");
      this.onChange();
    }
  }

  pointerMove(x: number, y: number) {
    const drag = this.drag;
    const metrics = this.metrics;
    if (!drag?.carId || !metrics || this.phase !== "play") return;
    const car = this.car(drag.carId);
    if (!car || car.gone || car.locked) return;
    const now = performance.now();
    const dt = Math.max(0.016, (now - drag.lastT) / 1000);
    drag.lastT = now;
    const dx = x - drag.x;
    const dy = y - drag.y;
    drag.x = x;
    drag.y = y;
    if (Math.hypot(x - drag.ox, y - drag.oy) > 8) drag.moved = true;
    const axis = axisPixels(car.axis, metrics.tw, metrics.th);
    const along = dx * axis.x + dy * axis.y;
    drag.acc += along;
    drag.vel = along / dt;
    const thresh = axis.len * (car.weight === "heavy" ? 0.92 : 0.4);
    if (drag.lock !== 0 && Math.sign(drag.acc) === drag.lock && Math.abs(drag.acc) < thresh) return;
    if (drag.lock !== 0 && Math.sign(drag.acc) !== drag.lock && Math.abs(drag.acc) > 6) drag.lock = 0;
    if (Math.abs(drag.acc) >= thresh) {
      const dir = (drag.acc > 0 ? 1 : -1) as 1 | -1;
      const ok = this.tryPush(car.id, dir);
      if (ok) drag.acc -= dir * thresh;
      else {
        drag.lock = dir;
        drag.acc = 0;
      }
    }
    this.refreshGhost();
  }

  pointerUp(x: number, y: number) {
    const drag = this.drag;
    this.drag = null;
    this.ghost = null;
    if (!drag || this.phase !== "play") return;
    const dist = Math.hypot(x - drag.ox, y - drag.oy);
    if (drag.carId && !drag.moved && dist < 16) {
      const car = this.car(drag.carId);
      if (car?.locked) this.openPhone(car);
      else this.selected = drag.carId;
      this.onChange();
      return;
    }
    if (!drag.carId || !this.metrics) {
      this.onChange();
      return;
    }
    const car = this.car(drag.carId);
    if (!car || car.gone || car.locked) return;
    const axis = axisPixels(car.axis, this.metrics.tw, this.metrics.th);
    const flick = car.weight === "light" && Math.abs(drag.vel) > axis.len * 6.5;
    if (flick) {
      const extra = 1 + flickBonus(this.save);
      const dir = (drag.vel >= 0 ? 1 : -1) as 1 | -1;
      for (let i = 0; i < extra; i++) {
        if (this.phase !== "play") break;
        if (!this.tryPush(car.id, dir)) break;
      }
    }
    this.onChange();
  }

  step(dt: number) {
    this.t += dt;
    audio.tick(dt);
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      return;
    }
    if (this.toastT > 0) this.toastT = Math.max(0, this.toastT - dt);
    if (this.screen !== "play") {
      this.easeChar(dt, this.attract.character, true);
      return;
    }
    const scale = this.kopiLeft > 0 ? 0.34 : 1;
    if (this.kopiLeft > 0) this.kopiLeft = Math.max(0, this.kopiLeft - dt);
    if (this.honkCd > 0) this.honkCd = Math.max(0, this.honkCd - dt);
    if (this.sami > 0) this.sami = Math.max(0, this.sami - dt);
    if (this.phone) this.phone.shake = Math.max(0, this.phone.shake - dt * 3);

    if (this.phase === "intro") {
      this.introT -= dt;
      if (this.introT <= 0) {
        this.phase = "play";
        this.onChange();
      }
    } else if (this.phase === "phone" && this.phone) {
      this.phone.left -= dt;
      if (this.phone.left <= 0) {
        this.phase = "play";
        this.phone = null;
        this.say("No answer. Read it faster.");
        audio.wrong();
      }
    } else if (this.phase === "uncle" && this.uncle) {
      this.uncle.t += dt;
      if (!this.uncle.released && this.uncle.t > 0.72) {
        this.uncle.released = true;
        const car = this.car(this.uncle.carId);
        dismissCar(this.state, this.uncle.carId);
        const vis = car ? this.visual.get(car.id) : undefined;
        if (vis) vis.flee = 1.1;
        this.puff(car?.c ?? 0, car?.r ?? 0, "#f6f1e7");
        audio.slide(false);
      }
      if (this.uncle.t > 1.45) {
        this.phase = "play";
        this.uncle = null;
        this.onChange();
      }
    } else if (this.phase === "bumper") {
      this.bumperT -= dt;
      if (this.bumperT <= 0) this.grantTime();
    } else if (this.phase === "play") {
      this.elapsed += dt * scale;
      this.stepHazards(dt);
      this.syncBoss();
      if (this.state.won) this.finishWin();
      else if (this.elapsed >= this.budget) this.finishFail();
    }

    this.easeCars(dt);
    this.easeChar(dt, this.state.character, false);
    this.decayFx(dt);
    this.uiAcc += dt;
    if (this.uiAcc > 0.12 && (this.phase === "play" || this.phase === "phone" || this.phase === "bumper")) {
      this.uiAcc = 0;
      this.onChange();
    }
  }

  bossText() {
    let text = this.level.bosses[0]?.text ?? "";
    for (const line of this.level.bosses) {
      if (this.elapsed >= line.at) text = line.text;
    }
    return text;
  }

  objective() {
    const riders = this.state.blockers.filter((blocker) => blocker.honkable);
    if (riders.length) return "Honk. You are already in the car. The rider is in your lane.";
    const locked = this.state.cars.find((car) => car.locked && !car.gone);
    if (locked) return `Tap ${locked.name}. Type the orange digits on the glass.`;
    if (this.tow) return "Clear the gold lane. Drive out when the tow is not on you.";
    return "Drag cars off the gold lane, then drive out the green arrow.";
  }

  timeLeft() {
    return Math.max(0, this.budget - this.elapsed);
  }

  playerStyle() {
    if (this.save.car === "lowered") return "lowered" as const;
    if (this.save.car === "king") return "king" as const;
    return "myvi" as const;
  }

  viewLevel() {
    return this.screen === "play" ? this.level : LEVELS[0]!;
  }

  viewState() {
    return this.screen === "play" ? this.state : this.attract;
  }

  private finishWin() {
    if (this.phase === "win") return;
    this.phase = "win";
    const left = this.timeLeft();
    const ratio = left / this.level.time;
    let stars = ratio >= 0.5 ? 3 : ratio >= 0.22 ? 2 : 1;
    if (this.extendsUsed) stars = Math.min(stars, 2);
    let rm = Math.round(36 * stars + left);
    if (hasPerk(this.save, "bobble")) rm = Math.round(rm * 1.15);
    this.winStars = stars;
    this.winRm = rm;
    this.save.ringgit += rm;
    this.save.stars[this.level.id] = Math.max(this.save.stars[this.level.id] ?? 0, stars);
    const next = nextLevelId(this.level.id);
    if (next) this.save.unlocked[next] = true;
    writeSave(this.save);
    audio.win();
    this.trauma = Math.min(1, this.trauma + 0.45);
    const you = this.state.cars.find((c) => c.role === "player");
    this.puff(you?.c ?? this.level.w, this.level.exitRow, "#e6b325");
    this.float(this.level.w - 0.2, this.level.exitRow, `+RM ${rm}`, "#e6b325");
    this.onChange();
  }

  private finishFail() {
    if (this.phase === "fail") return;
    this.phase = "fail";
    audio.fail();
    this.onChange();
  }

  private grantTime() {
    this.budget += 15;
    this.extendsUsed += 1;
    this.phase = "play";
    this.bumperT = 0;
    this.say("Meeting delayed. Fifteen seconds.");
    audio.ping();
    this.onChange();
  }

  private openPhone(car: Car) {
    if (!car.phone) return;
    const total = hasPerk(this.save, "tissue") ? 14 : 10;
    this.phase = "phone";
    this.phone = {
      carId: car.id,
      left: total,
      total,
      entry: "",
      prompt: car.phone.prompt,
      code: car.phone.code,
      shake: 0,
    };
    this.ghost = null;
    audio.ping();
    this.onChange();
  }

  private tryPush(id: string, dir: 1 | -1) {
    if (this.phase !== "play") return false;
    const car = this.car(id);
    if (!car || car.gone || car.locked) return false;
    const res = roll(this.level, this.state, id, dir);
    if (res.steps <= 0) {
      this.bumpFx(car);
      return false;
    }
    audio.slide(car.weight === "heavy");
    buzz(car.weight === "heavy" ? 18 : 8);
    this.puff(car.c, car.r, car.weight === "heavy" ? "#b7b1a4" : "#f6f1e7");
    if (res.bumped) this.bumpFx(car);
    this.checkSaman();
    if (res.won || this.state.won) this.finishWin();
    this.onChange();
    return true;
  }

  private bumpFx(car: Car) {
    audio.bump(car.weight === "heavy");
    buzz(car.weight === "heavy" ? [20, 36, 20] : 28);
    this.trauma = Math.min(1, this.trauma + (car.weight === "heavy" ? 0.55 : 0.34));
    this.hitstop = this.reduced ? 0 : car.weight === "heavy" ? 0.06 : 0.04;
    const vis = this.visual.get(car.id);
    if (vis) vis.squash = 1;
    this.float(car.c + car.len * 0.3, car.r, "bonk", "#e07a3d");
  }

  private stepHazards(dt: number) {
    const scaled = dt * (this.kopiLeft > 0 ? 0.34 : 1);
    this.auntyTimer += scaled;
    if (this.auntyTimer >= 0.85) {
      this.auntyTimer = 0;
      for (const blocker of this.state.blockers) {
        if (!blocker.patrol) continue;
        const next = blocker.c + blocker.patrol.dir;
        if (
          next < blocker.patrol.min ||
          next > blocker.patrol.max ||
          this.occupied(next, blocker.r, blocker.id)
        ) {
          blocker.patrol.dir = blocker.patrol.dir === 1 ? -1 : 1;
        } else {
          blocker.c = next;
        }
      }
    }
    if (!this.tow) return;
    this.towTimer += scaled;
    if (this.towTimer >= this.tow.interval) {
      this.towTimer = 0;
      const next = this.tow.r + this.tow.dir;
      if (next < this.tow.min || next > this.tow.max) this.tow.dir = this.tow.dir === 1 ? -1 : 1;
      else this.tow.r = next;
      this.checkSaman();
    }
  }

  private checkSaman() {
    if (!this.tow || this.sami > 0 || this.phase !== "play") return;
    const player = this.state.cars.find((c) => c.role === "player" && !c.gone);
    if (!player) return;
    const mine = cellsOf(player);
    let hit = false;
    for (let i = 0; i < this.tow.len; i++) {
      const c = this.tow.c;
      const r = this.tow.r + i;
      if (mine.some((cell) => cell.c === c && cell.r === r)) hit = true;
    }
    if (!hit) return;
    this.sami = 2;
    this.elapsed += 8;
    this.trauma = Math.min(1, this.trauma + (this.reduced ? 0 : 0.7));
    this.hitstop = this.reduced ? 0 : 0.05;
    this.float(player.c + 0.4, player.r, "SAMAN −8s", "#e07a3d");
    audio.saman();
    buzz([22, 40, 22]);
  }

  private occupied(c: number, r: number, ignore: string) {
    if (this.state.blockers.some((b) => b.id !== ignore && b.c === c && b.r === r)) return true;
    return this.state.cars.some((car) => !car.gone && cellsOf(car).some((cell) => cell.c === c && cell.r === r));
  }

  private syncBoss() {
    let idx = 0;
    this.level.bosses.forEach((line, i) => {
      if (this.elapsed >= line.at) idx = i;
    });
    if (idx !== this.msgAt) {
      if (this.msgAt >= 0) audio.ping();
      this.msgAt = idx;
      this.onChange();
    }
  }

  private easeCars(dt: number) {
    for (const car of this.state.cars) {
      const vis = this.visual.get(car.id);
      if (!vis) continue;
      vis.squash = Math.max(0, vis.squash - dt * 3.2);
      if (car.gone) {
        if (vis.flee > 0) {
          vis.flee -= dt;
          const speed = this.reduced ? 8 : 3.4;
          if (car.axis === "h") vis.c += speed * dt;
          else vis.r -= speed * dt;
        }
        continue;
      }
      const dist = Math.hypot(car.c - vis.c, car.r - vis.r);
      if (dist < 0.004) {
        vis.c = car.c;
        vis.r = car.r;
        continue;
      }
      const kopi = this.kopiLeft > 0 ? 0.42 : 1;
      const weight = car.weight === "heavy" ? 0.62 : 1;
      const speed = (this.reduced ? 16 : 6.2) * kopi * weight * (0.45 + Math.min(1.2, dist));
      const step = Math.min(dist, speed * dt);
      vis.c += ((car.c - vis.c) / dist) * step;
      vis.r += ((car.r - vis.r) / dist) * step;
    }
  }

  private easeChar(dt: number, target: { c: number; r: number }, attract: boolean) {
    const destC = attract ? 1.2 + Math.sin(this.t * 0.45) * 0.8 : target.c;
    const destR = attract ? 4.2 : target.r;
    const k = 1 - Math.exp(-10 * dt);
    this.charVis.c += (destC - this.charVis.c) * k;
    this.charVis.r += (destR - this.charVis.r) * k;
  }

  private decayFx(dt: number) {
    const traumaDrop = this.reduced ? 4 : 1.7;
    this.trauma = Math.max(0, this.trauma - dt * traumaDrop);
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      p.c += p.vx * dt;
      p.r += p.vy * dt;
      p.vy += dt * 0.4;
      return p.life > 0;
    });
    this.floaters = this.floaters.filter((f) => {
      f.life -= dt;
      f.r -= dt * 0.35;
      return f.life > 0;
    });
    if (this.particles.length > 90) this.particles.splice(0, this.particles.length - 90);
  }

  private refreshGhost() {
    const drag = this.drag;
    if (!drag?.carId || Math.abs(drag.acc) < 10) {
      this.ghost = null;
      return;
    }
    const dir = (drag.acc > 0 ? 1 : -1) as 1 | -1;
    const copy = structuredClone(this.state);
    const res = roll(this.level, copy, drag.carId, dir);
    const car = copy.cars.find((c) => c.id === drag.carId);
    if (!car) {
      this.ghost = null;
      return;
    }
    this.ghost = { id: car.id, c: car.gone ? this.level.w + 0.2 : car.c, r: car.r, ok: res.steps > 0 };
  }

  private pick(x: number, y: number) {
    for (const hit of this.hits) {
      if (inside(x, y, hit.poly)) return hit;
    }
    return null;
  }

  private car(id: string) {
    return this.state.cars.find((c) => c.id === id);
  }

  private say(text: string) {
    this.toast = text;
    this.toastT = 2.3;
    this.onChange();
  }

  private float(c: number, r: number, text: string, color: string) {
    this.floaters.push({ c, r, text, life: 0.9, max: 0.9, color });
  }

  private puff(c: number, r: number, color: string) {
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        c: c + Math.random(),
        r: r + Math.random() * 0.6,
        vx: (Math.random() - 0.5) * 1.4,
        vy: -Math.random() * 0.8,
        life: 0.35 + Math.random() * 0.25,
        max: 0.6,
        color,
        s: 2 + Math.random() * 3,
      });
    }
  }
}

function axisPixels(axis: "h" | "v", tw: number, th: number) {
  const v = axis === "h" ? { x: tw, y: 0 } : { x: 0, y: th };
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len, len };
}

function inside(x: number, y: number, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (!pi || !pj) continue;
    if (pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y || 0.00001) + pi.x) {
      c = !c;
    }
  }
  return c;
}

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* some browsers throw if vibration is blocked */
  }
}
