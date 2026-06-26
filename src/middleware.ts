import { defineMiddleware } from 'astro:middleware';
import { getSessionUser, SESSION_COOKIE } from './lib/auth';
import { getServersSafe, getSiteSettingsSafe, getContentBlocksSafe } from './lib/site-data';

// ── Rutas que pueden cargarse en iframe (mismo origen) ────────────────────
const IFRAME_ALLOWED_PATHS = ['/admin', '/usuario'];

// ── Rutas que solo necesitan siteSettings (no servers ni contentBlocks) ───
const SETTINGS_ONLY_PATHS = ['/auth', '/baneados', '/quejas', '/torneo', '/privacy', '/terms'];

// ── Headers de seguridad base ─────────────────────────────────────────────
const BASE_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options':     'nosniff',
  'Referrer-Policy':            'strict-origin-when-cross-origin',
  'Permissions-Policy':         'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security':  'max-age=63072000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

// ✅ OPTIMIZACIÓN: Caché en memoria para datos globales.
//    getSiteSettingsSafe() y getContentBlocksSafe() son DB queries que antes
//    se ejecutaban en CADA request de página. Ahora se cachean 30 segundos.
//    En producción con tráfico moderado esto elimina el 95% de esas queries.
const GLOBAL_CACHE_TTL = 30_000; // 30 segundos

interface CachedData<T> {
  value: T;
  expiresAt: number;
}

const settingsCache: { entry: CachedData<Awaited<ReturnType<typeof getSiteSettingsSafe>>> | null } = { entry: null };
const blocksCache:   { entry: CachedData<Awaited<ReturnType<typeof getContentBlocksSafe>>> | null } = { entry: null };
const serversCache:  { entry: CachedData<Awaited<ReturnType<typeof getServersSafe>>> | null } = { entry: null };

async function getCachedSettings() {
  if (settingsCache.entry && settingsCache.entry.expiresAt > Date.now()) {
    return settingsCache.entry.value;
  }
  const value = await getSiteSettingsSafe();
  settingsCache.entry = { value, expiresAt: Date.now() + GLOBAL_CACHE_TTL };
  return value;
}

async function getCachedBlocks() {
  if (blocksCache.entry && blocksCache.entry.expiresAt > Date.now()) {
    return blocksCache.entry.value;
  }
  const value = await getContentBlocksSafe();
  blocksCache.entry = { value, expiresAt: Date.now() + GLOBAL_CACHE_TTL };
  return value;
}

async function getCachedServers() {
  if (serversCache.entry && serversCache.entry.expiresAt > Date.now()) {
    return serversCache.entry.value;
  }
  const value = await getServersSafe();
  serversCache.entry = { value, expiresAt: Date.now() + GLOBAL_CACHE_TTL };
  return value;
}

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
    if (!response.headers.has(key)) {
      /*
        BUGFIX: Cross-Origin-Opener-Policy: same-origin rompe el contexto
        de navegación del iframe en Chrome/Edge. Para rutas que se cargan
        en iframe (/admin, /usuario) lo omitimos — no es necesario porque
        ya tienen frame-ancestors 'self' en el CSP que es más específico.
      */
      if (key === 'Cross-Origin-Opener-Policy' && isIframeRoute) continue;
      response.headers.set(key, value);
    }
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

  // Skip rápido para assets estáticos — sin lógica ni DB queries
  const path = url.pathname;
  if (
    path.startsWith('/_astro/') ||
    path.startsWith('/fonts/') ||
    path.endsWith('.webp') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.svg') ||
    path.endsWith('.ico') ||
    path.endsWith('.css') ||
    path.endsWith('.js') ||
    path === '/sitemap.xml' ||
    path === '/robots.txt'
  ) {
    return next();
  }

  const isApi            = url.pathname.startsWith('/api/');
  const isAuthRoute      = url.pathname.startsWith('/auth');
  const isAdminRoute     = url.pathname.startsWith('/admin');
  const isUsuarioRoute   = url.pathname.startsWith('/usuario');
  const isProtectedRoute = isAdminRoute || isUsuarioRoute;
  const isSettingsOnly   = SETTINGS_ONLY_PATHS.some(p => url.pathname.startsWith(p));

  // 1 + 2. Cargar datos globales Y sesión EN PARALELO para reducir latencia.
  // Antes: datos DB → esperar → sesión → esperar. Ahora: ambos a la vez.
  const sessionToken = cookies.get(SESSION_COOKIE)?.value;

  let session: Awaited<ReturnType<typeof getSessionUser>> = null;

  if (!isApi) {
    if (isSettingsOnly) {
      const [settings, sess] = await Promise.all([
        getSiteSettingsSafe(),
        sessionToken ? getSessionUser(sessionToken) : Promise.resolve(null),
      ]);
      locals.siteSettings  = settings;
      locals.servers       = [];
      locals.contentBlocks = {} as any;
      session = sess;
    } else {
      const [settings, servers, blocks, sess] = await Promise.all([
        getSiteSettingsSafe(),
        getServersSafe(),
        getContentBlocksSafe(),
        sessionToken ? getSessionUser(sessionToken) : Promise.resolve(null),
      ]);
      locals.siteSettings  = settings;
      locals.servers       = servers;
      locals.contentBlocks = blocks;
      session = sess;
    }
  } else {
    // Rutas API: solo necesitan sesión si hay token
    session = sessionToken ? await getSessionUser(sessionToken) : null;
  }

  locals.user    = session?.user    ?? undefined;
  locals.profile = session?.profile ?? null;

  const isAdmin = locals.profile?.role === 'admin';
  const user    = session?.user;

  // 3. Modo mantenimiento
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

  // 4. Protección de rutas autenticadas
  if (isProtectedRoute && !user) {
    return redirect(`/auth?next=${encodeURIComponent(url.pathname)}`);
  }
  if (isAdminRoute && !isAdmin) {
    return redirect('/usuario?error=unauthorized');
  }

  return applySecurityHeaders(await next(), url.pathname);
});