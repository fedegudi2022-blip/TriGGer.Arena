export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '../../lib/api';
import { execute } from '../../lib/db';

/** POST /api/set-role — cambiar el rol de un usuario (solo admin) */
export const POST: APIRoute = async ({ request, cookies }) => {
  const { user, error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: { userId?: string; role?: string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  const { userId, role } = body;
  if (!userId || !['admin', 'user'].includes(role ?? ''))
    return jsonResponse({ error: 'Parámetros inválidos' }, 400);

  if (userId === user!.id && role !== 'admin')
    return jsonResponse({ error: 'No podés quitarte el rol admin a vos mismo' }, 400);

  try {
    await execute('UPDATE profiles SET role = :role WHERE id = :id', { role, id: userId });
  } catch (err) {
    console.error('[set-role]', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }

  return jsonResponse({ ok: true });
};