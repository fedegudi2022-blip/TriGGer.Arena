export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '../../lib/api';
import { execute } from '../../lib/db';

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const { user, error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: { userId?: string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  if (!body.userId) return jsonResponse({ error: 'Falta userId' }, 400);
  if (body.userId === user!.id) return jsonResponse({ error: 'No podés eliminarte a vos mismo' }, 400);

  try {
    // ON DELETE CASCADE limpia profiles, sessions, oauth_accounts y tokens.
    await execute('DELETE FROM users WHERE id = :id', { id: body.userId });
  } catch (err) {
    console.error('[delete-user]', err);
    return jsonResponse({ error: 'Error al eliminar el usuario' }, 500);
  }

  return jsonResponse({ ok: true });
};