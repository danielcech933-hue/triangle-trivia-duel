import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { beerPublicState, createBeerGame, reduceBeer, type BeerAction, type BeerPlayer, type BeerState } from "@/lib/quiz/beer";

export const Route = createFileRoute("/pivni-kviz")({
  head: () => ({ meta: [{ title: "Pivní kvíz — AZ Duel" }, { name: "description", content: "Popisuj tajná slova z AZ kvízu a hádejte s kamarády." }] }),
  component: BeerLobby,
});

function BeerLobby() {
  const navigate = useNavigate();
  const created = useRef(false);

  useEffect(() => {
    if (created.current) return;
    created.current = true;
    const room = Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    const hostId = crypto.randomUUID();
    if (!localStorage.getItem("az:name")) localStorage.setItem("az:name", "Chmelák");
    // The host capability travels with this browser URL, so route transitions and refreshes
    // cannot accidentally turn the room creator into a guest.
    window.location.replace("/pivni-kviz/" + room + "?host=" + encodeURIComponent(hostId));
  }, [navigate]);

  return <main className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
    <div className="text-5xl">🍺</div>
    <h1 className="font-display text-2xl font-black">Zakládám Pivní kvíz…</h1>
    <p className="text-muted-foreground">Připravuji soukromou místnost a odkaz pro tvoje kamarády.</p>
  </main>;
}

export const BeerRoomRoute = createFileRoute("/pivni-kviz/$code")({
  head: ({ params }) => ({ meta: [{ title: "Pivní kvíz " + params.code + " — AZ Duel" }] }),
  component: BeerRoom,
});

type Peer = { id: string; name: string; at: number; role?: "host" | "guest"; gameState?: BeerState | null };

function BeerRoom() {
  const { code } = BeerRoomRoute.useParams();
  const [me, setMe] = useState("");
  const [host, setHost] = useState(false);
  const [state, setState] = useState<BeerState | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [ready, setReady] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [copied, setCopied] = useState(false);
  const [guess, setGuess] = useState("");
  const channel = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef<BeerState | null>(null);
  const myId = useRef("");

  const hostDispatch = useCallback((action: BeerAction) => {
    const current = stateRef.current;
    if (!current) return;
    const next = reduceBeer(current, action);
    if (next === current) return;
    stateRef.current = next;
    setState(next);
    const publicState = beerPublicState(next);
    channel.current?.send({ type: "broadcast", event: "state", payload: publicState });
    channel.current?.track({ name: localStorage.getItem("az:name") || "Hostitel", at: Date.now(), role: "host" });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hostId = params.get("host");
    const isCreator = Boolean(hostId);
    const id = hostId || sessionStorage.getItem("beer:client") || crypto.randomUUID();
    if (!hostId) sessionStorage.setItem("beer:client", id);
    myId.current = id;
    setMe(id);
    setHost(isCreator);
    const playerName = localStorage.getItem("az:name") || "Hráč";
    if (isCreator) {
      const initial = createBeerGame({ id, name: playerName, score: 0 });
      stateRef.current = initial;
      setState(initial);
    }

    const ch = supabase.channel("beer-room-" + code, { config: { broadcast: { self: false }, presence: { key: id } } });
    channel.current = ch;

    ch.on("presence", { event: "sync" }, () => {
      const presence = ch.presenceState<{ name: string; at: number; role: "host" | "guest" }>();
      const list = Object.entries(presence).flatMap(([peerId, entries]) => entries[0] ? [{ id: peerId, ...entries[0] }] : []);
      setPeers(list);
      if (!isCreator) {
        const hostPresence = list.some((peer) => peer.role === "host");
        if (!hostPresence) ch.send({ type: "broadcast", event: "hello", payload: {} });
        else ch.send({ type: "broadcast", event: "hello", payload: {} });
      }
      if (isCreator && stateRef.current?.phase === "lobby") {
        const players: BeerPlayer[] = list.sort((a, b) => a.at - b.at).map((p) => ({ id: p.id, name: p.name, score: 0 }));
        const current = stateRef.current;
        const same = players.length === current.players.length && players.every((p, i) => p.id === current.players[i]?.id && p.name === current.players[i]?.name);
        if (!same) {
          const synced = { ...current, players, seq: current.seq + 1 };
          stateRef.current = synced;
          setState(synced);
          const publicState = beerPublicState(synced);
          ch.send({ type: "broadcast", event: "state", payload: publicState });
          ch.track({ name: playerName, at: Date.now(), role: "host" });
        }
      }
    });
    ch.on("broadcast", { event: "state" }, ({ payload }) => {
      const incoming = payload as BeerState;
      if (!isCreator) {
        setState((previous) => {
          if (previous && incoming.seq < previous.seq) return previous;
          return incoming;
        });
      }
    });
    ch.on("broadcast", { event: "hello" }, () => {
      if (isCreator && stateRef.current) {
        const current = stateRef.current;
        ch.send({ type: "broadcast", event: "state", payload: beerPublicState(current) });
      }
    });
    ch.on("broadcast", { event: "action" }, ({ payload }) => {
      if (!isCreator) return;
      const data = payload as { from: string; action: BeerAction };
      const current = stateRef.current;
      const allowed = current?.players.some((p) => p.id === data.from);
      if (!allowed || !current) return;
      if (data.action.type === "GUESS") hostDispatch({ type: "GUESS", playerId: data.from, text: String(data.action.text).slice(0, 80) });
    });
    ch.subscribe(async (status, err) => {
      if (status === "SUBSCRIBED") {
        setConnectionError("");
        await ch.track({ name: playerName, at: Date.now(), role: isCreator ? "host" : "guest" });
        if (isCreator && stateRef.current) {
          ch.send({ type: "broadcast", event: "state", payload: beerPublicState(stateRef.current) });
        } else {
          ch.send({ type: "broadcast", event: "hello", payload: {} });
        }
        setReady(true);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setReady(false);
        setConnectionError(status === "TIMED_OUT"
          ? "Připojení k Supabase vypršelo. Zkontroluj internet a zkus to znovu."
          : "Nepodařilo se připojit k místnosti. Může být chybný kód nebo problém s online službou.");
        console.error("[Pivní kvíz] Realtime connection:", status, err);
      }
    });
    return () => { supabase.removeChannel(ch); channel.current = null; };
  }, [code, hostDispatch]);

  const sendAction = (action: BeerAction) => {
    if (host) hostDispatch(action);
    else channel.current?.send({ type: "broadcast", event: "action", payload: { from: myId.current, action } });
  };

  const current = state;
  const describer = current?.players.find((p) => p.id === current?.describer);
  const isDescriber = current?.describer === me;

  if (!ready) return <main className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
    <div className="text-4xl">🍺</div>
    <h1 className="font-display text-2xl font-bold">Připojování k hospodskému stolu</h1>
    <p className="text-muted-foreground">{connectionError || "Navazuji spojení s online místností…"}</p>
    {connectionError && <button onClick={() => window.location.reload()} className="rounded-xl bg-amber-500 px-5 py-3 font-bold text-black">Zkusit znovu</button>}
    <Link to="/" className="block text-sm text-muted-foreground underline">Zpět na hlavní lobby</Link>
  </main>;
  if (!current) return <main className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
    <div className="text-4xl">🍺</div>
    <h1 className="font-display text-2xl font-bold">Čekáme na hostitele</h1>
    <p className="text-muted-foreground">Místnost {code} zatím nemá aktivního hostitele. Požádej kamaráda, který ji založil, aby ji otevřel.</p>
    <button onClick={() => channel.current?.send({ type: "broadcast", event: "hello", payload: {} })} className="rounded-xl bg-amber-500 px-5 py-3 font-bold text-black">Obnovit spojení</button>
    <Link to="/pivni-kviz" className="block text-sm text-muted-foreground underline">Zpět na Pivní kvíz</Link>
  </main>;

  if (current.phase === "lobby") return <main className="mx-auto max-w-xl space-y-5 px-4 py-10">
    <div className="flex items-center justify-between"><Link to="/" className="font-display font-bold">🍺 PIVNÍ KVÍZ</Link><span className="text-xs text-muted-foreground">Místnost {code}</span></div>
    <div className="rounded-2xl border border-amber-500/30 bg-card p-6 text-center">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">Pošli kámošům odkaz</div>
      <div className="mt-2 font-display text-5xl font-black tracking-[0.25em] text-amber-500">{code}</div>
      <button onClick={() => { const invite = new URL(window.location.href); invite.searchParams.delete("host"); navigator.clipboard.writeText(invite.toString()); setCopied(true); }} className="mt-3 rounded-lg border border-border px-4 py-2">{copied ? "Odkaz zkopírován ✓" : "Zkopírovat odkaz"}</button>
    </div>
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl font-bold">U stolu ({current.players.length}/12)</h2>
      <div className="mt-3 grid gap-2">{current.players.map((p, i) => <div key={p.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-3"><span>{i === 0 ? "👑 " : "🍺 "}{p.name}{p.id === me ? " (ty)" : ""}</span><b>{p.score} bodů</b></div>)}</div>
      {host ? <button disabled={current.players.length < 2} onClick={() => hostDispatch({ type: "START" })} className="mt-5 w-full rounded-xl bg-amber-500 py-3 font-display text-lg font-bold text-black disabled:opacity-40">Začít Pivní kvíz</button> : <p className="mt-4 text-center text-sm text-muted-foreground">Čekáme, až hostitel spustí hru…</p>}
    </div>
    {!ready && <p className="text-sm">Připojování…</p>}
  </main>;

  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:py-10">
    <header className="flex items-center justify-between"><Link to="/" className="font-display text-xl font-black">🍺 PIVNÍ KVÍZ</Link><span className="text-sm text-muted-foreground">Kolo {current.round}</span></header>
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap gap-2">{current.players.map((p) => <div key={p.id} className={`rounded-full border px-3 py-2 text-sm ${p.id === current.describer ? "border-amber-500 bg-amber-500/10 text-amber-500" : "border-border"}`}>{p.name}: <b>{p.score}</b></div>)}</div>
    </section>
    <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-card p-6 text-center md:p-10">
      <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{isDescriber ? "Ty popisuješ" : describer?.name + " právě popisuje"}</div>
      {isDescriber && current.phase === "describe" && host && current.word && <><div className="mt-5 text-4xl font-black text-amber-500 md:text-6xl">{current.word.word}</div><p className="mt-3 text-sm text-muted-foreground">Popiš slovo vlastními slovy. Neříkej jeho název ani jeho část.</p><button onClick={() => hostDispatch({ type: "PASS" })} className="mt-6 rounded-xl bg-amber-500 px-6 py-3 font-bold text-black">Ostatní, začněte hádat</button></>}
      {!isDescriber && current.phase === "describe" && <p className="mt-5 text-lg">Poslouchejte popis a připravte tipy. Popisující: {describer?.name}.</p>}
      {current.phase === "guess" && <>{isDescriber ? <p className="mt-5">Ostatní hádají…</p> : <form onSubmit={(e) => { e.preventDefault(); if (guess.trim()) { sendAction({ type: "GUESS", playerId: me, text: guess }); setGuess(""); } }} className="mt-5 flex gap-2"><input autoFocus value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Co je to za slovo?" className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-3" /><button className="rounded-xl bg-primary px-5 font-bold text-primary-foreground">Tipnout</button></form>}</>}
      {current.phase === "result" && current.lastResult && <div className="mt-5 space-y-3"><div className={`text-2xl font-black ${current.lastResult.ok ? "text-green-500" : "text-destructive"}`}>{current.lastResult.ok ? "Správně! Bod získává " + (current.lastResult.by === me ? "ty" : current.players.find(p => p.id === current.lastResult?.by)?.name) : "Tentokrát ne!"}</div><div className="text-3xl font-black text-amber-500">{current.lastResult.answer}</div>{host && <button onClick={() => hostDispatch({ type: "NEXT" })} className="rounded-xl bg-amber-500 px-6 py-3 font-bold text-black">Další slovo →</button>}{!host && <p className="text-sm text-muted-foreground">Čekáme na další slovo…</p>}</div>}
    </section>
    {current.phase === "describe" && !isDescriber && <p className="text-center text-sm text-muted-foreground">Až popisující domluví, spustí hádání. Každý může zadat svůj tip.</p>}
    <div className="rounded-2xl border border-border bg-card p-4"><div className="font-display font-bold">Pravidla u stolu</div><p className="mt-1 text-sm text-muted-foreground">Jen popisující vidí tajné slovo. Ostatní tipují vlastními slovy. První správný tip získá bod a další kolo popisuje další hráč po směru hodinových ručiček.</p></div>
  </main>;
}
