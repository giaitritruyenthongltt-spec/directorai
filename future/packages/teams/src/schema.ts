/**
 * P5.06a — Workspace + Member + Role + Invite schemas.
 *
 * Roles: viewer / editor / admin. Permission semantics:
 *   viewer  — read styles, read project context, run dry-runs
 *   editor  — everything in viewer + apply styles + edit styles
 *   admin   — everything in editor + invite members + remove members + delete workspace
 *
 * Invites are single-use, expire after 7 days by default. Members
 * carry a Stripe `seatId` when billing kicks in (P5.06d) so we
 * know who counts against the workspace's plan.
 */
import { z } from 'zod';

export const RoleSchema = z.enum(['viewer', 'editor', 'admin']);
export type Role = z.infer<typeof RoleSchema>;

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, digits, and dashes only'),
  name: z.string().min(1).max(80),
  /** Workspace owner — set at creation; cannot be removed. */
  ownerEmail: z.string().email(),
  createdAt: z.string().datetime(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const MemberSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  role: RoleSchema,
  /** Stripe Subscription Item id once billing wired (P5.06d). */
  seatId: z.string().optional(),
  joinedAt: z.string().datetime(),
});
export type Member = z.infer<typeof MemberSchema>;

export const InviteSchema = z.object({
  token: z.string().min(32),
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  role: RoleSchema,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type Invite = z.infer<typeof InviteSchema>;

/** Permission matrix — single source of truth. */
export const PERMISSIONS = {
  viewer: ['read'] as const,
  editor: ['read', 'apply', 'edit'] as const,
  admin: ['read', 'apply', 'edit', 'invite', 'remove', 'delete-workspace'] as const,
} as const;

export type Permission = (typeof PERMISSIONS)[Role][number];

export function hasPermission(role: Role, perm: Permission): boolean {
  return (PERMISSIONS[role] as readonly string[]).includes(perm);
}

export const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
