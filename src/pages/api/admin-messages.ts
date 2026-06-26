export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '../../lib/api';
import { query } from '../../lib/db';
import { parsePagination, paginatedResponse } from '../../lib/pagination';

interface ContactRow {
  id: string;
  nombre: string;
  email: string;
  asunto: string | null;
  mensaje: string;
  created_at: string;
}

/**
 * GET /api/admin-messages — lista paginada y filtrable de mensajes de
 * contacto. Reemplaza el `SELECT * FROM contacts` sin límite que el panel
 * cargaba entero en cada visita; ahora solo trae la página visible.
 *
 * Query params: page, pageSize, q (busca en nombre/email), asunto (exacto).
 */
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  const pagination = parsePagination(url);
  const q = url.searchParams.get('q')?.trim();
  const asunto = url.searchParams.get('asunto')?.trim();

  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (q) { where.push('(nombre LIKE :q OR email LIKE :q)'); params.q = `%${q}%`; }
  if (asunto) { where.push('asunto = :asunto'); params.asunto = asunto; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [rows, totalRow] = await Promise.all([
      query<ContactRow>(
        `SELECT * FROM contacts ${whereSql} ORDER BY created_at DESC LIMIT :limit OFFSET :offset`,
        { ...params, limit: pagination.pageSize, offset: pagination.offset }
      ),
      query<{ total: number }>(`SELECT COUNT(*) AS total FROM contacts ${whereSql}`, params),
    ]);

    return jsonResponse(paginatedResponse(rows, totalRow[0]?.total ?? 0, pagination));
  } catch (err) {
    console.error('[admin-messages:GET]', err);
    return jsonResponse({ error: 'Error al cargar los mensajes' }, 500);
  }
};