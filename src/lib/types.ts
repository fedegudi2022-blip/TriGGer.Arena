/**
 * Tipos compartidos en todo el proyecto.
 * Importá desde acá en lugar de duplicar definiciones.
 */

// ── Auth (MySQL + sesiones propias) ────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  email_verified: boolean;
  created_at: string;
}

export interface UserProfile {
  username: string | null;
  avatar_url: string | null;
  role: string | null;
  created_at: string | null;
}

// ── Servers ───────────────────────────────────────────────────────────────
export interface ServerRow {
  id: number;
  name: string;
  mode: string | null;
  description: string | null;
  host: string;
  port: number;
  color: string;
  sort_order: number;
  active: boolean;
}

export interface ServerResult {
  id: number;
  online: boolean;
  map?: string;
  players?: number;
  maxPlayers?: number;
  ping?: number;
  updatedAt?: number;
  stale?: boolean;
  playerList?: string[];
  error?: string;
}

// ── Site settings ─────────────────────────────────────────────────────────
export interface SiteSettings {
  whatsapp_url: string;
  discord_url: string;
  instagram_url: string;
  site_status: 'operativo' | 'mantenimiento';
  maintenance_message: string;
}

// ── Content blocks ────────────────────────────────────────────────────────
export interface HeroBlock {
  eyebrow: string;
  title: string;
  subtitle: string;
  btn_label: string;
  stat1_val: string;
  stat1_key: string;
  stat2_val: string;
  stat2_key: string;
  stat3_val: string;
  stat3_key: string;
}

export interface EffexoBlock {
  badge: string;
  title: string;
  description: string;
  features: string[];
  btn_label: string;
  btn_url: string;
}

export interface HowToStep {
  title: string;
  body: string;
}

export interface HowToBlock {
  section_title: string;
  section_sub: string;
  step1: HowToStep;
  step2: HowToStep;
  step3: HowToStep;
}

export interface RuleItem {
  id: string;
  severity: 'high' | 'mid' | 'low';
  icon: string;
  tag: string;
  title: string;
  body: string;
}

export interface RulesBlock {
  section_title: string;
  section_sub: string;
  rules: RuleItem[];
}

export interface FooterBlock {
  tagline: string;
}

export interface SocialNetworkText {
  handle: string;
  desc: string;
}

export interface SocialBlock {
  section_title: string;
  section_sub: string;
  discord: SocialNetworkText;
  whatsapp: SocialNetworkText;
  instagram: SocialNetworkText;
}

export interface ContentBlocks {
  hero: HeroBlock;
  effexo: EffexoBlock;
  howto: HowToBlock;
  rules: RulesBlock;
  footer: FooterBlock;
  social: SocialBlock;
}

// ── Helpers ───────────────────────────────────────────────────────────────
export type ToastType = 'success' | 'error' | 'info';