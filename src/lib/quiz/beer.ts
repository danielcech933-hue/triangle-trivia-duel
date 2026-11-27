import { QUESTIONS, type Question } from "./questions";

export type BeerPhase = "lobby" | "describe" | "guess" | "result" | "closed";

export interface BeerWord {
  id: string;
  word: string;
  answers: string[];
}

export interface BeerPlayer {
  id: string;
  name: string;
  score: number;
  is_host: boolean;
  is_me: boolean;
  online: boolean;
}

export interface BeerGuess {
  player_id: string;
  player_name: string;
  guess: string;
  correct: boolean;
}

export interface BeerGameState {
  phase: BeerPhase;
  round: number;
  describer_id: string | null;
  word_id?: string | null;
  /** Only returned to the current describer. */
  word?: string | null;
  /** Only returned after a round has finished. */
  answer?: string | null;
  used_word_ids: string[];
  guesses: BeerGuess[];
  winner_id: string | null;
  winner_name: string | null;
  last_guess: string | null;
}

export interface BeerRoomSnapshot {
  code: string;
  revision: number;
  state: BeerGameState;
  players: BeerPlayer[];
  closed_at: string | null;
  expires_at: string;
}

const BANK: Question[] = QUESTIONS.filter((question) => question.answers.length > 0);

export function chooseBeerWord(usedIds: string[] = []): { word: BeerWord; resetUsed: boolean } {
  const available = BANK.filter((question) => !usedIds.includes(question.id));
  const resetUsed = available.length === 0;
  const pool = resetUsed ? BANK : available;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  if (!picked) throw new Error("Databáze AZ kvízu neobsahuje žádná použitelná slova.");

  return {
    resetUsed,
    word: {
      id: picked.id,
      word: picked.answers[0]!,
      answers: [...picked.answers],
    },
  };
}

export function beerQuestionCount(): number {
  return BANK.length;
}

export function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function makeSecretToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
