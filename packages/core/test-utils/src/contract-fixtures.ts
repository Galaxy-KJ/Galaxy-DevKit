import type { FundedTestAccount, TestnetHelperContext } from './testnet-helpers.js';

export interface ContractFixtureContext extends TestnetHelperContext {
  deployer?: FundedTestAccount;
}

export interface ContractFixture<TDeployment = unknown> {
  name: string;
  deploy(context: ContractFixtureContext): Promise<TDeployment>;
  initialize?(deployment: TDeployment, context: ContractFixtureContext): Promise<void>;
  cleanup?(deployment: TDeployment, context: ContractFixtureContext): Promise<void>;
}

export interface DeployedContractFixture<TDeployment = unknown> {
  name: string;
  deployment: TDeployment;
  cleanup(): Promise<void>;
}

export function createContractFixture<TDeployment>(
  fixture: ContractFixture<TDeployment>,
): ContractFixture<TDeployment> {
  return fixture;
}

export async function deployContractFixture<TDeployment>(
  fixture: ContractFixture<TDeployment>,
  context: ContractFixtureContext,
): Promise<DeployedContractFixture<TDeployment>> {
  const deployment = await fixture.deploy(context);

  if (fixture.initialize) {
    await fixture.initialize(deployment, context);
  }

  return {
    name: fixture.name,
    deployment,
    cleanup: async () => {
      if (fixture.cleanup) {
        await fixture.cleanup(deployment, context);
      }
    },
  };
}

export class ContractFixtureRegistry {
  private readonly deployed: Array<DeployedContractFixture<unknown>> = [];

  async deploy<TDeployment>(
    fixture: ContractFixture<TDeployment>,
    context: ContractFixtureContext,
  ): Promise<DeployedContractFixture<TDeployment>> {
    const deployed = await deployContractFixture(fixture, context);
    this.deployed.push(deployed as DeployedContractFixture<unknown>);
    return deployed;
  }

  async cleanup(): Promise<void> {
    const cleanupErrors: unknown[] = [];

    for (const fixture of [...this.deployed].reverse()) {
      try {
        await fixture.cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    this.deployed.length = 0;

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'One or more contract fixture cleanups failed');
    }
  }
}
