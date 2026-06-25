/**
 * Consulta de estado de servidores CS 1.6 via protocolo A2S de Valve.
 * Implementación nativa en Node.js (dgram/UDP) — sin gamedig ni bindings
 * nativos, compatible con Vercel Edge/Serverless.
 *
 * Protocolo: https://developer.valvesoftware.com/wiki/Server_queries#A2S_INFO
 */
import { createSocket } from 'dgram';
import { getServersSafe } from './site-data';
import type { ServerResult } from './types';

export type { ServerResult };

const CACHE_TTL_MS     = 20_000; // 20s — suficiente para no spamear el UDP
const QUERY_TIMEOUT_MS = 3_500;

const cache = new Map<number, { data: ServerResult; expiresAt: number }>();

// ── Protocolo A2S_INFO ────────────────────────────────────────────────────
// Request:  FF FF FF FF 54  "Source Engine Query\0"
// Response: empieza con FF FF FF FF 49 (o 6D en GoldSrc)

const A2S_INFO_REQUEST = Buffer.from([
  0xff, 0xff, 0xff, 0xff, 0x54,
  ...Buffer.from('Source Engine Query\0'),
]);

// A2S_PLAYER request (necesita challenge number)
const A2S_PLAYER_CHALLENGE = Buffer.from([
  0xff, 0xff, 0xff, 0xff, 0x55,
  0xff, 0xff, 0xff, 0xff,
]);

function parseA2SInfo(buf: Buffer): {
  map: string;
  players: number;
  maxPlayers: number;
  ping: number;
} | null {
  try {
    // Saltar header FF FF FF FF + tipo (1 byte) + obsolete addr (string) en GoldSrc
    // Para CS 1.6 (GoldSrc) el formato es ligeramente distinto al Source
    // Header: FF FF FF FF 6D (GoldSrc) o FF FF FF FF 49 (Source)
    let offset = 4;
    const type = buf[offset++];

    // GoldSrc (0x6D = 'm') — CS 1.6
    if (type === 0x6d) {
      // ip:port string (null-terminated)
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++; // null

      // hostname (null-terminated)
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;

      // map (null-terminated)
      const mapStart = offset;
      while (offset < buf.length && buf[offset] !== 0) offset++;
      const map = buf.slice(mapStart, offset).toString('utf8');
      offset++;

      // gamedir, gamename (skip)
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;

      // appid (2 bytes LE), players (1), maxplayers (1)
      offset += 2;
      const players    = buf[offset++];
      const maxPlayers = buf[offset++];

      return { map, players, maxPlayers, ping: 0 };
    }

    // Source (0x49 = 'I')
    if (type === 0x49) {
      offset++; // protocol version

      // name (null-terminated)
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;

      // map
      const mapStart = offset;
      while (offset < buf.length && buf[offset] !== 0) offset++;
      const map = buf.slice(mapStart, offset).toString('utf8');
      offset++;

      // folder, game (skip)
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;

      // appid (2), players (1), max_players (1)
      offset += 2;
      const players    = buf[offset++];
      const maxPlayers = buf[offset++];

      return { map, players, maxPlayers, ping: 0 };
    }

    return null;
  } catch {
    return null;
  }
}

function queryServerUDP(host: string, port: number): Promise<{
  map: string;
  players: number;
  maxPlayers: number;
  ping: number;
}> {
  return new Promise((resolve, reject) => {
    const sock = createSocket('udp4');
    const start = Date.now();
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      try { sock.close(); } catch {}
      if (err) reject(err);
    };

    const timer = setTimeout(() => {
      finish(new Error(`Timeout después de ${QUERY_TIMEOUT_MS}ms`));
    }, QUERY_TIMEOUT_MS);

    sock.on('error', (err) => {
      clearTimeout(timer);
      finish(err);
    });

    sock.on('message', (msg) => {
      clearTimeout(timer);
      const ping = Date.now() - start;
      const parsed = parseA2SInfo(msg);
      if (parsed) {
        settled = true;
        try { sock.close(); } catch {}
        resolve({ ...parsed, ping });
      } else {
        finish(new Error('Respuesta A2S_INFO inválida'));
      }
    });

    sock.send(A2S_INFO_REQUEST, port, host, (err) => {
      if (err) {
        clearTimeout(timer);
        finish(err);
      }
    });
  });
}

async function queryServer(server: {
  id: number;
  host: string;
  port: number;
}): Promise<ServerResult> {
  try {
    const state = await queryServerUDP(server.host, server.port);

    const result: ServerResult = {
      id:         server.id,
      online:     true,
      map:        state.map,
      players:    state.players,
      maxPlayers: state.maxPlayers,
      ping:       state.ping,
      updatedAt:  Date.now(),
      playerList: [], // A2S_PLAYER requiere un segundo request; omitimos por ahora
    };

    cache.set(server.id, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
