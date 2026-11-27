import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createBeerRoom } from "@/lib/quiz/beer-api";

export const Route = createFileRoute("/pivni-kviz")({
  head: () => ({ meta: [{ title: "Pivní kvíz — AZ Duel" }, { name: "description", content: "Hospodský AZ kvíz pro partu kamarádů." }] }),
  component: BeerEntry,
});

function BeerEntry() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("Chmelák");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("az:name");
    if (saved) setNickname(saved);
  }, []);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const room = await createBeerRoom(nickname.trim() || "Chmelák");
      await navigate({ to: "/pivni-kviz/$code", params: { code: room.code } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Místnost se nepodařilo vytvořit.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="mx-auto max-w-md space-y-5 px-4 py-14">
    <Link to="/" className="text-sm text-muted-foreground underline">← Hlavní stránka</Link>
    <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-card to-card p-7 text-center">
      <div className="text-5xl">🍺</div>
      <h1 className="mt-3 font-display text-3xl font-black">PIVNÍ KVÍZ</h1>
      <p className="mt-2 text-sm text-muted-foreground">Jedna partie, jeden kód místnosti. Po skončení se místnost uzavře a další hra dostane nový kód.</p>
    </section>
    <label className="block text-sm font-semibold">Tvoje přezdívka
      <input value={nickname} onChange={(event) => setNickname(event.target.value.slice(0,16))} maxLength={16} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3" />
    </label>
    <button onClick={() => void create()} disabled={busy || !nickname.trim()} className="w-full rounded-xl bg-amber-500 px-4 py-4 font-display text-lg font-black text-black disabled:opacity-50">
      {busy ? "Zakládám místnost…" : "🍻 Založit novou partii"}
    </button>
    {error && <p className="text-sm text-destructive">{error}</p>}
  </main>;
}
