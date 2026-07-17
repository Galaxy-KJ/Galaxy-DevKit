/**
 * @fileoverview Business-layer orchestrator for Team Accounts.
 * @description Sits between Express handlers and the repository. Enforces:
 *              - membership-required access (cross-org protection),
 *              - role-based gates (only owner/admin can invite / mutate members),
 *              - last-owner protection (an org must always have >= 1 owner),
 *              - personal workspaces are immutable rosters (creator only).
 *              All failures surface as typed TeamsError so route handlers can
 *              map them to HTTP status codes consistently.
 * @author Galaxy DevKit Team
 * @since 2026-07-01
 */

import { TeamsRepository } from '../repositories/teams.repository';
import { CursorPageResult } from '../utils/pagination';
import {
  CreateOrganizationInput,
  InviteMemberInput,
  Organization,
  OrganizationActivity,
  OrganizationMember,
  OrganizationRole,
  ROLE_RANK,
  TeamsError,
  TeamsErrorCode,
} from '../types/teams-types';

const ACTOR_INVITE_MIN_ROLE: OrganizationRole = 'admin';
const ACTOR_MUTATE_MEMBER_MIN_ROLE: OrganizationRole = 'admin';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export class TeamsService {
  constructor(private readonly repo: TeamsRepository = new TeamsRepository()) {}

  /**
   * Ensure the caller is a member of the organization and (optionally) has at
   * least `minRole`. Returns the loaded membership so the caller can reuse it
   * without a second lookup.
   */
  async assertMembership(
    organizationId: string,
    userId: string,
    minRole?: OrganizationRole
  ): Promise<OrganizationMember> {
    const membership = await this.repo.findMembership(organizationId, userId);
    if (!membership) {
      // Deliberately return 404 (not 403) so we don't leak org existence to
      // users who aren't members.
      throw new TeamsError(
        TeamsErrorCode.ORGANIZATION_NOT_FOUND,
        'Organization not found',
        404
      );
    }
    if (minRole && ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      throw new TeamsError(
        TeamsErrorCode.MEMBER_INSUFFICIENT_ROLE,
        `Action requires role >= ${minRole}`,
        403,
        { requiredRole: minRole, currentRole: membership.role }
      );
    }
    return membership;
  }

  async createOrganization(
    userId: string,
    input: CreateOrganizationInput
  ): Promise<Organization> {
    const desiredSlug = (input.slug ?? slugify(input.name));
    if (!desiredSlug) {
      throw new TeamsError(
        TeamsErrorCode.ORGANIZATION_VALIDATION_ERROR,
        'Cannot derive a slug from the provided name',
        400
      );
    }

    const existing = await this.repo.findOrganizationBySlug(desiredSlug);
    if (existing) {
      throw new TeamsError(
        TeamsErrorCode.ORGANIZATION_SLUG_TAKEN,
        `Slug "${desiredSlug}" is already taken`,
        409
      );
    }

    const organization = await this.repo.createOrganization({
      name: input.name.trim(),
      slug: desiredSlug,
      type: 'team',
      createdBy: userId,
      metadata: input.metadata ?? {},
    });

    // Creator is auto-added as owner. Without this step the org would be
    // orphaned (no member can ever access it via the API).
    await this.repo.addMember({
      organizationId: organization.id,
      userId,
      role: 'owner',
      invitedBy: null,
    });

    await this.repo.addActivity({
      organizationId: organization.id,
      actorUserId: userId,
      action: 'organization.created',
      metadata: { name: organization.name, slug: organization.slug },
    });

    return organization;
  }

  async listOrganizationsForUser(userId: string): Promise<Organization[]> {
    return this.repo.listOrganizationsForUser(userId);
  }

  async getOrganizationForUser(orgId: string, userId: string): Promise<Organization> {
    await this.assertMembership(orgId, userId);
    const organization = await this.repo.findOrganizationById(orgId);
    if (!organization) {
      // Membership existed but the org row is gone — treat as not-found.
      throw new TeamsError(
        TeamsErrorCode.ORGANIZATION_NOT_FOUND,
        'Organization not found',
        404
      );
    }
    return organization;
  }

  async listMembersForUser(orgId: string, userId: string): Promise<OrganizationMember[]> {
    await this.assertMembership(orgId, userId);
    return this.repo.listMembers(orgId);
  }

  async inviteMember(
    orgId: string,
    actorUserId: string,
    input: InviteMemberInput
  ): Promise<OrganizationMember> {
    await this.assertMembership(orgId, actorUserId, ACTOR_INVITE_MIN_ROLE);

    const organization = await this.repo.findOrganizationById(orgId);
    if (!organization) {
      throw new TeamsError(
        TeamsErrorCode.ORGANIZATION_NOT_FOUND,
        'Organization not found',
        404
      );
    }
    if (organization.type === 'personal') {
      throw new TeamsError(
        TeamsErrorCode.ORGANIZATION_PERSONAL_IMMUTABLE,
        'Personal workspaces cannot have additional members',
        400
      );
    }

    const invitee = await this.repo.findUserByEmail(input.email);
    if (!invitee) {
      throw new TeamsError(
        TeamsErrorCode.MEMBER_INVITEE_NOT_REGISTERED,
        `No registered user found for ${input.email}`,
        404
      );
    }

    const existing = await this.repo.findMembership(orgId, invitee.id);
    if (existing) {
      throw new TeamsError(
        TeamsErrorCode.MEMBER_ALREADY_EXISTS,
        `${input.email} is already a member of this organization`,
        409
      );
    }

    const member = await this.repo.addMember({
      organizationId: orgId,
      userId: invitee.id,
      role: input.role,
      invitedBy: actorUserId,
    });

    await this.repo.addActivity({
      organizationId: orgId,
      actorUserId,
      action: 'member.invited',
      targetUserId: invitee.id,
      metadata: { email: invitee.email, role: input.role },
    });

    return member;
  }

  async updateMemberRole(
    orgId: string,
    actorUserId: string,
    memberId: string,
    role: OrganizationRole
  ): Promise<OrganizationMember> {
    await this.assertMembership(orgId, actorUserId, ACTOR_MUTATE_MEMBER_MIN_ROLE);

    const target = await this.repo.findMemberById(orgId, memberId);
    if (!target) {
      throw new TeamsError(TeamsErrorCode.MEMBER_NOT_FOUND, 'Member not found', 404);
    }

    // Prevent demoting the last owner — otherwise the org becomes ownerless
    // and no one can invite, delete, or manage it anymore.
    if (target.role === 'owner' && role !== 'owner') {
      const owners = await this.repo.countOwners(orgId);
      if (owners <= 1) {
        throw new TeamsError(
          TeamsErrorCode.MEMBER_LAST_OWNER,
          'Cannot demote the last owner of the organization',
          409
        );
      }
    }

    const updated = await this.repo.updateMemberRole(orgId, memberId, role);
    if (!updated) {
      throw new TeamsError(TeamsErrorCode.MEMBER_NOT_FOUND, 'Member not found', 404);
    }

    await this.repo.addActivity({
      organizationId: orgId,
      actorUserId,
      action: 'member.role_updated',
      targetUserId: target.userId,
      metadata: { fromRole: target.role, toRole: role },
    });

    return updated;
  }

  async removeMember(
    orgId: string,
    actorUserId: string,
    memberId: string
  ): Promise<void> {
    await this.assertMembership(orgId, actorUserId, ACTOR_MUTATE_MEMBER_MIN_ROLE);

    const target = await this.repo.findMemberById(orgId, memberId);
    if (!target) {
      throw new TeamsError(TeamsErrorCode.MEMBER_NOT_FOUND, 'Member not found', 404);
    }

    if (target.role === 'owner') {
      const owners = await this.repo.countOwners(orgId);
      if (owners <= 1) {
        throw new TeamsError(
          TeamsErrorCode.MEMBER_LAST_OWNER,
          'Cannot remove the last owner of the organization',
          409
        );
      }
    }

    const removed = await this.repo.removeMember(orgId, memberId);
    if (!removed) {
      throw new TeamsError(TeamsErrorCode.MEMBER_NOT_FOUND, 'Member not found', 404);
    }

    await this.repo.addActivity({
      organizationId: orgId,
      actorUserId,
      action: 'member.removed',
      targetUserId: target.userId,
      metadata: { role: target.role },
    });
  }

  async listActivityForUser(
    orgId: string,
    userId: string,
    opts: { limit?: number; cursor?: string } = {}
  ): Promise<CursorPageResult<OrganizationActivity>> {
    await this.assertMembership(orgId, userId);
    return this.repo.listActivity(orgId, opts);
  }
}
