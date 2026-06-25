export const prerender = false;

import type { APIRoute } from 'astro';
import { requireAdmin, jsonResponse } from '../../lib/api';
import { invalidateSiteDataCache } from '../../lib/site-data';
import { execute } from '../../lib/db';

export const POST: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireAdmin(request, cookies);
  if (error) return error;

  let body: {
    whatsapp_url?: string;
    discord_url?: string;
    instagram_url?: string;
    site_status?: string;
    maintenance_message?: string;
  };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Body inválido' }, 400); }

  const payload = {
    whatsapp_url:        body.whatsapp_url?.trim()        || null,
    discord_url:         body.discord_url?.trim()         || null,
    instagram_url:       body.instagram_url?.trim()       || null,
    site_status:         body.site_status === 'mantenimiento' ? 'mantenimiento' : 'operativo',
    maintenance_message: body.maintenance_message?.trim() || null,
  };

  try {
    await execute(
      `INSERT INTO site_settings (id, whatsapp_url, discord_url, instagram_url, site_status, maintenance_message)
       VALUES (1, :whatsapp_url, :discord_url, :instagram_url, :site_status, :maintenance_message)
       ON DUPLICATE KEY UPDATE
         whatsapp_url = :whatsapp_url, discord_url = :discord_url, instagram_url = :instagram_url,
         site_status = :site_status, maintenance_message = :maintenance_message`,
      payload
    );
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }

  invalidateSiteDataCache('site_settings');
  return jsonResponse({ ok: true });
};