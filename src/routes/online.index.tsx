import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CATEGORIES, DIFFICULTIES, type CategoryId, type Difficulty } from "@/lib/quiz/questions";

type OnlineSearch = { cat: CategoryId; players: 2 | 3; difficulty: Difficulty };

export const Route = createFileRoute("/online/")({
  validateSearch: (s: Record<string, unknown>): OnlineSearch => ({
    cat: CATEGORIES.some((c) => c.id === s["cat"]) ? (s["cat"] as CategoryId) : "mix",
    players: s["players"] === 3 ? 3 : 2,
    difficulty: DIFFICULTIES.some((d) => d.id === s["difficulty"]) ? (s["difficulty"] as Difficulty) : "mix",
  }),
  head: () => ({
    meta: [
      { title: "Online místnost — AZ Duel" },
      { name: "description", content: "Založ online místnost AZ kvízu pro dva nebo tři hráče a pošli kód nebo odkaz." },
      { property: "og:title", content: "Online místnost — AZ Duel" },
      { property: "og:description", content: "Online AZ kvíz pro 2 až 3 hráče." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnlineLobby,
});

function OnlineLobby() {
  const { cat, players, difficulty } = Route.useSearch();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  useEffect(() => setName(localStorage.getItem("az:name") ?? ""), []);
  const catName = CATEGORIES.find((c) => c.id === cat)?.name;
  const difficultyName = DIFFICULTIES.find((d) => d.id === difficulty)?.name;

  const create = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const c = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    localStorage.setItem("az:name", name.trim() || "Hostitel");
    sessionStorage.setItem("az:host:" + c, JSON.stringify({ cat, players, difficulty }));
    navigate({ to: "/online/$code", params: { code: c } });
  };
  const join = () => {
    const value = code.trim().toUpperCase();
    if (value.length < 4) return;
    localStorage.setItem("az:name", name.trim() || "Hráč");
    navigate({ to: "/online/$code", params: { code: value } });
  };

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-12">
      <h1 className="font-display text-4xl font-bold">Online <span className="text-player-a">místnost</span></h1>
      <label className="block text-sm text-muted-foreground">Tvoje přezdívka
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Např. Chmelák"
          className="mt-1 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <div className="rounded-xl border border-border bg-card/70 p-4">
        <div className="font-display font-bold">Nastavení místnosti</div>
        <p className="mt-1 text-sm text-muted-foreground">{catName} · {players} hráči · obtížnost: {difficultyName}</p>
        <p className="text-sm text-muted-foreground">Zakladatel hraje za modrého. Ostatní se připojí přes kód nebo odkaz.</p>
        <button onClick={create} className="mt-3 w-full rounded-lg bg-player-a py-2 font-display font-bold text-primary-foreground">Vytvořit místnost</button>
      </div>
      <div className="rounded-xl border border-border bg-card/70 p-4">
        <div className="font-display font-bold">Připojit se kódem</div>
        <div className="mt-3 flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} placeholder="KÓD"
            className="min-w-0 flex-1 rounded-lg border border-input bg-background/60 px-3 py-2 font-display tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring" />
          <button onClick={join} className="rounded-lg bg-player-b px-4 font-display font-bold text-primary-foreground">Připojit</button>
        </div>
      </div>
    </main>
  );
}
