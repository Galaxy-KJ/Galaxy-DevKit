/**
 * @fileoverview Frontend client for organization team management API
 */

export type TeamRole = 'admin' | 'member' | 'viewer';

export interface TeamMember {
  id: string;
  organizationId: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
}

export interface TeamActivityLog {
  id: string;
  organizationId: string;
  actorEmail: string;
  action: string;
  createdAt: string;
}

export class TeamManagementClient {
  constructor(
    private readonly baseUrl: string = '/api/v1/teams',
    private readonly authToken?: string
  ) {}

  async listMembers(organizationId: string): Promise<TeamMember[]> {
    const response = await this.request<{ members: TeamMember[] }>(
      `${this.baseUrl}/${organizationId}/members`
    );
    return response.members;
  }

  async inviteMember(
    organizationId: string,
    email: string,
    role: TeamRole
  ): Promise<TeamMember> {
    const response = await this.request<{ member: TeamMember }>(
      `${this.baseUrl}/${organizationId}/invite`,
      {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      }
    );
    return response.member;
  }

  async updateMemberRole(memberId: string, role: TeamRole): Promise<TeamMember> {
    const response = await this.request<{ member: TeamMember }>(
      `${this.baseUrl}/members/${memberId}/role`,
      {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }
    );
    return response.member;
  }

  async listActivity(organizationId: string): Promise<TeamActivityLog[]> {
    const response = await this.request<{ activity: TeamActivityLog[] }>(
      `${this.baseUrl}/${organizationId}/activity`
    );
    return response.activity;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };

    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message =
        payload?.error?.message ??
        payload?.error ??
        `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }
}
