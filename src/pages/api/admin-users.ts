export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '../../lib/api';
import { query } from '../../lib/db';
import { parsePagination, paginatedResponse } from '../../lib/pagination';

interface ProfileRow {
  id: string;
  email: string;
  username: string | null;
  avatar_url: string | null;
  role: string | null;
  created_at: string;
}

/**
 * GET /api/admin-users — lista paginada y filtrable de usuarios.
 * Reemplaza el `SELECT ... FROM users JOIN profiles` sin límite que el
 * panel cargaba entero en cada visita.
 *
 * Query params: page, pageSize, q (busca en username/email), role (exacto).
 */
export const GET: APIRoute = async ({ request, cookies, url }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  const pagination = parsePagination(url);
  const q = url.searchParams.get('q')?.trim();
  const role = url.searchParams.get('role')?.trim();

  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (q) { where.push('(p.username LIKE :q OR u.email LIKE :q)'); params.q = `%${q}%`; }
  if (role && ['admin', 'user'].includes(role)) { where.push('p.role = :role'); params.role = role; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [rows, totalRow] = await Promise.all([
      query<ProfileRow>(
        `SELECT u.id, u.email, p.username, p.avatar_url, p.role, u.created_at
           FROM users u JOIN profiles p ON p.id = u.id
           ${whereSql}
          ORDER BY u.created_at DESC
          LIMIT :limit OFFSET :offset`,
        { ...params, limit: pagination.pageSize, offset: pagination.offset }
      ),
      query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM users u JOIN profiles p ON p.id = u.id ${whereSql}`,
        params
      ),
    ]);

    return jsonResponse(paginatedResponse(rows, totalRow[0]?.total ?? 0, pagination));
  } catch (err) {
    console.error('[admin-users:GET]', err);
    return jsonResponse({ error: 'Error al cargar los usuarios' }, 500);
  }
};