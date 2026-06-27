import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { execute } from '../../lib/db';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_TIPOS = ['hack', 'insultos', 'bug_abuse', 'trampa', 'otro'] as const;

// Rate limiting igual al de contact.ts
const rateLimitMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 300_000; // 5 minutos
const RATE_MAX       = 3;       // máx 3 reportes en 5 min

function isRateLimited(ip: string): boolean {
  const now  = Date.now();
  const hits = (rateLimitMap.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS);
  hits.push(now);
  rateLimitMap.set(ip, hits);
  if (rateLimitMap.size > 500) {
    for (const [key, times] of rateLimitMap) {
      if (times.every(t => now - t >= RATE_WINDOW_MS)) rateLimitMap.delete(key);
    }
  }
  return hits.length > RATE_MAX;
}

function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (isRateLimited(ip)) {
    return json({ error: 'Demasiados reportes. Esperá unos minutos.' }, 429);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const nick        = body.nick?.toString().trim().slice(0, 80);
  const tipo        = body.tipo?.toString().trim();
  const descripcion = body.descripcion?.toString().trim().slice(0, 2000);
  const fecha_aprox = body.fecha_aprox?.toString().trim().slice(0, 40) || null;
  const email       = body.email?.toString().trim().slice(0, 160);

  if (!nick || nick.length < 2) return json({ error: 'Nick inválido' }, 400);
  if (!VALID_TIPOS.includes(tipo as any)) return json({ error: 'Tipo de infracción inválido' }, 400);
  if (!descripcion || descripcion.length < 20) return json({ error: 'Descripción muy corta' }, 400);
  if (!email || !EMAIL_RE.test(email)) return json({ error: 'Email inválido' }, 400);

  try {
    await execute(
      `INSERT INTO reports (id, reporter_email, reported_nick, tipo, descripcion, fecha_aprox)
       VALUES (:id, :email, :nick, :tipo, :descripcion, :fecha_aprox)`,
      { id: randomUUID(), email, nick, tipo, descripcion, fecha_aprox }
    );
  } catch (err) {
    console.error('[report]', err);
    return json({ error: 'Error al guardar el reporte' }, 500);
  }

  return json({ ok: true });
};