export const prerender = false;

import type { APIRoute } from 'astro';
import { buildOAuthUrl, isOAuthConfigured } from '../../../../lib/auth';

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isOAuthConfigured('discord')) {
    return redirect(`/auth?error=${encodeURIComponent('Discord no está disponible en este momento.')}`);
  }

  const url      = new URL(request.url);
  const rawNext  = url.searchParams.get('next') ?? '/';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const callbackUrl = new URL('/auth/callback', url.origin).toString();

  return redirect(buildOAuthUrl('discord', callbackUrl, cookies, safeNext));
};