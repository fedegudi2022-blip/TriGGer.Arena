export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '../../lib/api';
import { invalidateSiteDataCache } from '../../lib/site-data';
import { execute } from '../../lib/db';

interface ServerPayload {
  id?: number | string;
  name?: string;
  host?: string;
  port?: number;
  mode?: string | null;
  description?: string | null;
  color?: string;
  sort_order?: number;
  active?: boolean;
}

/**
 * POST /api/admin-servers — crea o actualiza un servidor CS 1.6 desde el
 * panel admin (`#srvSave`). Distinto de `/api/servers.json` (GET público de
 * solo lectura, usado para mostrar el estado en vivo de los servidores).
 *
 * El panel ya llamaba a esta ruta desde antes, pero el archivo nunca se
 * creó: alta/edición/borrado de servidores devolvía 404. Además, como
 * `getServersSafe()` cachea la lista de servidores 5 minutos, invalidamos
 * el caché acá mismo que en content-blocks.ts / site-settings.ts, para que
 * el cambio se vea en el sitio público sin esperar el TTL.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: ServerPayload;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  const name = body.name?.trim();
  const host = body.host?.trim();
  const port = Number(body.port);
  if (!name || !host || !port) return jsonResponse({ error: 'Nombre, Host y Puerto son obligatorios' }, 400);

  const payload = {
    name,
    host,
    port,
    mode: body.mode?.trim() || null,
    description: body.description?.trim() || null,
    color: body.color?.trim() || '#d9712b',
    sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
    active: body.active !== false,
  };

  try {
    if (body.id) {
      await execute(
        `UPDATE servers SET
           name = :name, host = :host, port = :port, mode = :mode, description = :description,
           color = :color, sort_order = :sort_order, active = :active
         WHERE id = :id`,
        { ...payload, id: body.id }
      );
    } else {
      await execute(
        `INSERT INTO servers (name, host, port, mode, description, color, sort_order, active)
         VALUES (:name, :host, :port, :mode, :description, :color, :sort_order, :active)`,
        payload
      );
    }
  } catch (err) {
    console.error('[admin-servers:POST]', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }

  invalidateSiteDataCache('servers');
  return jsonResponse({ ok: true });
};

/** DELETE /api/admin-servers — elimina un servidor por id */
export const DELETE: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: { id?: number | string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  if (!body.id) return jsonResponse({ error: 'Falta id' }, 400);

  try {
    await execute('DELETE FROM servers WHERE id = :id', { id: body.id });
  } catch (err) {
    console.error('[admin-servers:DELETE]', err);
    return jsonResponse({ error: 'Error al eliminar el servidor' }, 500);
  }

  invalidateSiteDataCache('servers');
  return jsonResponse({ ok: true });
};
