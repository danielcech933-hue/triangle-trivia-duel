import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Seat } from "@/lib/quiz/board";
import { ANSWER_SECONDS, STEAL_SECONDS, other, type Action, type GameState } from "@/lib/quiz/engine";
import { CATEGORIES, DIFFICULTIES } from "@/lib/quiz/questions";
import { SEAT_BORDER, SEAT_LABEL, SEAT_TEXT } from "./seat";
import { sfx } from "@/lib/quiz/sfx";
import { cn } from "@/lib/utils";
import { Board } from "./Board";

interface Props {
  state: GameState;
  mySeats: Seat[];
  dispatch: (a: Action) => void;
  canRematch: boolean;
  correctAnswer?: string;
}

const seatColor = (s: Seat) => SEAT_TEXT[s];

function PlayerCard({ state, seat }: { state: GameState; seat: Seat }) {
  const active = state.phase === "question" ? state.answering === seat : state.turn === seat && state.phase === "pick";
  const owned = state.cells.filter((c) => c === seat).length;
  return (
    <div className={cn(
      "min-w-0 flex-1 rounded-xl border bg-card/70 p-3 transition-all",
      active ? SEAT_BORDER[seat] : "border-border opacity-80",
    )}>
      <div className={cn("font-display text-xs uppercase tracking-widest", seatColor(seat))}>
        {SEAT_LABEL[seat]}
      </div>
      <div className="truncate font-display text-lg font-bold">{state.names[seat]}</div>
      <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
        <span>Pole <b className="text-foreground">{owned}</b></span>
        <span>✓ {state.stats[seat].correct}</span>
        <span>✗ {state.stats[seat].wrong}</span>
      </div>
    </div>
  );
}

function Countdown({ deadline, total }: { deadline: number; total: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  const left = Math.max(0, deadline - now);
  const secs = Math.ceil(left / 1000);
  const lastTick = useRef(0);
  useEffect(() => { if (secs <= 5 && secs > 0 && secs !== lastTick.current) { lastTick.current = secs; sfx.tick(); } }, [secs]);
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full transition-all duration-200", secs <= 5 ? "bg-destructive" : "bg-primary")} style={{ width: `${(left / (total * 1000)) * 100}%` }} />
      </div>
      <span className={cn("w-8 text-right font-display font-bold", secs <= 5 && "text-destructive")}>{secs}</span>
    </div>
  );
}

export function GameScreen({ state, mySeats, dispatch, canRematch }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const prevSeq = useRef(state.seq);
  const cat = CATEGORIES.find((c) => c.id === state.category);
  const questionCategory = state.question ? CATEGORIES.find((c) => c.id === state.question?.cat) : undefined;
  const myAnswerTurn = state.phase === "question" && mySeats.includes(state.answering);

  useEffect(() => {
    if (state.seq === prevSeq.current) return;
    prevSeq.current = state.seq;
    if (state.phase === "question" && !state.lastResult) sfx.pick();
    if (state.lastResult && (state.phase === "result" || state.attempt === "steal") && state.phase !== "over") {
      if (state.phase === "result" && state.winner) sfx.win();
      else if (state.lastResult.ok) sfx.correct();
      else sfx.wrong();
    }
  }, [state]);

  useEffect(() => { setText(""); if (myAnswerTurn) setTimeout(() => inputRef.current?.focus(), 50); }, [state.answering, state.cellIdx, state.phase, myAnswerTurn]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!myAnswerTurn || !text.trim()) return;
    dispatch({ type: "ANSWER", seat: state.answering, text });
  };

  const canPick = (i: number) => state.phase === "pick" && mySeats.includes(state.turn) && (state.cells[i] === null || state.cells[i] === "X");
  const lr = state.lastResult;
  const fmt = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-3 py-4 md:py-8">
      <header className="flex items-center justify-between">
        <Link to="/" className="font-display text-xl font-bold tracking-wide">AZ<span className="text-primary">DUEL</span></Link>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{cat?.icon} {cat?.name} · {DIFFICULTIES.find((d) => d.id === state.difficulty)?.name}</span>
      </header>

      <div className="flex gap-3">
        {state.seats.map((seat) => <PlayerCard key={seat} state={state} seat={seat} />)}
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_1fr] md:items-center">
        <Board cells={state.cells} active={state.cellIdx} winPath={state.winPath} canPick={canPick} onPick={(i) => dispatch({ type: "PICK", seat: state.turn, index: i })} />

        <section className="min-h-[220px] rounded-2xl border border-border bg-card/80 p-5 backdrop-blur">
          {state.phase === "pick" && (
            <div className="space-y-2 text-center">
              <div className={cn("font-display text-2xl font-bold", seatColor(state.turn))}>{state.names[state.turn]}</div>
              <p className="text-muted-foreground">{mySeats.includes(state.turn) ? "Vyber pole na pyramidě." : "Soupeř vybírá pole…"}</p>
              <p className="pt-4 text-xs text-muted-foreground">Propoj všechny tři strany trojúhelníku. Černé pole = náhradní otázka. Odpovídat můžeš česky i slovensky.</p>
            </div>
          )}

          {state.phase === "question" && state.question && (
            <div className={cn("space-y-4", lr && !lr.ok && "animate-shake")} key={state.answering + state.attempt}>
              <div className="flex items-center gap-4">
                <div className="hex flex h-16 w-14 shrink-0 items-center justify-center bg-primary font-display text-3xl font-bold text-primary-foreground">{state.question.letter}</div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  Pole {state.cellIdx! + 1} · {state.players === 3 ? (state.attempt === "black" ? "Náhradní otázka" : "Otázka pro hráče na tahu") : state.attempt === "black" ? "Souboj o černé pole" : state.attempt === "steal" ? "Šance pro soupeře" : "Otázka"}{questionCategory ? " · " + questionCategory.name : ""}{state.question.diff === "hard" ? " · těžká" : " · lehká"}
                  <div className={cn("mt-1 font-display text-base normal-case tracking-normal", seatColor(state.answering))}>Odpovídá {state.names[state.answering]}</div>
                </div>
              </div>
              {state.attempt === "steal" && lr && <p className="text-sm text-destructive">{state.names[lr.by]}: {lr.timeout ? "čas vypršel" : `„${lr.text}“ není správně`}</p>}
              <p className="text-lg font-semibold leading-snug md:text-xl">{state.question.q}</p>
              <Countdown deadline={state.deadline} total={state.attempt === "steal" ? STEAL_SECONDS : ANSWER_SECONDS} />
              {myAnswerTurn ? (
                <form onSubmit={submit} className="flex gap-2">
                  <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off"
                    placeholder={`Odpověď na ${state.question.letter}…`}
                    className="min-w-0 flex-1 rounded-lg border border-input bg-background/60 px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
                  <button className="rounded-lg bg-primary px-4 font-display font-bold text-primary-foreground hover:brightness-110">OK</button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">Čeká se na odpověď…</p>
              )}
            </div>
          )}

          {state.phase === "result" && lr && (
            <div className="space-y-3 text-center">
              <div className={cn("font-display text-3xl font-bold", lr.ok ? "text-success" : "text-destructive")}>{lr.ok ? "Správně!" : "Špatně"}</div>
              <p className="text-muted-foreground">
                {lr.ok ? `${state.names[lr.by]} získává pole ${state.cellIdx! + 1}.`
                  : state.players === 3 ? "Pole zůstává černé. Tah přechází na dalšího hráče." : lr.attempt === "black" ? `Pole získává ${state.names[other(lr.by)]}.` : "Pole zůstává černé."}
              </p>
              {state.question && <p className="text-sm">Odpověď: <b className="text-primary">{state.question.answers[0]}</b></p>}
            </div>
          )}

          {state.phase === "over" && state.winner && (
            <div className="space-y-4 text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Vítěz</div>
              <div className={cn("font-display text-4xl font-bold", seatColor(state.winner))}>{state.names[state.winner]} 🏆</div>
              <table className="mx-auto w-full max-w-xs text-sm">
                <thead><tr className="text-muted-foreground"><th />{state.seats.map((x) => <th key={x} className={seatColor(x)}>{state.names[x]}</th>)}</tr></thead>
                <tbody>
                  <tr><td className="text-left text-muted-foreground">Pole</td>{state.seats.map((x) => <td key={x}>{state.cells.filter((c) => c === x).length}</td>)}</tr>
                  <tr><td className="text-left text-muted-foreground">Správně</td>{state.seats.map((x) => <td key={x}>{state.stats[x].correct}</td>)}</tr>
                  <tr><td className="text-left text-muted-foreground">Chybně</td>{state.seats.map((x) => <td key={x}>{state.stats[x].wrong}</td>)}</tr>
                  <tr><td className="text-left text-muted-foreground">Nejrychlejší</td>{state.seats.map((x) => <td key={x}>{fmt(state.stats[x].fastest)}</td>)}</tr>
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground">{state.rounds} kol · černých polí {state.cells.filter((c) => c === "X").length}</p>
              <div className="flex justify-center gap-2">
                {canRematch && <button onClick={() => dispatch({ type: "RESET" })} className="rounded-lg bg-primary px-4 py-2 font-display font-bold text-primary-foreground">Odveta</button>}
                <Link to="/" className="rounded-lg border border-border px-4 py-2 font-display">Menu</Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
