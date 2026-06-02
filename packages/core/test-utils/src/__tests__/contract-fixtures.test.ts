import {
  ContractFixtureRegistry,
  createContractFixture,
  deployContractFixture,
} from '../contract-fixtures.js';
import type { ContractFixtureContext } from '../contract-fixtures.js';

const context = {
  accounts: [],
  networkPassphrase: 'testnet',
  server: {},
  getAccountForWorker: jest.fn(),
} as unknown as ContractFixtureContext;

describe('contract fixtures', () => {
  it('deploys and initializes a fixture', async () => {
    const initialize = jest.fn();
    const fixture = createContractFixture({
      name: 'counter',
      deploy: async () => ({ contractId: 'C123' }),
      initialize,
    });

    const deployed = await deployContractFixture(fixture, context);

    expect(deployed.name).toBe('counter');
    expect(deployed.deployment).toEqual({ contractId: 'C123' });
    expect(initialize).toHaveBeenCalledWith({ contractId: 'C123' }, context);
  });

  it('cleans registered fixtures in reverse deployment order', async () => {
    const cleanupOrder: string[] = [];
    const registry = new ContractFixtureRegistry();

    await registry.deploy(
      createContractFixture({
        name: 'first',
        deploy: async () => 'first',
        cleanup: async () => {
          cleanupOrder.push('first');
        },
      }),
      context,
    );
    await registry.deploy(
      createContractFixture({
        name: 'second',
        deploy: async () => 'second',
        cleanup: async () => {
          cleanupOrder.push('second');
        },
      }),
      context,
    );

    await registry.cleanup();

    expect(cleanupOrder).toEqual(['second', 'first']);
  });
});
