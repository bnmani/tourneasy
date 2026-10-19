import type { Prisma } from '@tourneasy/db';
import { prisma } from '@tourneasy/db';
import type { RequestMeta } from './request-meta';

type Db = Prisma.TransactionClient | typeof prisma;

export type AuditEntry = {
  actorId: string | null;
  action: string; // e.g. "user.role.grant"
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  meta?: RequestMeta;
};

/** Append-only record of admin actions and security-relevant account events. */
export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before,
      after: entry.after,
      ipAddress: entry.meta?.ip ?? null,
      userAgent: entry.meta?.userAgent?.slice(0, 300) ?? null,
    },
  });
}
