import { neighbors, rowsOf, sides, type Seat } from "./board";
import type { GameState } from "./engine";

export function aiPick(s: GameState, me: Seat): number {
  const rows = rowsOf(s.cells.length);
  const mine = s.cells.map((c, i) => (c === me ? i : -1)).filter((i) => i >= 0);
  const touched = { left: false, right: false, bottom: false };
  mine.forEach((i) => { const sd = sides(i, rows); touched.left ||= sd.left; touched.right ||= sd.right; touched.bottom ||= sd.bottom; });
  let best = -1, bestScore = -Infinity;
  s.cells.forEach((c, i) => {
    if (c !== null && c !== "X") return;
    let score = Math.random() * 1.5;
    if (c === "X") score -= 1.5;
    const nb = neighbors(i, rows);
    score += nb.filter((n) => s.cells[n] === me).length * 2.5;
    score += nb.filter((n) => s.cells[n] !== null && s.cells[n] !== "X" && s.cells[n] !== me).length * 1.2;
    const sd = sides(i, rows);
    if (sd.left && !touched.left) score += 1.5;
    if (sd.right && !touched.right) score += 1.5;
    if (sd.bottom && !touched.bottom) score += 1.5;
    score += nb.length * 0.2;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

export function aiAnswer(s: GameState): string {
  const hard = s.question?.diff === "hard";
  const base = hard ? 0.42 : 0.62;
  const chance = s.attempt === "steal" ? base - 0.15 : base;
  return Math.random() < chance && s.question ? s.question.answers[0]! : "nevím";
}
