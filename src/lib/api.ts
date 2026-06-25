/**
 * Helpers compartidos para los API endpoints.
 * Centraliza: respuestas JSON, guard de autenticación y guard de admin.
 */
import type { AstroCookies } from 'astro';
import { getSessionUser, SESSION_COOKIE } from './auth';
import type { AuthUser, UserProfile } from './types';

// ── Respuesta JSON tipada ──────────────────────────────────────────────────
export function jsonResponse(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Guard: sesión activa ───────────────────────────────────────────────────
export async function requireAuth(
  request: Request,
  cookies: AstroCookies
): Promise<{ user: AuthUser | null; profile: UserProfile | null }> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  const session = await getSessionUser(token);
  return { user: session?.user ?? null, profile: session?.profile ?? null };
}

// ── Guard: sesión + rol admin ──────────────────────────────────────────────
export async function requireAdmin(
  request: Request,
  cookies: AstroCookies
): Promise<{ user: AuthUser | null; profile: UserProfile | null; error: Response | null }> {
  const { user, profile } = await requireAuth(request, cookies);
  if (!user) return { user: null, profile: null, error: jsonResponse({ error: 'No autorizado' }, 401) };

  if (!profile || profile.role !== 'admin') {
    return { user, profile, error: jsonResponse({ error: 'Sin permisos' }, 403) };
  }

  return { user, profile, error: null };
}