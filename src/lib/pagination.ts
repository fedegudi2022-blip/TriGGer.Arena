/**
 * Helper genérico de paginación para endpoints admin (mensajes, usuarios,
 * descargas, audit-log). Centraliza el parseo de `?page=&pageSize=` y el
 * cálculo de `totalPages`, para no repetir esta lógica en cada endpoint.
 */

export interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Lee page/pageSize de la query string, con límites sanos. */
export function parsePagination(url: URL, defaultPageSize = DEFAULT_PAGE_SIZE): PaginationParams {
  let page = parseInt(url.searchParams.get('page') ?? '1', 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  let pageSize = parseInt(url.searchParams.get('pageSize') ?? String(defaultPageSize), 10);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = defaultPageSize;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Empaqueta filas + total en la forma de respuesta estándar paginada. */
export function paginatedResponse<T>(data: T[], total: number, params: PaginationParams): PaginatedResult<T> {
  return {
    data,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}