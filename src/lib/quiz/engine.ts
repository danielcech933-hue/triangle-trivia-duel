import { CELL_COUNT, findWin, type Cell, type Seat } from "./board";
import { poolFor, type CategoryId, type Question } from "./questions";
import { isCorrect } from "./validate";

export const ANSWER_SECONDS = 30;
export const STEAL_SECONDS = 20;
export const RESULT_MS = 3000;

export type Attempt = "first" | "steal" | "black";
export type Phase = "lobby" | "pick" | "question" | "result" | "over";

export interface PublicQuestion { id: string; q: string; letter: string; answers: string[] }

export interface GameState {
  seq: number;
  category: CategoryId;
  names: Record<Seat, string>;
  cells: Cell[];
  turn: Seat;
  phase: Phase;
  cellIdx: number | null;
  question: PublicQuestion | null;
  answering: Seat;
  attempt: Attempt;
  deadline: number;
  lastResult: { ok: boolean; by: Seat; text: string; attempt: Attempt; timeout: boolean } | null;
  resolvedAt: number;
  used: string[];
  winner: Seat | null;
  winPath: number[];
  stats: Record<Seat, { correct: number; wrong: number; fastest: number | null }>;
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

export const other = (s: Seat): Seat => (s === "A" ? "B" : "A");

export function createGame(category: CategoryId, names: Record<Seat, string>, lobby = false): GameState {
  return {
    seq: 0, category, names,
    cells: Array<Cell>(CELL_COUNT).fill(null),
    turn: "A", phase: lobby ? "lobby" : "pick",
    cellIdx: null, question: null, answering: "A", attempt: "first", deadline: 0,
    lastResult: null, resolvedAt: 0, used: [], winner: null, winPath: [],
    stats: { A: { correct: 0, wrong: 0, fastest: null }, B: { correct: 0, wrong: 0, fastest: null } },
    askedAt: 0, startedAt: Date.now(), rounds: 0,
  };
}

function draw(state: GameState): { q: Question; used: string[] } {
  const pool = poolFor(state.category);
  let avail = pool.filter((q) => !state.used.includes(q.id));
  let used = state.used;
  if (avail.length === 0) { avail = pool; used = []; }
  const q = avail[Math.floor(Math.random() * avail.length)]!;
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
      const g = createGame(s.category, s.names);
      return { ...g, used: s.used, seq: s.seq + 1, turn: s.winner ? other(s.winner) : "A" };
    }
    case "PICK": {
      if (s.phase !== "pick" || a.seat !== s.turn) return s;
      const c = s.cells[a.index];
      if (c === undefined || c === "A" || c === "B") return s;
      const { q, used } = draw(s);
      return n({
        phase: "question", cellIdx: a.index, used,
        question: { id: q.id, q: q.q, letter: q.letter, answers: q.answers },
        answering: s.turn, attempt: c === "X" ? "black" : "first",
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
      if (!ok && s.attempt === "first") {
        return n({ stats, lastResult, attempt: "steal", answering: other(by), deadline: now + STEAL_SECONDS * 1000 });
      }
      const cells = [...s.cells];
      cells[s.cellIdx] = ok ? by : s.attempt === "black" ? other(by) : "X";
      const winA = findWin(cells, "A");
      const winB = findWin(cells, "B");
      const winner: Seat | null = winA ? "A" : winB ? "B" : null;
      return n({ stats, lastResult, cells, phase: "result", resolvedAt: now, winner, winPath: winA ?? winB ?? [], rounds: s.rounds + 1 });
    }
    case "NEXT": {
      if (s.phase !== "result") return s;
      if (s.winner) return n({ phase: "over" });
      return n({ phase: "pick", turn: other(s.turn), cellIdx: null, question: null });
    }
  }
}

/** Hide accepted answers from the opponent's client while the question is open. */
export function publicState(s: GameState): GameState {
  if (s.phase === "question" && s.question) return { ...s, question: { ...s.question, answers: [] } };
  return s;
}
