import { QUESTIONS, type CategoryId, type Question } from "./questions";
import { normalize } from "./validate";

export type BeerPhase = "lobby" | "describe" | "guess" | "result";
export interface BeerPlayer { id: string; name: string; score: number }
export interface BeerWord { id: string; word: string; category: CategoryId }
export interface BeerState {
  seq: number;
  phase: BeerPhase;
  players: BeerPlayer[];
  round: number;
  describer: string;
  word: BeerWord | null;
  used: string[];
  guesses: string[];
  lastGuess: string;
  lastResult: { ok: boolean; by: string | null; answer: string } | null;
  winner: string | null;
}
export type BeerAction =
  | { type: "JOIN"; player: BeerPlayer }
  | { type: "START" }
  | { type: "GUESS"; playerId: string; text: string }
  | { type: "PASS" }
  | { type: "NEXT" }
  | { type: "RESET" };

const bank = QUESTIONS.filter((q) => q.answers.length > 0);
const wordFromQuestion = (q: Question): BeerWord => ({
  id: q.id, word: q.answers[0]!, category: q.cat,
});
const shuffledPick = (used: string[]): BeerWord | null => {
  const available = bank.filter((q) => !used.includes(q.id));
  const pool = available.length ? available : bank;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return picked ? wordFromQuestion(picked) : null;
};

export function createBeerGame(host: BeerPlayer): BeerState {
  return {
    seq: 0, phase: "lobby", players: [host], round: 0, describer: host.id,
    word: null, used: [], guesses: [], lastGuess: "", lastResult: null, winner: null,
  };
}

export function beerPublicState(state: BeerState): BeerState {
  return { ...state, word: null };
}

export function reduceBeer(state: BeerState, action: BeerAction): BeerState {
  const next = (patch: Partial<BeerState>) => ({ ...state, ...patch, seq: state.seq + 1 });
  switch (action.type) {
    case "JOIN": {
      if (state.phase !== "lobby" || state.players.some((p) => p.id === action.player.id)) return state;
      if (state.players.length >= 12) return state;
      return next({ players: [...state.players, { ...action.player, name: action.player.name.slice(0, 16), score: 0 }] });
    }
    case "START": {
      if (state.phase !== "lobby" || state.players.length < 2) return state;
      const word = shuffledPick(state.used);
      if (!word) return state;
      return next({
        phase: "describe", round: 1, describer: state.players[0]!.id,
        word, used: [...state.used, word.id], guesses: [], lastGuess: "", lastResult: null,
      });
    }
    case "GUESS": {
      if (state.phase !== "guess" || !state.word || action.playerId === state.describer) return state;
      const player = state.players.find((p) => p.id === action.playerId);
      if (!player) return state;
      const guess = action.text.trim().slice(0, 80);
      if (!guess) return state;
      const ok = normalize(guess) === normalize(state.word.word) ||
        state.word.word.split(/\s+/).some((part) => part.length >= 4 && normalize(part) === normalize(guess));
      const players = ok ? state.players.map((p) => p.id === player.id ? { ...p, score: p.score + 1 } : p) : state.players;
      return next({
        phase: "result", players, lastGuess: guess,
        lastResult: { ok, by: ok ? player.id : null, answer: state.word.word },
        winner: null,
      });
    }
    case "PASS":
      if (state.phase !== "describe") return state;
      return next({ phase: "guess" });
    case "NEXT": {
      if (state.phase !== "result" && state.phase !== "guess") return state;
      const idx = state.players.findIndex((p) => p.id === state.describer);
      const describer = state.players[(idx + 1) % state.players.length]!.id;
      const word = shuffledPick(state.used);
      if (!word) return state;
      return next({
        phase: "describe", round: state.round + 1, describer, word,
        used: [...(state.used.length >= bank.length ? [] : state.used), word.id],
        guesses: [], lastGuess: "", lastResult: null,
      });
    }
    case "RESET":
      return next({
        phase: "lobby", players: state.players.map((p) => ({ ...p, score: 0 })),
        round: 0, describer: state.players[0]?.id ?? "", word: null,
        used: [], guesses: [], lastGuess: "", lastResult: null, winner: null,
      });
  }
}
