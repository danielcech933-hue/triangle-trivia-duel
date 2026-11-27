import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

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

