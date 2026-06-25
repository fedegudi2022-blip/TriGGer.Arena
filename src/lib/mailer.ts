/**
 * Envío de emails transaccionales — SIN nodemailer.
 *
 * Usa la API HTTP de Resend (resend.com) que es serverless-compatible.
 * Si no tenés RESEND_API_KEY, cae a un SMTP vía fetch con el endpoint
 * de tu proveedor (Brevo, Mailgun, etc.).
 *
 * Variables de entorno:
 *   RESEND_API_KEY   → recomendado (resend.com, free tier: 3000 emails/mes)
 *   SMTP_FROM        → "TriGGer.Arena <noreply@trigger.arena>"
 *
 * Migración desde nodemailer: cambiá SMTP_HOST/USER/PASSWORD por RESEND_API_KEY.
 * Resend acepta cualquier dominio verificado o sandbox @resend.dev para testing.
 */

function getSiteUrl(): string {
  return import.meta.env.PUBLIC_SITE_URL ?? 'https://trigger.arena';
}

function getFrom(): string {
  return import.meta.env.SMTP_FROM ?? 'TriGGer.Arena <noreply@trigger.arena>';
}

// ── Template base ─────────────────────────────────────────────────────────

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

// ── Envío vía Resend API (HTTP puro, sin dependencias) ────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = import.meta.env.RESEND_API_KEY as string | undefined;

  if (!apiKey) {
    throw new Error(
      '[Mailer] Falta RESEND_API_KEY en las variables de entorno. ' +
      'Creá una cuenta gratuita en resend.com y agregá la variable en Vercel.'
    );
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    getFrom(),
      to:      [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[Mailer] Resend error ${res.status}: ${body}`);
  }
}

// ── Funciones públicas ────────────────────────────────────────────────────

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const url  = `${getSiteUrl()}/auth/callback?token=${token}&type=signup`;
  const html = baseTemplate('Verificá tu email', `
    <h1>Verificá tu dirección de email</h1>
    <p>Gracias por registrarte en TriGGer.Arena. Hacé clic en el botón para verificar tu cuenta:</p>
    <p><a class="btn" href="${url}">Verificar email</a></p>
    <p class="muted">El enlace expira en 24 horas. Si no creaste esta cuenta, podés ignorar este email.</p>
  `);
  await sendEmail(email, 'Verificá tu email — TriGGer.Arena', html);
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const url  = `${getSiteUrl()}/auth/callback?token=${token}&type=recovery`;
  const html = baseTemplate('Recuperar contraseña', `
    <h1>Recuperá tu contraseña</h1>
    <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en TriGGer.Arena.</p>
    <p><a class="btn" href="${url}">Restablecer contraseña</a></p>
    <p class="muted">El enlace expira en 1 hora. Si no solicitaste este cambio, podés ignorar este email.</p>
  `);
  await sendEmail(email, 'Recuperar contraseña — TriGGer.Arena', html);
}
