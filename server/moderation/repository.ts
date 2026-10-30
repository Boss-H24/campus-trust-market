import type { Row } from '../db/database.ts';
export function presentReport(row: Row, admin = false) {
    return { id: String(row.id), targetType: row.target_type, targetId: String(row.target_id), reason: row.reason,
        description: row.description, status: row.status, decision: row.decision, action: row.action,
        resolutionReason: row.resolution_reason, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
        ...(admin ? { reporterId: String(row.reporter_id), targetUserId: String(row.target_user_id) } : {}) };
}
