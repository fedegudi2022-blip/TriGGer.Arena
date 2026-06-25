export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '../../lib/api';
import { invalidateSiteDataCache } from '../../lib/site-data';
import { query, execute } from '../../lib/db';

const VALID_KEYS = ['hero', 'howto', 'rules', 'effexo', 'footer', 'social'] as const;

/** GET /api/content-blocks — usado por el panel admin para precargar el editor */
export const GET: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  const rows = await query<{ key: string; value: unknown }>('SELECT `key`, value FROM content_blocks');
  return jsonResponse({ data: rows });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: { key?: string; value?: unknown };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  if (!body.key || typeof body.value !== 'object')
    return jsonResponse({ error: 'key y value son requeridos' }, 400);

  if (!VALID_KEYS.includes(body.key as typeof VALID_KEYS[number]))
    return jsonResponse({ error: 'key inválida' }, 400);

  try {
    await execute(
      `INSERT INTO content_blocks (\`key\`, value) VALUES (:key, CAST(:value AS JSON))
       ON DUPLICATE KEY UPDATE value = CAST(:value AS JSON)`,
      { key: body.key, value: JSON.stringify(body.value) }
    );
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }

  invalidateSiteDataCache('content_blocks');
  return jsonResponse({ ok: true });
};