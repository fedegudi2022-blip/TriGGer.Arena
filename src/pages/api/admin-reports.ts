import type { APIRoute } from 'astro';
import { query, execute } from '../../lib/db';
import { requireAdmin, jsonResponse } from '../../lib/api';

export const prerender = false;

const VALID_STATUSES = ['pendiente', 'revisando', 'resuelto', 'descartado'] as const;

// GET — list reports
export const GET: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  try {
    const reports = await query(
      `SELECT id, reporter_email, reported_nick, tipo, descripcion, fecha_aprox, status, created_at
         FROM reports ORDER BY created_at DESC LIMIT 300`
    );
    return jsonResponse({ ok: true, reports });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
};

// PATCH — update status
export const PATCH: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON inválido' }, 400); }

  const { id, status } = body;
  if (!id) return jsonResponse({ error: 'ID requerido' }, 400);
  if (!VALID_STATUSES.includes(status)) return jsonResponse({ error: 'Estado inválido' }, 400);

  try {
    await execute(`UPDATE reports SET status = :status WHERE id = :id`, { status, id });
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
};

// DELETE — delete report
export const DELETE: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'JSON inválido' }, 400); }

  const { id } = body;
  if (!id) return jsonResponse({ error: 'ID requerido' }, 400);

  try {
    await execute(`DELETE FROM reports WHERE id = :id`, { id });
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
};
