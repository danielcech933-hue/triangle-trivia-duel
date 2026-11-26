import { cellCount, findWin, rowsFor, SEATS, type Cell, type Seat } from "./board";
import { poolFor, type CategoryId, type Difficulty, type Question, type QDiff } from "./questions";
import { isCorrect } from "./validate";

export const ANSWER_SECONDS = 30;
export const STEAL_SECONDS = 20;
export const RESULT_MS = 3000;

export type Attempt = "first" | "steal" | "black";
export type Phase = "lobby" | "pick" | "question" | "result" | "over";

export interface PublicQuestion { id: string; q: string; letter: string; answers: string[]; diff: QDiff }
export interface SeatStats { correct: number; wrong: number; fastest: number | null }

export interface GameState {
  seq: number;
  category: CategoryId;
  difficulty: Difficulty;
  players: 2 | 3;
  seats: Seat[];
  names: Record<Seat, string>;
  cells: Cell[];
  turn: Seat;
  phase: Phase;
  cellIdx: number | null;
  question: PublicQuestion | null;
  answering: Seat;
  attempt: Attempt;
  tried: Seat[];
  deadline: number;
  lastResult: { ok: boolean; by: Seat; text: string; attempt: Attempt; timeout: boolean } | null;
  resolvedAt: number;
  used: string[];
  winner: Seat | null;
  winPath: number[];
  stats: Record<Seat, SeatStats>;
  askedAt: number;
  startedAt: number;
  rounds: number;
}

export type Action =
  | { type: "START" }
  | { type: "PICK"; seat: Seat; index: number }
  | { type: "ANSWER"; seat: Seat; text: string }
  | { type: "TIMEOUT" }
  | { type: "NEXT" }
  | { type: "RESET" }
  | { type: "NAMES"; names: Record<Seat, string> };

export interface GameOptions { difficulty?: Difficulty; players?: 2 | 3 }
export const nextSeat = (seats: Seat[], s: Seat): Seat => seats[(seats.indexOf(s) + 1) % seats.length]!;
export const other = (s: Seat): Seat => (s === "A" ? "B" : "A");
const emptyStats = (): SeatStats => ({ correct: 0, wrong: 0, fastest: null });

export function createGame(category: CategoryId, names: Partial<Record<Seat, string>>, lobby = false, opts: GameOptions = {}): GameState {
  const players = opts.players ?? 2;
  const seats = SEATS.slice(0, players);
  return {
    seq: 0, category, difficulty: opts.difficulty ?? "easy", players, seats,
    names: { A: names.A ?? "Hráč 1", B: names.B ?? "Hráč 2", C: names.C ?? "Hráč 3" },
    cells: Array<Cell>(cellCount(rowsFor(players))).fill(null),
    turn: "A", phase: lobby ? "lobby" : "pick",
    cellIdx: null, question: null, answering: "A", attempt: "first", tried: [], deadline: 0,
    lastResult: null, resolvedAt: 0, used: [], winner: null, winPath: [],
    stats: { A: emptyStats(), B: emptyStats(), C: emptyStats() },
    askedAt: 0, startedAt: Date.now(), rounds: 0,
  };
}

function draw(state: GameState): { q: Question; used: string[] } {
  const selected = poolFor(state.category, state.difficulty);
  const relaxed = selected.length ? selected : poolFor(state.category, "mix");
  const global = relaxed.length ? relaxed : poolFor("mix", "mix");
  const pool = global.length ? global : poolFor("gaming", "mix");
  const usedSet = new Set(state.used);
  let avail = pool.filter((q) => !usedSet.has(q.id));
  let used = state.used;
  if (avail.length === 0) { avail = pool; used = []; }
  const q = avail[Math.floor(Math.random() * avail.length)];
  if (!q) throw new Error("Databáze otázek je prázdná.");
  return { q, used: [...used, q.id] };
}

export function reduce(s: GameState, a: Action, now = Date.now()): GameState {
  const n = (patch: Partial<GameState>): GameState => ({ ...s, ...patch, seq: s.seq + 1 });
  switch (a.type) {
    case "NAMES": return n({ names: a.names });
    case "START":
      if (s.phase !== "lobby") return s;
      return n({ phase: "pick", startedAt: now });
    case "RESET": {
      const g = createGame(s.category, s.names, false, { difficulty: s.difficulty, players: s.players });
      return { ...g, used: s.used, seq: s.seq + 1, turn: s.winner ? nextSeat(s.seats, s.winner) : "A" };
    }
    case "PICK": {
      if (s.phase !== "pick" || a.seat !== s.turn) return s;
      const c = s.cells[a.index];
      if (c === undefined || (c !== null && c !== "X")) return s;
      const { q, used } = draw(s);
      return n({
        phase: "question", cellIdx: a.index, used,
        question: { id: q.id, q: q.q, letter: q.letter, answers: q.answers, diff: q.diff },
        answering: s.turn, attempt: c === "X" ? "black" : "first", tried: [],
        deadline: now + ANSWER_SECONDS * 1000, askedAt: now, lastResult: null,
      });
    }
    case "ANSWER":
    case "TIMEOUT": {
      if (s.phase !== "question" || !s.question || s.cellIdx === null) return s;
      if (a.type === "ANSWER" && a.seat !== s.answering) return s;
      if (a.type === "TIMEOUT" && now < s.deadline) return s;
      const text = a.type === "ANSWER" ? a.text : "";
      const ok = a.type === "ANSWER" && isCorrect(a.text, s.question.answers);
      const by = s.answering;
      const stats = { ...s.stats, [by]: { ...s.stats[by] } };
      if (ok) {
        stats[by].correct++;
        const t = now - s.askedAt;
        if (s.attempt !== "steal" && (stats[by].fastest === null || t < stats[by].fastest!)) stats[by].fastest = t;
      } else stats[by].wrong++;
      const lastResult = { ok, by, text, attempt: s.attempt, timeout: a.type === "TIMEOUT" };
      const cells = [...s.cells];
      if (!ok) {
        const tried = [...s.tried, by];
        if (s.attempt === "black" && s.players === 2) {
          cells[s.cellIdx] = other(by);
        } else {
          if (s.seats.some((x) => !tried.includes(x))) {
            return n({ stats, lastResult, tried, attempt: s.attempt === "black" ? "black" : "steal", answering: orderedNext(s, tried), deadline: now + STEAL_SECONDS * 1000 });
          }
          cells[s.cellIdx] = "X";
        }
      } else cells[s.cellIdx] = by;
      let winner: Seat | null = null;
      let winPath: number[] = [];
      for (const seat of s.seats) { const w = findWin(cells, seat); if (w) { winner = seat; winPath = w; break; } }
      return n({ stats, lastResult, cells, phase: "result", resolvedAt: now, winner, winPath, rounds: s.rounds + 1 });
    }
    case "NEXT": {
      if (s.phase !== "result") return s;
      if (s.winner) return n({ phase: "over" });
      return n({ phase: "pick", turn: nextSeat(s.seats, s.turn), cellIdx: null, question: null, tried: [] });
    }
  }
}

function orderedNext(s: GameState, tried: Seat[]): Seat {
  let cur = s.answering;
  for (let i = 0; i < s.seats.length; i++) { cur = nextSeat(s.seats, cur); if (!tried.includes(cur)) return cur; }
  return cur;
}

export function publicState(s: GameState): GameState {
  if (s.phase === "question" && s.question) return { ...s, question: { ...s.question, answers: [] } };
  return s;
}
