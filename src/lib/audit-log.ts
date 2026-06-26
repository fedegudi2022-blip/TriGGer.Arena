import { query, execute } from './db';

interface AuditLogFilters {
  action?: string;
  targetType?: string;
  q?: string;
}

interface LogAdminActionInput {
  adminId: number | string;
  adminUsername?: string;
  action: string;
  targetType: string;
  targetId?: string;
  request: Request;
}

/**
 * Consulta los logs de auditoría con filtros y paginación
 */
export async function queryAuditLog(filters: AuditLogFilters, pageSize: number, offset: number) {
  let whereClauses: string[] = [];
  let params: Record<string, any> = { limit: pageSize, offset: offset };

  if (filters.action) {
    whereClauses.push('action = :action');
    params.action = filters.action;
  }
  if (filters.targetType) {
    whereClauses.push('targetType = :targetType');
    params.targetType = filters.targetType;
  }
  if (filters.q) {
    whereClauses.push('adminUsername LIKE :q');
    params.q = `%${filters.q}%`;
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Ejecuta la consulta de filas y el conteo total en paralelo
  const [rows, countResult] = await Promise.all([
    query<any>(
      `SELECT id, adminId, adminUsername, action, targetType, targetId, createdAt 
       FROM audit_logs ${whereSql} 
       ORDER BY createdAt DESC 
       LIMIT :limit OFFSET :offset`,
      params
    ),
    query<{ total: number }>(`SELECT COUNT(*) as total FROM audit_logs ${whereSql}`, params)
  ]);

  return {
    rows,
    total: countResult[0]?.total || 0
  };
}

/**
 * Registra una nueva acción de administrador en la base de datos
 */
export async function logAdminAction({
  adminId,
  adminUsername,
  action,
  targetType,
  targetId,
  request
}: LogAdminActionInput) {
  // Opcional: Puedes extraer la IP o User-Agent del objeto 'request' si tu tabla lo soporta
  
  await execute(
    `INSERT INTO audit_logs (adminId, adminUsername, action, targetType, targetId, createdAt)
     VALUES (:adminId, :adminUsername, :action, :targetType, :targetId, NOW())`,
    {
      adminId,
      adminUsername: adminUsername || null,
      action,
      targetType,
      targetId: targetId || null
    }
  );
}
