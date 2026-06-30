/**
 * @fileoverview Organization team management service
 */

export type TeamRole = 'admin' | 'member' | 'viewer';

export interface TeamMember {
  id: string;
  organizationId: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
}

export interface TeamInviteInput {
  organizationId: string;
  email: string;
  role: TeamRole;
}

export interface TeamActivityLog {
  id: string;
  organizationId: string;
  actorEmail: string;
  action: string;
  createdAt: string;
}

export class TeamService {
  private members = new Map<string, TeamMember>();
  private activityLogs = new Map<string, TeamActivityLog[]>();

  constructor() {
    this.seedDefaultOrganization();
  }

  listMembers(organizationId: string): TeamMember[] {
    return [...this.members.values()].filter(
      (member) => member.organizationId === organizationId
    );
  }

  inviteMember(input: TeamInviteInput): TeamMember {
    const email = input.email.trim().toLowerCase();
    if (!email) {
      throw new Error('email is required');
    }

    const duplicate = [...this.members.values()].find(
      (member) =>
        member.organizationId === input.organizationId && member.email === email
    );
    if (duplicate) {
      throw new Error('Member already exists in organization');
    }

    const member: TeamMember = {
      id: `member_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId: input.organizationId,
      email,
      role: input.role,
      joinedAt: new Date().toISOString(),
    };

    this.members.set(member.id, member);
    this.appendActivity(input.organizationId, email, `Invited ${email} as ${input.role}`);
    return member;
  }

  updateMemberRole(memberId: string, role: TeamRole): TeamMember {
    const member = this.members.get(memberId);
    if (!member) {
      throw new Error('Member not found');
    }

    member.role = role;
    this.members.set(memberId, member);
    this.appendActivity(member.organizationId, member.email, `Updated role to ${role}`);
    return member;
  }

  listActivity(organizationId: string): TeamActivityLog[] {
    return [...(this.activityLogs.get(organizationId) ?? [])].reverse();
  }

  private appendActivity(
    organizationId: string,
    actorEmail: string,
    action: string
  ): void {
    const logs = this.activityLogs.get(organizationId) ?? [];
    logs.push({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organizationId,
      actorEmail,
      action,
      createdAt: new Date().toISOString(),
    });
    this.activityLogs.set(organizationId, logs);
  }

  private seedDefaultOrganization(): void {
    const orgId = 'default-org';
    const admin: TeamMember = {
      id: 'member_admin',
      organizationId: orgId,
      email: 'admin@galaxy.dev',
      role: 'admin',
      joinedAt: new Date().toISOString(),
    };
    this.members.set(admin.id, admin);
    this.appendActivity(orgId, admin.email, 'Organization workspace initialized');
  }
}

let singleton: TeamService | null = null;

export function getTeamService(): TeamService {
  if (!singleton) {
    singleton = new TeamService();
  }
  return singleton;
}

export function resetTeamServiceForTests(): void {
  singleton = null;
}
