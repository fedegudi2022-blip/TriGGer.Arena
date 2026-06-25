/**
 * Clientes de Supabase para los tres contextos de uso:
 *
 *   supabase           → Browser (scripts cliente, sin cookies SSR)
 *   createAdminClient  → Service Role (SSR con privilegios, bypasea RLS)
 *   createSupabaseServerClient → Anon + cookies (SSR con sesión del usuario)
 */
import { createClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

/** Cliente browser: para `<script>` en el cliente. No usar en SSR. */
export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
);

/** Cliente admin con Service Role Key. Nunca exponer al browser. */
export function createAdminClient() {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('[Supabase] Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno');
  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Cliente SSR que mantiene PKCE y sesiones vía cookies. */
export function createSupabaseServerClient(request: Request, cookies: AstroCookies) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get('Cookie') ?? '').map(
            ({ name, value }) => ({ name, value: value ?? '' })
          );
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookies.set(name, value, { ...options, path: '/' } as any)
          );
        },
      },
    }
  );
}
