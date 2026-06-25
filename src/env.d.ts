/// <reference path="../.astro/types.d.ts" />

// ── Variables de entorno ──────────────────────────────────────────────────
interface ImportMetaEnv {
  // Base de datos
  readonly DB_HOST:             string;
  readonly DB_PORT:             string;
  readonly DB_USER:             string;
  readonly DB_PASSWORD:         string;
  readonly DB_NAME:             string;
  readonly DB_SSL:              string;
  readonly DB_CONNECTION_LIMIT: string;

  // Sitio
  readonly PUBLIC_SITE_URL:      string;
  readonly PUBLIC_WHATSAPP_URL:  string;
  readonly PUBLIC_DISCORD_URL:   string;
  readonly PUBLIC_INSTAGRAM_URL: string;

  // Email (Nodemailer)
  readonly SMTP_HOST:     string;
  readonly SMTP_PORT:     string;
  readonly SMTP_USER:     string;
  readonly SMTP_PASSWORD: string;
  readonly SMTP_FROM:     string;

  // OAuth — Google (opcional)
  readonly GOOGLE_CLIENT_ID:     string;
  readonly GOOGLE_CLIENT_SECRET: string;

  // OAuth — Discord (opcional)
  readonly DISCORD_CLIENT_ID:     string;
  readonly DISCORD_CLIENT_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// ── Locals de Astro (cargados en el middleware una sola vez por request) ──
declare namespace App {
  interface Locals {
    siteSettings:  import('./lib/types').SiteSettings;
    servers:       import('./lib/types').ServerRow[];
    contentBlocks: import('./lib/types').ContentBlocks;
    user:          import('./lib/types').AuthUser | undefined;
    profile:       import('./lib/types').UserProfile | null;
  }
}

// ── API global del browser ────────────────────────────────────────────────
interface Window {
  showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  closeModal?: () => void;
}