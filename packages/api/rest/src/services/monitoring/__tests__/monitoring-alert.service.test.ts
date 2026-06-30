import { MonitoringAlertService } from '../monitoring-alert.service';
import { MonitoringAlertRepository } from '../../../repositories/monitoring-alert.repository';
import {
  CreateMonitoringAlertInput,
  MonitoringError,
  MonitoringErrorCode,
} from '../../../types/monitoring-types';

type RepoMock = jest.Mocked<MonitoringAlertRepository>;

function makeRepo(): RepoMock {
  return {
    create: jest.fn(),
    findByIdForUser: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    listActiveForEvaluation: jest.fn(),
    markEvaluated: jest.fn(),
    createEvent: jest.fn(),
    updateEventDelivery: jest.fn(),
    listEventsForUser: jest.fn(),
  } as unknown as RepoMock;
}

const validInput: CreateMonitoringAlertInput = {
  name: 'Blend HF guard',
  protocol: 'blend',
  accountAddress: 'GA' + 'A'.repeat(54),
  network: 'testnet',
  alertType: 'health_factor_below',
  threshold: 1.5,
  channel: 'webhook',
  channelConfig: { url: 'https://hook.example.com', secret: 'sixteenchars1234' },
  cooldownSeconds: 300,
  metadata: {},
};

describe('MonitoringAlertService', () => {
  it('delegates create to repo when input is valid', async () => {
    const repo = makeRepo();
    repo.create.mockResolvedValue({ id: 'a1' } as any);
    const service = new MonitoringAlertService(repo);

    await service.create('user-1', validInput);

    expect(repo.create).toHaveBeenCalledWith('user-1', validInput);
  });

  it('rejects unsupported protocols with 400', async () => {
    const repo = makeRepo();
    const service = new MonitoringAlertService(repo);

    await expect(
      service.create('user-1', { ...validInput, protocol: 'unknown' })
    ).rejects.toMatchObject({
      code: MonitoringErrorCode.ALERT_PROTOCOL_UNSUPPORTED,
      statusCode: 400,
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects channels that are declared but not implemented (e.g. email) with 501', async () => {
    const repo = makeRepo();
    const service = new MonitoringAlertService(repo);

    await expect(
      service.create('user-1', {
        ...validInput,
        channel: 'email',
        channelConfig: { to: 'a@b.com' } as any,
      })
    ).rejects.toMatchObject({
      code: MonitoringErrorCode.ALERT_CHANNEL_UNSUPPORTED,
      statusCode: 501,
    });
  });

  it('rejects webhook channels with missing url/secret', async () => {
    const repo = makeRepo();
    const service = new MonitoringAlertService(repo);

    await expect(
      service.create('user-1', {
        ...validInput,
        channelConfig: { url: 'https://x' } as any,
      })
    ).rejects.toMatchObject({
      code: MonitoringErrorCode.ALERT_VALIDATION_ERROR,
      statusCode: 400,
    });
  });

  it('throws ALERT_NOT_FOUND when getForUser returns nothing', async () => {
    const repo = makeRepo();
    repo.findByIdForUser.mockResolvedValue(null);
    const service = new MonitoringAlertService(repo);

    await expect(service.getForUser('a1', 'user-1')).rejects.toMatchObject({
      code: MonitoringErrorCode.ALERT_NOT_FOUND,
      statusCode: 404,
    });
  });

  it('throws ALERT_NOT_FOUND when update touches no rows', async () => {
    const repo = makeRepo();
    repo.update.mockResolvedValue(null);
    const service = new MonitoringAlertService(repo);

    await expect(service.update('a1', 'user-1', { name: 'x' })).rejects.toMatchObject({
      code: MonitoringErrorCode.ALERT_NOT_FOUND,
    });
  });

  it('throws ALERT_NOT_FOUND when delete touches no rows', async () => {
    const repo = makeRepo();
    repo.delete.mockResolvedValue(false);
    const service = new MonitoringAlertService(repo);

    await expect(service.delete('a1', 'user-1')).rejects.toMatchObject({
      code: MonitoringErrorCode.ALERT_NOT_FOUND,
    });
  });

  it('throws ALERT_NOT_FOUND when listing events for an alert the user does not own', async () => {
    const repo = makeRepo();
    repo.listEventsForUser.mockResolvedValue(null);
    const service = new MonitoringAlertService(repo);

    await expect(service.listEventsForUser('a1', 'user-1')).rejects.toBeInstanceOf(MonitoringError);
  });
});
