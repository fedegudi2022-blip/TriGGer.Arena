/**
 * Fuente única de verdad para datos controlables desde el admin:
 *   - site_settings  (redes, estado del sitio, mensaje de mantenimiento)
 *   - servers        (servidores CS 1.6)
 *   - content_blocks (hero, effexo, howto, rules, footer, social)
 *
 * Todas las funciones son "safe": nunca tiran excepciones —
 * en caso de error devuelven los defaults definidos aquí.
 */
import { query, queryOne } from './db';
import { WHATSAPP_URL, DISCORD_URL, INSTAGRAM_URL } from '../config';
import type {
  SiteSettings,
  ServerRow,
  ContentBlocks,
} from './types';

// ── Caché en memoria ──────────────────────────────────────────────────────
// El middleware llamaba a las 3 funciones de abajo en CADA request a página
// (no-API), generando 3 round-trips a MySQL por visita sin ningún caché.
// Mismo patrón de TTL que ya usábamos en server-status.ts.
//
// Nota: este caché vive en memoria del proceso, así que en serverless
// (Vercel) solo es efectivo dentro de una misma instancia "warm" — se
// resetea en cold starts y no se comparte entre instancias. Para un caché
// realmente compartido entre instancias habría que migrar a Vercel KV /
// Upstash Redis, pero para el volumen actual del sitio esto ya reduce
// drásticamente la carga a la base sin agregar infraestructura nueva.
const SITE_DATA_TTL_MS = 300_000; // 5 min — datos cambian poco, admin invalida si necesita

type CacheEntry<T> = { data: T; expiresAt: number };
const dataCache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = dataCache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const data = await fetcher();
  dataCache.set(key, { data, expiresAt: Date.now() + SITE_DATA_TTL_MS });
  return data;
}

/**
 * Invalida una entrada (o todas) del caché. Se llama desde los endpoints de
 * admin que escriben en site_settings / content_blocks para que, dentro de
 * la misma instancia warm, el cambio se vea reflejado sin esperar el TTL.
 */
export function invalidateSiteDataCache(key?: 'site_settings' | 'servers' | 'content_blocks'): void {
  if (key) dataCache.delete(key);
  else dataCache.clear();
}

// Re-exportar los tipos para que el resto del proyecto los importe desde aquí
// si ya lo hacía (compatibilidad hacia atrás).
export type { SiteSettings, ServerRow, ContentBlocks };
export type {
  HeroBlock, EffexoBlock, HowToBlock, HowToStep,
  RuleItem, RulesBlock, FooterBlock, SocialBlock, SocialNetworkText,
} from './types';

// ── Defaults ──────────────────────────────────────────────────────────────

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  whatsapp_url: WHATSAPP_URL,
  discord_url: DISCORD_URL,
  instagram_url: INSTAGRAM_URL,
  site_status: 'operativo',
  maintenance_message: 'Estamos realizando tareas de mantenimiento. Volvemos en breve, ¡gracias por la paciencia!',
};

export const DEFAULT_SERVERS: ServerRow[] = [
  {
    id: 1,
    name: '#1 [TriGGer.Arena]',
    mode: '~|AutoMix|~',
    description: 'Mix automático — Siempre hay partida disponible',
    host: '45.235.98.30',
    port: 27515,
    color: '#38b6ff',
    sort_order: 1,
    active: true,
  },
  {
    id: 2,
    name: '#2 [TriGGer.Arena]',
    mode: '~|AUTOMIX/PCW|~',
    description: 'Mix automático — Partidas organizadas y competitivas',
    host: '45.235.98.222',
    port: 27598,
    color: '#4ade80',
    sort_order: 2,
    active: true,
  },
];

export const DEFAULT_CONTENT_BLOCKS: ContentBlocks = {
  hero: {
    eyebrow: 'Comunidad Argentina de CS 1.6',
    title: 'TriGGer.Arena',
    subtitle: 'Servidores competitivos 24/7.\nUnite a la comunidad.',
    btn_label: 'Ver servidores',
    stat1_val: '24/7', stat1_key: 'Servidores activos',
    stat2_val: '100%', stat2_key: 'CS 1.6 puro',
    stat3_val: 'ARG',  stat3_key: 'Comunidad local',
  },
  effexo: {
    badge: 'Sponsor oficial',
    title: 'Effexo',
    description: 'Hosting de servidores de juego con la mejor latencia para Argentina y Latinoamérica.',
    features: ['Baja latencia', 'Soporte 24/7', 'Panel de control', 'Anti-DDoS'],
    btn_label: 'Conocer más sobre Effexo',
    btn_url: 'https://effexo.net/servers',
  },
  howto: {
    section_title: '¿Cómo unirse?',
    section_sub: 'En tres pasos estás jugando en TriGGer.Arena.',
    step1: { title: 'Descargá el juego', body: 'Instalá Counter-Strike 1.6 desde nuestra sección de descargas.' },
    step2: { title: 'Conectate al servidor', body: 'Abrí la consola, escribí connect y la IP del servidor que quieras.' },
    step3: { title: '¡A jugar!', body: 'Elegí tu equipo y empezá a jugar con la comunidad argentina.' },
  },
  rules: {
    section_title: 'Reglamento',
    section_sub: 'Respetá las reglas para mantener una comunidad sana y competitiva.',
    rules: [
      { id: '01', severity: 'high', icon: 'ti-ban',          tag: 'Expulsión inmediata', title: 'Prohibido el uso de cheats o hacks', body: 'Queda absolutamente prohibido el uso de cheats, hacks, aimbots o cualquier software que otorgue ventajas injustas.' },
      { id: '02', severity: 'high', icon: 'ti-mood-angry',   tag: 'Tolerancia cero',     title: 'Respeto entre jugadores',           body: 'El insulto, acoso o discriminación hacia otros jugadores no se tolera bajo ninguna circunstancia.' },
      { id: '03', severity: 'mid',  icon: 'ti-microphone-off', tag: 'Advertencia',        title: 'Uso del chat de voz',               body: 'El micrófono es para coordinación táctica. Música, ruidos o spam de voz pueden resultar en mute.' },
      { id: '04', severity: 'low',  icon: 'ti-clock',        tag: 'Fair play',            title: 'No abandones la partida',           body: 'Salir a mitad de un match perjudica al equipo. Reiteradas desconexiones pueden resultar en penalización.' },
    ],
  },
  footer: {
    tagline: 'Comunidad Argentina de CS 1.6 — Headshots, fragmentos y comunidad real.',
  },
  social: {
    section_title: 'Sumate a la comunidad',
    section_sub: 'Noticias, partidas y la mejor comunidad argentina de CS 1.6.',
    discord:   { handle: 'TriGGer.Arena',         desc: 'Servidor oficial — canales de voz, texto y soporte técnico.' },
    whatsapp:  { handle: 'Grupo de la comunidad', desc: 'Avisos de partidas, mix y soporte en tiempo real.' },
    instagram: { handle: '@trigger.arena_cs',     desc: 'Highlights, noticias y memes de CS 1.6.' },
  },
};

// ── Queries ───────────────────────────────────────────────────────────────

export async function getSiteSettingsSafe(): Promise<SiteSettings> {
  return cached('site_settings', async () => {
    try {
      const data = await queryOne<{
        whatsapp_url: string | null; discord_url: string | null; instagram_url: string | null;
        site_status: string; maintenance_message: string | null;
      }>('SELECT whatsapp_url, discord_url, instagram_url, site_status, maintenance_message FROM site_settings WHERE id = 1 LIMIT 1');

      if (!data) return DEFAULT_SITE_SETTINGS;

      return {
        whatsapp_url:        data.whatsapp_url        || DEFAULT_SITE_SETTINGS.whatsapp_url,
        discord_url:         data.discord_url         || DEFAULT_SITE_SETTINGS.discord_url,
        instagram_url:       data.instagram_url       || DEFAULT_SITE_SETTINGS.instagram_url,
        site_status:         data.site_status === 'mantenimiento' ? 'mantenimiento' : 'operativo',
        maintenance_message: data.maintenance_message || DEFAULT_SITE_SETTINGS.maintenance_message,
      };
    } catch {
      return DEFAULT_SITE_SETTINGS;
    }
  });
}

export async function getServersSafe(): Promise<ServerRow[]> {
  return cached('servers', async () => {
    try {
      const data = await query<ServerRow>('SELECT * FROM servers ORDER BY sort_order ASC');
      if (!data || data.length === 0) return DEFAULT_SERVERS;
      return data.map(s => ({ ...s, active: !!s.active }));
    } catch {
      return DEFAULT_SERVERS;
    }
  });
}

export async function getContentBlocksSafe(): Promise<ContentBlocks> {
  return cached('content_blocks', async () => {
    try {
      const data = await query<{ key: string; value: unknown }>('SELECT `key`, value FROM content_blocks');
      if (!data || data.length === 0) return DEFAULT_CONTENT_BLOCKS;

      const blocks: ContentBlocks = { ...DEFAULT_CONTENT_BLOCKS };
      const validKeys = ['hero', 'effexo', 'howto', 'rules', 'footer', 'social'] as const;

      for (const row of data) {
        if (!validKeys.includes(row.key as typeof validKeys[number])) continue;
        try {
          const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
          (blocks as any)[row.key] = parsed;
        } catch {
          // JSON corrupto → mantener el default del bloque
        }
      }
      return blocks;
    } catch {
      return DEFAULT_CONTENT_BLOCKS;
    }
  });
}

// ── Utilidades ────────────────────────────────────────────────────────────
export function serverIp(s: Pick<ServerRow, 'host' | 'port'>): string {
  return `${s.host}:${s.port}`;
}