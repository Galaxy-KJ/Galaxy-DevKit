/**
 * @fileoverview Domain types for Team Accounts & Workspace organization
 * @description Backs Issue #313 / Roadmap #61. Personal workspaces are
 *              auto-provisioned; team workspaces are created explicitly and
 *              can hold multiple members with role-based permissions.
 * @author Galaxy DevKit Team
 * @since 2026-07-01
 */

export type OrganizationType = 'personal' | 'team';
export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  createdBy: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  role: OrganizationRole;
  invitedBy: string | null;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationActivity {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  action: string;
  targetUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  metadata?: Record<string, unknown>;
}

export interface InviteMemberInput {
  email: string;
  role: OrganizationRole;
}

export interface UpdateMemberInput {
  role: OrganizationRole;
}

/**
 * Ranked ordering used by the service to compare roles when enforcing
 * `minRole` gates (e.g. "invite requires >= admin").
 */
export const ROLE_RANK: Record<OrganizationRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export enum TeamsErrorCode {
  ORGANIZATION_NOT_FOUND = 'ORGANIZATION_NOT_FOUND',
  ORGANIZATION_FORBIDDEN = 'ORGANIZATION_FORBIDDEN',
  ORGANIZATION_VALIDATION_ERROR = 'ORGANIZATION_VALIDATION_ERROR',
  ORGANIZATION_SLUG_TAKEN = 'ORGANIZATION_SLUG_TAKEN',
  ORGANIZATION_PERSONAL_IMMUTABLE = 'ORGANIZATION_PERSONAL_IMMUTABLE',
  MEMBER_NOT_FOUND = 'MEMBER_NOT_FOUND',
  MEMBER_ALREADY_EXISTS = 'MEMBER_ALREADY_EXISTS',
  MEMBER_INVITEE_NOT_REGISTERED = 'MEMBER_INVITEE_NOT_REGISTERED',
  MEMBER_LAST_OWNER = 'MEMBER_LAST_OWNER',
  MEMBER_INSUFFICIENT_ROLE = 'MEMBER_INSUFFICIENT_ROLE',
}

export class TeamsError extends Error {
  constructor(
    public code: TeamsErrorCode,
    message: string,
    public statusCode: number = 400,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'TeamsError';
  }
}
