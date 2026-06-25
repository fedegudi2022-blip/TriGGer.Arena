/**
 * Autenticación completa con MySQL puro.
 * Reemplaza toda dependencia de Supabase Auth.
 *
 * Tablas requeridas:
 *   users            (id, email, password_hash, email_verified, created_at)
 *   profiles         (id FK→users, username, avatar_url, role, created_at)
 *   sessions         (id, user_id FK→users, expires_at, created_at)
 *   email_verification_tokens (token, user_id, expires_at)
 *   password_reset_tokens     (token, user_id, expires_at)
 *   oauth_accounts   (user_id, provider, provider_user_id)
 *
 * Ver scripts/migrate.mjs para el DDL completo.
 */

import { randomBytes, createHash } from 'node:crypto';
import { randomUUID }              from 'node:crypto';
import bcrypt                      from 'bcryptjs';
import type { AstroCookies }       from 'astro';
import { query, execute, queryOne } from './db';
import type { AuthUser, UserProfile } from './types';

// ── Constantes ────────────────────────────────────────────────────────────
export const SESSION_COOKIE     = 'ta_session';
export const RESET_COOKIE       = 'ta_reset';
export const OAUTH_STATE_COOKIE = 'ta_oauth_state';

const SESSION_TTL_DAYS  = 30;
const VERIFY_TOKEN_TTL  = 24 * 60 * 60 * 1000;   // 24 horas
const RESET_TOKEN_TTL   = 60 * 60 * 1000;          // 1 hora

// ── Helpers internos ──────────────────────────────────────────────────────

function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sessionExpiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_TTL_DAYS);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// ── Sesiones ──────────────────────────────────────────────────────────────

export interface SessionWithUser {
  user:    AuthUser;
  profile: UserProfile | null;
}

/**
 * Lee la sesión desde el token de cookie.
 * Devuelve null si el token no existe, expiró o el usuario no existe.
 */
export async function getSessionUser(
  token: string | undefined
): Promise<SessionWithUser | null> {
  if (!token) return null;

  const hashed = hashToken(token);

  const row = await queryOne<{
    id: string; email: string; email_verified: number; created_at: string;
    username: string | null; avatar_url: string | null; role: string | null;
    profile_created_at: string | null;
  }>(
    `SELECT
       u.id, u.email, u.email_verified, u.created_at,
       p.username, p.avatar_url, p.role, p.created_at AS profile_created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN profiles p ON p.id = u.id
     WHERE s.id = :token AND s.expires_at > NOW()
     LIMIT 1`,
    { token: hashed }
  );

  if (!row) return null;

  return {
    user: {
      id:             row.id,
      email:          row.email,
      email_verified: !!row.email_verified,
      created_at:     row.created_at,
    },
    profile: {
      username:   row.username,
      avatar_url: row.avatar_url,
      role:       row.role,
      created_at: row.profile_created_at,
    },
  };
}

/**
 * Crea una nueva sesión en la base y devuelve el token en claro.
 * El token hasheado se guarda en DB; el token en claro va a la cookie.
 */
export async function createSession(userId: string): Promise<string> {
  const token  = generateToken();
  const hashed = hashToken(token);
  const exp    = sessionExpiresAt();

  await execute(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (:id, :userId, :exp)',
    { id: hashed, userId, exp }
  );

  return token;
}

/** Elimina la sesión de la base (logout). */
export async function deleteSession(token: string): Promise<void> {
  await execute('DELETE FROM sessions WHERE id = :token', { token: hashToken(token) });
}

export function setSessionCookie(cookies: AstroCookies, token: string): void {
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   true,
    sameSite: 'lax',
    path:     '/',
    maxAge:   SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

// ── Registro + login ──────────────────────────────────────────────────────

export interface CreateUserInput {
  email:        string;
  username:     string;
  passwordHash: string | null;   // null para cuentas OAuth
  emailVerified: boolean;
}

/** Crea usuario + perfil en una transacción lógica (doble INSERT). */
export async function createUserWithProfile(input: CreateUserInput): Promise<string> {
  const id = randomUUID();
  await execute(
    `INSERT INTO users (id, email, password_hash, email_verified)
     VALUES (:id, :email, :hash, :verified)`,
    { id, email: input.email, hash: input.passwordHash, verified: input.emailVerified ? 1 : 0 }
  );
  await execute(
    `INSERT INTO profiles (id, username) VALUES (:id, :username)`,
    { id, username: input.username }
  );
  return id;
}

/** Busca usuario por email. Devuelve null si no existe. */
export async function findUserByEmail(
  email: string
): Promise<AuthUser | null> {
  const row = await queryOne<{ id: string; email: string; email_verified: number; created_at: string }>(
    'SELECT id, email, email_verified, created_at FROM users WHERE email = :email LIMIT 1',
    { email }
  );
  if (!row) return null;
  return { id: row.id, email: row.email, email_verified: !!row.email_verified, created_at: row.created_at };
}

/** Verifica email + password. Devuelve el usuario si las credenciales son válidas. */
export async function verifyPassword(
  email: string,
  password: string
): Promise<AuthUser | null> {
  const row = await queryOne<{
    id: string; email: string; email_verified: number; created_at: string; password_hash: string | null;
  }>(
    'SELECT id, email, email_verified, created_at, password_hash FROM users WHERE email = :email LIMIT 1',
    { email }
  );
  if (!row || !row.password_hash) return null;

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return null;

  return { id: row.id, email: row.email, email_verified: !!row.email_verified, created_at: row.created_at };
}

/** Hashea una contraseña nueva (registro / cambio de contraseña). */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// ── Verificación de email ─────────────────────────────────────────────────

export async function createEmailVerificationToken(userId: string): Promise<string> {
  const token   = generateToken();
  const hashed  = hashToken(token);
  const expires = new Date(Date.now() + VERIFY_TOKEN_TTL)
    .toISOString().slice(0, 19).replace('T', ' ');

  // Eliminar tokens anteriores del mismo usuario
  await execute('DELETE FROM email_verification_tokens WHERE user_id = :userId', { userId });
  await execute(
    'INSERT INTO email_verification_tokens (token, user_id, expires_at) VALUES (:token, :userId, :expires)',
    { token: hashed, userId, expires }
  );

  return token;
}

/**
 * Consume el token de verificación de email.
 * Devuelve el userId si era válido, null si expiró o no existe.
 */
export async function consumeEmailVerificationToken(token: string): Promise<string | null> {
  const hashed = hashToken(token);
  const row = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM email_verification_tokens WHERE token = :token AND expires_at > NOW() LIMIT 1',
    { token: hashed }
  );
  if (!row) return null;

  await execute('DELETE FROM email_verification_tokens WHERE token = :token', { token: hashed });
  return row.user_id;
}

export async function markEmailVerified(userId: string): Promise<void> {
  await execute('UPDATE users SET email_verified = 1 WHERE id = :id', { id: userId });
}

// ── Reset de contraseña ───────────────────────────────────────────────────

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token   = generateToken();
  const hashed  = hashToken(token);
  const expires = new Date(Date.now() + RESET_TOKEN_TTL)
    .toISOString().slice(0, 19).replace('T', ' ');

  await execute('DELETE FROM password_reset_tokens WHERE user_id = :userId', { userId });
  await execute(
    'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (:token, :userId, :expires)',
    { token: hashed, userId, expires }
  );

  return token;
}

/**
 * Verifica el token de reset sin consumirlo (solo lectura).
 * Usado por /auth/update-password para saber si el link sigue válido.
 */
export async function peekPasswordResetToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const hashed = hashToken(token);
  const row = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM password_reset_tokens WHERE token = :token AND expires_at > NOW() LIMIT 1',
    { token: hashed }
  );
  return row?.user_id ?? null;
}

/** Consume el token y actualiza la contraseña. */
export async function consumeResetTokenAndUpdatePassword(
  token: string,
  newPassword: string
): Promise<boolean> {
  const hashed = hashToken(token);
  const row = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM password_reset_tokens WHERE token = :token AND expires_at > NOW() LIMIT 1',
    { token: hashed }
  );
  if (!row) return false;

  const newHash = await hashPassword(newPassword);
  await execute('UPDATE users SET password_hash = :hash WHERE id = :id', { hash: newHash, id: row.user_id });
  await execute('DELETE FROM password_reset_tokens WHERE token = :token', { token: hashed });
  // Invalidar todas las sesiones activas por seguridad
  await execute('DELETE FROM sessions WHERE user_id = :id', { id: row.user_id });

  return true;
}

export function setResetCookie(cookies: AstroCookies, token: string): void {
  cookies.set(RESET_COOKIE, token, {
    httpOnly: true,
    secure:   true,
    sameSite: 'lax',
    path:     '/auth',
    maxAge:   RESET_TOKEN_TTL / 1000,
  });
}

export function clearResetCookie(cookies: AstroCookies): void {
  cookies.delete(RESET_COOKIE, { path: '/auth' });
}

// ── Usernames ──────────────────────────────────────────────────────────────

export async function findUsernameTaken(
  username: string,
  excludeUserId?: string
): Promise<boolean> {
  const sql = excludeUserId
    ? 'SELECT 1 FROM profiles WHERE username = :username AND id != :excludeId LIMIT 1'
    : 'SELECT 1 FROM profiles WHERE username = :username LIMIT 1';
  const rows = await query(sql, { username, excludeId: excludeUserId });
  return rows.length > 0;
}

/**
 * Genera un username disponible a partir de un seed.
 * Agrega un sufijo numérico si ya está en uso.
 */
export async function generateAvailableUsername(seed: string): Promise<string> {
  const base = seed
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 15) || 'jugador';

  if (!(await findUsernameTaken(base))) return base;

  for (let i = 1; i <= 9999; i++) {
    const candidate = `${base}${i}`;
    if (!(await findUsernameTaken(candidate))) return candidate;
  }

  return `${base}_${randomBytes(3).toString('hex')}`;
}

// ── OAuth ─────────────────────────────────────────────────────────────────

export type OAuthProvider = 'google' | 'discord';

export interface OAuthProfile {
  providerUserId: string;
  email:          string | null;
  name:           string | null;
  avatarUrl:      string | null;
  emailVerified:  boolean;
}

/**
 * Devuelve true si la variable de entorno del proveedor está configurada.
 * Usado por /auth/index.astro para mostrar u ocultar los botones de OAuth.
 */
export function isOAuthConfigured(provider: OAuthProvider): boolean {
  if (provider === 'google') {
    return !!(import.meta.env.GOOGLE_CLIENT_ID && import.meta.env.GOOGLE_CLIENT_SECRET);
  }
  if (provider === 'discord') {
    return !!(import.meta.env.DISCORD_CLIENT_ID && import.meta.env.DISCORD_CLIENT_SECRET);
  }
  return false;
}

/** Construye la URL de autorización OAuth y guarda el state en cookie. */
export function buildOAuthUrl(
  provider: OAuthProvider,
  redirectUri: string,
  cookies: AstroCookies,
  next: string = '/'
): string {
  const nonce = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ nonce, next, provider })).toString('base64url');

  cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure:   true,
    sameSite: 'lax',
    path:     '/auth',
    maxAge:   600,
  });

  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id:     import.meta.env.GOOGLE_CLIENT_ID!,
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope:         'openid email profile',
      state:         nonce,
      prompt:        'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  if (provider === 'discord') {
    const params = new URLSearchParams({
      client_id:     import.meta.env.DISCORD_CLIENT_ID!,
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope:         'identify email',
      state:         nonce,
    });
    return `https://discord.com/api/oauth2/authorize?${params}`;
  }

  throw new Error(`Provider OAuth no soportado: ${provider}`);
}

/** Intercambia el code por tokens y obtiene el perfil del proveedor. */
export async function exchangeOAuthCode(
  provider: OAuthProvider,
  code:        string,
  redirectUri: string
): Promise<OAuthProfile> {
  if (provider === 'google') {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     import.meta.env.GOOGLE_CLIENT_ID!,
        client_secret: import.meta.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(`Google token error: ${JSON.stringify(tokens)}`);

    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = await infoRes.json();

    return {
      providerUserId: info.sub,
      email:          info.email ?? null,
      name:           info.name ?? null,
      avatarUrl:      info.picture ?? null,
      emailVerified:  !!info.email_verified,
    };
  }

  if (provider === 'discord') {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     import.meta.env.DISCORD_CLIENT_ID!,
        client_secret: import.meta.env.DISCORD_CLIENT_SECRET!,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(`Discord token error: ${JSON.stringify(tokens)}`);

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = await userRes.json();

    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : null;

    return {
      providerUserId: user.id,
      email:          user.email ?? null,
      name:           user.username ?? null,
      avatarUrl,
      emailVerified:  !!user.verified,
    };
  }

  throw new Error(`Provider OAuth no soportado: ${provider}`);
}

/** Busca si ya existe una cuenta vinculada a ese proveedor + ID externo. */
export async function findUserIdByOAuthAccount(
  provider: OAuthProvider,
  providerUserId: string
): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM oauth_accounts WHERE provider = :provider AND provider_user_id = :pid LIMIT 1',
    { provider, pid: providerUserId }
  );
  return row?.user_id ?? null;
}

/** Vincula una cuenta OAuth a un usuario existente. */
export async function linkOAuthAccount(
  userId:         string,
  provider:       OAuthProvider,
  providerUserId: string
): Promise<void> {
  await execute(
    `INSERT IGNORE INTO oauth_accounts (user_id, provider, provider_user_id)
     VALUES (:userId, :provider, :pid)`,
    { userId, provider, pid: providerUserId }
  );
}