import { TeamManagementClient, TeamMember, TeamRole } from '../services/team-management.client';
import { assertWriteOperation } from '../actions';

export class TeamManagementPanel {
  private container: HTMLElement;
  private client: TeamManagementClient;
  private organizationId: string;
  private members: TeamMember[] = [];
  private statusDisplay: HTMLElement | null = null;

  constructor(
    containerId: string,
    client: TeamManagementClient,
    organizationId: string = 'default-org'
  ) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container #${containerId} not found`);
    this.container = el;
    this.client = client;
    this.organizationId = organizationId;
    this.render();
    void this.refresh();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="panel team-management">
        <h3>Organization & Team Management</h3>

        <div class="form-section">
          <h4>Invite Member</h4>
          <div class="form-group">
            <label for="tm-invite-email">Email</label>
            <input type="email" id="tm-invite-email" placeholder="member@company.com" />
          </div>
          <div class="form-group">
            <label for="tm-invite-role">Role</label>
            <select id="tm-invite-role">
              <option value="admin">Admin</option>
              <option value="member" selected>Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button id="tm-invite-btn">Send Invitation</button>
        </div>

        <div class="form-section">
          <h4>Organization Members</h4>
          <div class="table-responsive">
            <table class="team-table" aria-label="Organization members">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="tm-members-body">
                <tr><td colspan="4">Loading members...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="form-section">
          <h4>Workspace Activity</h4>
          <ul id="tm-activity-list" class="activity-list"></ul>
        </div>

        <div id="tm-status" class="status"></div>
      </div>
    `;

    this.statusDisplay = document.getElementById('tm-status');
    document.getElementById('tm-invite-btn')?.addEventListener('click', () => this.handleInvite());
  }

  private async refresh(): Promise<void> {
    try {
      this.members = await this.client.listMembers(this.organizationId);
      this.renderMembers();
      await this.renderActivity();
    } catch (err: any) {
      this.updateStatus(`Failed to load team data: ${err.message}`, 'error');
    }
  }

  private renderMembers(): void {
    const body = document.getElementById('tm-members-body');
    if (!body) return;

    if (this.members.length === 0) {
      body.innerHTML = '<tr><td colspan="4">No members yet.</td></tr>';
      return;
    }

    body.innerHTML = this.members
      .map(
        (member) => `
          <tr data-member-id="${member.id}">
            <td>${member.email}</td>
            <td>
              <select class="tm-role-select" data-member-id="${member.id}" aria-label="Role for ${member.email}">
                <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="member" ${member.role === 'member' ? 'selected' : ''}>Member</option>
                <option value="viewer" ${member.role === 'viewer' ? 'selected' : ''}>Viewer</option>
              </select>
            </td>
            <td>${new Date(member.joinedAt).toLocaleString()}</td>
            <td><button class="tm-save-role" data-member-id="${member.id}">Save Role</button></td>
          </tr>
        `
      )
      .join('');

    body.querySelectorAll('.tm-save-role').forEach((button) => {
      button.addEventListener('click', (event) => {
        const target = event.currentTarget as HTMLButtonElement;
        void this.handleRoleUpdate(target.dataset.memberId!);
      });
    });
  }

  private async renderActivity(): Promise<void> {
    const list = document.getElementById('tm-activity-list');
    if (!list) return;

    const activity = await this.client.listActivity(this.organizationId);
    list.innerHTML =
      activity.length === 0
        ? '<li>No activity yet.</li>'
        : activity
            .map(
              (entry) =>
                `<li><strong>${entry.actorEmail}</strong> — ${entry.action} <em>(${new Date(entry.createdAt).toLocaleString()})</em></li>`
            )
            .join('');
  }

  private async handleInvite(): Promise<void> {
    try {
      assertWriteOperation();
      const email = (document.getElementById('tm-invite-email') as HTMLInputElement).value.trim();
      const role = (document.getElementById('tm-invite-role') as HTMLSelectElement)
        .value as TeamRole;

      if (!email) {
        throw new Error('Email is required');
      }

      this.updateStatus('Sending invitation...', 'info');
      await this.client.inviteMember(this.organizationId, email, role);
      (document.getElementById('tm-invite-email') as HTMLInputElement).value = '';
      await this.refresh();
      this.updateStatus('Invitation sent successfully.', 'success');
    } catch (err: any) {
      this.updateStatus(`Error: ${err.message}`, 'error');
    }
  }

  private async handleRoleUpdate(memberId: string): Promise<void> {
    try {
      assertWriteOperation();
      const select = this.container.querySelector(
        `.tm-role-select[data-member-id="${memberId}"]`
      ) as HTMLSelectElement | null;

      if (!select) {
        throw new Error('Role selector not found');
      }

      this.updateStatus('Updating member role...', 'info');
      await this.client.updateMemberRole(memberId, select.value as TeamRole);
      await this.refresh();
      this.updateStatus('Member role updated.', 'success');
    } catch (err: any) {
      this.updateStatus(`Error: ${err.message}`, 'error');
    }
  }

  private updateStatus(msg: string, type: 'info' | 'success' | 'error'): void {
    if (this.statusDisplay) {
      this.statusDisplay.textContent = msg;
      this.statusDisplay.className = `status status-${type}`;
    }
  }
}
