/**
 * Pool de conexiones MySQL — reemplaza por completo a Supabase como backend
 * de datos. Se usa `mysql2/promise` con un pool reducido, pensado para
 * entornos serverless (Vercel): cada instancia "warm" mantiene su propio
 * pool chico, en vez de abrir/cerrar una conexión por request.
 *
 * Variables de entorno requeridas (ver .env.example):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * Opcional:
 *   DB_SSL=true   → habilita TLS (necesario en la mayoría de los proveedores
 *                   de MySQL administrado: PlanetScale, Aiven, Railway, etc.)
 *   DB_CONNECTION_LIMIT → tope de conexiones por instancia (default 5)
 */
import mysql from 'mysql2/promise';

let pool: mysql.Pool | undefined;

export function getPool(): mysql.Pool {
  if (pool) return pool;

  const {
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    DB_SSL,
    DB_CONNECTION_LIMIT,
  } = import.meta.env as Record<string, string | undefined>;

  if (!DB_HOST || !DB_USER || !DB_NAME) {
    throw new Error(
      '[DB] Faltan variables de entorno de MySQL (DB_HOST, DB_USER, DB_NAME). Revisá tu .env.'
    );
  }

  pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT ? Number(DB_PORT) : 3306,
    user: DB_USER,
    password: DB_PASSWORD ?? '',
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: DB_CONNECTION_LIMIT ? Number(DB_CONNECTION_LIMIT) : 5,
    queueLimit: 0,
    dateStrings: true,
    namedPlaceholders: true,   // habilita :param en pool.query()
    ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  return pool;
}

/** Ejecuta una query parametrizada y devuelve solo las filas. */
export async function query<T = any>(sql: string, params?: Record<string, unknown> | unknown[]): Promise<T[]> {
  const [rows] = await getPool().query(sql, params as any);
  return rows as T[];
}

/**
 * Ejecuta un INSERT/UPDATE/DELETE con named placeholders (:param) y
 * devuelve el resultado (affectedRows, insertId, etc).
 *
 * FIX: usa pool.query() en vez de pool.execute() porque mysql2's
 * pool.execute() (prepared statements) NO soporta namedPlaceholders,
 * aunque esté habilitado en el pool. pool.query() sí los soporta
 * cuando namedPlaceholders: true está en la config del pool.
 */
export async function execute(sql: string, params?: Record<string, unknown> | unknown[]): Promise<mysql.ResultSetHeader> {
  const [result] = await getPool().query(sql, params as any);
  return result as mysql.ResultSetHeader;
}

/** Devuelve la primera fila o null. Atajo muy usado en el proyecto. */
export async function queryOne<T = any>(sql: string, params?: Record<string, unknown> | unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
