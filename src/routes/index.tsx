import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CATEGORIES, DIFFICULTIES, QUESTIONS, type CategoryId, type Difficulty } from "@/lib/quiz/questions";
import { cn } from "@/lib/utils";
import { createBeerRoom } from "@/lib/quiz/beer-api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AZ Duel — AZ kvíz pro 2 až 3 hráče" },
      { name: "description", content: "AZ kvíz pro dva nebo tři hráče. Online místnosti, lokální hra a trénink proti AI." },
      { property: "og:title", content: "AZ Duel — AZ kvíz pro 2 až 3 hráče" },
      { property: "og:description", content: "Trojúhelníková herní deska, online místnosti i hra u jednoho displeje." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [cat, setCat] = useState<CategoryId>("mix");
  const [players, setPlayers] = useState<2 | 3>(2);
  const [difficulty, setDifficulty] = useState<Difficulty>("mix");
  const [nickname, setNickname] = useState("Chmelák");
  const [beerCreating, setBeerCreating] = useState(false);
  const [beerError, setBeerError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem("az:name");
    if (saved) setNickname(saved);
  }, []);

  const createBeerRoomNow = async () => {
    if (beerCreating) return;
    setBeerCreating(true);
    setBeerError("");
    try {
      const created = await createBeerRoom(nickname.trim() || "Chmelák");
      await navigate({ to: "/pivni-kviz/$code", params: { code: created.code } });
    } catch (cause) {
      setBeerError(cause instanceof Error ? cause.message : "Místnost se nepodařilo vytvořit.");
    } finally {
      setBeerCreating(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:py-16">
      <h1 className="font-display text-5xl font-bold tracking-tight md:text-7xl">
        AZ<span className="text-primary">DUEL</span>
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Kvízová pyramida pro dva nebo tři hráče. Deska má 28 polí ve dvojici a 55 polí při hře ve třech.
        V databázi je aktuálně {QUESTIONS.length.toLocaleString("cs-CZ")} otázek.
      </p>

      <h2 className="mt-10 font-display text-sm uppercase tracking-widest text-muted-foreground">1 · Kategorie</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        {CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)}
            className={cn("rounded-xl border bg-card/70 p-4 text-left transition-all hover:border-primary",
              cat === c.id ? "border-primary ring-2 ring-primary/40" : "border-border")}>
            <div className="text-2xl">{c.icon}</div>
            <div className="mt-1 font-display font-bold">{c.name}</div>
            <div className="text-xs text-muted-foreground">{c.desc}</div>
          </button>
        ))}
      </div>

      <h2 className="mt-10 font-display text-sm uppercase tracking-widest text-muted-foreground">2 · Počet hráčů</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button onClick={() => setPlayers(2)}
          className={cn("rounded-xl border p-4 text-left transition-all", players === 2 ? "border-primary ring-2 ring-primary/40 bg-card" : "border-border bg-card/50")}>
          <div className="font-display text-xl font-bold">2 hráči</div>
          <div className="text-sm text-muted-foreground">Klasická pyramida · 28 polí</div>
        </button>
        <button onClick={() => setPlayers(3)}
          className={cn("rounded-xl border p-4 text-left transition-all", players === 3 ? "border-primary ring-2 ring-primary/40 bg-card" : "border-border bg-card/50")}>
          <div className="font-display text-xl font-bold">3 hráči</div>
          <div className="text-sm text-muted-foreground">Velká pyramida · 55 polí</div>
        </button>
      </div>

      <h2 className="mt-7 font-display text-sm uppercase tracking-widest text-muted-foreground">3 · Obtížnost</h2>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {DIFFICULTIES.map((d) => (
          <button key={d.id} onClick={() => setDifficulty(d.id)}
            className={cn("rounded-xl border p-3 text-left transition-all", difficulty === d.id ? "border-primary ring-2 ring-primary/40 bg-card" : "border-border bg-card/50")}>
            <div className="font-display font-bold">{d.name}</div>
            <div className="text-xs text-muted-foreground">{d.desc}</div>
          </button>
        ))}
      </div>

      <h2 className="mt-10 font-display text-sm uppercase tracking-widest text-muted-foreground">4 · Herní mód</h2>
      <div className="mt-3 max-w-sm">
        <div className="max-w-sm">
          <label className="block text-sm font-semibold text-muted-foreground">Tvoje přezdívka
            <input value={nickname} onChange={(event) => { const value = event.target.value.slice(0, 16); setNickname(value); localStorage.setItem("az:name", value); }} maxLength={16} placeholder="Např. Chmelák" className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 text-foreground" />
          </label>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => void createBeerRoomNow()}
          disabled={beerCreating || !nickname.trim()}
          className="rounded-xl border border-amber-500/60 bg-card/70 p-5 text-left transition-all hover:brightness-110 disabled:opacity-50"
        >
          <div className="font-display text-xl font-bold text-amber-500">{beerCreating ? "🍺 Zakládám místnost…" : "🍺 Pivní kvíz"}</div>
          <div className="text-sm text-muted-foreground">Kliknutím rovnou vytvoříš novou partii a staneš se hostitelem. Kamarády pozveš odkazem.</div>
        </button>
        <Link to="/online" search={{ cat, players, difficulty }} className="rounded-xl border border-player-a/60 bg-card/70 p-5 hover:glow-a">
          <div className="font-display text-xl font-bold text-player-a">Online místnost</div>
          <div className="text-sm text-muted-foreground">Hrajte přes kód nebo odkaz. Online funguje pro 2 i 3 hráče.</div>
        </Link>
        <Link to="/hra" search={{ mode: "local", cat, players, difficulty }} className="rounded-xl border border-player-b/60 bg-card/70 p-5 hover:glow-b">
          <div className="font-display text-xl font-bold text-player-b">U jednoho displeje</div>
          <div className="text-sm text-muted-foreground">Pass & Play. Předáváte si jedno zařízení.</div>
        </Link>
        <Link to="/hra" search={{ mode: "ai", cat, players: 2, difficulty }} className="rounded-xl border border-primary/60 bg-card/70 p-5 hover:brightness-125">
          <div className="font-display text-xl font-bold text-primary">Trénink s AI</div>
          <div className="text-sm text-muted-foreground">Jeden hráč proti počítači na klasické desce.</div>
        </Link>
      </div>
      {beerError && <p className="mt-3 text-sm text-destructive">{beerError}</p>}

      <details className="mt-10 rounded-xl border border-border bg-card/50 p-4 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-display text-foreground">Pravidla</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Hráč na tahu vybere pole. Zobrazí se otázka a počáteční písmeno odpovědi.</li>
          <li>Správná odpověď obarví pole jeho barvou. Při chybě dostanou šanci další hráči v pořadí.</li>
          <li>Když všichni odpoví špatně, pole zčerná. Černé pole lze později znovu vyzvat.</li>
          <li>Odpovědi se píšou. Diakritika, velká písmena a drobné překlepy nevadí.</li>
          <li>Vyhrává hráč, který propojí svou barvou všechny tři strany trojúhelníku.</li>
        </ul>
      </details>
    </main>
  );
}
