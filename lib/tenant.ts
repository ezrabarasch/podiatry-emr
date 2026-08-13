// STOPGAP: the only tenant that exists until the session/scoping phase wires
// up real tenant context (see prisma/migrations/20260812000000_add_tenancy_foundation).
// Matches the literal id that migration inserts for "Tenant #1".
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'
