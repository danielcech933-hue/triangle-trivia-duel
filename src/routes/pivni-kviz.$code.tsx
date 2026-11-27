import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { beerRpc, createBeerRoom, getBeerRoom, joinBeerRoom, readBeerCredentials, type BeerCredentials } from "@/lib/quiz/beer-api";
import { chooseBeerWord, type BeerRoomSnapshot } from "@/lib/quiz/beer";

export const Route = createFileRoute("/pivni-kviz/$code")({
  head: ({ params }) => ({
    meta: [
      { title: "Pivní kvíz " + params.code + " — AZ Duel" },
      { name: "description", content: "Jedna hospodská partie, náhodná slova z AZ kvízu a body pro nejrychlejší." },
    ],
  }),
  component: BeerRoom,
});

type Screen = "loading" | "join" | "ready" | "error";

function BeerRoom() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>("loading");
  const [credentials, setCredentials] = useState<BeerCredentials | null>(null);
  const [snapshot, setSnapshot] = useState<BeerRoomSnapshot | null>(null);
  const [nickname, setNickname] = useState("");
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const snapshotRef = useRef<BeerRoomSnapshot | null>(null);

  const updateSnapshot = useCallback((value: BeerRoomSnapshot) => {
    snapshotRef.current = value;
    setSnapshot(value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setScreen("loading");
      setError("");
      setSnapshot(null);
      snapshotRef.current = null;
      const saved = readBeerCredentials(code);
      if (!saved) {
        if (!cancelled) {
          setNickname(localStorage.getItem("az:name") || "");
          setScreen("join");
        }
        return;
      }
      setCredentials(saved);
      try {
        const room = await getBeerRoom(code, saved);
        if (cancelled) return;
        updateSnapshot(room);
        setScreen("ready");
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Do této místnosti se nepodařilo připojit.");
        setScreen(saved.role === "guest" ? "join" : "error");
        if (saved.role === "guest") setNickname(localStorage.getItem("az:name") || "");
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [code, updateSnapshot]);

  useEffect(() => {
    if (screen !== "ready" || !credentials) return;
    let cancelled = false;
    let running = false;
    const poll = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const room = await getBeerRoom(code, credentials);
        if (!cancelled) {
          updateSnapshot(room);
          setError("");
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Spojení se na chvíli přerušilo.");
      } finally {
        running = false;
      }
    };
    const timer = window.setInterval(() => { void poll(); }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [code, credentials, screen, updateSnapshot]);

  const me = snapshot?.players.find((player) => player.is_me);
  const isHost = me?.is_host === true;
  const game = snapshot?.state;
  const describer = snapshot?.players.find((player) => player.id === game?.describer_id);
  const isDescriber = !!credentials && game?.describer_id === credentials.playerId;
  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin + "/pivni-kviz/" + code;
  }, [code]);

  const join = async (event: FormEvent) => {
    event.preventDefault();
    const name = nickname.trim().slice(0, 16);
    if (!name) {
      setError("Napiš přezdívku, pod kterou budeš hrát.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await joinBeerRoom(code, name);
      setCredentials(result.credentials);
      updateSnapshot(result.snapshot);
      setScreen("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Do místnosti se nepodařilo připojit.");
    } finally {
      setBusy(false);
    }
  };

  const doAction = async <T,>(name: string, args: Record<string, unknown>): Promise<T | null> => {
    if (!credentials) return null;
    setBusy(true);
    setError("");
    try {
      const result = await beerRpc<T>(name, {
        p_code: code,
        p_player_id: credentials.playerId,
        p_token: credentials.token,
        ...args,
      });
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Akci se nepodařilo provést.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const startNextRound = async () => {
    if (!snapshot || !credentials || !isHost || !game) return;
    const nextDescriber = game.phase === "lobby"
      ? credentials.playerId
      : (() => {
          const currentIndex = snapshot.players.findIndex((player) => player.id === game.describer_id);
          return snapshot.players[(currentIndex + 1) % snapshot.players.length]?.id || credentials.playerId;
        })();
    const picked = chooseBeerWord(game.used_word_ids || []);
    const result = await doAction<BeerRoomSnapshot>("beer_start_round", {
      p_word_id: picked.word.id,
      p_word: picked.word.word,
      p_answers: picked.word.answers,
      p_describer_id: nextDescriber,
      p_reset_used: picked.resetUsed,
    });
    if (result) {
      updateSnapshot(result);
      setFeedback("");
      setGuess("");
    }
  };

  const beginGuessing = async () => {
    const result = await doAction<BeerRoomSnapshot>("beer_begin_guessing", {});
    if (result) updateSnapshot(result);
  };

  const submitGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (!guess.trim()) return;
    const result = await doAction<{ correct: boolean; room: BeerRoomSnapshot }>("beer_submit_guess", { p_guess: guess });
    if (result) {
      updateSnapshot(result.room);
      setFeedback(result.correct ? "Správně! Získáváš bod." : "To není ono. Zkusí to další hráč.");
      setGuess("");
    }
  };

  const endRound = async () => {
    const result = await doAction<BeerRoomSnapshot>("beer_end_round", {});
    if (result) updateSnapshot(result);
  };

  const closeRoom = async () => {
    const result = await doAction<BeerRoomSnapshot>("beer_close_room", {});
    if (result) updateSnapshot(result);
  };

  const newGame = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await createBeerRoom(localStorage.getItem("az:name") || "Chmelák");
      await navigate({ to: "/pivni-kviz/$code", params: { code: result.code }, replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Novou místnost se nepodařilo založit.");
    } finally {
      setBusy(false);
    }
  };

  if (screen === "loading") {
    return <main className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="text-5xl">🍺</div>
      <h1 className="mt-4 font-display text-2xl font-black">Otevírám hospodský stůl…</h1>
      <p className="mt-2 text-sm text-muted-foreground">Načítám uloženou partii {code}.</p>
    </main>;
  }

  if (screen === "error") {
    return <main className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <div className="text-5xl">🍺</div>
      <h1 className="font-display text-2xl font-black">Tuhle partii nelze otevřít</h1>
      <p className="text-muted-foreground">{error}</p>
      <Link to="/" className="inline-flex rounded-xl bg-amber-500 px-5 py-3 font-bold text-black">Zpět na hlavní stránku</Link>
    </main>;
  }

  if (screen === "join") {
    return <main className="mx-auto max-w-md space-y-5 px-4 py-12">
      <Link to="/" className="text-sm text-muted-foreground underline">← Zpět na hlavní stránku</Link>
      <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-card to-card p-6 text-center">
        <div className="text-5xl">🍺</div>
        <h1 className="mt-3 font-display text-3xl font-black">PIVNÍ KVÍZ</h1>
        <p className="mt-2 text-sm text-muted-foreground">Připojuješ se do místnosti <b className="text-amber-500">{code}</b>.</p>
      </section>
      <form onSubmit={join} className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <label className="block text-sm font-semibold">Tvoje přezdívka
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={16} required autoFocus placeholder="Např. Chmelák" className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 text-foreground" />
        </label>
        <button disabled={busy || !nickname.trim()} className="w-full rounded-xl bg-amber-500 px-4 py-3 font-display font-bold text-black disabled:opacity-50">
          {busy ? "Připojuji…" : "Připojit se ke kamarádům"}
        </button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </main>;
  }

  if (!snapshot || !game || !credentials) return null;

  const closed = game.phase === "closed" || !!snapshot.closed_at;
  const scoreLeader = [...snapshot.players].sort((a, b) => b.score - a.score)[0];

  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:py-10">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Link to="/" className="font-display text-xl font-black">🍺 PIVNÍ KVÍZ</Link>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>MÍSTNOST</span><b className="font-display text-amber-500">{code}</b>
        <span className="rounded-full bg-muted px-2 py-1">{closed ? "UZAVŘENO" : "JEDNA PARTIE"}</span>
      </div>
    </header>

    {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

    <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-card to-card p-6 text-center md:p-8">
      <div className="text-5xl">🍻</div>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.3em] text-amber-500">Hospodský AZ souboj</p>
      <h1 className="mt-2 font-display text-3xl font-black md:text-4xl">
        {closed ? "Partie uzavřena" : game.phase === "lobby" ? "Stůl je otevřený" : "Kolo " + game.round}
      </h1>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        {closed
          ? game.winner_name ? game.winner_name + " vyhrává celou partii! Místnost se uzavřela a další hra dostane nový kód." : "Tato místnost je uzavřená. Další hra začne v nové místnosti."
          : game.phase === "lobby"
            ? "Pošli odkaz kamarádům. Až budou u stolu alespoň dva hráči, můžeš spustit první slovo."
            : game.phase === "describe"
              ? (isDescriber ? "Tohle je tvoje tajné slovo. Vysvětli ho ostatním, ale neříkej ho přímo." : (describer?.name || "Hráč") + " právě popisuje tajné slovo.")
              : game.phase === "guess"
                ? (isDescriber ? "Ostatní hráči hádají. Počkej na tipy." : "Napiš, jaké slovo právě popisující vysvětluje.")
                : game.winner_name ? game.winner_name + " uhodl jako první a získává bod." : "Nikdo slovo neuhodl. Odpověď se odhaluje."
        }
      </p>

      {game.phase === "lobby" && (
        <div className="mt-5 flex flex-col items-center gap-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Pozvánkový odkaz</div>
          <button onClick={async () => {
            try {
              await navigator.clipboard.writeText(inviteUrl);
              setCopied(true);
            } catch {
              setError("Odkaz se nepodařilo zkopírovat. Zkopíruj adresu z prohlížeče.");
            }
          }} className="rounded-xl border border-amber-500/40 bg-background/70 px-5 py-3 font-bold hover:bg-amber-500/10">
            {copied ? "Odkaz zkopírován ✓" : "Zkopírovat odkaz pro kamarády"}
          </button>
        </div>
      )}

      {game.phase === "describe" && isDescriber && (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-background/70 p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Tvoje tajné slovo</div>
          <div className="mt-2 break-words font-display text-4xl font-black text-amber-500 md:text-5xl">{game.word || "••••••••"}</div>
          <p className="mt-2 text-xs text-muted-foreground">Vysvětli ho vlastními slovy. Nepoužívej název ani jeho část.</p>
          <button disabled={busy} onClick={() => void beginGuessing()} className="mt-5 rounded-xl bg-amber-500 px-6 py-3 font-bold text-black disabled:opacity-50">
            Ostatní, začněte hádat
          </button>
        </div>
      )}

      {game.phase === "guess" && !isDescriber && (
        <form onSubmit={submitGuess} className="mx-auto mt-6 flex max-w-xl flex-col gap-2 sm:flex-row">
          <input value={guess} onChange={(event) => setGuess(event.target.value)} maxLength={120} autoFocus placeholder="Jaké je tajné slovo?" className="min-w-0 flex-1 rounded-xl border border-input bg-background px-4 py-3" />
          <button disabled={busy || !guess.trim()} className="rounded-xl bg-amber-500 px-6 py-3 font-bold text-black disabled:opacity-50">Tipnout</button>
        </form>
      )}

      {feedback && <p className="mt-3 font-bold text-amber-500">{feedback}</p>}

      {game.phase === "result" && (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-background/70 p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Správná odpověď</div>
          <div className="mt-2 font-display text-4xl font-black text-amber-500">{game.answer || "—"}</div>
          <p className="mt-2 font-semibold">
            {game.winner_name ? "🏆 Bod získává " + game.winner_name : "Tentokrát bez bodu. Zkusíme další slovo."}
          </p>
          {isHost && <button disabled={busy} onClick={() => void startNextRound()} className="mt-5 rounded-xl bg-amber-500 px-6 py-3 font-bold text-black disabled:opacity-50">Další slovo →</button>}
        </div>
      )}

      {closed && (
        <div className="mt-6 space-y-3">
          <p className="font-semibold text-amber-500">{scoreLeader ? "Nejlepší hráč: " + scoreLeader.name + " (" + scoreLeader.score + " bodů)" : "Hra skončila."}</p>
          {isHost && <button disabled={busy} onClick={() => void newGame()} className="rounded-xl bg-amber-500 px-6 py-3 font-bold text-black disabled:opacity-50">Nová partie · vytvořit novou místnost</button>}
        </div>
      )}

      {!closed && game.phase === "lobby" && isHost && (
        <button disabled={busy || snapshot.players.length < 2} onClick={() => void startNextRound()} className="mt-6 w-full max-w-md rounded-xl bg-amber-500 px-6 py-4 font-display text-lg font-black text-black disabled:opacity-40">
          {snapshot.players.length < 2 ? "Čekám na další hráče…" : "Spustit Pivní kvíz"}
        </button>
      )}

      {!closed && game.phase === "guess" && (isHost || isDescriber) && (
        <button disabled={busy} onClick={() => void endRound()} className="mt-5 rounded-xl border border-amber-500/40 px-5 py-3 font-semibold hover:bg-amber-500/10 disabled:opacity-50">
          Nikdo neuhodl · odhalit slovo
        </button>
      )}
    </section>

    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Hráči u stolu</h2>
        <span className="text-xs text-muted-foreground">{snapshot.players.length}/12 · cíl 10 bodů</span>
      </div>
      <div className="mt-4 grid gap-2">
        {snapshot.players.map((player) => (
          <div key={player.id} className={"flex items-center justify-between rounded-xl border px-4 py-3 " + (player.id === game.describer_id && !closed ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-muted/30")}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-xl">{player.is_host ? "👑" : "🍺"}</span>
              <div className="min-w-0">
                <div className="truncate font-bold">{player.name}{player.is_me ? " (ty)" : ""}</div>
                <div className="text-xs text-muted-foreground">
                  {player.is_host ? "Hostitel" : player.id === game.describer_id && !closed ? "Právě popisuje" : "Hráč"}
                  {" · "}{player.online ? "online" : "offline"}
                </div>
              </div>
            </div>
            <div className="font-display text-2xl font-black tabular-nums text-amber-500">{player.score}<span className="ml-1 text-xs font-medium text-muted-foreground">/10</span></div>
          </div>
        ))}
      </div>
      {game.guesses.length > 0 && !closed && (
        <div className="mt-4 rounded-xl bg-muted/40 p-3">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tipy v tomto kole</div>
          <div className="mt-2 space-y-1">
            {game.guesses.map((entry, index) => <div key={entry.player_id + index} className="flex justify-between gap-3 text-sm">
              <span>{entry.player_name}: {entry.guess}</span>
              <span className={entry.correct ? "font-bold text-green-500" : "text-muted-foreground"}>{entry.correct ? "✓" : "×"}</span>
            </div>)}
          </div>
        </div>
      )}
    </section>

    {!closed && isHost && (
      <div className="flex justify-end">
        <button disabled={busy} onClick={() => void closeRoom()} className="text-xs text-muted-foreground underline hover:text-destructive disabled:opacity-50">Ukončit partii a uzavřít místnost</button>
      </div>
    )}
    <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>Jedna místnost = jedna partie. Po skončení dostane další hra nový kód.</span>
      <Link to="/" className="underline">Zpět na hlavní stránku</Link>
    </footer>
  </main>;
}
