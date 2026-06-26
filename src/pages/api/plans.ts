export const prerender = false;

import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { requireAdmin, jsonResponse } from '../../lib/api';
import { execute } from '../../lib/db';

interface PlanFeature { ok: boolean; text: string }

interface PlanPayload {
  id?: string;
  tag?: string;
  price?: string;
  descripcion?: string | null;
  badge?: string | null;
  cta?: string | null;
  sort_order?: number;
  featured?: boolean;
  features?: PlanFeature[];
}

/**
 * POST /api/plans — crea o actualiza un plan (upsert por id, igual al patrón
 * de content-blocks.ts). El panel admin (`#planSave`) ya llamaba a esta ruta
 * desde antes, pero el archivo nunca se creó: toda edición de planes
 * devolvía 404 silencioso y no se reflejaba en la sección de Ventas.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: PlanPayload;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  const tag = body.tag?.trim();
  const price = body.price?.trim();
  if (!tag || !price) return jsonResponse({ error: 'Tag y Precio son obligatorios' }, 400);

  const id = body.id || randomUUID();
  const payload = {
    id,
    tag,
    price,
    descripcion: body.descripcion?.trim() || null,
    badge: body.badge?.trim() || null,
    cta: body.cta?.trim() || null,
    sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0,
    featured: !!body.featured,
    features: JSON.stringify(Array.isArray(body.features) ? body.features : []),
  };

  try {
    await execute(
      `INSERT INTO plans (id, tag, price, descripcion, badge, cta, sort_order, featured, features)
       VALUES (:id, :tag, :price, :descripcion, :badge, :cta, :sort_order, :featured, CAST(:features AS JSON))
       ON DUPLICATE KEY UPDATE
         tag = :tag, price = :price, descripcion = :descripcion, badge = :badge, cta = :cta,
         sort_order = :sort_order, featured = :featured, features = CAST(:features AS JSON)`,
      payload
    );
  } catch (err) {
    console.error('[plans:POST]', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }

  return jsonResponse({ ok: true, id });
};

/** DELETE /api/plans — elimina un plan por id */
export const DELETE: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: { id?: string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  if (!body.id) return jsonResponse({ error: 'Falta id' }, 400);

  try {
    await execute('DELETE FROM plans WHERE id = :id', { id: body.id });
  } catch (err) {
    console.error('[plans:DELETE]', err);
    return jsonResponse({ error: 'Error al eliminar el plan' }, 500);
  }

  return jsonResponse({ ok: true });
};
