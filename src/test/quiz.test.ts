import { describe, expect, it } from "vitest";
import { findWin, idx, type Cell } from "@/lib/quiz/board";
import { createGame, reduce } from "@/lib/quiz/engine";
import { poolFor } from "@/lib/quiz/questions";
import { isCorrect } from "@/lib/quiz/validate";

describe("answer validation", () => {
  it("ignores diacritics, case and spaces", () => expect(isCorrect("  zELEZNY ", ["Železný"])).toBe(true));
  it("tolerates a small typo", () => expect(isCorrect("Schwarzeneger", ["Schwarzenegger"])).toBe(true));
  it("accepts a surname alone", () => expect(isCorrect("djokovic", ["Novak Djoković"])).toBe(true));
  it("rejects a wrong answer", () => expect(isCorrect("Praha", ["Paříž"])).toBe(false));
});

describe("pyramid win", () => {
  it("bottom row alone connects all three sides on the 28-cell board", () => {
    const cells: Cell[] = Array(28).fill(null);
    for (let c = 0; c < 7; c++) cells[idx(6, c)] = "A";
    expect(findWin(cells, "A")).not.toBeNull();
  });
  it("left edge only is not a win", () => {
    const cells: Cell[] = Array(28).fill(null);
    for (let r = 0; r < 6; r++) cells[idx(r, 0)] = "B";
    expect(findWin(cells, "B")).toBeNull();
  });
  it("bottom row connects all three sides on the 55-cell board", () => {
    const cells: Cell[] = Array(55).fill(null);
    for (let c = 0; c < 10; c++) cells[idx(9, c)] = "C";
    expect(findWin(cells, "C")).not.toBeNull();
  });
});

describe("two-player rules", () => {
  it("wrong answer then wrong steal turns the cell black", () => {
    let s = createGame("sport", { A: "a", B: "b" });
    s = reduce(s, { type: "PICK", seat: "A", index: 0 });
    s = reduce(s, { type: "ANSWER", seat: "A", text: "zzzz" });
    expect(s.answering).toBe("B");
    s = reduce(s, { type: "ANSWER", seat: "B", text: "zzzz" });
    expect(s.cells[0]).toBe("X");
  });
  it("wrong answer on a black cell gives it to the opponent", () => {
    let s = createGame("sport", { A: "a", B: "b" });
    s = { ...s, cells: s.cells.map((c, i) => (i === 3 ? "X" : c)) };
    s = reduce(s, { type: "PICK", seat: "A", index: 3 });
    s = reduce(s, { type: "ANSWER", seat: "A", text: "zzzz" });
    expect(s.cells[3]).toBe("B");
  });
});

describe("three-player rules", () => {
  it("creates a 55-cell board and offers every wrong answer to the next player", () => {
    let s = createGame("mix", { A: "A", B: "B", C: "C" }, false, { players: 3, difficulty: "mix" });
    expect(s.cells).toHaveLength(55);
    s = reduce(s, { type: "PICK", seat: "A", index: 0 });
    s = reduce(s, { type: "ANSWER", seat: "A", text: "definitely wrong" });
    expect(s.answering).toBe("B");
    s = reduce(s, { type: "ANSWER", seat: "B", text: "definitely wrong" });
    expect(s.answering).toBe("C");
    s = reduce(s, { type: "ANSWER", seat: "C", text: "definitely wrong" });
    expect(s.cells[0]).toBe("X");
    expect(s.phase).toBe("result");
  });
  it("has category-specific questions for both difficulties in every added category", () => {
    for (const category of ["hudba", "historie", "veda", "literatura", "jidlo"] as const) {
      expect(poolFor(category, "easy").length).toBeGreaterThan(0);
      expect(poolFor(category, "hard").length).toBeGreaterThan(0);
    }
    let s = createGame("hudba", { A: "A", B: "B" }, false, { players: 2, difficulty: "hard" });
    s = reduce(s, { type: "PICK", seat: "A", index: 0 });
    expect(s.phase).toBe("question");
    expect(s.question?.diff).toBe("hard");
  });
  it("keeps the player count and difficulty after a rematch", () => {
    const s = createGame("mix", { A: "A", B: "B", C: "C" }, false, { players: 3, difficulty: "hard" });
    const next = reduce({ ...s, phase: "over", winner: "B" }, { type: "RESET" });
    expect(next.players).toBe(3);
    expect(next.cells).toHaveLength(55);
    expect(next.difficulty).toBe("hard");
    expect(next.turn).toBe("C");
  });
});
