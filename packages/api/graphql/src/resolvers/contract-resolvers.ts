/**
 * Contract GraphQL Resolvers
 * Handles contract-related queries, mutations, and subscriptions
 */

interface DeployContractInput {
  name: string;
  code: string;
  language: string;
  metadata?: any;
}

interface UpdateContractInput {
  id: string;
  name?: string;
  description?: string;
  metadata?: any;
}

interface InvokeContractFunctionInput {
  contractId: string;
  functionName: string;
  parameters: any;
  signers?: string[];
}

import {
  CONTRACT_DEPLOYED,
  CONTRACT_UPDATED,
  CONTRACT_DELETED,
  CONTRACT_FUNCTION_INVOKED,
  contractScoped,
} from '../utils/channels';

export const contractResolvers = {
  Query: {
    contract: async (_: any, { id }: { id: string }, context: any) => {
      try {
        const contract = await context.dataSources.contractService.getContract(id);
        return contract;
      } catch (error) {
        throw new Error(`Failed to fetch contract: ${(error as Error).message}`);
      }
    },

    contractByAddress: async (_: any, { address }: { address: string }, context: any) => {
      try {
        const contract = await context.dataSources.contractService.getContractByAddress(
          address
        );
        return contract;
      } catch (error) {
        throw new Error(`Failed to fetch contract by address: ${(error as Error).message}`);
      }
    },

    contracts: async (
      _: any,
      { first, after, language }: { first?: number; after?: string; language?: string },
      context: any
    ) => {
      try {
        const contracts = await context.dataSources.contractService.getContracts({
          first: first || 10,
          after,
          language,
        });
        return contracts;
      } catch (error) {
        throw new Error(`Failed to fetch contracts: ${(error as Error).message}`);
      }
    },

    contractFunctions: async (
      _: any,
      { contractId }: { contractId: string },
      context: any
    ) => {
      try {
        const functions = await context.dataSources.contractService.getContractFunctions(
          contractId
        );
        return functions;
      } catch (error) {
        throw new Error(`Failed to fetch contract functions: ${(error as Error).message}`);
      }
    },
  },

  Mutation: {
    deployContract: async (
      _: any,
      { name, code, language, metadata }: DeployContractInput,
      context: any
    ) => {
      try {
        const contract = await context.dataSources.contractService.deployContract({
          name,
          code,
          language,
          metadata,
        });
        // Emit using centralized channel name so subscribers receive it
        context.subscriptionManager.emit(CONTRACT_DEPLOYED, contract);
        return contract;
      } catch (error) {
        throw new Error(`Failed to deploy contract: ${(error as Error).message}`);
      }
    },

    updateContract: async (
      _: any,
      { id, name, description, metadata }: UpdateContractInput,
      context: any
    ) => {
      try {
        const contract = await context.dataSources.contractService.updateContract(id, {
          name,
          description,
          metadata,
        });
        context.subscriptionManager.emit(CONTRACT_UPDATED, contract);
        return contract;
      } catch (error) {
        throw new Error(`Failed to update contract: ${(error as Error).message}`);
      }
    },

    invokeContractFunction: async (
      _: any,
      { contractId, functionName, parameters, signers }: InvokeContractFunctionInput,
      context: any
    ) => {
      try {
        const result = await context.dataSources.contractService.invokeFunction(
          contractId,
          functionName,
          parameters,
          signers
        );
        context.subscriptionManager.emit(CONTRACT_FUNCTION_INVOKED, {
          contractId,
          functionName,
          result,
        });
        return result;
      } catch (error) {
        throw new Error(`Failed to invoke contract function: ${(error as Error).message}`);
      }
    },

    deleteContract: async (_: any, { id }: { id: string }, context: any) => {
      try {
        await context.dataSources.contractService.deleteContract(id);
        context.subscriptionManager.emit(CONTRACT_DELETED, { id });
        return true;
      } catch (error) {
        throw new Error(`Failed to delete contract: ${(error as Error).message}`);
      }
    },
  },

  Subscription: {
    contractDeployed: {
      subscribe: (_: any, __: any, context: any) => {
        return context.subscriptionManager.subscribe(CONTRACT_DEPLOYED);
      },
      resolve: (payload: any) => payload,
    },

    contractUpdated: {
      subscribe: (_: any, __: any, context: any) => {
        return context.subscriptionManager.subscribe(CONTRACT_UPDATED);
      },
      resolve: (payload: any) => payload,
    },
  },

  Contract: {
    functions: async (contract: any, _: any, context: any) => {
      try {
        const functions = await context.dataSources.contractService.getContractFunctions(
          contract.id
        );
        return functions;
      } catch (error) {
        console.error('Failed to resolve contract functions:', error);
        return [];
      }
    },
  },
};
