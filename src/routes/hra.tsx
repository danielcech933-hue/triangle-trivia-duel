import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { GameScreen } from "@/components/quiz/GameScreen";
import { useGameDriver } from "@/components/quiz/useGameDriver";
import { aiAnswer, aiPick } from "@/lib/quiz/ai";
import { createGame, reduce, type Action } from "@/lib/quiz/engine";
import { CATEGORIES, DIFFICULTIES, type CategoryId, type Difficulty } from "@/lib/quiz/questions";

type Search = { mode: "local" | "ai"; cat: CategoryId; players: 2 | 3; difficulty: Difficulty };

export const Route = createFileRoute("/hra")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    mode: s["mode"] === "ai" ? "ai" : "local",
    cat: CATEGORIES.some((c) => c.id === s["cat"]) ? (s["cat"] as CategoryId) : "mix",
    players: s["players"] === 3 ? 3 : 2,
    difficulty: DIFFICULTIES.some((d) => d.id === s["difficulty"]) ? (s["difficulty"] as Difficulty) : "mix",
  }),
  head: () => ({
    meta: [
      { title: "Hra — AZ Duel" },
      { name: "description", content: "AZ kvíz pro dva nebo tři hráče u jednoho displeje nebo proti AI." },
      { property: "og:title", content: "Hra — AZ Duel" },
      { property: "og:description", content: "Lokální AZ kvíz pro dva nebo tři hráče a trénink proti AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LocalGame,
});

function LocalGame() {
  const { mode, cat, players, difficulty } = Route.useSearch();
  const actualPlayers = mode === "ai" ? 2 : players;
  const [state, setState] = useState(() => createGame(
    cat,
    mode === "ai" ? { A: "Ty", B: "AI Robot" } : { A: "Hráč 1", B: "Hráč 2", C: "Hráč 3" },
    false,
    { players: actualPlayers, difficulty },
  ));
  const dispatch = useCallback((a: Action) => setState((s) => reduce(s, a)), []);
  useGameDriver(state, dispatch, true);

  useEffect(() => {
    if (mode !== "ai") return;
    if (state.phase === "pick" && state.turn === "B") {
      const t = setTimeout(() => dispatch({ type: "PICK", seat: "B", index: aiPick(state, "B") }), 1100);
      return () => clearTimeout(t);
    }
    if (state.phase === "question" && state.answering === "B") {
      const t = setTimeout(() => dispatch({ type: "ANSWER", seat: "B", text: aiAnswer(state) }), 2000 + Math.random() * 3500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [mode, state, dispatch]);

  return <GameScreen state={state} mySeats={mode === "ai" ? ["A"] : state.seats} dispatch={dispatch} canRematch />;
}
