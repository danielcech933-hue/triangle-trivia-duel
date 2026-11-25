import { ROWS, idx, type Cell } from "@/lib/quiz/board";
import { cn } from "@/lib/utils";

interface Props {
  cells: Cell[];
  active: number | null;
  winPath: number[];
  canPick: (i: number) => boolean;
  onPick: (i: number) => void;
}

export function Board({ cells, active, winPath, canPick, onPick }: Props) {
  return (
    <div className="flex flex-col items-center select-none" style={{ ["--s" as string]: "clamp(38px, 11.5vw, 66px)" }}>
      {Array.from({ length: ROWS }, (_, r) => (
        <div key={r} className="flex" style={{ marginTop: r === 0 ? 0 : "calc(var(--s) * -0.22)" }}>
          {Array.from({ length: r + 1 }, (_, c) => {
            const i = idx(r, c);
            const v = cells[i];
            const pickable = canPick(i);
            return (
              <button
                key={i}
                type="button"
                disabled={!pickable}
                onClick={() => onPick(i)}
                aria-label={`Pole ${i + 1}`}
                className={cn(
                  "hex mx-[2px] flex items-center justify-center font-display text-sm font-bold transition-all md:text-lg",
                  v === null && "bg-cell text-foreground",
                  v === "X" && "bg-cell-black text-muted-foreground ring-1 ring-border",
                  v === "A" && "bg-player-a text-primary-foreground animate-pop",
                  v === "B" && "bg-player-b text-primary-foreground animate-pop",
                  pickable && "cursor-pointer hover:brightness-150 hover:scale-105",
                  !pickable && "cursor-default",
                  active === i && "scale-110 brightness-150",
                  winPath.includes(i) && "animate-win",
                )}
                style={{ width: "var(--s)", height: "calc(var(--s) * 1.12)" }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
