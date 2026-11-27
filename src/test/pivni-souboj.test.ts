import { describe, expect, it } from "vitest";
import { QUESTIONS } from "@/lib/quiz/questions";
import { beerQuestionCount, chooseBeerWord } from "@/lib/quiz/beer";

describe("Pivní kvíz word selection", () => {
  it("selects a word from the existing AZ question bank", () => {
    const picked = chooseBeerWord();
    const source = QUESTIONS.find((question) => question.id === picked.word.id);
    expect(source).toBeDefined();
    expect(source!.answers).toContain(picked.word.word);
    expect(picked.word.answers).toEqual(source!.answers);
    expect(picked.resetUsed).toBe(false);
  });

  it("does not repeat a word while unused bank entries remain", () => {
    const first = chooseBeerWord();
    const next = chooseBeerWord([first.word.id]);
    expect(next.word.id).not.toBe(first.word.id);
    expect(next.resetUsed).toBe(false);
  });

  it("starts a fresh word cycle after the full bank is exhausted", () => {
    const allIds = QUESTIONS.filter((question) => question.answers.length > 0).map((question) => question.id);
    expect(beerQuestionCount()).toBe(allIds.length);
    const picked = chooseBeerWord(allIds);
    expect(picked.resetUsed).toBe(true);
    expect(allIds).toContain(picked.word.id);
  });
});
