import express from 'express';
import request from 'supertest';
import { setupTeamRoutes } from '../index';
import { TeamsService } from '../../../services/teams.service';
import {
  Organization,
  OrganizationMember,
  TeamsError,
  TeamsErrorCode,
} from '../../../types/teams-types';

// Bypass real auth — routes are exercised in isolation.
jest.mock('../../../middleware/auth', () => ({
  authenticate: () => (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', email: 't@t.io', permissions: [] };
    next();
  },
}));

jest.mock('../../../middleware/audit', () => ({
  auditRequest: () => (_req: any, _res: any, next: any) => next(),
}));

function buildApp(service: Partial<jest.Mocked<TeamsService>>) {
  const app = express();
  app.use(express.json());
  app.use('/teams', setupTeamRoutes(service as TeamsService));
  return app;
}

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';

const sampleOrg: Organization = {
  id: ORG_ID,
  name: 'Acme',
  slug: 'acme',
  type: 'team',
  createdBy: 'user-1',
  metadata: {},
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
};

const sampleMember: OrganizationMember = {
  id: MEMBER_ID,
  organizationId: ORG_ID,
  userId: 'user-1',
  email: 'owner@acme.test',
  role: 'owner',
  invitedBy: null,
  joinedAt: new Date('2026-07-01T00:00:00Z'),
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
};

describe('Team Accounts routes', () => {
  describe('POST /teams/organizations', () => {
    it('returns 201 with the created organization', async () => {
      const createOrganization = jest.fn().mockResolvedValue(sampleOrg);
      const app = buildApp({ createOrganization } as any);

      const response = await request(app)
        .post('/teams/organizations')
        .send({ name: 'Acme' });

      expect(response.status).toBe(201);
      expect(response.body.organization.id).toBe(ORG_ID);
      expect(createOrganization).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ name: 'Acme' })
      );
    });

    it('returns 400 when the name is missing', async () => {
      const app = buildApp({ createOrganization: jest.fn() } as any);

      const response = await request(app).post('/teams/organizations').send({});
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when a provided slug is malformed', async () => {
      const app = buildApp({ createOrganization: jest.fn() } as any);

      const response = await request(app)
        .post('/teams/organizations')
        .send({ name: 'Acme', slug: 'NotValid Slug' });

      expect(response.status).toBe(400);
    });

    it('returns 409 when the slug is taken', async () => {
      const createOrganization = jest.fn().mockRejectedValue(
        new TeamsError(TeamsErrorCode.ORGANIZATION_SLUG_TAKEN, 'taken', 409)
      );
      const app = buildApp({ createOrganization } as any);

      const response = await request(app)
        .post('/teams/organizations')
        .send({ name: 'Acme' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ORGANIZATION_SLUG_TAKEN');
    });
  });

  describe('GET /teams/organizations', () => {
    it('returns the current user workspaces', async () => {
      const listOrganizationsForUser = jest.fn().mockResolvedValue([sampleOrg]);
      const app = buildApp({ listOrganizationsForUser } as any);

      const response = await request(app).get('/teams/organizations');

      expect(response.status).toBe(200);
      expect(response.body.organizations).toHaveLength(1);
      expect(listOrganizationsForUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET /teams/organizations/:orgId (cross-org protection)', () => {
    it('returns 404 when the caller is not a member', async () => {
      const getOrganizationForUser = jest.fn().mockRejectedValue(
        new TeamsError(
          TeamsErrorCode.ORGANIZATION_NOT_FOUND,
          'Organization not found',
          404
        )
      );
      const app = buildApp({ getOrganizationForUser } as any);

      const response = await request(app).get(`/teams/organizations/${ORG_ID}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
    });

    it('returns the org when the caller is a member', async () => {
      const getOrganizationForUser = jest.fn().mockResolvedValue(sampleOrg);
      const app = buildApp({ getOrganizationForUser } as any);

      const response = await request(app).get(`/teams/organizations/${ORG_ID}`);

      expect(response.status).toBe(200);
      expect(response.body.organization.id).toBe(ORG_ID);
    });
  });

  describe('POST /teams/organizations/:orgId/invite', () => {
    it('returns 201 with the newly added member', async () => {
      const inviteMember = jest.fn().mockResolvedValue(sampleMember);
      const app = buildApp({ inviteMember } as any);

      const response = await request(app)
        .post(`/teams/organizations/${ORG_ID}/invite`)
        .send({ email: 'new@user.io', role: 'member' });

      expect(response.status).toBe(201);
      expect(response.body.member.id).toBe(MEMBER_ID);
      expect(inviteMember).toHaveBeenCalledWith(
        ORG_ID,
        'user-1',
        expect.objectContaining({ email: 'new@user.io' })
      );
    });

    it('returns 400 when the email is missing', async () => {
      const app = buildApp({ inviteMember: jest.fn() } as any);

      const response = await request(app)
        .post(`/teams/organizations/${ORG_ID}/invite`)
        .send({ role: 'member' });

      expect(response.status).toBe(400);
    });

    it('rejects owner promotion via the invite endpoint (role must be admin/member/viewer)', async () => {
      const app = buildApp({ inviteMember: jest.fn() } as any);

      const response = await request(app)
        .post(`/teams/organizations/${ORG_ID}/invite`)
        .send({ email: 'x@y.io', role: 'owner' });

      expect(response.status).toBe(400);
    });

    it('returns 403 when the caller lacks admin role', async () => {
      const inviteMember = jest.fn().mockRejectedValue(
        new TeamsError(
          TeamsErrorCode.MEMBER_INSUFFICIENT_ROLE,
          'Action requires role >= admin',
          403
        )
      );
      const app = buildApp({ inviteMember } as any);

      const response = await request(app)
        .post(`/teams/organizations/${ORG_ID}/invite`)
        .send({ email: 'x@y.io', role: 'member' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('MEMBER_INSUFFICIENT_ROLE');
    });

    it('returns 404 when the caller is not a member of the target org', async () => {
      const inviteMember = jest.fn().mockRejectedValue(
        new TeamsError(
          TeamsErrorCode.ORGANIZATION_NOT_FOUND,
          'Organization not found',
          404
        )
      );
      const app = buildApp({ inviteMember } as any);

      const response = await request(app)
        .post(`/teams/organizations/${ORG_ID}/invite`)
        .send({ email: 'x@y.io', role: 'member' });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /teams/organizations/:orgId/members', () => {
    it('returns the roster for members', async () => {
      const listMembersForUser = jest.fn().mockResolvedValue([sampleMember]);
      const app = buildApp({ listMembersForUser } as any);

      const response = await request(app).get(
        `/teams/organizations/${ORG_ID}/members`
      );

      expect(response.status).toBe(200);
      expect(response.body.members).toHaveLength(1);
      expect(listMembersForUser).toHaveBeenCalledWith(ORG_ID, 'user-1');
    });

    it('returns 404 for non-members (cross-org access blocked)', async () => {
      const listMembersForUser = jest.fn().mockRejectedValue(
        new TeamsError(
          TeamsErrorCode.ORGANIZATION_NOT_FOUND,
          'Organization not found',
          404
        )
      );
      const app = buildApp({ listMembersForUser } as any);

      const response = await request(app).get(
        `/teams/organizations/${ORG_ID}/members`
      );

      expect(response.status).toBe(404);
    });

    it('returns 400 when the orgId is not a UUID', async () => {
      const app = buildApp({ listMembersForUser: jest.fn() } as any);

      const response = await request(app).get(
        `/teams/organizations/not-a-uuid/members`
      );
      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /teams/organizations/:orgId/members/:memberId', () => {
    it('returns the updated member on success', async () => {
      const updateMemberRole = jest.fn().mockResolvedValue({
        ...sampleMember,
        role: 'admin',
      });
      const app = buildApp({ updateMemberRole } as any);

      const response = await request(app)
        .patch(`/teams/organizations/${ORG_ID}/members/${MEMBER_ID}`)
        .send({ role: 'admin' });

      expect(response.status).toBe(200);
      expect(response.body.member.role).toBe('admin');
    });

    it('surfaces last-owner protection as 409', async () => {
      const updateMemberRole = jest.fn().mockRejectedValue(
        new TeamsError(
          TeamsErrorCode.MEMBER_LAST_OWNER,
          'Cannot demote the last owner',
          409
        )
      );
      const app = buildApp({ updateMemberRole } as any);

      const response = await request(app)
        .patch(`/teams/organizations/${ORG_ID}/members/${MEMBER_ID}`)
        .send({ role: 'admin' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('MEMBER_LAST_OWNER');
    });

    it('returns 400 when role is missing', async () => {
      const app = buildApp({ updateMemberRole: jest.fn() } as any);

      const response = await request(app)
        .patch(`/teams/organizations/${ORG_ID}/members/${MEMBER_ID}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /teams/organizations/:orgId/members/:memberId', () => {
    it('returns 204 on success', async () => {
      const removeMember = jest.fn().mockResolvedValue(undefined);
      const app = buildApp({ removeMember } as any);

      const response = await request(app).delete(
        `/teams/organizations/${ORG_ID}/members/${MEMBER_ID}`
      );

      expect(response.status).toBe(204);
    });

    it('returns 404 when the target member does not belong to the org', async () => {
      const removeMember = jest.fn().mockRejectedValue(
        new TeamsError(TeamsErrorCode.MEMBER_NOT_FOUND, 'Member not found', 404)
      );
      const app = buildApp({ removeMember } as any);

      const response = await request(app).delete(
        `/teams/organizations/${ORG_ID}/members/${MEMBER_ID}`
      );

      expect(response.status).toBe(404);
    });
  });

  describe('GET /teams/organizations/:orgId/activity', () => {
    it('returns the activity array and next cursor', async () => {
      const listActivityForUser = jest
        .fn()
        .mockResolvedValue({ items: [], nextCursor: null });
      const app = buildApp({ listActivityForUser } as any);

      const response = await request(app).get(
        `/teams/organizations/${ORG_ID}/activity`
      );

      expect(response.status).toBe(200);
      expect(response.body.activity).toEqual([]);
      expect(response.body.nextCursor).toBeNull();
    });
  });
});
