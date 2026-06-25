export const prerender = false;
import type { APIRoute } from 'astro';
import {
  consumeEmailVerificationToken,
  markEmailVerified,
  createSession,
  setSessionCookie,
  setResetCookie,
  peekPasswordResetToken,
  OAUTH_STATE_COOKIE,
  exchangeOAuthCode,
  findUserIdByOAuthAccount,
  linkOAuthAccount,
  findUserByEmail,
  createUserWithProfile,
  generateAvailableUsername,
  type OAuthProvider,
} from '../../lib/auth';
import { query } from '../../lib/db';

function safePath(raw: string | null, fallback = '/'): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback;
}

async function roleRedirectPath(userId: string, fallback: string): Promise<string> {
  const rows = await query<{ role: string | null }>('SELECT role FROM profiles WHERE id = :id LIMIT 1', { id: userId });
  return rows[0]?.role === 'admin' ? '/admin' : fallback;
}

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const url = new URL(request.url);
  const errorDescription = url.searchParams.get('error_description');
  const rawNext = url.searchParams.get('next') || '/';
  const safeNext = safePath(rawNext);

  if (errorDescription) {
    return redirect(`/auth?error=${encodeURIComponent(errorDescription)}`);
  }

  // ── 1. Verificación de email tras signup ───────────────────────────────
  const verifyToken = url.searchParams.get('token');
  const type = url.searchParams.get('type');

  if (verifyToken && type === 'signup') {
    const userId = await consumeEmailVerificationToken(verifyToken);
    if (!userId) {
      return redirect(`/auth?error=${encodeURIComponent('El link de verificación es inválido o expiró.')}`);
    }
    await markEmailVerified(userId);
    const session = await createSession(userId);
    setSessionCookie(cookies, session);

    const dest = await roleRedirectPath(userId, safeNext.startsWith('/usuario') || safeNext.startsWith('/admin') ? safeNext : '/usuario');
    return redirect(dest);
  }

  // ── 2. Recuperación de contraseña ───────────────────────────────────────
  if (verifyToken && type === 'recovery') {
    const userId = await peekPasswordResetToken(verifyToken);
    if (!userId) {
      return redirect(`/auth?error=${encodeURIComponent('El link de recuperación es inválido o expiró.')}`);
    }
    setResetCookie(cookies, verifyToken);
    return redirect(safePath(rawNext, '/auth/update-password'));
  }

  // ── 3. OAuth (Google / Discord) ─────────────────────────────────────────
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (code) {
    const stateCookieRaw = cookies.get(OAUTH_STATE_COOKIE)?.value;
    cookies.delete(OAUTH_STATE_COOKIE, { path: '/auth' });

    let parsedState: { nonce: string; next: string; provider: OAuthProvider } | null = null;
    try {
      parsedState = stateCookieRaw ? JSON.parse(Buffer.from(stateCookieRaw, 'base64url').toString('utf8')) : null;
    } catch {
      parsedState = null;
    }

    if (!parsedState || !state || parsedState.nonce !== state) {
      return redirect(`/auth?error=${encodeURIComponent('Sesión de autenticación inválida o expirada. Probá de nuevo.')}`);
    }

    const provider = parsedState.provider;
    const redirectUri = new URL('/auth/callback', url.origin).toString();

    try {
      const profile = await exchangeOAuthCode(provider, code, redirectUri);

      let userId = await findUserIdByOAuthAccount(provider, profile.providerUserId);

      if (!userId) {
        // ¿Ya existe una cuenta con ese email (registrada con password)? La vinculamos.
        const existing = profile.email ? await findUserByEmail(profile.email) : null;
        if (existing) {
          userId = existing.id;
        } else {
          const seed = profile.name || profile.email?.split('@')[0] || 'jugador';
          const username = await generateAvailableUsername(seed);
          userId = await createUserWithProfile({
            email: profile.email ?? `${profile.providerUserId}@${provider}.oauth.local`,
            username,
            passwordHash: null,
            emailVerified: profile.emailVerified,
          });
          if (profile.avatarUrl) {
            await query('UPDATE profiles SET avatar_url = :url WHERE id = :id', { url: profile.avatarUrl, id: userId });
          }
        }
        await linkOAuthAccount(userId, provider, profile.providerUserId);
      }

      // Si el proveedor confirma el email, reflejarlo también localmente.
      if (profile.emailVerified) await markEmailVerified(userId);

      const session = await createSession(userId);
      setSessionCookie(cookies, session);

      const wentToProtectedRoute = parsedState.next.startsWith('/usuario') || parsedState.next.startsWith('/admin');
      const dest = wentToProtectedRoute
        ? await roleRedirectPath(userId, parsedState.next)
        : safePath(parsedState.next);
      return redirect(dest);
    } catch (err) {
      console.error('[Callback] Error en OAuth:', err);
      return redirect(`/auth?error=${encodeURIComponent('No se pudo completar el acceso. Intentá de nuevo.')}`);
    }
  }

  return redirect(`/auth?error=${encodeURIComponent('Código de autenticación faltante')}`);
};