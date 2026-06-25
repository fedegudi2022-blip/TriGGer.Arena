export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAuth, jsonResponse } from '../../lib/api';
import { clearSessionCookie, SESSION_COOKIE } from '../../lib/auth';
import { execute } from '../../lib/db';

/** DELETE /api/delete-own-account — el usuario autenticado elimina su propia cuenta */
export const DELETE: APIRoute = async ({ request, cookies }) => {
  const { user } = await requireAuth(request, cookies);
  if (!user) return jsonResponse({ error: 'No autenticado' }, 401);

  try {
    // ON DELETE CASCADE en users eliminará: profiles, sessions, oauth_accounts, tokens
    await execute('DELETE FROM users WHERE id = :id', { id: user.id });
  } catch (err) {
    console.error('[delete-own-account]', err);
    return jsonResponse({ error: 'Error al eliminar la cuenta.' }, 500);
  }

  // Limpiar la cookie de sesión
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) clearSessionCookie(cookies);

  return jsonResponse({ ok: true });
};