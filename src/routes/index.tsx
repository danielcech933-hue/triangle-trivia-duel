import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CATEGORIES, QUESTIONS, type CategoryId } from "@/lib/quiz/questions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AZ Duel — vlastní AZ kvíz pro dva hráče" },
      { name: "description", content: "Pyramida 28 polí, šest kategorií, online hra s kódem, hra u jednoho displeje i trénink proti AI." },
      { property: "og:title", content: "AZ Duel — vlastní AZ kvíz pro dva hráče" },
      { property: "og:description", content: "Pyramida 28 polí, šest kategorií, online i lokální hra." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [cat, setCat] = useState<CategoryId>("mix");
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:py-16">
      <h1 className="font-display text-5xl font-bold tracking-tight md:text-7xl">
        AZ<span className="text-primary">DUEL</span>
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Pyramida 28 polí. <span className="text-player-a">Modrý</span> proti <span className="text-player-b">Oranžovému</span>.
        Propoj všechny tři strany trojúhelníku. {QUESTIONS.length} otázek v databázi.
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

      <h2 className="mt-10 font-display text-sm uppercase tracking-widest text-muted-foreground">2 · Herní mód</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Link to="/online" search={{ cat }} className="rounded-xl border border-player-a/60 bg-card/70 p-5 hover:glow-a">
          <div className="font-display text-xl font-bold text-player-a">Online</div>
          <div className="text-sm text-muted-foreground">Místnost s kódem nebo odkazem pro kamaráda.</div>
        </Link>
        <Link to="/hra" search={{ mode: "local", cat }} className="rounded-xl border border-player-b/60 bg-card/70 p-5 hover:glow-b">
          <div className="font-display text-xl font-bold text-player-b">U jednoho displeje</div>
          <div className="text-sm text-muted-foreground">Pass & Play pro dva hráče.</div>
        </Link>
        <Link to="/hra" search={{ mode: "ai", cat }} className="rounded-xl border border-primary/60 bg-card/70 p-5 hover:brightness-125">
          <div className="font-display text-xl font-bold text-primary">Trénink s AI</div>
          <div className="text-sm text-muted-foreground">Zahraj si proti počítači.</div>
        </Link>
      </div>

      <details className="mt-10 rounded-xl border border-border bg-card/50 p-4 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-display text-foreground">Pravidla</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Hráč na tahu vybere pole, zobrazí se otázka a počáteční písmeno odpovědi.</li>
          <li>Správná odpověď = pole v barvě hráče. Chybná = šance pro soupeře, jinak pole zčerná.</li>
          <li>Černé pole lze vybrat znovu: náhradní otázka — správně = tvoje, špatně = soupeřovo.</li>
          <li>Odpovědi se píšou. Diakritika, velká písmena a drobné překlepy nevadí, stačí i příjmení.</li>
          <li>Vyhrává, kdo souvislou cestou propojí všechny tři strany pyramidy.</li>
        </ul>
      </details>
    </main>
  );
}
