export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '../../lib/api';
import { execute } from '../../lib/db';

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: { contactId?: string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  if (!body.contactId) return jsonResponse({ error: 'Falta contactId' }, 400);

  try {
    await execute('DELETE FROM contacts WHERE id = :id', { id: body.contactId });
  } catch (err) {
    console.error('[delete-contact]', err);
    return jsonResponse({ error: 'Error al eliminar el mensaje' }, 500);
  }

  return jsonResponse({ ok: true });
};