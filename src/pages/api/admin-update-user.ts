export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '../../lib/api';
import { findUsernameTaken } from '../../lib/auth';
import { execute } from '../../lib/db';
import { logAdminAction } from '../../lib/audit-log';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/**
 * POST /api/admin-update-user — edición de perfil de cualquier usuario desde
 * el panel admin (reemplaza la escritura directa a `profiles` que hacía el
 * cliente de Supabase en el browser, ahora reemplazado por MySQL).
 *
 * Nota: este archivo vivía en `src/pages/auth/admin-update-user.ts`, lo que lo
 * exponía en `/auth/admin-update-user` en vez de `/api/admin-update-user`
 * (la ruta que el panel admin llama). Se movió a `src/pages/api/` para que
 * coincida con el fetch del cliente — antes devolvía 404 en cada guardado.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const { user, profile, error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: { id?: string; username?: string; avatar_url?: string; role?: string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  const { id, username, avatar_url, role } = body;
  if (!id || !username || !role) return jsonResponse({ error: 'Parámetros inválidos' }, 400);

  if (!USERNAME_RE.test(username))
    return jsonResponse({ error: 'El usuario debe tener entre 3 y 20 caracteres (letras, números y _)' }, 400);
  if (!['admin', 'user'].includes(role))
    return jsonResponse({ error: 'Rol inválido' }, 400);
  if (id === user!.id && role !== 'admin')
    return jsonResponse({ error: 'No podés quitarte el rol admin a vos mismo' }, 400);

  if (await findUsernameTaken(username, id))
    return jsonResponse({ error: 'Ese username ya está en uso' }, 409);

    // ... código anterior

  try {
    await execute(
      'UPDATE profiles SET username = :username, avatar_url = :avatar_url, role = :role WHERE id = :id',
      { username, avatar_url: avatar_url || null, role, id }
    );
  } catch (err) {
    // ¡AQUÍ! Agrega el 'return' antes de jsonResponse
    return jsonResponse({ error: (err as Error).message }, 500);
  }

  await logAdminAction({
    adminId: user!.id,
    adminUsername: profile?.username ?? undefined,
    action: 'user.update',
    targetType: 'user',
    targetId: id,
    request,
  });

  return jsonResponse({ ok: true });
};
