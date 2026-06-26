export const prerender = false;

import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { requireAdmin, jsonResponse } from '../../lib/api';
import { execute } from '../../lib/db';

interface DownloadPayload {
  id?: string;
  nombre?: string;
  url?: string;
  descripcion?: string | null;
  categoria?: string | null;
  size_label?: string | null;
  sort_order?: number;
}

/**
 * POST /api/downloads — crea o actualiza un archivo de descarga (upsert por
 * id). El panel admin (`#dlSave`) ya llamaba a esta ruta desde antes, pero el
 * archivo nunca se creó: la sección de Descargas no se podía editar.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: DownloadPayload;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  const nombre = body.nombre?.trim();
  const url = body.url?.trim();
  if (!nombre || !url) return jsonResponse({ error: 'Nombre y URL son obligatorios' }, 400);

  const id = body.id || randomUUID();
  const payload = {
    id,
    nombre,
    url,
    descripcion: body.descripcion?.trim() || null,
    categoria: body.categoria?.trim() || 'general',
    size_label: body.size_label?.trim() || null,
    sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
  };

  try {
    await execute(
      `INSERT INTO downloads (id, nombre, url, descripcion, categoria, size_label, sort_order)
       VALUES (:id, :nombre, :url, :descripcion, :categoria, :size_label, :sort_order)
       ON DUPLICATE KEY UPDATE
         nombre = :nombre, url = :url, descripcion = :descripcion, categoria = :categoria,
         size_label = :size_label, sort_order = :sort_order`,
      payload
    );
  } catch (err) {
    console.error('[downloads:POST]', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }

  return jsonResponse({ ok: true, id });
};

/** DELETE /api/downloads — elimina un archivo por id */
export const DELETE: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: { id?: string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  if (!body.id) return jsonResponse({ error: 'Falta id' }, 400);

  try {
    await execute('DELETE FROM downloads WHERE id = :id', { id: body.id });
  } catch (err) {
    console.error('[downloads:DELETE]', err);
    return jsonResponse({ error: 'Error al eliminar el archivo' }, 500);
  }

  return jsonResponse({ ok: true });
};
