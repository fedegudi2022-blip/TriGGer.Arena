/**
 * Lógica de consulta de estado de servidores (gamedig).
 * Usada exclusivamente por /api/servers.json.
 * Los servidores se leen de la tabla `servers` en MySQL (con fallback).
 */
import { createRequire } from 'module';
import { getServersSafe } from './site-data';
import type { ServerResult } from './types';

// Re-exportar para quienes ya importaban desde aquí
export type { ServerResult };

const require = createRequire(import.meta.url);
const { GameDig } = require('gamedig');

const CACHE_TTL_MS    = 15_000;
const QUERY_TIMEOUT_MS = 3_000;

const cache = new Map<number, { data: ServerResult; expiresAt: number }>();

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function queryServer(server: { id: number; host: string; port: number }): Promise<ServerResult> {
  try {
    const state = await GameDig.query({
      type: 'counterstrike16',
      host: server.host,
      port: server.port,
      socketTimeout:  QUERY_TIMEOUT_MS,
      attemptTimeout: QUERY_TIMEOUT_MS,
      maxAttempts: 1,
    });

    const playerList: string[] = (state.players ?? [])
      .filter((p: { name?: string }) => p.name?.trim())
      .map((p: { name?: string }) => p.name as string);

    const result: ServerResult = {
      id: server.id,
      online: true,
      map: state.map,
      players: state.players.length,
      maxPlayers: state.maxplayers,
      ping: Math.round(state.ping),
      updatedAt: Date.now(),
      playerList,
    };

    cache.set(server.id, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    console.error(`[ServerStatus] Servidor ${server.id}:`, message);

    const cached = cache.get(server.id);
    if (cached) return { ...cached.data, stale: true };

    return { id: server.id, online: false, playerList: [], error: message };
  }
}

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