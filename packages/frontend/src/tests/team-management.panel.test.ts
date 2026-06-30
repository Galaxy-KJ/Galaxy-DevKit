/**
 * @jest-environment jsdom
 */

jest.mock('../actions', () => ({
  assertWriteOperation: jest.fn(),
}));

import { TeamManagementPanel } from '../panels/team-management';
import { TeamManagementClient } from '../services/team-management.client';

describe('TeamManagementPanel', () => {
  let client: TeamManagementClient;

  beforeEach(() => {
    document.body.innerHTML = '<div id="team-panel"></div>';
    client = new TeamManagementClient('/api/v1/teams');

    jest.spyOn(client, 'listMembers').mockResolvedValue([
      {
        id: 'member-1',
        organizationId: 'default-org',
        email: 'admin@galaxy.dev',
        role: 'admin',
        joinedAt: new Date().toISOString(),
      },
    ]);

    jest.spyOn(client, 'listActivity').mockResolvedValue([
      {
        id: 'log-1',
        organizationId: 'default-org',
        actorEmail: 'admin@galaxy.dev',
        action: 'Organization workspace initialized',
        createdAt: new Date().toISOString(),
      },
    ]);
  });

  it('renders organization members', async () => {
    new TeamManagementPanel('team-panel', client);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector('.team-table')).toBeTruthy();
    expect(document.getElementById('tm-members-body')?.textContent).toContain('admin@galaxy.dev');
    expect(document.getElementById('tm-activity-list')?.textContent).toContain('initialized');
  });

  it('submits invitation updates through the team client', async () => {
    const inviteSpy = jest.spyOn(client, 'inviteMember').mockResolvedValue({
      id: 'member-2',
      organizationId: 'default-org',
      email: 'new@galaxy.dev',
      role: 'member',
      joinedAt: new Date().toISOString(),
    });

    new TeamManagementPanel('team-panel', client);
    await new Promise((resolve) => setTimeout(resolve, 0));

    (document.getElementById('tm-invite-email') as HTMLInputElement).value = 'new@galaxy.dev';
    document.getElementById('tm-invite-btn')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(inviteSpy).toHaveBeenCalledWith('default-org', 'new@galaxy.dev', 'member');
  });
});
