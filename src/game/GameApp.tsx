import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  Coffee,
  Lock,
  Megaphone,
  Pause,
  RotateCcw,
  ShoppingBag,
  Star,
  Volume2,
  VolumeX,
} from "lucide-react";
import { audio } from "./audio";
import { LEVELS, STATIONS } from "./levels";
import { drawFrame } from "./render";
import { loadSave, writeSave, CATALOG } from "./save";
import { Sim } from "./sim";

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim | null>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const sim = new Sim();
    sim.boot(loadSave());
    sim.onChange = () => setTick((n) => n + 1);
    simRef.current = sim;
    if (import.meta.env.DEV) {
      (window as unknown as { __park?: Sim }).__park = sim;
    }
    setReady(true);
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim.step(dt);
      const canvas = canvasRef.current;
      if (canvas) drawFrame(canvas, sim);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const onHide = () => {
      if (document.visibilityState === "hidden") writeSave(sim.save);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const rel = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      const p = rel(e);
      sim.pointerDown(p.x, p.y, e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const p = rel(e);
      sim.pointerMove(p.x, p.y);
    };
    const up = (e: PointerEvent) => {
      const p = rel(e);
      sim.pointerUp(p.x, p.y);
    };
    const kill = (e: Event) => e.preventDefault();
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("contextmenu", kill);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("contextmenu", kill);
    };
  }, [ready]);

  const sim = simRef.current;
  void tick;

  return (
    <div className="relative mx-auto h-dvh w-full max-w-[480px] overflow-hidden bg-asphalt text-fg select-none">
      <canvas ref={canvasRef} className="absolute inset-0 z-0 h-full w-full touch-none" />
      {!ready || !sim || sim.screen === "title" ? <Title sim={ready ? sim : null} /> : null}
      {ready && sim?.screen === "map" ? <MapScreen sim={sim} /> : null}
      {ready && sim?.screen === "garage" ? <Garage sim={sim} /> : null}
      {ready && sim?.screen === "play" ? <Play sim={sim} /> : null}
    </div>
  );
}

function Title({ sim }: { sim: Sim | null }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col">
      <div className="safe-top bg-asphalt/80 px-6 pt-8 pb-6">
        <p className="text-xs font-medium tracking-widest text-kopi uppercase">Klang Valley crawl</p>
        <h1 className="font-display text-5xl leading-none font-semibold text-fg">Cari Makan</h1>
        <p className="font-display text-2xl text-gold italic">double-park</p>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
          You drive the yellow car. Drag everyone else straight off your lane.
        </p>
      </div>
      <div className="flex-1" />
      <div className="safe-bot bg-asphalt/85 px-6 pt-4 pb-6">
        <button
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-gold text-base font-bold text-ink"
          onClick={() => {
            audio.unlock();
            sim?.go("map");
          }}
        >
          Start the crawl
        </button>
        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <span>SS15 · Uptown · Pudu · Petaling</span>
          <Mute sim={sim} />
        </div>
      </div>
    </div>
  );
}

function MapScreen({ sim }: { sim: Sim }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-asphalt/90">
      <header className="safe-top flex items-center justify-between px-4 pt-4 pb-3">
        <div>
          <p className="text-xs tracking-widest text-muted uppercase">Four stops</p>
          <h2 className="font-display text-3xl">Where to eat</h2>
        </div>
        <div className="flex items-center gap-2">
          <Mute sim={sim} />
          <button
            className="flex h-11 items-center gap-2 rounded-full bg-panel px-3 text-sm font-semibold text-fg"
            onClick={() => sim.go("garage")}
          >
            <ShoppingBag className="size-4 text-gold" />
            RM {sim.save.ringgit}
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="mb-4 rounded-2xl border border-line bg-panel p-4">
          <p className="text-xs font-semibold text-mamak">You are the driver</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            The yellow car is yours. Drag other cars up, down, left, or right. Honk from your seat. A locked car has the number in orange on the glass.
          </p>
        </div>
        <div className="relative space-y-6 pl-7">
          <div className="absolute top-2 bottom-2 left-2 w-px bg-line" />
          {STATIONS.map((station, index) => (
            <section key={station.id} className="relative">
              <span className="absolute top-1 -left-7 size-3 rounded-full bg-mamak" />
              <p className="text-xs text-muted">
                {station.area}
              </p>
              <h3 className="font-display text-2xl">{station.name}</h3>
              <p className="mb-3 text-sm text-muted">{station.line}</p>
              <div className="grid gap-2">
                {LEVELS.filter((level) => level.station === index).map((level) => {
                  const open = !!sim.save.unlocked[level.id];
                  const stars = sim.save.stars[level.id] ?? 0;
                  return (
                    <button
                      key={level.id}
                      disabled={!open}
                      onClick={() => sim.startLevel(level.id)}
                      className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-left disabled:opacity-40"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs text-kopi">
                          {open ? `Stop ${index + 1} · Bay ${level.bay}` : "Clear the bay above to unlock"}
                        </span>
                        <span className="block font-semibold">{level.name}</span>
                        <span className="block text-sm text-muted">{level.blurb}</span>
                      </span>
                      {open ? <Stars n={stars} /> : <Lock className="size-4 text-muted" />}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Garage({ sim }: { sim: Sim }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-asphalt">
      <header className="safe-top flex items-center gap-3 px-3 pt-3 pb-2">
        <button className="flex size-11 items-center justify-center rounded-full bg-panel" onClick={() => sim.go("map")}>
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex-1">
          <h2 className="font-display text-2xl">Dashboard</h2>
          <p className="text-sm text-muted">RM {sim.save.ringgit} in the coin tray</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-6">
        {CATALOG.map((item) => {
          const owned = sim.save.owned.includes(item.id);
          const equipped = item.slot === "car" ? sim.save.car === item.id : item.slot === "horn" ? sim.save.horn === item.id : owned;
          return (
            <button
              key={item.id}
              onClick={() => sim.buy(item.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {item.name}
                  {equipped && item.slot !== "perk" ? <span className="text-mamak"> · on</span> : null}
                  {item.slot === "perk" && owned ? <span className="text-mamak"> · fitted</span> : null}
                </span>
                <span className="block text-sm text-muted">{item.detail}</span>
              </span>
              <span className="shrink-0 text-sm font-bold text-gold">
                {owned ? (item.slot === "perk" ? "Kept" : equipped ? "Using" : "Use") : `RM ${item.price}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Play({ sim }: { sim: Sim }) {
  const left = sim.timeLeft();
  const ratio = sim.level.time > 0 ? left / sim.level.time : 0;
  let live = ratio >= 0.5 ? 3 : ratio >= 0.22 ? 2 : 1;
  if (sim.extendsUsed) live = Math.min(live, 2);
  const pct = sim.budget > 0 ? Math.max(0, Math.min(100, (left / sim.budget) * 100)) : 0;
  const critical = left < sim.level.time * 0.22;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
      <header className="safe-top pointer-events-auto px-3 pt-3">
        <div className="rounded-2xl border border-line bg-panel/95 px-3 py-2">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm leading-snug">{sim.bossText()}</p>
            <Stars n={live} />
            <span className={`font-bold tabular-nums ${critical ? "text-kopi" : "text-fg"}`}>{clock(left)}</span>
            <button className="flex size-9 items-center justify-center rounded-full bg-asphalt" onClick={() => sim.pause()}>
              <Pause className="size-4" />
            </button>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div className={`h-full ${critical ? "bg-kopi" : "bg-mamak"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </header>
      <div className="flex-1" />
      {sim.toastT > 0 ? (
        <p className="mb-2 px-6 text-center text-sm font-medium">{sim.toast}</p>
      ) : (
        <p className="mb-2 px-6 text-center text-xs text-muted">{sim.objective()}</p>
      )}
      <footer className="safe-bot pointer-events-auto grid grid-cols-3 gap-2 px-3 pb-3">
        <button
          className="flex h-14 flex-col items-center justify-center rounded-2xl bg-mamak text-ink disabled:opacity-40"
          onClick={() => sim.pressHonk()}
          disabled={sim.honkCd > 0 || sim.phase !== "play"}
        >
          <Megaphone className="size-5" />
          <span className="text-xs font-bold">{sim.honkCd > 0 ? "Wait" : "Honk"}</span>
        </button>
        <button
          className="flex h-14 flex-col items-center justify-center rounded-2xl bg-kopi text-ink disabled:opacity-40"
          onClick={() => sim.pressKopi()}
          disabled={sim.kopiCharges <= 0 || sim.kopiLeft > 0 || sim.phase !== "play"}
        >
          <Coffee className="size-5" />
          <span className="text-xs font-bold">
            {sim.kopiLeft > 0 ? `${sim.kopiLeft.toFixed(1)}s` : `Kopi ${sim.kopiCharges}`}
          </span>
        </button>
        <button
          className="flex h-14 flex-col items-center justify-center rounded-2xl bg-panel text-fg"
          onClick={() => sim.backToMap()}
        >
          <span className="text-xs font-bold text-gold">RM {sim.save.ringgit}</span>
          <span className="text-xs text-muted">Map</span>
        </button>
      </footer>
      {sim.phase === "intro" ? <Intro sim={sim} /> : null}
      {sim.phase === "phone" && sim.phone ? <Phone sim={sim} /> : null}
      {sim.phase === "pause" ? <PauseCard sim={sim} /> : null}
      {sim.phase === "win" ? <WinCard sim={sim} /> : null}
      {sim.phase === "fail" ? <FailCard sim={sim} /> : null}
      {sim.phase === "bumper" ? <Bumper sim={sim} /> : null}
    </div>
  );
}

function Intro({ sim }: { sim: Sim }) {
  return (
    <button className="pointer-events-auto absolute inset-0 flex items-end bg-ink/35 p-4" onClick={() => sim.skipIntro()}>
      <div className="pop-in w-full rounded-3xl bg-panel p-5 text-left">
        <p className="text-xs font-semibold tracking-widest text-kopi uppercase">
          {STATIONS[sim.level.station]?.name} · Bay {sim.level.bay}
        </p>
        <h3 className="font-display text-3xl">{sim.level.name}</h3>
        <p className="mt-2 text-sm text-muted">{sim.level.blurb}</p>
        <p className="mt-3 text-sm">{sim.level.coach}</p>
        <p className="mt-4 text-xs font-bold text-gold">Tap to drop the handbrake</p>
      </div>
    </button>
  );
}

function Phone({ sim }: { sim: Sim }) {
  const phone = sim.phone;
  if (!phone) return null;
  const shown = fillPrompt(phone.prompt, phone.entry);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "×"];
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 rounded-t-3xl border border-line bg-panel px-4 pt-4 safe-bot"
      style={{ transform: phone.shake > 0 ? `translateX(${Math.sin(phone.shake * 40) * 8}px)` : undefined }}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted">Windshield receipt</p>
        <p className="font-bold text-kopi tabular-nums">{phone.left.toFixed(1)}s</p>
      </div>
      <div className="mb-3 rounded-2xl bg-fg px-4 py-3 text-ink">
        <p className="text-xs font-semibold">Same note as the glass</p>
        <p className="mt-1 font-display text-2xl leading-tight tracking-wide">
          {markReceipt(phone.prompt, phone.code).map((part, index) =>
            part.hot ? (
              <span key={index} className="mx-0.5 inline-block rounded-md bg-kopi px-1 text-ink">
                {part.text}
              </span>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
        </p>
        <p className="mt-1 text-sm">Type the orange digits, left to right. They are also stuck on the car.</p>
      </div>
      <p className="mb-3 font-display text-xl tracking-wide text-muted">{shown}</p>
      <div className="grid grid-cols-3 gap-2 pb-4">
        {keys.map((key) => (
          <button
            key={key}
            className="h-12 rounded-xl bg-asphalt text-lg font-bold"
            onClick={() => {
              if (key === "×") sim.closePhone();
              else if (key === "⌫") {
                if (sim.phone) sim.phone.entry = sim.phone.entry.slice(0, -1);
                sim.onChange();
              } else sim.phoneDigit(key);
            }}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}

function PauseCard({ sim }: { sim: Sim }) {
  return (
    <Sheet>
      <h3 className="font-display text-3xl">Handbrake on</h3>
      <p className="mt-1 text-sm text-muted">The boss clock is holding. The tow is not a patient vehicle, but it waits with you.</p>
      <div className="mt-4 grid gap-2">
        <button className="h-12 rounded-2xl bg-gold font-bold text-ink" onClick={() => sim.resume()}>
          Roll again
        </button>
        <button className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-panel font-semibold" onClick={() => sim.retry()}>
          <RotateCcw className="size-4" /> Restart bay
        </button>
        <button className="h-12 rounded-2xl bg-panel font-semibold" onClick={() => sim.backToMap()}>
          Back to the line
        </button>
      </div>
    </Sheet>
  );
}

function WinCard({ sim }: { sim: Sim }) {
  const next = LEVELS[LEVELS.findIndex((l) => l.id === sim.level.id) + 1];
  return (
    <Sheet>
      <p className="text-xs font-semibold tracking-widest text-mamak uppercase">Seat saved</p>
      <h3 className="font-display text-3xl">You made the table.</h3>
      <div className="mt-3">
        <Stars n={sim.winStars} />
      </div>
      <p className="mt-2 text-sm text-muted">
        {sim.winStars === 3
          ? "Boss barely had time to complain."
          : sim.winStars === 2
            ? "The tea is still cold. That's a win."
            : "You sat down as the last basket landed."}
      </p>
      <p className="mt-2 font-bold text-gold">+ RM {sim.winRm}</p>
      <div className="mt-4 grid gap-2">
        {next ? (
          <button className="h-12 rounded-2xl bg-gold font-bold text-ink" onClick={() => sim.startLevel(next.id)}>
            Next bay · {next.name}
          </button>
        ) : (
          <p className="text-sm">That's the whole crawl. The bill is yours.</p>
        )}
        <button className="h-12 rounded-2xl bg-panel font-semibold" onClick={() => sim.backToMap()}>
          MRT map
        </button>
      </div>
    </Sheet>
  );
}

function FailCard({ sim }: { sim: Sim }) {
  const vip = sim.save.owned.includes("vip");
  return (
    <Sheet>
      <p className="text-xs font-semibold tracking-widest text-kopi uppercase">Seat's gone</p>
      <h3 className="font-display text-3xl">Boss ordered without you.</h3>
      <p className="mt-2 text-sm text-muted">A delayed meeting buys fifteen seconds. The alley stays as you left it.</p>
      <div className="mt-4 grid gap-2">
        <button className="h-12 rounded-2xl bg-gold font-bold text-ink" onClick={() => sim.takeCall()}>
          {vip ? "Saman waived · +15s" : "Boss called · +15s"}
        </button>
        {!vip ? (
          <button
            className="h-12 rounded-2xl bg-panel font-semibold disabled:opacity-40"
            disabled={sim.save.ringgit < 25}
            onClick={() => sim.payTime()}
          >
            Pay RM 25 instead
          </button>
        ) : null}
        <button className="h-12 rounded-2xl bg-panel font-semibold" onClick={() => sim.retry()}>
          Retry the bay
        </button>
        <button className="h-12 rounded-2xl bg-asphalt font-semibold text-muted" onClick={() => sim.backToMap()}>
          Leave the alley
        </button>
      </div>
    </Sheet>
  );
}

function Bumper({ sim }: { sim: Sim }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-ink/80 p-5">
      <div className="pop-in w-full rounded-3xl bg-kopi p-6 text-ink">
        <p className="text-xs font-bold tracking-widest uppercase">Ikat tepi</p>
        <h3 className="font-display text-4xl leading-none">Kopi O ice.</h3>
        <p className="mt-2 text-sm">Bungkus. Sejuk. Enough caffeine to outrun a tow truck.</p>
        <p className="mt-6 text-sm font-bold">Meeting moves in {Math.max(0, sim.bumperT).toFixed(1)}s</p>
      </div>
    </div>
  );
}

function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-end bg-ink/70 p-4">
      <div className="pop-in safe-bot w-full rounded-3xl border border-line bg-asphalt p-5">{children}</div>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <Star key={i} className={i < n ? "size-4 fill-gold text-gold" : "size-4 text-line"} />
      ))}
    </span>
  );
}

function Mute({ sim }: { sim: Sim | null }) {
  const muted = sim?.save.mute ?? false;
  return (
    <button
      className="flex size-11 items-center justify-center rounded-full bg-panel"
      onClick={() => {
        audio.unlock();
        sim?.toggleMute();
      }}
      aria-label={muted ? "Unmute" : "Mute"}
    >
      {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
    </button>
  );
}

function markReceipt(prompt: string, code: string) {
  const parts: { text: string; hot: boolean }[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (!buf) return;
    parts.push({ text: buf, hot: false });
    buf = "";
  };
  for (const ch of prompt) {
    if (ch === "_") {
      flush();
      parts.push({ text: code[i] ?? "?", hot: true });
      i += 1;
    } else buf += ch;
  }
  flush();
  return parts;
}

function fillPrompt(prompt: string, entry: string) {
  let i = 0;
  let out = "";
  for (const ch of prompt) {
    if (ch === "_") {
      out += entry[i] ?? "·";
      i += 1;
    } else out += ch;
  }
  return out;
}

function clock(seconds: number) {
  const t = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, "0")}`;
}
