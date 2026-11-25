import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CATEGORIES, type CategoryId } from "@/lib/quiz/questions";

export const Route = createFileRoute("/online/")({
  validateSearch: (s: Record<string, unknown>): { cat: CategoryId } => ({
    cat: CATEGORIES.some((c) => c.id === s["cat"]) ? (s["cat"] as CategoryId) : "mix",
  }),
  head: () => ({
    meta: [
      { title: "Online místnost — AZ Duel" },
      { name: "description", content: "Založ online místnost AZ kvízu a pošli kamarádovi kód nebo odkaz." },
      { property: "og:title", content: "Online místnost — AZ Duel" },
      { property: "og:description", content: "Online AZ kvíz pro dva s kódem místnosti." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnlineLobby,
});

function OnlineLobby() {
  const { cat } = Route.useSearch();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  useEffect(() => setName(localStorage.getItem("az:name") ?? ""), []);
  const catName = CATEGORIES.find((c) => c.id === cat)?.name;

  const create = () => {
    const c = Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    localStorage.setItem("az:name", name || "Hostitel");
    sessionStorage.setItem(`az:host:${c}`, cat);
    navigate({ to: "/online/$code", params: { code: c } });
  };
  const join = () => {
    if (code.trim().length < 4) return;
    localStorage.setItem("az:name", name || "Host");
    navigate({ to: "/online/$code", params: { code: code.trim().toUpperCase() } });
  };

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-12">
      <h1 className="font-display text-4xl font-bold">Online <span className="text-player-a">duel</span></h1>
      <label className="block text-sm text-muted-foreground">Tvoje přezdívka
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Např. Chmelák"
          className="mt-1 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <div className="rounded-xl border border-border bg-card/70 p-4">
        <div className="font-display font-bold">Založit místnost</div>
        <p className="text-sm text-muted-foreground">Kategorie: {catName}. Budeš hrát za modrého.</p>
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
