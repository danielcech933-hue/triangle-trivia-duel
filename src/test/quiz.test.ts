import { describe, expect, it } from "vitest";
import { findWin, idx, type Cell } from "@/lib/quiz/board";
import { createGame, reduce } from "@/lib/quiz/engine";
import { isCorrect } from "@/lib/quiz/validate";

describe("answer validation", () => {
  it("ignores diacritics, case and spaces", () => expect(isCorrect("  zELEZNY ", ["Železný"])).toBe(true));
  it("tolerates a small typo", () => expect(isCorrect("Schwarzeneger", ["Schwarzenegger"])).toBe(true));
  it("accepts a surname alone", () => expect(isCorrect("djokovic", ["Novak Djoković"])).toBe(true));
  it("rejects a wrong answer", () => expect(isCorrect("Praha", ["Paříž"])).toBe(false));
});

describe("pyramid win", () => {
  it("bottom row alone connects all three sides", () => {
    const cells: Cell[] = Array(28).fill(null);
    for (let c = 0; c < 7; c++) cells[idx(6, c)] = "A";
    expect(findWin(cells, "A")).not.toBeNull();
  });
  it("left edge only is not a win", () => {
    const cells: Cell[] = Array(28).fill(null);
    for (let r = 0; r < 6; r++) cells[idx(r, 0)] = "B";
    expect(findWin(cells, "B")).toBeNull();
  });
});

describe("rules", () => {
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
