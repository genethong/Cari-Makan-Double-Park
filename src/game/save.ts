export type Save = {
  version: 1;
  ringgit: number;
  stars: Record<string, number>;
  unlocked: Record<string, boolean>;
  car: string;
  horn: string;
  owned: string[];
  mute: boolean;
};

export type CatalogItem = {
  id: string;
  slot: "car" | "horn" | "perk";
  name: string;
  detail: string;
  price: number;
};

export const CATALOG: CatalogItem[] = [
  { id: "myvi", slot: "car", name: "Campus Myvi", detail: "Yellow, light, flicks like a student late for class.", price: 0 },
  { id: "lowered", slot: "car", name: "Lowered Saga", detail: "Stanced. Hard flicks travel one cell farther.", price: 120 },
  { id: "king", slot: "car", name: "King Myvi", detail: "Black roof, gold body. The alley already knows.", price: 160 },
  { id: "horn-std", slot: "horn", name: "Standard Honk", detail: "Polite. Riders barely look up.", price: 0 },
  { id: "horn-woi", slot: "horn", name: "Woi!", detail: "Cuts across a wet market.", price: 40 },
  { id: "horn-mamak", slot: "horn", name: "Roti Canai", detail: "A stall call. Riders scatter anyway.", price: 55 },
  { id: "horn-chime", slot: "horn", name: "Reverse Chime", detail: "That lorry melody, turned down for shoplots.", price: 55 },
  { id: "tissue", slot: "perk", name: "Tissue Box", detail: "Four extra seconds to read the digits on the glass.", price: 70 },
  { id: "toll", slot: "perk", name: "Toll Tag", detail: "Light cars flick one cell farther.", price: 100 },
  { id: "bobble", slot: "perk", name: "Bobblehead", detail: "Fifteen percent more ringgit when you make the table.", price: 80 },
  { id: "vip", slot: "perk", name: "Saman Waiver", detail: "Skip the delay bumper. A second kopi every bay.", price: 250 },
];

const KEY = "cari-makan-double-park";

export function defaultSave(): Save {
  return {
    version: 1,
    ringgit: 0,
    stars: {},
    unlocked: { "ss15-a": true },
    car: "myvi",
    horn: "horn-std",
    owned: ["myvi", "horn-std"],
    mute: false,
  };
}

export function loadSave(): Save {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Save>;
    if (!parsed || typeof parsed !== "object") return base;
    const save: Save = {
      ...base,
      ...parsed,
      version: 1,
      stars: { ...base.stars, ...(parsed.stars ?? {}) },
      unlocked: { ...base.unlocked, ...(parsed.unlocked ?? {}) },
      owned: Array.isArray(parsed.owned) ? parsed.owned.filter((x) => typeof x === "string") : base.owned,
    };
    if (!save.owned.includes("myvi")) save.owned.push("myvi");
    if (!save.owned.includes("horn-std")) save.owned.push("horn-std");
    save.unlocked["ss15-a"] = true;
    return save;
  } catch {
    return base;
  }
}

export function writeSave(save: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode or quota — keep the session in memory */
  }
}

export function hasPerk(save: Save, id: string) {
  return save.owned.includes(id);
}

export function flickBonus(save: Save) {
  return save.car === "lowered" || hasPerk(save, "toll") ? 1 : 0;
}
