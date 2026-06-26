import { getServersSafe } from './site-data';
import type { ServerResult } from './types';

export type { ServerResult };

const CACHE_TTL_MS     = 20_000;
const QUERY_TIMEOUT_MS = 8_000;

// URL del proxy externo. Configurá esta variable en Vercel Dashboard → Settings → Environment Variables.
// Si no está configurada, el módulo marca todos los servidores como offline con un mensaje claro.
const PROXY_URL = (typeof process !== 'undefined' ? process.env.GAMEDIG_PROXY_URL : undefined) ?? '';

const cache = new Map<number, { data: ServerResult; expiresAt: number }>();

// ── Query via proxy HTTP ───────────────────────────────────────────────────

async function queryServer(server: {
  id: number; host: string; port: number;
}): Promise<ServerResult> {
  if (!PROXY_URL) {
    // Devolver caché stale si existe
    const cached = cache.get(server.id);
    if (cached) return { ...cached.data, stale: true };
    return {
      id: server.id,
      online: false,
      playerList: [],
      error: 'GAMEDIG_PROXY_URL no configurada — ver src/lib/server-status.ts',
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

    // El proxy espera: GET /query?type=counterstrike16&host=IP&port=PORT
    const url = new URL('/query', PROXY_URL);
    url.searchParams.set('type', 'counterstrike16');
    url.searchParams.set('host', server.host);
    url.searchParams.set('port', String(server.port));

    const start = Date.now();
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    }).finally(() => clearTimeout(timer));

    const ping = Date.now() - start;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Proxy HTTP ${res.status}: ${body || res.statusText}`);
    }

    // El proxy devuelve el resultado de gamedig directamente (o { error: "..." })
    const data = await res.json() as {
      name?: string;
      map?: string;
      maxplayers?: number;
      players?: Array<{ name?: string }>;
      bots?: Array<{ name?: string }>;
      ping?: number;
      error?: string;
    };

    if (data.error) {
      throw new Error(data.error);
    }

    const playerList  = (data.players ?? [])
      .map(p => (p.name ?? '').trim())
      .filter(n => n.length > 0);

    const result: ServerResult = {
      id:         server.id,
      online:     true,
      map:        data.map ?? '—',
      players:    (data.players ?? []).length,
      maxPlayers: data.maxplayers ?? 32,
      ping:       data.ping ?? Math.round(ping / 2),
      updatedAt:  Date.now(),
      playerList,
    };

    cache.set(server.id, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ServerStatus] Servidor ${server.id} (${server.host}:${server.port}):`, message);

    const cached = cache.get(server.id);
    if (cached) return { ...cached.data, stale: true };

    return { id: server.id, online: false, playerList: [], error: message };
  }
}

// ── Export principal ───────────────────────────────────────────────────────

export async function getAllServerStatuses(): Promise<ServerResult[]> {
  const servers = await getServersSafe();
  const active  = servers.filter(s => s.active !== false);

  return Promise.all(
    active.map(server => {
      const cached = cache.get(server.id);
      if (cached && cached.expiresAt > Date.now()) return cached.data;
      return queryServer(server);
    })
  );
}
