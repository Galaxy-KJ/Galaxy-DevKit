import { SupabaseClient } from '@supabase/supabase-js';
import { TeamsRepository } from '../teams.repository';

/**
 * Builds a chainable Supabase mock. Each terminal method (`.single`,
 * `.maybeSingle`, awaited `.delete/.range/.update/.eq`) resolves to whatever
 * the test pre-loaded into `responses`. The order of queue entries matches
 * the order of terminal awaits in the test.
 */
function makeClient(
  responses: Array<{ data?: unknown; error?: unknown; count?: number }>
) {
  const queue = [...responses];
  const next = () => queue.shift() ?? { data: null, error: null };

  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockImplementation(() => Promise.resolve(next())),
    limit: jest.fn().mockImplementation(() => Promise.resolve(next())),
    single: jest.fn().mockImplementation(() => Promise.resolve(next())),
    maybeSingle: jest.fn().mockImplementation(() => Promise.resolve(next())),
    then: undefined as unknown,
  };

  // For awaited chains that DON'T end on .single/.range (e.g. update().eq()),
  // make the chain itself thenable so `await query` resolves with the next response.
  (chain as unknown as { then: (resolve: (v: unknown) => void) => void }).then = (
    resolve
  ) => resolve(next());

  const client = {
    from: jest.fn().mockReturnValue(chain),
  } as unknown as SupabaseClient;

  return { client, chain };
}

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const MEMBER_ID = '33333333-3333-3333-3333-333333333333';

const orgRow = {
  id: ORG_ID,
  name: 'Acme',
  slug: 'acme',
  type: 'team' as const,
  created_by: USER_ID,
  metadata: {},
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

const memberRow = {
  id: MEMBER_ID,
  organization_id: ORG_ID,
  user_id: USER_ID,
  role: 'owner' as const,
  invited_by: null,
  joined_at: '2026-07-01T00:00:00Z',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
  member_user: { email: 'owner@acme.test' },
};

describe('TeamsRepository', () => {
  describe('createOrganization', () => {
    it('maps the returned row into the domain Organization', async () => {
      const { client } = makeClient([{ data: orgRow, error: null }]);
      const repo = new TeamsRepository(client);

      const org = await repo.createOrganization({
        name: 'Acme',
        slug: 'acme',
        type: 'team',
        createdBy: USER_ID,
      });

      expect(org.id).toBe(ORG_ID);
      expect(org.type).toBe('team');
      expect(org.createdAt).toBeInstanceOf(Date);
    });

    it('throws when the insert errors', async () => {
      const { client } = makeClient([
        { data: null, error: { message: 'duplicate' } },
      ]);
      const repo = new TeamsRepository(client);

      await expect(
        repo.createOrganization({
          name: 'Acme',
          slug: 'acme',
          type: 'team',
          createdBy: USER_ID,
        })
      ).rejects.toThrow('Failed to create organization');
    });
  });

  describe('findOrganizationBySlug', () => {
    it('normalizes the slug to lowercase when querying', async () => {
      const { client, chain } = makeClient([{ data: orgRow, error: null }]);
      const repo = new TeamsRepository(client);

      await repo.findOrganizationBySlug('ACME');

      expect(chain.eq).toHaveBeenCalledWith('slug', 'acme');
    });

    it('returns null when no row is found', async () => {
      const { client } = makeClient([{ data: null, error: null }]);
      const repo = new TeamsRepository(client);

      const org = await repo.findOrganizationBySlug('missing');
      expect(org).toBeNull();
    });
  });

  describe('listOrganizationsForUser', () => {
    it('unwraps the joined organization rows and skips null joins', async () => {
      const { client } = makeClient([
        {
          data: [
            { organizations: orgRow },
            { organizations: null }, // defensive path for dangling joins
          ],
          error: null,
        },
      ]);
      const repo = new TeamsRepository(client);

      const orgs = await repo.listOrganizationsForUser(USER_ID);

      expect(orgs).toHaveLength(1);
      expect(orgs[0].slug).toBe('acme');
    });
  });

  describe('findMembership', () => {
    it('scopes the query by both organization_id and user_id', async () => {
      const { client, chain } = makeClient([{ data: memberRow, error: null }]);
      const repo = new TeamsRepository(client);

      await repo.findMembership(ORG_ID, USER_ID);

      expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
      expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    });

    it('flattens the joined user email into the domain object', async () => {
      const { client } = makeClient([{ data: memberRow, error: null }]);
      const repo = new TeamsRepository(client);

      const member = await repo.findMembership(ORG_ID, USER_ID);
      expect(member?.email).toBe('owner@acme.test');
    });

    it('returns null when the user is not a member', async () => {
      const { client } = makeClient([{ data: null, error: null }]);
      const repo = new TeamsRepository(client);

      const member = await repo.findMembership(ORG_ID, 'stranger');
      expect(member).toBeNull();
    });
  });

  describe('listMembers', () => {
    it('always filters by organization_id (cross-org protection)', async () => {
      const { client, chain } = makeClient([{ data: [memberRow], error: null }]);
      const repo = new TeamsRepository(client);

      await repo.listMembers(ORG_ID);

      expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
    });
  });

  describe('countOwners', () => {
    it('returns the exact count returned by supabase', async () => {
      const { client } = makeClient([{ error: null, count: 2 }]);
      const repo = new TeamsRepository(client);

      const owners = await repo.countOwners(ORG_ID);
      expect(owners).toBe(2);
    });

    it('returns 0 when supabase returns null for count', async () => {
      const { client } = makeClient([{ error: null }]);
      const repo = new TeamsRepository(client);

      const owners = await repo.countOwners(ORG_ID);
      expect(owners).toBe(0);
    });
  });

  describe('updateMemberRole', () => {
    it('scopes the update by organization_id AND member id', async () => {
      const { client, chain } = makeClient([
        { data: { ...memberRow, role: 'admin' }, error: null },
      ]);
      const repo = new TeamsRepository(client);

      await repo.updateMemberRole(ORG_ID, MEMBER_ID, 'admin');

      expect(chain.update).toHaveBeenCalledWith({ role: 'admin' });
      expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
      expect(chain.eq).toHaveBeenCalledWith('id', MEMBER_ID);
    });

    it('returns null when no row was touched (e.g. cross-org attempt)', async () => {
      const { client } = makeClient([{ data: null, error: null }]);
      const repo = new TeamsRepository(client);

      const result = await repo.updateMemberRole(ORG_ID, MEMBER_ID, 'admin');
      expect(result).toBeNull();
    });
  });

  describe('removeMember', () => {
    it('returns true when a row was deleted', async () => {
      const { client } = makeClient([{ error: null, count: 1 }]);
      const repo = new TeamsRepository(client);

      const ok = await repo.removeMember(ORG_ID, MEMBER_ID);
      expect(ok).toBe(true);
    });

    it('returns false when no row matched (wrong org)', async () => {
      const { client } = makeClient([{ error: null, count: 0 }]);
      const repo = new TeamsRepository(client);

      const ok = await repo.removeMember(ORG_ID, MEMBER_ID);
      expect(ok).toBe(false);
    });
  });

  describe('findUserByEmail', () => {
    it('normalizes the email to lowercase', async () => {
      const { client, chain } = makeClient([
        { data: { id: USER_ID, email: 'bob@example.com' }, error: null },
      ]);
      const repo = new TeamsRepository(client);

      await repo.findUserByEmail('BOB@EXAMPLE.COM');
      expect(chain.eq).toHaveBeenCalledWith('email', 'bob@example.com');
    });

    it('returns null when no user matches', async () => {
      const { client } = makeClient([{ data: null, error: null }]);
      const repo = new TeamsRepository(client);

      const user = await repo.findUserByEmail('nobody@x.io');
      expect(user).toBeNull();
    });
  });

  describe('addActivity', () => {
    it('records the actor, target and metadata', async () => {
      const activityRow = {
        id: 'act-1',
        organization_id: ORG_ID,
        actor_user_id: USER_ID,
        action: 'member.invited',
        target_user_id: 'invitee-1',
        metadata: { role: 'member' },
        created_at: '2026-07-01T00:00:00Z',
      };
      const { client, chain } = makeClient([{ data: activityRow, error: null }]);
      const repo = new TeamsRepository(client);

      const activity = await repo.addActivity({
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        action: 'member.invited',
        targetUserId: 'invitee-1',
        metadata: { role: 'member' },
      });

      expect(activity.action).toBe('member.invited');
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: ORG_ID,
          actor_user_id: USER_ID,
          action: 'member.invited',
          target_user_id: 'invitee-1',
        })
      );
    });
  });

  describe('listActivity', () => {
    it('orders by created_at DESC with pagination range', async () => {
      const { client, chain } = makeClient([
        {
          data: [
            {
              id: 'act-1',
              organization_id: ORG_ID,
              actor_user_id: USER_ID,
              action: 'organization.created',
              target_user_id: null,
              metadata: {},
              created_at: '2026-07-01T00:00:00Z',
            },
          ],
          error: null,
        },
      ]);
      const repo = new TeamsRepository(client);

      await repo.listActivity(ORG_ID, { limit: 10, offset: 5 });

      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chain.range).toHaveBeenCalledWith(5, 14);
    });
  });
});
