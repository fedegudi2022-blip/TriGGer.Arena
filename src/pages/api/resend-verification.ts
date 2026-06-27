export const prerender = false;

import type { APIRoute } from 'astro';
import { jsonResponse, getClientIp } from '../../lib/api';
import { findUserByEmail, createEmailVerificationToken } from '../../lib/auth';
import { sendVerificationEmail } from '../../lib/mailer';

// ── Rate limiting de reenvíos ────────────────────────────────────────────────
// Mismo patrón en memoria que usa signin.ts. Limita por email y por IP para
// evitar que alguien use este endpoint para spamear la bandeja de un tercero
// o para reventar la cuota de Resend.
const COOLDOWN_MS  = 45 * 1000;   // un poco menos que los 60s del botón en el front
const MAX_PER_HOUR = 5;

type Record_ = { lastSentAt: number; countInWindow: number; windowStart: number };
const resendAttempts = new Map<string, Record_>();

function cleanupOldEntries(): void {
  const now = Date.now();
  for (const [key, rec] of resendAttempts) {
    if (now - rec.windowStart > 60 * 60 * 1000) resendAttempts.delete(key);
  }
}

function checkRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  if (resendAttempts.size > 1000) cleanupOldEntries();

  const now = Date.now();
  const rec = resendAttempts.get(key);
  if (!rec) return { allowed: true };

  if (now - rec.lastSentAt < COOLDOWN_MS) {
    return { allowed: false, retryAfterMs: COOLDOWN_MS - (now - rec.lastSentAt) };
  }
  if (now - rec.windowStart < 60 * 60 * 1000 && rec.countInWindow >= MAX_PER_HOUR) {
    return { allowed: false, retryAfterMs: 60 * 60 * 1000 - (now - rec.windowStart) };
  }
  return { allowed: true };
}

function registerAttempt(key: string): void {
  const now = Date.now();
  const rec = resendAttempts.get(key);
  if (!rec || now - rec.windowStart > 60 * 60 * 1000) {
    resendAttempts.set(key, { lastSentAt: now, countInWindow: 1, windowStart: now });
  } else {
    rec.lastSentAt = now;
    rec.countInWindow += 1;
  }
}

/** POST /api/resend-verification — reenvía el email de verificación de cuenta */
export const POST: APIRoute = async ({ request }) => {
  let body: { email?: string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Cuerpo de solicitud inválido' }, 400); }

  const email = body.email?.trim().toLowerCase();
  if (!email) return jsonResponse({ error: 'Email requerido' }, 400);

  const ip = getClientIp(request);
  const key = `${ip}:${email}`;

  const rl = checkRateLimit(key);
  if (!rl.allowed) {
    return jsonResponse(
      { error: `Esperá ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s antes de reenviar` },
      429
    );
  }

  // Siempre respondemos ok para no revelar si el email existe o ya está verificado.
  const user = await findUserByEmail(email);
  if (user && !user.email_verified) {
    registerAttempt(key);
    try {
      const token = await createEmailVerificationToken(user.id);
      await sendVerificationEmail(email, token);
    } catch (err) {
      console.error('[resend-verification] Error al enviar email:', err);
      // No exponemos el detalle al cliente; el log queda en Vercel para diagnóstico.
    }
  }

  return jsonResponse({ ok: true });
};