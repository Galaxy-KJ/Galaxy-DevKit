import { TeamsService } from '../teams.service';
import { TeamsRepository } from '../../repositories/teams.repository';
import {
  Organization,
  OrganizationMember,
  TeamsError,
  TeamsErrorCode,
} from '../../types/teams-types';

type RepoMock = jest.Mocked<TeamsRepository>;

function makeRepo(): RepoMock {
  return {
    createOrganization: jest.fn(),
    findOrganizationById: jest.fn(),
    findOrganizationBySlug: jest.fn(),
    listOrganizationsForUser: jest.fn(),
    addMember: jest.fn(),
    findMembership: jest.fn(),
    findMemberById: jest.fn(),
    listMembers: jest.fn(),
    countOwners: jest.fn(),
    updateMemberRole: jest.fn(),
    removeMember: jest.fn(),
    findUserByEmail: jest.fn(),
    addActivity: jest.fn(),
    listActivity: jest.fn(),
  } as unknown as RepoMock;
}

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const ACTOR_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_ID = '33333333-3333-3333-3333-333333333333';
const MEMBER_ID = '44444444-4444-4444-4444-444444444444';

const teamOrg: Organization = {
  id: ORG_ID,
  name: 'Acme',
  slug: 'acme',
  type: 'team',
  createdBy: ACTOR_ID,
  metadata: {},
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
};

const personalOrg: Organization = { ...teamOrg, type: 'personal', slug: 'personal-acme' };

const ownerMembership: OrganizationMember = {
  id: MEMBER_ID,
  organizationId: ORG_ID,
  userId: ACTOR_ID,
  email: 'owner@acme.test',
  role: 'owner',
  invitedBy: null,
  joinedAt: new Date('2026-07-01T00:00:00Z'),
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
};

const viewerMembership: OrganizationMember = {
  ...ownerMembership,
  id: 'viewer-membership',
  userId: OTHER_ID,
  email: 'viewer@acme.test',
  role: 'viewer',
};

describe('TeamsService', () => {
  describe('createOrganization', () => {
    it('derives slug from name, inserts owner membership and records activity', async () => {
      const repo = makeRepo();
      repo.findOrganizationBySlug.mockResolvedValue(null);
      repo.createOrganization.mockResolvedValue(teamOrg);
      repo.addMember.mockResolvedValue(ownerMembership);
      repo.addActivity.mockResolvedValue({} as any);

      const service = new TeamsService(repo);
      const result = await service.createOrganization(ACTOR_ID, { name: 'Acme' });

      expect(result.id).toBe(ORG_ID);
      expect(repo.createOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Acme',
          slug: 'acme',
          type: 'team',
          createdBy: ACTOR_ID,
        })
      );
      expect(repo.addMember).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          userId: ACTOR_ID,
          role: 'owner',
        })
      );
      expect(repo.addActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'organization.created' })
      );
    });

    it('rejects with 409 when the slug is already taken', async () => {
      const repo = makeRepo();
      repo.findOrganizationBySlug.mockResolvedValue(teamOrg);

      const service = new TeamsService(repo);

      await expect(
        service.createOrganization(ACTOR_ID, { name: 'Acme' })
      ).rejects.toMatchObject({
        code: TeamsErrorCode.ORGANIZATION_SLUG_TAKEN,
        statusCode: 409,
      });
      expect(repo.createOrganization).not.toHaveBeenCalled();
    });

    it('rejects when a slug cannot be derived (name only produces empty chars)', async () => {
      const repo = makeRepo();
      const service = new TeamsService(repo);

      await expect(
        service.createOrganization(ACTOR_ID, { name: '...' })
      ).rejects.toMatchObject({
        code: TeamsErrorCode.ORGANIZATION_VALIDATION_ERROR,
      });
    });
  });

  describe('assertMembership (cross-org protection)', () => {
    it('returns 404 (not 403) when the user is not a member — no existence leak', async () => {
      const repo = makeRepo();
      repo.findMembership.mockResolvedValue(null);

      const service = new TeamsService(repo);

      await expect(service.assertMembership(ORG_ID, OTHER_ID)).rejects.toMatchObject({
        code: TeamsErrorCode.ORGANIZATION_NOT_FOUND,
        statusCode: 404,
      });
    });

    it('returns 403 when the caller lacks the required minimum role', async () => {
      const repo = makeRepo();
      repo.findMembership.mockResolvedValue(viewerMembership);

      const service = new TeamsService(repo);

      await expect(
        service.assertMembership(ORG_ID, OTHER_ID, 'admin')
      ).rejects.toMatchObject({
        code: TeamsErrorCode.MEMBER_INSUFFICIENT_ROLE,
        statusCode: 403,
      });
    });

    it('returns the membership when the caller has the required role', async () => {
      const repo = makeRepo();
      repo.findMembership.mockResolvedValue(ownerMembership);

      const service = new TeamsService(repo);
      const result = await service.assertMembership(ORG_ID, ACTOR_ID, 'admin');

      expect(result.role).toBe('owner');
    });
  });

  describe('inviteMember', () => {
    it('rejects invites into personal workspaces', async () => {
      const repo = makeRepo();
      repo.findMembership.mockResolvedValue(ownerMembership);
      repo.findOrganizationById.mockResolvedValue(personalOrg);

      const service = new TeamsService(repo);

      await expect(
        service.inviteMember(ORG_ID, ACTOR_ID, { email: 'x@y.io', role: 'member' })
      ).rejects.toMatchObject({
        code: TeamsErrorCode.ORGANIZATION_PERSONAL_IMMUTABLE,
      });
    });

    it('rejects with 404 when the invitee has no user account yet', async () => {
      const repo = makeRepo();
      repo.findMembership.mockResolvedValue(ownerMembership);
      repo.findOrganizationById.mockResolvedValue(teamOrg);
      repo.findUserByEmail.mockResolvedValue(null);

      const service = new TeamsService(repo);

      await expect(
        service.inviteMember(ORG_ID, ACTOR_ID, {
          email: 'new@user.io',
          role: 'member',
        })
      ).rejects.toMatchObject({
        code: TeamsErrorCode.MEMBER_INVITEE_NOT_REGISTERED,
      });
    });

    it('rejects with 409 when the invitee is already a member', async () => {
      const repo = makeRepo();
      // First call is actor's own membership; second is the invitee's existing membership.
      repo.findMembership
        .mockResolvedValueOnce(ownerMembership)
        .mockResolvedValueOnce(viewerMembership);
      repo.findOrganizationById.mockResolvedValue(teamOrg);
      repo.findUserByEmail.mockResolvedValue({
        id: OTHER_ID,
        email: 'viewer@acme.test',
      });

      const service = new TeamsService(repo);

      await expect(
        service.inviteMember(ORG_ID, ACTOR_ID, {
          email: 'viewer@acme.test',
          role: 'member',
        })
      ).rejects.toMatchObject({
        code: TeamsErrorCode.MEMBER_ALREADY_EXISTS,
      });
    });

    it('rejects with 403 when the caller is only a viewer', async () => {
      const repo = makeRepo();
      repo.findMembership.mockResolvedValue(viewerMembership);

      const service = new TeamsService(repo);

      await expect(
        service.inviteMember(ORG_ID, OTHER_ID, {
          email: 'x@y.io',
          role: 'member',
        })
      ).rejects.toMatchObject({
        code: TeamsErrorCode.MEMBER_INSUFFICIENT_ROLE,
      });
    });

    it('creates the membership and records activity on happy path', async () => {
      const repo = makeRepo();
      repo.findMembership
        .mockResolvedValueOnce(ownerMembership) // actor is owner
        .mockResolvedValueOnce(null); // invitee not yet a member
      repo.findOrganizationById.mockResolvedValue(teamOrg);
      repo.findUserByEmail.mockResolvedValue({
        id: OTHER_ID,
        email: 'new@acme.test',
      });
      repo.addMember.mockResolvedValue({
        ...viewerMembership,
        userId: OTHER_ID,
        role: 'member',
      });
      repo.addActivity.mockResolvedValue({} as any);

      const service = new TeamsService(repo);
      const member = await service.inviteMember(ORG_ID, ACTOR_ID, {
        email: 'new@acme.test',
        role: 'member',
      });

      expect(member.userId).toBe(OTHER_ID);
      expect(repo.addActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'member.invited' })
      );
    });
  });

  describe('updateMemberRole (last-owner protection)', () => {
    it('rejects demotion when the target is the only owner left', async () => {
      const repo = makeRepo();
      repo.findMembership.mockResolvedValue(ownerMembership);
      repo.findMemberById.mockResolvedValue(ownerMembership);
      repo.countOwners.mockResolvedValue(1);

      const service = new TeamsService(repo);

      await expect(
        service.updateMemberRole(ORG_ID, ACTOR_ID, MEMBER_ID, 'admin')
      ).rejects.toMatchObject({
        code: TeamsErrorCode.MEMBER_LAST_OWNER,
        statusCode: 409,
      });
      expect(repo.updateMemberRole).not.toHaveBeenCalled();
    });

    it('allows demotion when at least one other owner remains', async () => {
      const repo = makeRepo();
      repo.findMembership.mockResolvedValue(ownerMembership);
      repo.findMemberById.mockResolvedValue(ownerMembership);
      repo.countOwners.mockResolvedValue(2);
      repo.updateMemberRole.mockResolvedValue({ ...ownerMembership, role: 'admin' });
      repo.addActivity.mockResolvedValue({} as any);

      const service = new TeamsService(repo);
      const updated = await service.updateMemberRole(
        ORG_ID,
        ACTOR_ID,
        MEMBER_ID,
        'admin'
      );

      expect(updated.role).toBe('admin');
    });
  });

  describe('removeMember (last-owner protection)', () => {
    it('rejects removal when the target is the only owner left', async () => {
      const repo = makeRepo();
      repo.findMembership.mockResolvedValue(ownerMembership);
      repo.findMemberById.mockResolvedValue(ownerMembership);
      repo.countOwners.mockResolvedValue(1);

      const service = new TeamsService(repo);

      await expect(
        service.removeMember(ORG_ID, ACTOR_ID, MEMBER_ID)
      ).rejects.toMatchObject({
        code: TeamsErrorCode.MEMBER_LAST_OWNER,
      });
      expect(repo.removeMember).not.toHaveBeenCalled();
    });

    it('surfaces MEMBER_NOT_FOUND when the target does not belong to the org', async () => {
      const repo = makeRepo();
      repo.findMembership.mockResolvedValue(ownerMembership);
      repo.findMemberById.mockResolvedValue(null);

      const service = new TeamsService(repo);

      await expect(
        service.removeMember(ORG_ID, ACTOR_ID, MEMBER_ID)
      ).rejects.toBeInstanceOf(TeamsError);
    });
  });

  describe('read paths guarded by membership', () => {
    it('listMembersForUser blocks non-members with 404', async () => {
      const repo = makeRepo();
      repo.findMembership.mockResolvedValue(null);

      const service = new TeamsService(repo);

      await expect(service.listMembersForUser(ORG_ID, OTHER_ID)).rejects.toMatchObject({
        code: TeamsErrorCode.ORGANIZATION_NOT_FOUND,
      });
      expect(repo.listMembers).not.toHaveBeenCalled();
    });

    it('listActivityForUser blocks non-members with 404', async () => {
      const repo = makeRepo();
      repo.findMembership.mockResolvedValue(null);

      const service = new TeamsService(repo);

      await expect(service.listActivityForUser(ORG_ID, OTHER_ID)).rejects.toMatchObject({
        code: TeamsErrorCode.ORGANIZATION_NOT_FOUND,
      });
      expect(repo.listActivity).not.toHaveBeenCalled();
    });
  });
});
