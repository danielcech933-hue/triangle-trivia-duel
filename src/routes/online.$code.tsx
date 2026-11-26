import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { GameScreen } from "@/components/quiz/GameScreen";
import { useGameDriver } from "@/components/quiz/useGameDriver";
import { createGame, publicState, reduce, type Action, type GameState } from "@/lib/quiz/engine";
import { CATEGORIES, DIFFICULTIES, type CategoryId, type Difficulty } from "@/lib/quiz/questions";
import { SEATS, type Seat } from "@/lib/quiz/board";
import { SEAT_LABEL, SEAT_TEXT } from "@/components/quiz/seat";

export const Route = createFileRoute("/online/$code")({
  head: ({ params }) => ({
    meta: [
      { title: "Místnost " + params.code + " — AZ Duel" },
      { name: "description", content: "Připoj se do online AZ kvízu pro dva nebo tři hráče." },
      { property: "og:title", content: "Pozvánka do AZ Duelu (" + params.code + ")" },
      { property: "og:description", content: "Klikni a hraj se mnou AZ kvíz online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnlineRoom,
});

type Presence = { name: string; role: "host" | "guest"; at: number };
type RoomSettings = { cat: CategoryId; players: 2 | 3; difficulty: Difficulty };
type Peer = { id: string; p: Presence };
type Roster = Record<string, Seat>;
const GUEST_SEATS: Seat[] = ["B", "C"];

function OnlineRoom() {
  const { code } = Route.useParams();
  const [ready, setReady] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [roster, setRoster] = useState<Roster>({});
  const [mySeat, setMySeat] = useState<Seat | null>(null);
  const [copied, setCopied] = useState(false);
  const stateRef = useRef<GameState | null>(null);
  const chanRef = useRef<RealtimeChannel | null>(null);
  const rosterRef = useRef<Roster>({});
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
    const raw = sessionStorage.getItem("az:host:" + code);
    let settings: RoomSettings | null = null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<RoomSettings>;
        if (parsed.cat && CATEGORIES.some((c) => c.id === parsed.cat)) {
          settings = {
            cat: parsed.cat,
            players: parsed.players === 3 ? 3 : 2,
            difficulty: DIFFICULTIES.some((d) => d.id === parsed.difficulty) ? parsed.difficulty! : "mix",
          };
        }
      } catch {
        if (CATEGORIES.some((c) => c.id === raw)) settings = { cat: raw as CategoryId, players: 2, difficulty: "mix" };
      }
    }

    const host = settings !== null;
    const name = localStorage.getItem("az:name") || (host ? "Hostitel" : "Hráč");
    const me = sessionStorage.getItem("az:client") ?? crypto.randomUUID();
    sessionStorage.setItem("az:client", me);
    meRef.current = me;
    setIsHost(host);
    if (host) {
      const names = { A: name, B: "Čeká se…", C: "Čeká se…" };
      const game = createGame(settings!.cat, names, true, {
        players: settings!.players,
        difficulty: settings!.difficulty,
      });
      stateRef.current = game;
      setState(game);
      setMySeat("A");
    }

    const ch = supabase.channel("az-room-" + code, {
      config: { broadcast: { self: false }, presence: { key: me } },
    });
    chanRef.current = ch;

    ch.on("presence", { event: "sync" }, () => {
      const presence = ch.presenceState<Presence>();
      const list: Peer[] = Object.entries(presence).flatMap(([id, entries]) =>
        entries[0] ? [{ id, p: entries[0] }] : [],
      );
      setPeers(list);

      if (host) {
        const current = stateRef.current;
        if (!current) return;
        const guests = list
          .filter((peer) => peer.p.role === "guest")
          .sort((a, b) => a.p.at - b.p.at || a.id.localeCompare(b.id));
        let nextRoster: Roster = { ...rosterRef.current };

        // Before the game starts, seats are assigned in join order.
        // Once started, assignments are frozen so a reconnect cannot steal another seat.
        if (current.phase === "lobby") {
          nextRoster = {};
          for (let i = 0; i < Math.min(current.players - 1, guests.length); i++) {
            nextRoster[guests[i]!.id] = GUEST_SEATS[i]!;
          }
        }

        rosterRef.current = nextRoster;
        setRoster(nextRoster);
        ch.send({ type: "broadcast", event: "roster", payload: nextRoster });

        if (current.phase === "lobby") {
          const names = { ...current.names, B: "Čeká se…", C: "Čeká se…" };
          for (const peer of guests) {
            const seat = nextRoster[peer.id];
            if (seat) names[seat] = peer.p.name;
          }
          const changed = current.seats.some((seat) => current.names[seat] !== names[seat]);
          if (changed) hostDispatch({ type: "NAMES", names });
          else ch.send({ type: "broadcast", event: "state", payload: publicState(current) });
        } else {
          ch.send({ type: "broadcast", event: "state", payload: publicState(current) });
        }
      }
    });

    ch.on("broadcast", { event: "state" }, ({ payload }) => {
      if (!host) setState(payload as GameState);
    });

    ch.on("broadcast", { event: "roster" }, ({ payload }) => {
      if (host) return;
      const next = payload as Roster;
      rosterRef.current = next;
      setRoster(next);
      setMySeat(next[me] ?? null);
    });

    ch.on("broadcast", { event: "hello" }, () => {
      if (host && stateRef.current) {
        ch.send({ type: "broadcast", event: "roster", payload: rosterRef.current });
        ch.send({ type: "broadcast", event: "state", payload: publicState(stateRef.current) });
      }
    });

    ch.on("broadcast", { event: "action" }, ({ payload }) => {
      if (!host) return;
      const data = payload as { from: string; action: Action };
      const seat = rosterRef.current[data.from];
      if (!seat) return;
      if (data.action.type === "PICK") {
        hostDispatch({ type: "PICK", seat, index: Number(data.action.index) });
      } else if (data.action.type === "ANSWER") {
        hostDispatch({ type: "ANSWER", seat, text: String(data.action.text).slice(0, 80) });
      }
    });

    ch.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await ch.track({ name, role: host ? "host" : "guest", at: Date.now() } satisfies Presence);
      if (!host) ch.send({ type: "broadcast", event: "hello", payload: {} });
      setReady(true);
    });

    return () => {
      supabase.removeChannel(ch);
      chanRef.current = null;
    };
  }, [code, hostDispatch]);

  const guestDispatch = useCallback((action: Action) => {
    chanRef.current?.send({
      type: "broadcast",
      event: "action",
      payload: { from: meRef.current, action },
    });
  }, []);

  const fallback = state ?? createGame("mix", { A: "", B: "", C: "" }, true);
  useGameDriver(fallback, hostDispatch, isHost && !!state);

  const hostOnline = isHost || peers.some((peer) => peer.p.role === "host");
  const expectedGuests = (state?.players ?? 2) - 1;
  const connectedGuests = Object.keys(roster).filter((id) =>
    id === meRef.current || peers.some((peer) => peer.id === id && peer.p.role === "guest"),
  ).length;
  const allGuestsOnline = connectedGuests >= expectedGuests;
  const opponentOnline = hostOnline && allGuestsOnline;
  const assignedSeat = isHost ? "A" : mySeat;

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
            {copied ? "Odkaz zkopírován ✓" : "Zkopírovat odkaz pro hráče"}
          </button>
          <p className="mt-3 text-xs text-muted-foreground">
            {state ? state.players + " hráči · " + (CATEGORIES.find((c) => c.id === state.category)?.name ?? "Mix") + " · " + (DIFFICULTIES.find((d) => d.id === state.difficulty)?.name ?? "") : "Načítám nastavení místnosti…"}
          </p>
        </div>

        <div className="space-y-2 text-left">
          {(state?.seats ?? SEATS.slice(0, 2)).map((seat) => {
            const guestId = Object.keys(roster).find((id) => roster[id] === seat);
            const guestPeer = peers.find((peer) => peer.id === guestId);
            const online = seat === "A" ? hostOnline : !!guestId && (guestId === meRef.current || !!guestPeer);
            const playerName = state?.names[seat] || (seat === "A" ? "Hostitel" : "Čeká se…");
            return <PlayerRow key={seat} color={SEAT_TEXT[seat]} label={SEAT_LABEL[seat]} name={playerName} online={online} />;
          })}
        </div>

        {!ready && <p className="text-sm text-muted-foreground">Připojuji…</p>}
        {isHost ? (
          <button disabled={!state || !allGuestsOnline} onClick={() => hostDispatch({ type: "START" })}
            className="w-full rounded-lg bg-primary py-3 font-display text-lg font-bold text-primary-foreground disabled:opacity-40">
            {allGuestsOnline ? "Začít hru" : "Čekám na " + expectedGuests + " soupeře…"}
          </button>
        ) : (
          <p className="text-muted-foreground">
            {hostOnline ? "Jsi připojen. Čekáme, až hostitel spustí hru…" : "Hostitel zatím není v místnosti."}
            {mySeat ? " Tvoje barva: " + SEAT_LABEL[mySeat] + "." : ""}
          </p>
        )}
      </main>
    );
  }

  return (
    <>
      {!opponentOnline && (
        <div className="fixed inset-x-0 top-0 z-50 bg-destructive py-1 text-center text-sm text-destructive-foreground">
          Některý hráč se odpojil — čekáme na návrat…
        </div>
      )}
      {!isHost && !assignedSeat && (
        <div className="fixed inset-x-0 top-8 z-40 bg-muted py-2 text-center text-sm text-foreground">
          Místnost už má obsazená všechna hráčská místa. Hru můžeš sledovat, ale nejsi přiřazen k barvě.
        </div>
      )}
      <GameScreen
        state={state}
        mySeats={assignedSeat ? [assignedSeat] : []}
        dispatch={isHost ? hostDispatch : guestDispatch}
        canRematch={isHost}
      />
    </>
  );
}

function PlayerRow({ color, label, name, online }: { color: string; label: string; name: string; online: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3">
      <div>
        <div className={"font-display text-xs uppercase tracking-widest " + color}>{label}</div>
        <div className="font-bold">{name}</div>
      </div>
      <span className={online && name !== "Čeká se…" ? "text-success" : "text-muted-foreground"}>
        {online && name !== "Čeká se…" ? "● připraven" : "○ čeká"}
      </span>
    </div>
  );
}
