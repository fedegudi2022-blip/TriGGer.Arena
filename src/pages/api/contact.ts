import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { execute } from '../../lib/db';

export const prerender = false;

const MAX_LEN = { nombre: 80, email: 160, asunto: 60, mensaje: 500 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return json({ error: 'No se pudo leer el formulario' }, 400);
  }

  // Honeypot: campo oculto que un usuario real nunca completa.
  // Si llega con valor, es casi seguro un bot — respondemos "ok" para no
  // delatar la trampa, pero no guardamos nada en la base.
  if (data.get('website')?.toString().trim()) {
    return json({ ok: true });
  }

  const nombre  = data.get('nombre')?.toString().trim().slice(0, MAX_LEN.nombre);
  const email   = data.get('email')?.toString().trim().slice(0, MAX_LEN.email);
  const asunto  = data.get('asunto')?.toString().trim().slice(0, MAX_LEN.asunto);
  const mensaje = data.get('mensaje')?.toString().trim().slice(0, MAX_LEN.mensaje);

  if (!nombre || nombre.length < 2 || !email || !mensaje || mensaje.length < 10) {
    return json({ error: 'Campos incompletos' }, 400);
  }

  if (!EMAIL_RE.test(email)) {
    return json({ error: 'Email inválido' }, 400);
  }

  try {
    await execute(
      'INSERT INTO contacts (id, nombre, email, asunto, mensaje) VALUES (:id, :nombre, :email, :asunto, :mensaje)',
      { id: randomUUID(), nombre, email, asunto: asunto || null, mensaje }
    );
  } catch (err) {
    console.error('[contact]', err);
    return json({ error: 'Error al guardar' }, 500);
  }

  return json({ ok: true });
};