import { supabase } from "@/integrations/supabase/client";
import { makeRoomCode, makeSecretToken, type BeerRoomSnapshot } from "./beer";

export interface BeerCredentials {
  playerId: string;
  token: string;
  role: "host" | "guest";
}

const credentialKey = (code: string) => "az:beer:credentials:" + code.toUpperCase();

export function saveBeerCredentials(code: string, credentials: BeerCredentials): void {
  localStorage.setItem(credentialKey(code), JSON.stringify(credentials));
}

export function readBeerCredentials(code: string): BeerCredentials | null {
  try {
    const value = localStorage.getItem(credentialKey(code));
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<BeerCredentials>;
    if (typeof parsed.playerId !== "string" || typeof parsed.token !== "string" ||
        (parsed.role !== "host" && parsed.role !== "guest")) return null;
    return parsed as BeerCredentials;
  } catch {
    return null;
  }
}

export async function beerRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message || "Nepodařilo se spojit s herním serverem.");
  return data as T;
}

export async function createBeerRoom(nickname: string): Promise<{ code: string; credentials: BeerCredentials; snapshot: BeerRoomSnapshot }> {
  const name = nickname.trim().slice(0, 16) || "Chmelák";
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeRoomCode();
    const credentials: BeerCredentials = {
      playerId: crypto.randomUUID(),
      token: makeSecretToken(),
      role: "host",
    };

    try {
      const snapshot = await beerRpc<BeerRoomSnapshot>("beer_create_room", {
        p_code: code,
        p_player_id: credentials.playerId,
        p_token: credentials.token,
        p_nickname: name,
      });
      saveBeerCredentials(code, credentials);
      localStorage.setItem("az:name", name);
      return { code, credentials, snapshot };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate key|already exists|unique constraint/i.test(message)) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Nepodařilo se vytvořit novou místnost. Zkus to prosím znovu.");
}

export async function joinBeerRoom(code: string, nickname: string): Promise<{ credentials: BeerCredentials; snapshot: BeerRoomSnapshot }> {
  const credentials: BeerCredentials = {
    playerId: crypto.randomUUID(),
    token: makeSecretToken(),
    role: "guest",
  };
  const snapshot = await beerRpc<BeerRoomSnapshot>("beer_join_room", {
    p_code: code.toUpperCase(),
    p_player_id: credentials.playerId,
    p_token: credentials.token,
    p_nickname: nickname.trim().slice(0, 16),
  });
  saveBeerCredentials(code, credentials);
  localStorage.setItem("az:name", nickname.trim().slice(0, 16));
  return { credentials, snapshot };
}

export async function getBeerRoom(code: string, credentials: BeerCredentials): Promise<BeerRoomSnapshot> {
  return beerRpc<BeerRoomSnapshot>("beer_get_room", {
    p_code: code.toUpperCase(),
    p_player_id: credentials.playerId,
    p_token: credentials.token,
  });
}
