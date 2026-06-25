import { defineMiddleware } from 'astro:middleware';
import { getSessionUser, SESSION_COOKIE } from './lib/auth';
import { getServersSafe, getSiteSettingsSafe, getContentBlocksSafe } from './lib/site-data';

// ── Rutas que pueden cargarse en iframe (mismo origen) ────────────────────
const IFRAME_ALLOWED_PATHS = ['/admin', '/usuario'];

// ── Headers de seguridad base ─────────────────────────────────────────────
const BASE_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options':     'nosniff',
  'Referrer-Policy':            'strict-origin-when-cross-origin',
  'Permissions-Policy':         'camera=(), microphone=(), geolocation=()',
  // Vercel sirve siempre sobre HTTPS, así que esto es seguro por defecto.
  // No incluye "preload": eso requiere enviar el dominio a hstspreload.org
  // y es casi imposible de revertir una vez aceptado — mejor decisión manual.
  'Strict-Transport-Security':  'max-age=63072000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/**
 * CSP de TriGGer.Arena — dominios externos reales usados en el proyecto:
 *   - cdn.jsdelivr.net  → CSS + fuentes de @tabler/icons-webfont
 *   - https: (img-src)  → avatares de usuario, que pueden venir de cualquier
 *                         URL https (ver update-profile.ts) o de Google/Discord
 *                         cuando el login es vía OAuth
 *
 * 'unsafe-inline' en script-src es una concesión: el JSON-LD (Organization/
 * WebSite) en Layout.astro se inyecta como <script> inline. Migrar a nonces
 * por request eliminaría esta concesión, pero requiere generar y propagar
 * el nonce en el middleware y en cada <script> inline — queda como mejora
 * a futuro si se quiere CSP estricta de verdad.
 */
function buildCSP(isIframeRoute: boolean): string {
  const frameAncestors = isIframeRoute ? "'self'" : "'none'";
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "font-src 'self' https://cdn.jsdelivr.net data:",
    "img-src 'self' https: data:",
    "connect-src 'self'",
    "frame-src 'self'",
    `frame-ancestors ${frameAncestors}`,
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
}

function applySecurityHeaders(response: Response, pathname: string): Response {
  const isIframeRoute = IFRAME_ALLOWED_PATHS.some(p => pathname.startsWith(p));

  for (const [key, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    if (!response.headers.has(key)) response.headers.set(key, value);
  }
  if (!response.headers.has('X-Frame-Options')) {
    response.headers.set('X-Frame-Options', isIframeRoute ? 'SAMEORIGIN' : 'DENY');
  }
  if (!response.headers.has('Content-Security-Policy')) {
    response.headers.set('Content-Security-Policy', buildCSP(isIframeRoute));
  }
  return response;
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return s.replace(/[&<>"']/g, c => map[c]);
}

function renderMaintenancePage(message: string): string {
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>En mantenimiento · TriGGer.Arena</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#07090f; color:#e8ecf3; font-family:system-ui,sans-serif; padding:24px; text-align:center; }
    .wrap { max-width:460px; }
    .icon { width:56px; height:56px; margin:0 auto 20px; border-radius:14px; background:rgba(56,182,255,0.1); border:1px solid rgba(56,182,255,0.28); display:flex; align-items:center; justify-content:center; font-size:26px; }
    h1 { font-size:1.3rem; margin:0 0 10px; }
    p  { color:#9aa3b5; font-size:0.92rem; line-height:1.5; }
    .tag { margin-top:22px; font-size:0.72rem; letter-spacing:0.08em; text-transform:uppercase; color:#5a6478; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="icon">🛠️</div>
    <h1>TriGGer.Arena está en mantenimiento</h1>
    <p>${escapeHtml(message)}</p>
    <div class="tag">Volvemos pronto</div>
  </div>
</body>
</html>`;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, cookies, redirect, url, locals } = context;

  const isApi           = url.pathname.startsWith('/api/');
  const isAuthRoute     = url.pathname.startsWith('/auth');
  const isAdminRoute    = url.pathname.startsWith('/admin');
  const isUsuarioRoute  = url.pathname.startsWith('/usuario');
  const isProtectedRoute = isAdminRoute || isUsuarioRoute;

  // 1. Cargar datos globales (solo en rutas no-API para evitar overhead innecesario)
  if (!isApi) {
    const [settings, servers, blocks] = await Promise.all([
      getSiteSettingsSafe(),
      getServersSafe(),
      getContentBlocksSafe(),
    ]);
    locals.siteSettings  = settings;
    locals.servers       = servers;
    locals.contentBlocks = blocks;
  }

  // 2. Leer sesión desde la cookie propia (sesión + perfil en una sola query)
  const sessionToken = cookies.get(SESSION_COOKIE)?.value;
  const session = await getSessionUser(sessionToken);

  locals.user = session?.user ?? undefined;
  locals.profile = session?.profile ?? null;

  const isAdmin = locals.profile?.role === 'admin';
  const user = session?.user;

  // 4. Modo mantenimiento — bloquear acceso público
  const isMaintenance = locals.siteSettings?.site_status === 'mantenimiento';
  if (isMaintenance && !isAdmin && !isAdminRoute && !isAuthRoute && !isApi) {
    return applySecurityHeaders(
      new Response(
        renderMaintenancePage(locals.siteSettings.maintenance_message || 'Estamos trabajando en el sitio.'),
        {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '3600' },
        }
      ),
      url.pathname
    );
  }

  // 5. Protección de rutas autenticadas
  if (isProtectedRoute && !user) {
    return redirect(`/auth?next=${encodeURIComponent(url.pathname)}`);
  }
  if (isAdminRoute && !isAdmin) {
    return redirect('/usuario?error=unauthorized');
  }

  return applySecurityHeaders(await next(), url.pathname);
});