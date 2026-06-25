/**
 * Envío de emails transaccionales con Nodemailer.
 *
 * Variables de entorno requeridas:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 *
 * Ejemplo con Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587,
 *   SMTP_USER=tu@gmail.com, SMTP_PASSWORD=app-password-de-16-chars
 *
 * Ejemplo con Resend (recomendado para producción):
 *   SMTP_HOST=smtp.resend.com, SMTP_PORT=465,
 *   SMTP_USER=resend, SMTP_PASSWORD=re_XXXXXXXXXX
 *   SMTP_FROM=noreply@trigger.arena
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer');

let transporter: any;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = import.meta.env as Record<string, string | undefined>;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error('[Mailer] Faltan variables SMTP_HOST, SMTP_USER o SMTP_PASSWORD en .env');
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? Number(SMTP_PORT) : 587,
    secure: SMTP_PORT === '465',
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });

  return transporter;
}

function getSiteUrl(): string {
  return import.meta.env.PUBLIC_SITE_URL ?? 'https://trigger.arena';
}

function getFrom(): string {
  return import.meta.env.SMTP_FROM ?? `TriGGer.Arena <noreply@trigger.arena>`;
}

// ── Plantillas ─────────────────────────────────────────────────────────────

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#07090f; font-family:system-ui,sans-serif; }
    .wrap { max-width:520px; margin:40px auto; background:#0d1117; border:1px solid rgba(56,182,255,0.15); border-radius:12px; overflow:hidden; }
    .header { background:linear-gradient(135deg,#0a1628,#0d1f3c); padding:28px 32px; border-bottom:1px solid rgba(56,182,255,0.15); }
    .logo { font-size:1.4rem; font-weight:700; color:#38b6ff; letter-spacing:0.05em; }
    .content { padding:32px; color:#c8d3e0; line-height:1.6; }
    .content h1 { font-size:1.15rem; color:#e8ecf3; margin:0 0 12px; }
    .content p { margin:0 0 16px; font-size:0.93rem; }
    .btn { display:inline-block; padding:12px 28px; background:#38b6ff; color:#07090f; font-weight:700; border-radius:8px; text-decoration:none; font-size:0.93rem; }
    .footer { padding:18px 32px; border-top:1px solid rgba(255,255,255,0.06); font-size:0.78rem; color:#4a5568; }
    .muted { color:#4a5568; font-size:0.8rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header"><div class="logo">TriGGer.Arena</div></div>
    <div class="content">${body}</div>
    <div class="footer">© ${new Date().getFullYear()} TriGGer.Arena — Comunidad Argentina de CS 1.6</div>
  </div>
</body>
</html>`;
}

// ── Funciones públicas ─────────────────────────────────────────────────────

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const url = `${getSiteUrl()}/auth/callback?token=${token}&type=signup`;

  const html = baseTemplate('Verificá tu email', `
    <h1>Verificá tu dirección de email</h1>
    <p>Gracias por registrarte en TriGGer.Arena. Hacé clic en el botón para verificar tu cuenta:</p>
    <p><a class="btn" href="${url}">Verificar email</a></p>
    <p class="muted">El enlace expira en 24 horas. Si no creaste esta cuenta, podés ignorar este email.</p>
  `);

  await getTransporter().sendMail({
    from:    getFrom(),
    to:      email,
    subject: 'Verificá tu email — TriGGer.Arena',
    html,
  });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const url = `${getSiteUrl()}/auth/callback?token=${token}&type=recovery`;

  const html = baseTemplate('Recuperar contraseña', `
    <h1>Recuperá tu contraseña</h1>
    <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en TriGGer.Arena.</p>
    <p><a class="btn" href="${url}">Restablecer contraseña</a></p>
    <p class="muted">El enlace expira en 1 hora. Si no solicitaste este cambio, podés ignorar este email.</p>
  `);

  await getTransporter().sendMail({
    from:    getFrom(),
    to:      email,
    subject: 'Recuperar contraseña — TriGGer.Arena',
    html,
  });
}