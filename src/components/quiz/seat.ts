import type { Seat } from "@/lib/quiz/board";

export const SEAT_LABEL: Record<Seat, string> = { A: "Modrý", B: "Oranžový", C: "Zelený" };
export const SEAT_TEXT: Record<Seat, string> = { A: "text-player-a", B: "text-player-b", C: "text-player-c" };
export const SEAT_BG: Record<Seat, string> = { A: "bg-player-a", B: "bg-player-b", C: "bg-player-c" };
export const SEAT_BORDER: Record<Seat, string> = { A: "border-player-a glow-a", B: "border-player-b glow-b", C: "border-player-c glow-c" };
