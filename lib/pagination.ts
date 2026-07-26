/**
 * Shared page/limit parsing for paginated API routes.
 *
 *   const { page, limit, skip, take } = pageParams(searchParams)
 *
 * `limit` is clamped to 1–100 (default 25) so a client can't ask for the world.
 * An explicit `offset` wins over `page` when both are supplied.
 */
export function pageParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10) || 25))
  const offset = searchParams.get('offset')
  const skip = offset !== null ? Math.max(0, parseInt(offset, 10) || 0) : (page - 1) * limit
  return { page, limit, skip, take: limit }
}
