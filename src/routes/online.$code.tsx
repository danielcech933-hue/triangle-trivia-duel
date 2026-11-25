import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { GameScreen } from "@/components/quiz/GameScreen";
import { useGameDriver } from "@/components/quiz/useGameDriver";
import { createGame, publicState, reduce, type Action, type GameState } from "@/lib/quiz/engine";
import { CATEGORIES, type CategoryId } from "@/lib/quiz/questions";

export const Route = createFileRoute("/online/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Místnost ${params.code} — AZ Duel` },
      { name: "description", content: "Připoj se do online duelu v AZ kvízu." },
      { property: "og:title", content: `Pozvánka do AZ Duelu (${params.code})` },
      { property: "og:description", content: "Klikni a hraj se mnou AZ kvíz online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnlineRoom,
});

type Presence = { name: string; role: "host" | "guest"; at: number };

function OnlineRoom() {
  const { code } = Route.useParams();
  const [ready, setReady] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [peers, setPeers] = useState<{ id: string; p: Presence }[]>([]);
  const [copied, setCopied] = useState(false);
  const stateRef = useRef<GameState | null>(null);
  const chanRef = useRef<RealtimeChannel | null>(null);
  const guestIdRef = useRef<string | null>(null);
  const meRef = useRef<string>("");

  const hostDispatch = useCallback((a: Action) => {
    const cur = stateRef.current;
    if (!cur) return;
    const next = reduce(cur, a);
    if (next === cur) return;
    stateRef.current = next;
    setState(next);
    chanRef.current?.send({ type: "broadcast", event: "state", payload: publicState(next) });
  }, []);

  useEffect(() => {
    const hostCat = sessionStorage.getItem(`az:host:${code}`) as CategoryId | null;
    const host = !!hostCat && CATEGORIES.some((c) => c.id === hostCat);
    const name = localStorage.getItem("az:name") || (host ? "Hostitel" : "Host");
    const me = sessionStorage.getItem("az:client") ?? crypto.randomUUID();
    sessionStorage.setItem("az:client", me);
    meRef.current = me;
    setIsHost(host);
    if (host) {
      const g = createGame(hostCat!, { A: name, B: "Čeká se…" }, true);
      stateRef.current = g;
      setState(g);
    }
    const ch = supabase.channel(`az-room-${code}`, { config: { broadcast: { self: false }, presence: { key: me } } });
    chanRef.current = ch;

    ch.on("presence", { event: "sync" }, () => {
      const ps = ch.presenceState<Presence>();
      const list = Object.entries(ps).map(([id, arr]) => ({ id, p: arr[0]! })).filter((x) => x.p);
      setPeers(list);
      if (host) {
        const guests = list.filter((x) => x.p.role === "guest").sort((a, b) => a.p.at - b.p.at);
        if (!guestIdRef.current || !guests.some((g) => g.id === guestIdRef.current)) {
          const s = stateRef.current;
          // Keep the seat for a reconnecting guest only while the game hasn't started.
          if (!s || s.phase === "lobby") guestIdRef.current = guests[0]?.id ?? null;
          else if (!guestIdRef.current) guestIdRef.current = guests[0]?.id ?? null;
        }
        const guest = guests.find((g) => g.id === guestIdRef.current) ?? guests[0];
        if (guest && stateRef.current && stateRef.current.names.B !== guest.p.name) {
          if (stateRef.current.phase !== "lobby") guestIdRef.current = guest.id;
          hostDispatch({ type: "NAMES", names: { A: stateRef.current.names.A, B: guest.p.name } });
        } else if (stateRef.current) {
          ch.send({ type: "broadcast", event: "state", payload: publicState(stateRef.current) });
        }
      }
    });
    ch.on("broadcast", { event: "state" }, ({ payload }) => { if (!host) setState(payload as GameState); });
    ch.on("broadcast", { event: "hello" }, () => {
      if (host && stateRef.current) ch.send({ type: "broadcast", event: "state", payload: publicState(stateRef.current) });
    });
    ch.on("broadcast", { event: "action" }, ({ payload }) => {
      if (!host) return;
      const { from, action } = payload as { from: string; action: Action };
      if (from !== guestIdRef.current) return;
      if (action.type === "PICK") hostDispatch({ type: "PICK", seat: "B", index: Number(action.index) });
      else if (action.type === "ANSWER") hostDispatch({ type: "ANSWER", seat: "B", text: String(action.text).slice(0, 80) });
    });
    ch.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await ch.track({ name, role: host ? "host" : "guest", at: Date.now() } satisfies Presence);
      if (!host) ch.send({ type: "broadcast", event: "hello", payload: {} });
      setReady(true);
    });
    return () => { supabase.removeChannel(ch); };
  }, [code, hostDispatch]);

  const guestDispatch = useCallback((a: Action) => {
    chanRef.current?.send({ type: "broadcast", event: "action", payload: { from: meRef.current, action: a } });
  }, []);

  const fallback = state ?? createGame("mix", { A: "", B: "" }, true);
  useGameDriver(fallback, hostDispatch, isHost && !!state);

  const hostOnline = peers.some((x) => x.p.role === "host");
  const guestOnline = peers.some((x) => x.p.role === "guest");
  const opponentOnline = isHost ? guestOnline : hostOnline;

  if (!state || state.phase === "lobby") {
    const link = typeof window !== "undefined" ? window.location.href : "";
    return (
      <main className="mx-auto max-w-md space-y-6 px-4 py-12 text-center">
        <Link to="/" className="font-display text-xl font-bold">AZ<span className="text-primary">DUEL</span></Link>
        <div className="rounded-2xl border border-border bg-card/70 p-6">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Kód místnosti</div>
          <div className="mt-1 font-display text-5xl font-bold tracking-[0.3em] text-primary">{code}</div>
          <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); }}
            className="mt-4 rounded-lg border border-border px-4 py-2 text-sm hover:border-primary">
            {copied ? "Odkaz zkopírován ✓" : "Zkopírovat odkaz pro soupeře"}
          </button>
        </div>
        <div className="space-y-2 text-left">
          <PlayerRow color="text-player-a" label="Modrý" name={state?.names.A ?? peers.find((x) => x.p.role === "host")?.p.name} online={isHost || hostOnline} />
          <PlayerRow color="text-player-b" label="Oranžový" name={isHost ? (guestOnline ? state?.names.B : undefined) : peers.find((x) => x.id === meRef.current)?.p.name} online={!isHost || guestOnline} />
        </div>
        {!ready && <p className="text-sm text-muted-foreground">Připojuji…</p>}
        {isHost ? (
          <button disabled={!guestOnline} onClick={() => hostDispatch({ type: "START" })}
            className="w-full rounded-lg bg-primary py-3 font-display text-lg font-bold text-primary-foreground disabled:opacity-40">
            {guestOnline ? "Začít hru" : "Čekám na soupeře…"}
          </button>
        ) : (
          <p className="text-muted-foreground">{hostOnline ? "Čekáme, až hostitel spustí hru…" : "Hostitel zatím není v místnosti."}</p>
        )}
      </main>
    );
  }

  return (
    <>
      {!opponentOnline && (
        <div className="fixed inset-x-0 top-0 z-50 bg-destructive py-1 text-center text-sm text-destructive-foreground">Soupeř se odpojil — čekáme na návrat…</div>
      )}
      <GameScreen state={state} mySeats={isHost ? ["A"] : ["B"]} dispatch={isHost ? hostDispatch : guestDispatch} canRematch={isHost} />
    </>
  );
}

function PlayerRow({ color, label, name, online }: { color: string; label: string; name: string | undefined; online: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3">
      <div><div className={`font-display text-xs uppercase tracking-widest ${color}`}>{label}</div><div className="font-bold">{name ?? "—"}</div></div>
      <span className={online && name ? "text-success" : "text-muted-foreground"}>{online && name ? "● připraven" : "○ čeká"}</span>
    </div>
  );
}
