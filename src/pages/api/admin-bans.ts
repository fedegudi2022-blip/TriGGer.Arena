import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { query, execute } from '../../lib/db';
import { requireAdmin, jsonResponse } from '../../lib/api';

export const prerender = false;

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS bans (
    id         VARCHAR(36)  NOT NULL PRIMARY KEY,
    nick       VARCHAR(80)  NOT NULL,
    tag        VARCHAR(40)  NULL,
    steam_id   VARCHAR(30)  NULL,
    ip         VARCHAR(45)  NULL,
    motivo     TEXT         NOT NULL,
    tipo       ENUM('hack','insultos','bug_abuse','trampa','otro') NOT NULL DEFAULT 'otro',
    admin_nick VARCHAR(80)  NULL,
    fecha_ban  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duracion   VARCHAR(40)  NULL,
    activo     TINYINT(1)   NOT NULL DEFAULT 1,
    INDEX idx_nick (nick),
    INDEX idx_steam (steam_id),
    INDEX idx_activo (activo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function ensureTable() {
  await query(TABLE_SQL);
  // Migrations: add new columns if they don't exist yet
  const migrations = [
    `ALTER TABLE bans ADD COLUMN IF NOT EXISTS tag VARCHAR(40) NULL AFTER nick`,
    `ALTER TABLE bans ADD COLUMN IF NOT EXISTS steam_id VARCHAR(30) NULL AFTER tag`,
    `ALTER TABLE bans ADD COLUMN IF NOT EXISTS ip VARCHAR(45) NULL AFTER steam_id`,
  ];
  for (const sql of migrations) {
    try { await query(sql); } catch { /* column already exists */ }
  }
}

const VALID_TIPOS = ['hack', 'insultos', 'bug_abuse', 'trampa', 'otro'] as const;

export const GET: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  try {
    await ensureTable();
    const bans = await query(
      `SELECT id, nick, tag, steam_id, ip, motivo, tipo, admin_nick, fecha_ban, duracion, activo
         FROM bans ORDER BY fecha_ban DESC LIMIT 500`
    );
    return jsonResponse({ ok: true, bans });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const { error, profile } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON inválido' }, 400); }

  const nick       = body.nick?.toString().trim().slice(0, 80);
  const tag        = body.tag?.toString().trim().slice(0, 40) || null;
  const steam_id   = body.steam_id?.toString().trim().slice(0, 30) || null;
  const ip         = body.ip?.toString().trim().slice(0, 45) || null;
  const motivo     = body.motivo?.toString().trim().slice(0, 2000);
  const tipo       = body.tipo?.toString().trim();
  const duracion   = body.duracion?.toString().trim().slice(0, 40) || null;
  const admin_nick = profile?.username || body.admin_nick?.toString().trim().slice(0, 80) || null;

  if (!nick || nick.length < 2) return jsonResponse({ error: 'Nick inválido' }, 400);
  if (!motivo || motivo.length < 3) return jsonResponse({ error: 'Motivo requerido' }, 400);
  if (!VALID_TIPOS.includes(tipo as any)) return jsonResponse({ error: 'Tipo inválido' }, 400);

  try {
    await ensureTable();
    const id = randomUUID();
    await execute(
      `INSERT INTO bans (id, nick, tag, steam_id, ip, motivo, tipo, admin_nick, duracion)
       VALUES (:id, :nick, :tag, :steam_id, :ip, :motivo, :tipo, :admin_nick, :duracion)`,
      { id, nick, tag, steam_id, ip, motivo, tipo, admin_nick, duracion }
    );
    return jsonResponse({ ok: true, id });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON inválido' }, 400); }

  const { id, activo } = body;
  if (!id) return jsonResponse({ error: 'ID requerido' }, 400);

  try {
    await execute(`UPDATE bans SET activo = :activo WHERE id = :id`, { activo: activo ? 1 : 0, id });
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON inválido' }, 400); }

  const { id } = body;
  if (!id) return jsonResponse({ error: 'ID requerido' }, 400);

  try {
    await execute(`DELETE FROM bans WHERE id = :id`, { id });
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
};
