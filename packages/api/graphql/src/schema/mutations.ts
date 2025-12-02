import { gql } from 'apollo-server-express';

/**
 * GraphQL Mutation Definitions
 * Defines all write operations for the Galaxy API
 */
export const mutationTypeDefs = gql`
  type Mutation {
    # Wallet Mutations
    createWallet(
      name: String!
      type: WalletType!
    ): Wallet!
    importWallet(
      publicKey: String!
      name: String
    ): Wallet!
    deleteWallet(id: ID!): Boolean!
    updateWalletName(id: ID!, name: String!): Wallet!

    # Contract Mutations
    deployContract(
      name: String!
      code: String!
      language: ContractLanguage!
      metadata: JSON
    ): Contract!
    updateContract(
      id: ID!
      name: String
      description: String
      metadata: JSON
    ): Contract!
    invokeContractFunction(
      contractId: ID!
      functionName: String!
      parameters: JSON!
      signers: [String!]
    ): JSON!
    deleteContract(id: ID!): Boolean!

    # Transaction Mutations
    sendPayment(
      source: String!
      destination: String!
      asset: String!
      amount: String!
      memo: String
      signers: [String!]!
    ): Transaction!
    createOffer(
      source: String!
      selling: String!
      buying: String!
      amount: String!
      price: String!
      signers: [String!]!
    ): Transaction!
    swapAssets(
      source: String!
      sendAsset: String!
      sendAmount: String!
      receiveAsset: String!
      receiveAmount: String!
      signers: [String!]!
    ): Transaction!
    submitTransaction(
      transactionEnvelope: String!
    ): Transaction!

    # Automation Mutations
    createAutomation(
      name: String!
      description: String
      trigger: JSON!
      actions: [JSON!]!
      enabled: Boolean
    ): Automation!
    updateAutomation(
      id: ID!
      name: String
      description: String
      trigger: JSON
      actions: [JSON!]
      enabled: Boolean
    ): Automation!
    executeAutomation(id: ID!): JSON!
    deleteAutomation(id: ID!): Boolean!
    pauseAutomation(id: ID!): Automation!
    resumeAutomation(id: ID!): Automation!

    # Settings Mutations
    updateNetworkSettings(
      network: String!
      rpcUrl: String
      horizonUrl: String
    ): JSON!
    updateGasSettings(
      gasLimit: String
      gasPrice: String
    ): JSON!
  }
`;
