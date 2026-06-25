export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAuth, jsonResponse } from '../../lib/api';
import { findUsernameTaken } from '../../lib/auth';
import { execute } from '../../lib/db';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const AVATAR_URL_RE = /^https?:\/\/.+/;

export const POST: APIRoute = async ({ request, cookies }) => {
  const { user } = await requireAuth(request, cookies);
  if (!user) return jsonResponse({ error: 'No autorizado' }, 401);

  let body: { username?: string; avatar_url?: string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  const { username, avatar_url } = body;
  const updates: string[] = [];
  const params: Record<string, unknown> = { id: user.id };

  if (username !== undefined) {
    if (typeof username !== 'string' || !USERNAME_RE.test(username))
      return jsonResponse({ error: 'El username debe tener entre 3 y 20 caracteres (letras, números y _)' }, 400);

    if (await findUsernameTaken(username, user.id))
      return jsonResponse({ error: 'Ese username ya está en uso' }, 409);

    updates.push('username = :username');
    params.username = username;
  }

  if (avatar_url !== undefined) {
    if (avatar_url && !AVATAR_URL_RE.test(avatar_url))
      return jsonResponse({ error: 'URL de avatar inválida' }, 400);
    updates.push('avatar_url = :avatar_url');
    params.avatar_url = avatar_url || null;
  }

  if (updates.length === 0)
    return jsonResponse({ error: 'No hay nada que actualizar' }, 400);

  try {
    await execute(`UPDATE profiles SET ${updates.join(', ')} WHERE id = :id`, params);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }

  return jsonResponse({ ok: true });
};