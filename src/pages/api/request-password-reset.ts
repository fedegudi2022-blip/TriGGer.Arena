export const prerender = false;

import type { APIRoute } from 'astro';
import { jsonResponse } from '../../lib/api';
import { findUserByEmail, createPasswordResetToken } from '../../lib/auth';
import { sendPasswordResetEmail } from '../../lib/mailer';

/** POST /api/request-password-reset — envía email de recuperación */
export const POST: APIRoute = async ({ request }) => {
  let body: { email?: string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  const { email } = body;
  if (!email) return jsonResponse({ error: 'Email requerido' }, 400);

  // Siempre respondemos ok para no revelar si el email existe
  const user = await findUserByEmail(email);
  if (user) {
    try {
      const token = await createPasswordResetToken(user.id);
      await sendPasswordResetEmail(email, token);
    } catch (err) {
      console.error('[request-password-reset]', err);
    }
  }

  return jsonResponse({ ok: true });
};