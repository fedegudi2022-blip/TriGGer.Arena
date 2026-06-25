/**
 * Consulta de estado de servidores CS 1.6 via protocolo A2S de Valve.
 * Implementación nativa en Node.js (dgram/UDP) — sin gamedig ni bindings
 * nativos, compatible con Vercel serverless.
 *
 * Protocolo: https://developer.valvesoftware.com/wiki/Server_queries
 */
import { createSocket } from 'dgram';
import { getServersSafe } from './site-data';
import type { ServerResult } from './types';

export type { ServerResult };

const CACHE_TTL_MS     = 20_000;
const QUERY_TIMEOUT_MS = 4_000;

const cache = new Map<number, { data: ServerResult; expiresAt: number }>();

// ── UDP helper ────────────────────────────────────────────────────────────

function udpRequest(host: string, port: number, payload: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const sock = createSocket('udp4');
    let settled = false;

    const done = (err?: Error, buf?: Buffer) => {
      if (settled) return;
      settled = true;
      try { sock.close(); } catch {}
      if (err) reject(err);
      else resolve(buf!);
    };

    const timer = setTimeout(() => done(new Error(`UDP timeout (${QUERY_TIMEOUT_MS}ms)`)), QUERY_TIMEOUT_MS);

    sock.on('error', (e) => { clearTimeout(timer); done(e); });
    sock.on('message', (msg) => { clearTimeout(timer); done(undefined, msg); });
    sock.send(payload, port, host, (e) => { if (e) { clearTimeout(timer); done(e); } });
  });
}

// ── A2S_INFO ──────────────────────────────────────────────────────────────

const A2S_INFO_REQUEST = Buffer.from([
  0xff, 0xff, 0xff, 0xff, 0x54,
  ...Buffer.from('Source Engine Query\0'),
]);

function parseA2SInfo(buf: Buffer): {
  map: string; players: number; maxPlayers: number; ping: number;
} | null {
  try {
    let offset = 4;
    const type = buf[offset++];

    // GoldSrc (CS 1.6) = 0x6D
    if (type === 0x6d) {
      // ip:port string
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;
      // hostname
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;
      // map
      const mapStart = offset;
      while (offset < buf.length && buf[offset] !== 0) offset++;
      const map = buf.slice(mapStart, offset).toString('utf8');
      offset++;
      // gamedir
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;
      // gamename
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;
      // appid (2 bytes)
      offset += 2;
      const players    = buf[offset++];
      const maxPlayers = buf[offset++];
      return { map, players, maxPlayers, ping: 0 };
    }

    // Source = 0x49
    if (type === 0x49) {
      offset++; // protocol
      // name
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;
      // map
      const mapStart = offset;
      while (offset < buf.length && buf[offset] !== 0) offset++;
      const map = buf.slice(mapStart, offset).toString('utf8');
      offset++;
      // folder, game
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;
      while (offset < buf.length && buf[offset] !== 0) offset++;
      offset++;
      // appid (2), players (1), max (1)
      offset += 2;
      const players    = buf[offset++];
      const maxPlayers = buf[offset++];
      return { map, players, maxPlayers, ping: 0 };
    }

    return null;
  } catch { return null; }
}

// ── A2S_PLAYER ────────────────────────────────────────────────────────────
// Paso 1: pedir challenge number con FF FF FF FF 55 FF FF FF FF
// Paso 2: usar ese challenge para pedir la lista real

const A2S_PLAYER_CHALLENGE_REQ = Buffer.from([
  0xff, 0xff, 0xff, 0xff, 0x55,
  0xff, 0xff, 0xff, 0xff,
]);

function buildPlayerRequest(challenge: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xff, 0xff, 0xff, 0x55]),
    challenge,
  ]);
}

function parseA2SPlayer(buf: Buffer): string[] {
  try {
    // Header: FF FF FF FF 44
    if (buf[4] !== 0x44) return [];
    let offset = 5;
    const count = buf[offset++];
    const names: string[] = [];

    for (let i = 0; i < count; i++) {
      if (offset >= buf.length) break;
      offset++; // index byte
      // name (null-terminated)
      const nameStart = offset;
      while (offset < buf.length && buf[offset] !== 0) offset++;
      const name = buf.slice(nameStart, offset).toString('utf8').trim();
      offset++; // null
      offset += 4; // score (int32)
      offset += 4; // duration (float)
      if (name) names.push(name);
    }
    return names;
  } catch { return []; }
}

async function getPlayerList(host: string, port: number): Promise<string[]> {
  try {
    // Paso 1: obtener challenge
    const challengeRes = await udpRequest(host, port, A2S_PLAYER_CHALLENGE_REQ);

    // Si responde directamente con la lista (algunos servidores lo hacen)
    if (challengeRes[4] === 0x44) {
      return parseA2SPlayer(challengeRes);
    }

    // Si responde con challenge (0x41 = 'A')
    if (challengeRes[4] === 0x41 && challengeRes.length >= 9) {
      const challenge = challengeRes.slice(5, 9);
      const playerReq = buildPlayerRequest(challenge);
      const playerRes = await udpRequest(host, port, playerReq);
      return parseA2SPlayer(playerRes);
    }

    return [];
  } catch { return []; }
}

// ── Query principal ───────────────────────────────────────────────────────

async function queryServer(server: {
  id: number; host: string; port: number;
}): Promise<ServerResult> {
  try {
    const start = Date.now();

    // A2S_INFO y A2S_PLAYER en paralelo para minimizar latencia
    const [infoRes, playerList] = await Promise.all([
      udpRequest(server.host, server.port, A2S_INFO_REQUEST),
      getPlayerList(server.host, server.port),
    ]);

    const ping = Date.now() - start;
    const info = parseA2SInfo(infoRes);

    if (!info) throw new Error('Respuesta A2S_INFO inválida');

    // Filtrar nombres vacíos/bots sin nombre
    const cleanPlayers = playerList.filter(n => n.length > 0);

    const result: ServerResult = {
      id:         server.id,
      online:     true,
      map:        info.map,
      players:    info.players,
      maxPlayers: info.maxPlayers,
      ping:       Math.round(ping / 2), // RTT / 2 ≈ one-way
      updatedAt:  Date.now(),
      playerList: cleanPlayers,
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