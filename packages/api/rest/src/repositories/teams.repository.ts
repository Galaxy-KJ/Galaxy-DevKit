/**
 * @fileoverview Persistence for organizations, organization_members and organization_activity.
 * @description Every read/write on membership-scoped tables is filtered by
 *              organization_id at the query level. The service layer is
 *              responsible for asserting that the caller is a member of that
 *              organization *before* invoking these methods.
 * @author Galaxy DevKit Team
 * @since 2026-07-01
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabase';
import {
  Organization,
  OrganizationActivity,
  OrganizationMember,
  OrganizationRole,
  OrganizationType,
} from '../types/teams-types';

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  created_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface OrganizationMemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
  // Joined via select('*, member_user:users!user_id(email)'). The alias is
  // required because organization_members has TWO FKs to users (user_id and
  // invited_by) — without the `!user_id` hint Supabase refuses the embed.
  member_user?: { email: string } | { email: string }[] | null;
}

interface OrganizationActivityRow {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  action: string;
  target_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

function rowToOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    createdBy: row.created_by,
    metadata: row.metadata ?? {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function extractEmail(row: OrganizationMemberRow): string {
  const rel = row.member_user;
  if (!rel) return '';
  if (Array.isArray(rel)) return rel[0]?.email ?? '';
  return rel.email ?? '';
}

function rowToMember(row: OrganizationMemberRow): OrganizationMember {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    email: extractEmail(row),
    role: row.role,
    invitedBy: row.invited_by,
    joinedAt: new Date(row.joined_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToActivity(row: OrganizationActivityRow): OrganizationActivity {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetUserId: row.target_user_id,
    metadata: row.metadata ?? {},
    createdAt: new Date(row.created_at),
  };
}

const ORGS_TABLE = 'organizations';
const MEMBERS_TABLE = 'organization_members';
const ACTIVITY_TABLE = 'organization_activity';
const USERS_TABLE = 'users';

export interface CreateOrganizationRow {
  name: string;
  slug: string;
  type: OrganizationType;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface AddMemberRow {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  invitedBy: string | null;
}

export interface AddActivityRow {
  organizationId: string;
  actorUserId: string | null;
  action: string;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
}

export class TeamsRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client ?? getSupabaseClient();
  }

  async createOrganization(input: CreateOrganizationRow): Promise<Organization> {
    const { data, error } = await this.client
      .from(ORGS_TABLE)
      .insert({
        name: input.name,
        slug: input.slug,
        type: input.type,
        created_by: input.createdBy,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create organization: ${error?.message ?? 'unknown error'}`);
    }
    return rowToOrganization(data as OrganizationRow);
  }

  async findOrganizationById(id: string): Promise<Organization | null> {
    const { data, error } = await this.client
      .from(ORGS_TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ? rowToOrganization(data as OrganizationRow) : null;
  }

  async findOrganizationBySlug(slug: string): Promise<Organization | null> {
    const { data, error } = await this.client
      .from(ORGS_TABLE)
      .select('*')
      .eq('slug', slug.toLowerCase())
      .maybeSingle();

    if (error) throw error;
    return data ? rowToOrganization(data as OrganizationRow) : null;
  }

  /**
   * List every organization the user is a member of. Used for workspace switching.
   */
  async listOrganizationsForUser(userId: string): Promise<Organization[]> {
    const { data, error } = await this.client
      .from(MEMBERS_TABLE)
      .select('organizations(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Each row is { organizations: OrganizationRow | null }; skip nulls defensively.
    // Double-cast through `unknown` because the Supabase generic types the
    // embedded relation as `any[]` (N-to-N), but the FK is 1:1 so at runtime
    // this is a single row or null.
    const rows = (data ?? []) as unknown as Array<{
      organizations: OrganizationRow | null;
    }>;
    return rows
      .map((r) => r.organizations)
      .filter((r): r is OrganizationRow => r !== null)
      .map(rowToOrganization);
  }

  async addMember(input: AddMemberRow): Promise<OrganizationMember> {
    const { data, error } = await this.client
      .from(MEMBERS_TABLE)
      .insert({
        organization_id: input.organizationId,
        user_id: input.userId,
        role: input.role,
        invited_by: input.invitedBy,
      })
      .select('*, member_user:users!user_id(email)')
      .single();

    if (error || !data) {
      throw new Error(`Failed to add member: ${error?.message ?? 'unknown error'}`);
    }
    return rowToMember(data as OrganizationMemberRow);
  }

  async findMembership(
    organizationId: string,
    userId: string
  ): Promise<OrganizationMember | null> {
    const { data, error } = await this.client
      .from(MEMBERS_TABLE)
      .select('*, member_user:users!user_id(email)')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data ? rowToMember(data as OrganizationMemberRow) : null;
  }

  async findMemberById(
    organizationId: string,
    memberId: string
  ): Promise<OrganizationMember | null> {
    const { data, error } = await this.client
      .from(MEMBERS_TABLE)
      .select('*, member_user:users!user_id(email)')
      .eq('organization_id', organizationId)
      .eq('id', memberId)
      .maybeSingle();

    if (error) throw error;
    return data ? rowToMember(data as OrganizationMemberRow) : null;
  }

  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    const { data, error } = await this.client
      .from(MEMBERS_TABLE)
      .select('*, member_user:users!user_id(email)')
      .eq('organization_id', organizationId)
      .order('joined_at', { ascending: true });

    if (error) throw error;
    return (data ?? []).map((row) => rowToMember(row as OrganizationMemberRow));
  }

  async countOwners(organizationId: string): Promise<number> {
    const { count, error } = await this.client
      .from(MEMBERS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('role', 'owner');

    if (error) throw error;
    return count ?? 0;
  }

  async updateMemberRole(
    organizationId: string,
    memberId: string,
    role: OrganizationRole
  ): Promise<OrganizationMember | null> {
    const { data, error } = await this.client
      .from(MEMBERS_TABLE)
      .update({ role })
      .eq('organization_id', organizationId)
      .eq('id', memberId)
      .select('*, member_user:users!user_id(email)')
      .maybeSingle();

    if (error) throw error;
    return data ? rowToMember(data as OrganizationMemberRow) : null;
  }

  async removeMember(organizationId: string, memberId: string): Promise<boolean> {
    const { error, count } = await this.client
      .from(MEMBERS_TABLE)
      .delete({ count: 'exact' })
      .eq('organization_id', organizationId)
      .eq('id', memberId);

    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async findUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
    const { data, error } = await this.client
      .from(USERS_TABLE)
      .select('id, email')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (error) throw error;
    return data ? { id: data.id as string, email: data.email as string } : null;
  }

  async addActivity(input: AddActivityRow): Promise<OrganizationActivity> {
    const { data, error } = await this.client
      .from(ACTIVITY_TABLE)
      .insert({
        organization_id: input.organizationId,
        actor_user_id: input.actorUserId,
        action: input.action,
        target_user_id: input.targetUserId ?? null,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to record activity: ${error?.message ?? 'unknown error'}`);
    }
    return rowToActivity(data as OrganizationActivityRow);
  }

  async listActivity(
    organizationId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<OrganizationActivity[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const { data, error } = await this.client
      .from(ACTIVITY_TABLE)
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return (data ?? []).map((row) => rowToActivity(row as OrganizationActivityRow));
  }
}
