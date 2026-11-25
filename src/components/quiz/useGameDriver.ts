import { useEffect } from "react";
import { RESULT_MS, type Action, type GameState } from "@/lib/quiz/engine";

/** Runs timeouts and auto-advance. Only the authoritative client (local or host) enables it. */
export function useGameDriver(state: GameState, dispatch: (a: Action) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (state.phase === "question") {
      const t = setTimeout(() => dispatch({ type: "TIMEOUT" }), Math.max(0, state.deadline - Date.now()) + 50);
      return () => clearTimeout(t);
    }
    if (state.phase === "result") {
      const t = setTimeout(() => dispatch({ type: "NEXT" }), RESULT_MS);
      return () => clearTimeout(t);
    }
  }, [enabled, state.phase, state.deadline, state.seq, dispatch]);
}
