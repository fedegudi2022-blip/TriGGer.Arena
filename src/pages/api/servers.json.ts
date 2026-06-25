// NOTA: este endpoint es un alias legado de /api/servers.json (mismo
// resultado, distintos headers de cache/CORS). Ambos comparten la misma
// lógica en src/lib/server-status.ts para que nunca puedan desincronizarse.
export const prerender = false;

import { getAllServerStatuses } from '../../lib/server-status';

export async function GET() {
  const results = await getAllServerStatuses();

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}