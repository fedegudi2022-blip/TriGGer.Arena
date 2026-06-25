export const prerender = false;

import type { APIRoute } from 'astro';
import {
  findUserByEmail,
  findUsernameTaken,
  createUserWithProfile,
  createSession,
  setSessionCookie,
  createEmailVerificationToken,
  hashPassword,
} from '../../lib/auth';
import { jsonResponse } from '../../lib/api';
import { sendVerificationEmail } from '../../lib/mailer';

/** POST /api/signup — registrar nueva cuenta */
export const POST: APIRoute = async ({ request, cookies }) => {
  let body: { email?: string; password?: string; username?: string };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Cuerpo de solicitud inválido' }, 400); }

  const { email, password, username } = body ?? {};

  if (!email || !password || !username) {
    return jsonResponse({ error: 'Todos los campos son requeridos' }, 400);
  }

  const trimmedUsername = username.trim();
  if (trimmedUsername.length < 3) {
    return jsonResponse({ error: 'El nickname debe tener al menos 3 caracteres' }, 400);
  }

  const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
  if (!USERNAME_RE.test(trimmedUsername)) {
    return jsonResponse({ error: 'El nickname solo puede contener letras, números y _' }, 400);
  }

  if (password.length < 8) {
    return jsonResponse({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400);
  }

  // ¿Email ya registrado?
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    return jsonResponse({ error: 'already_registered' }, 409);
  }

  // ¿Username ya tomado?
  if (await findUsernameTaken(trimmedUsername)) {
    return jsonResponse({ error: 'Ese nickname ya está en uso' }, 409);
  }

  const passwordHash = await hashPassword(password);

  const userId = await createUserWithProfile({
    email,
    username:     trimmedUsername,
    passwordHash,
    emailVerified: false,
  });

  // Generar token de verificación de email y enviarlo
  const verifyToken = await createEmailVerificationToken(userId);
  try {
    await sendVerificationEmail(email, verifyToken);
  } catch (err) {
    console.error('[signup] Error al enviar email de verificación:', err);
    // No bloqueamos el registro; el usuario puede re-solicitar el email
  }

  // Iniciar sesión directamente (sin verificación de email bloqueante)
  // La cookie de sesión se establece aunque el email no esté verificado todavía.
  // Si querés verificación obligatoria, comentá las 2 líneas siguientes y devolvé needsVerification: true.
  const token = await createSession(userId);
  setSessionCookie(cookies, token);

  return jsonResponse({ ok: true, needsVerification: true, email });
};