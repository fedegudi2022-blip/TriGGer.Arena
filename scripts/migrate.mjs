/**
 * Script de migración de base de datos — TriGGer.Arena
 * Ejecutar: node scripts/migrate.mjs
 *
 * Crea todas las tablas necesarias si no existen (idempotente).
 * Requiere las variables DB_* en .env (cargadas via dotenv si existe).
 */

import mysql from 'mysql2/promise';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Cargar .env si existe
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL } = process.env;

if (!DB_HOST || !DB_USER || !DB_NAME) {
  console.error('❌ Faltan variables DB_HOST, DB_USER o DB_NAME en .env');
  process.exit(1);
}

const conn = await mysql.createConnection({
  host:     DB_HOST,
  port:     DB_PORT ? Number(DB_PORT) : 3306,
  user:     DB_USER,
  password: DB_PASSWORD ?? '',
  database: DB_NAME,
  ssl:      DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  multipleStatements: true,
});

console.log(`\n🔗 Conectado a ${DB_HOST}/${DB_NAME}\n`);

const migrations = [
  // ── Usuarios ──────────────────────────────────────────────────────────
  {
    name: 'users',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id            CHAR(36)     NOT NULL,
        email         VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255)     NULL,
        email_verified TINYINT(1)  NOT NULL DEFAULT 0,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Perfiles ──────────────────────────────────────────────────────────
  {
    name: 'profiles',
    sql: `
      CREATE TABLE IF NOT EXISTS profiles (
        id         CHAR(36)     NOT NULL,
        username   VARCHAR(20)      NULL,
        avatar_url VARCHAR(500)     NULL,
        role       ENUM('user','admin') NOT NULL DEFAULT 'user',
        created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_profiles_username (username),
        CONSTRAINT fk_profiles_user FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Sesiones ──────────────────────────────────────────────────────────
  {
    name: 'sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS sessions (
        id         CHAR(64)  NOT NULL,
        user_id    CHAR(36)  NOT NULL,
        expires_at DATETIME  NOT NULL,
        created_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_sessions_user  (user_id),
        INDEX idx_sessions_exp   (expires_at),
        CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Tokens de verificación de email ───────────────────────────────────
  {
    name: 'email_verification_tokens',
    sql: `
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        token      CHAR(64)  NOT NULL,
        user_id    CHAR(36)  NOT NULL,
        expires_at DATETIME  NOT NULL,
        PRIMARY KEY (token),
        INDEX idx_evt_user (user_id),
        CONSTRAINT fk_evt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Tokens de reset de contraseña ─────────────────────────────────────
  {
    name: 'password_reset_tokens',
    sql: `
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token      CHAR(64)  NOT NULL,
        user_id    CHAR(36)  NOT NULL,
        expires_at DATETIME  NOT NULL,
        PRIMARY KEY (token),
        INDEX idx_prt_user (user_id),
        CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Cuentas OAuth ─────────────────────────────────────────────────────
  {
    name: 'oauth_accounts',
    sql: `
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        user_id          CHAR(36)    NOT NULL,
        provider         VARCHAR(20) NOT NULL,
        provider_user_id VARCHAR(64) NOT NULL,
        created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (provider, provider_user_id),
        INDEX idx_oa_user (user_id),
        CONSTRAINT fk_oa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Servidores CS 1.6 ─────────────────────────────────────────────────
  {
    name: 'servers',
    sql: `
      CREATE TABLE IF NOT EXISTS servers (
        id          INT          NOT NULL AUTO_INCREMENT,
        name        VARCHAR(80)  NOT NULL,
        mode        VARCHAR(60)      NULL,
        description VARCHAR(255)     NULL,
        host        VARCHAR(100) NOT NULL,
        port        SMALLINT UNSIGNED NOT NULL,
        color       CHAR(7)      NOT NULL DEFAULT '#38b6ff',
        sort_order  TINYINT      NOT NULL DEFAULT 0,
        active      TINYINT(1)   NOT NULL DEFAULT 1,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Configuración del sitio ───────────────────────────────────────────
  {
    name: 'site_settings',
    sql: `
      CREATE TABLE IF NOT EXISTS site_settings (
        id                  TINYINT  NOT NULL DEFAULT 1,
        whatsapp_url        VARCHAR(500)  NULL,
        discord_url         VARCHAR(500)  NULL,
        instagram_url       VARCHAR(500)  NULL,
        site_status         ENUM('operativo','mantenimiento') NOT NULL DEFAULT 'operativo',
        maintenance_message TEXT          NULL,
        updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Bloques de contenido (admin editable) ─────────────────────────────
  {
    name: 'content_blocks',
    sql: `
      CREATE TABLE IF NOT EXISTS content_blocks (
        \`key\`     VARCHAR(40) NOT NULL,
        value      JSON        NOT NULL,
        updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },

  // ── Mensajes de contacto ──────────────────────────────────────────────
  {
    name: 'contacts',
    sql: `
      CREATE TABLE IF NOT EXISTS contacts (
        id         CHAR(36)     NOT NULL,
        nombre     VARCHAR(80)  NOT NULL,
        email      VARCHAR(160) NOT NULL,
        asunto     VARCHAR(60)      NULL,
        mensaje    TEXT         NOT NULL,
        created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_contacts_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `,
  },
];

let ok = 0;
let failed = 0;

for (const m of migrations) {
  try {
    await conn.query(m.sql);
    console.log(`  ✅ ${m.name}`);
    ok++;
  } catch (err) {
    console.error(`  ❌ ${m.name}: ${err.message}`);
    failed++;
  }
}

// Seed inicial: fila de site_settings si no existe
try {
  await conn.query(`INSERT IGNORE INTO site_settings (id) VALUES (1)`);
  console.log(`  ✅ site_settings seed`);
} catch (err) {
  console.warn(`  ⚠️  site_settings seed: ${err.message}`);
}

await conn.end();

console.log(`\n${failed === 0 ? '🎉' : '⚠️'} Migración completada: ${ok}/${migrations.length + 1} tablas OK, ${failed} errores.\n`);
if (failed > 0) process.exit(1);
