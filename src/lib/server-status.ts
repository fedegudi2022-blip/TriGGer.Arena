/**
 * Consulta de estado de servidores CS 1.6 via proxy HTTP externo.
 *
 * ¿Por qué no gamedig directamente en Vercel?
 * Vercel serverless (Node.js runtime) NO permite sockets UDP salientes.
 * GameDig y la implementación A2S nativa usan UDP → ambos fallan en producción.
 *
 * Solución: una Vercel Serverless Function NO puede hacer UDP.
 * Necesitás un proxy externo que haga el UDP query y devuelva JSON por HTTP.
 *
 * OPCIONES (de más fácil a más compleja):
 *
 *  1. [RECOMENDADO] Desplegá `gamedig-proxy` en Railway/Render/Fly.io (gratis tier).
 *     Es un servidor Express que wrappea gamedig y expone un endpoint HTTP.
 *     El código del proxy está incluido al final de este archivo como comentario.
 *     Configurá GAMEDIG_PROXY_URL en las env vars de Vercel.
 *
 *  2. Usá la función Edge de Vercel (Edge Runtime) — tampoco permite UDP.
 *
 *  3. Montá gamedig en un VPS propio y exponé el endpoint.
 *
 * Una vez que tengas el proxy corriendo, seteá en Vercel:
 *   GAMEDIG_PROXY_URL=https://tu-proxy.railway.app
 */
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

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  CÓDIGO DEL PROXY (desplegarlo en Railway, Render, Fly.io, o tu propio VPS)
 *  Guardalo como `proxy/index.mjs` en un repo separado y hacé deploy.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * // proxy/package.json
 * {
 *   "name": "gamedig-proxy",
 *   "type": "module",
 *   "scripts": { "start": "node index.mjs" },
 *   "dependencies": { "gamedig": "^5.3.3", "express": "^4.18.2" }
 * }
 *
 * // proxy/index.mjs
 * import express from 'express';
 * import { GameDig } from 'gamedig';
 *
 * const app  = express();
 * const PORT = process.env.PORT ?? 3000;
 *
 * // Whitelist de IPs permitidas (opcional pero recomendado)
 * const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS ?? '').split(',').filter(Boolean);
 *
 * app.get('/query', async (req, res) => {
 *   const { type, host, port } = req.query;
 *   if (!type || !host) return res.status(400).json({ error: 'type y host son requeridos' });
 *
 *   // Validar que el host consultado esté en la lista blanca (seguridad)
 *   if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.includes(host)) {
 *     return res.status(403).json({ error: 'Host no permitido' });
 *   }
 *
 *   try {
 *     const result = await GameDig.query({
 *       type,
 *       host,
 *       port: port ? Number(port) : undefined,
 *       socketTimeout: 5000,
 *       attemptTimeout: 6000,
 *       maxAttempts: 2,
 *     });
 *     res.json(result);
 *   } catch (err) {
 *     res.status(200).json({ error: err.message ?? String(err) });
 *   }
 * });
 *
 * app.listen(PORT, () => console.log(`Proxy escuchando en :${PORT}`));
 *
 * // Variables de entorno en Railway/Render:
 * //   PORT        → lo setea automáticamente la plataforma
 * //   ALLOWED_HOSTS → "45.235.98.30,45.235.98.222"  (IPs de tus servidores CS)
 */