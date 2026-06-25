export const prerender = false;

import { getAllServerStatuses } from '../../lib/server-status';

export async function GET() {
  const results = await getAllServerStatuses();

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Cache en CDN de Vercel por 15 segundos, stale-while-revalidate 30s
      // Evita que cada usuario haga un UDP query al servidor de CS
      'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
