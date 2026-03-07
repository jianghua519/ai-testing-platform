import { signControlPlaneJwt } from '../../apps/control-plane/dist/index.js';

export const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

export const buildTenantTable = (tenantId, tableName) => `${quoteIdentifier(tenantId)}.${quoteIdentifier(tableName)}`;

export const createAuthHeaders = ({ subjectId, tenantId }) => ({
  authorization: `Bearer ${signControlPlaneJwt({
    sub: subjectId,
    tenant_id: tenantId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}`,
});

export const seedProjectMemberships = async (pool, { tenantId, subjectId, memberships }) => {
  for (const membership of memberships) {
    await pool.query(
      `insert into subject_project_memberships (
         tenant_id, subject_id, project_id, roles_json, status
       ) values ($1, $2, $3, $4::jsonb, 'active')
       on conflict (tenant_id, subject_id, project_id) do update set
         roles_json = excluded.roles_json,
         status = excluded.status,
         updated_at = now()`,
      [
        tenantId,
        subjectId,
        membership.projectId,
        JSON.stringify(membership.roles ?? []),
      ],
    );
  }
};
