export type Axis = "h" | "v";

export type CarStyle =
  | "myvi"
  | "axia"
  | "kelisa"
  | "vellfire"
  | "saga"
  | "waja"
  | "kancil"
  | "tow"
  | "lowered"
  | "king";

export type PhonePuzzle = {
  prompt: string;
  code: string;
};

export type Car = {
  id: string;
  name: string;
  axis: Axis;
  len: 2 | 3;
  c: number;
  r: number;
  role: "player" | "traffic";
  weight: "light" | "heavy";
  locked: boolean;
  phone?: PhonePuzzle;
  style: CarStyle;
  gone?: boolean;
};

export type Patrol = {
  axis: "h";
  min: number;
  max: number;
  dir: 1 | -1;
};

export type Blocker = {
  id: string;
  kind: "crate" | "rider" | "aunty";
  c: number;
  r: number;
  honkable: boolean;
  patrol?: Patrol;
};

export type Slope = {
  c: number;
  r: number;
  axis: Axis;
  dir: 1 | -1;
};

export type Tow = {
  c: number;
  r: number;
  axis: "v";
  len: number;
  min: number;
  max: number;
  dir: 1 | -1;
  interval: number;
};

export type Level = {
  id: string;
  station: number;
  bay: "A" | "B";
  name: string;
  blurb: string;
  coach: string;
  w: number;
  h: number;
  exitRow: number;
  time: number;
  cars: Car[];
  blockers: Blocker[];
  slopes: Slope[];
  tow?: Tow;
  char: { c: number; r: number };
  bosses: { at: number; text: string }[];
};

export type State = {
  cars: Car[];
  blockers: Blocker[];
  character: { c: number; r: number };
  won: boolean;
};

export type PushResult = {
  steps: number;
  bumped: boolean;
  won: boolean;
};
