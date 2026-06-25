export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyPassword, createSession, setSessionCookie, clearSessionCookie, deleteSession, SESSION_COOKIE } from '../../lib/auth';
import { jsonResponse } from '../../lib/api';

// ── Rate limiting de intentos de login ─────────────────────────────────────
const MAX_ATTEMPTS = 5;
const WINDOW_MS     = 10 * 60 * 1000; // 10 min
const LOCKOUT_MS    = 15 * 60 * 1000; // 15 min

type AttemptRecord = { count: number; firstAttempt: number; lockedUntil?: number };
const loginAttempts = new Map<string, AttemptRecord>();

function getClientKey(request: Request, email: string): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return `${ip}:${email.toLowerCase()}`;
}

function cleanupOldEntries(): void {
  const now = Date.now();
  for (const [key, record] of loginAttempts) {
    const windowExpired = now - record.firstAttempt > WINDOW_MS;
    const lockExpired   = !record.lockedUntil || record.lockedUntil < now;
    if (windowExpired && lockExpired) loginAttempts.delete(key);
  }
}

function checkRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  if (loginAttempts.size > 500) cleanupOldEntries();
  const record = loginAttempts.get(key);
  if (record?.lockedUntil && record.lockedUntil > Date.now()) {
    return { allowed: false, retryAfterMs: record.lockedUntil - Date.now() };
  }
  return { allowed: true };
}

function registerFailedAttempt(key: string): void {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now - record.firstAttempt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
    return;
  }
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) record.lockedUntil = now + LOCKOUT_MS;
}

function clearAttempts(key: string): void {
  loginAttempts.delete(key);
}

/** POST /api/signin — iniciar sesión con email + password */
export const POST: APIRoute = async ({ request, cookies }) => {
  let body: { email?: string; password?: string; next?: string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  const { email, password, next } = body;
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (!email || !password) {
    return jsonResponse({ error: 'Email y contraseña son requeridos' }, 400);
  }

  const rateLimitKey = getClientKey(request, email);
  const { allowed, retryAfterMs } = checkRateLimit(rateLimitKey);
  if (!allowed) {
    const minutes = Math.max(1, Math.ceil((retryAfterMs ?? 0) / 60_000));
    return jsonResponse(
      { error: `Demasiados intentos fallidos. Probá de nuevo en ${minutes} minuto${minutes === 1 ? '' : 's'}.` },
      429
    );
  }

  const user = await verifyPassword(email, password);

  if (!user) {
    registerFailedAttempt(rateLimitKey);
    return jsonResponse({ error: 'Email o contraseña incorrectos' }, 400);
  }

  clearAttempts(rateLimitKey);

  const token = await createSession(user.id);
  setSessionCookie(cookies, token);

  return jsonResponse({ ok: true, next: safeNext });
};

/** DELETE /api/signin — cerrar sesión */
export const DELETE: APIRoute = async ({ cookies }) => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try { await deleteSession(token); } catch { /* ignorar */ }
  }
  clearSessionCookie(cookies);
  return jsonResponse({ ok: true });
};