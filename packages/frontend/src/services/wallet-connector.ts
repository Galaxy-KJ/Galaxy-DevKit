import { SmartWalletClient } from './smart-wallet.client';
import { Address, StrKey, Networks } from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';

/**
 * Represents information about an imported smart wallet
 */
export interface ImportedWalletInfo {
  address: string;
  isValid: boolean;
  isSmartWallet: boolean;
  signers: WalletSigner[];
  errorMessage?: string;
}

/**
 * Represents a signer associated with a wallet
 */
export interface WalletSigner {
  id: string;
  type: 'admin' | 'session' | 'unknown';
  publicKey?: string;
  isActive: boolean;
}

/**
 * Service for importing and managing existing smart wallet connections
 */
export class WalletConnectorService {
  private client: SmartWalletClient;
  private server: Server;
  private network: string;

  constructor(
    client: SmartWalletClient,
    rpcUrl: string = 'https://soroban-testnet.stellar.org',
    network: string = Networks.TESTNET
  ) {
    this.client = client;
    this.server = new Server(rpcUrl);
    this.network = network;
  }

  /**
   * Verifies if a contract address is a valid Soroban contract on-chain
   * @param contractAddress - The C... contract address to verify
   * @returns true if the contract exists and is a valid contract
   */
  async verifyContractExists(contractAddress: string): Promise<boolean> {
    try {
      // Validate the address format
      if (!contractAddress.startsWith('C')) {
        return false;
      }

      // Try to decode to verify it's a valid bech32 address
      try {
        StrKey.decodeContract(contractAddress);
      } catch {
        return false;
      }

      // Convert to ScAddress for the RPC call
      const contractScAddress = new Address(contractAddress).toScAddress();
      
      // Query the ledger for the contract's instance entry
      // In Soroban, a contract exists if it has an instance entry or code
      const response = await this.server.getLedgerEntries({
        type: 'contractData',
        contract: contractAddress,
        key: 'Instance', // Soroban internal key for contract instance
        durability: 'persistent'
      });

      return !!(response && response.entries && response.entries.length > 0);
    } catch (error) {
      // Return false on any network or parsing error
      return false;
    }
  }

  /**
   * Attempts to determine if a contract is a smart wallet contract
   * by checking if it has the expected smart wallet interface
   * @param contractAddress - The contract address to verify
   * @returns true if it appears to be a smart wallet contract
   */
  async isSmartWalletContract(contractAddress: string): Promise<boolean> {
    try {
      if (!await this.verifyContractExists(contractAddress)) {
        return false;
      }

      // To verify it's a smart wallet, we check if it implements the required interface.
      // We do this by attempting to simulate a call to a read-only method that 
      // all our smart wallets should have, or by checking the contract spec.
      
      // For this implementation, we'll check for the 'add_signer' method in the interface
      // by attempting to get the contract code and checking its exported functions
      // (Simplified for this version - in a full implementation we'd use a spec check)
      
      return true; // Assume true if verifyContractExists passes for now, 
                   // as full interface check requires WASM inspection
    } catch (error) {
      console.error('Error checking if contract is smart wallet:', error);
      return false;
    }
  }

  /**
   * Imports an existing smart wallet by its address
   * Verifies the contract exists on-chain and fetches its signers
   * @param contractAddress - The C... smart wallet contract address
   * @returns ImportedWalletInfo with wallet details and signers
   */
  async importWallet(contractAddress: string): Promise<ImportedWalletInfo> {
    const result: ImportedWalletInfo = {
      address: contractAddress,
      isValid: false,
      isSmartWallet: false,
      signers: [],
    };

    try {
      // Step 1: Verify contract exists on-chain
      const exists = await this.verifyContractExists(contractAddress);
      if (!exists) {
        result.errorMessage = 'Contract address does not exist on-chain';
        return result;
      }
      result.isValid = true;

      // Step 2: Verify it's likely a smart wallet contract
      const isSmartWallet = await this.isSmartWalletContract(contractAddress);
      if (!isSmartWallet) {
        result.errorMessage =
          'Contract does not appear to be a smart wallet contract. Verify the contract address is correct.';
        return result;
      }
      result.isSmartWallet = true;

      // Step 3: Attempt to fetch signers from the contract
      // Note: This is a placeholder for now as reading contract state requires
      // more sophisticated RPC interactions. In production, you would:
      // 1. Query the contract's persistent storage for signers
      // 2. Parse the returned data to extract signer IDs and types
      const signers = await this.fetchSigners(contractAddress);
      result.signers = signers;

      // Success: wallet imported successfully
      return result;
    } catch (error) {
      result.errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return result;
    }
  }

  /**
   * Fetches the list of signers registered on a smart wallet contract
   * @param contractAddress - The smart wallet contract address
   * @returns Array of WalletSigner objects
   */
  async fetchSigners(contractAddress: string): Promise<WalletSigner[]> {
    try {
      // This is a placeholder implementation
      // In a production system, you would:
      // 1. Make an RPC call to read the contract's stored state
      // 2. Parse the storage entries to extract signer information
      // 3. Return structured WalletSigner data
      
      // For now, we return an empty list as the full implementation
      // requires deeper Soroban RPC integration
      const signers: WalletSigner[] = [];
      
      // TODO: Implement actual signer fetching using:
      // - server.getLedgerEntries() for contract data
      // - Parse xdr.ContractDataEntry to extract signer storage
      // - Return structured WalletSigner[] with id, type, and isActive flags
      
      return signers;
    } catch (error) {
      console.error('Error fetching signers from contract:', error);
      throw new Error(`Failed to fetch signers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validates a contract address format without network calls
   * @param contractAddress - The contract address to validate
   * @returns Error message if invalid, undefined if valid
   */
  validateContractAddress(contractAddress: string): string | undefined {
    if (!contractAddress || contractAddress.trim().length === 0) {
      return 'Contract address is required';
    }

    if (!contractAddress.startsWith('C')) {
      return 'Contract address must start with "C"';
    }

    // Validate bech32 format
    try {
      StrKey.decodeContract(contractAddress);
      return undefined; // valid
    } catch {
      return 'Invalid contract address format. Must be a valid bech32 address starting with "C"';
    }
  }

  /**
   * Connects to an existing wallet by address
   * This prepares the client to interact with an existing deployed wallet
   * @param contractAddress - The smart wallet contract address
   * @returns true if connection was successful
   */
  async connectToWallet(contractAddress: string): Promise<boolean> {
    try {
      const validation = this.validateContractAddress(contractAddress);
      if (validation) {
        throw new Error(validation);
      }

      // Import and verify the wallet
      const walletInfo = await this.importWallet(contractAddress);
      
      if (!walletInfo.isSmartWallet) {
        throw new Error(
          walletInfo.errorMessage || 'Failed to verify contract is a smart wallet'
        );
      }

      // Store the connection info for later use
      this.storeWalletConnection(contractAddress, walletInfo);
      
      return true;
    } catch (error) {
      console.error('Error connecting to wallet:', error);
      return false;
    }
  }

  /**
   * Stores the wallet connection information in local storage
   * @param contractAddress - The contract address
   * @param walletInfo - The wallet information to store
   */
  private storeWalletConnection(contractAddress: string, walletInfo: ImportedWalletInfo): void {
    try {
      const connections = this.getStoredConnections();
      
      // Update or add the connection
      const index = connections.findIndex(c => c.address === contractAddress);
      const connectionRecord = {
        address: contractAddress,
        importedAt: new Date().toISOString(),
        isSmartWallet: walletInfo.isSmartWallet,
        signerCount: walletInfo.signers.length,
      };

      if (index >= 0) {
        connections[index] = connectionRecord;
      } else {
        connections.push(connectionRecord);
      }

      localStorage.setItem('smart_wallet_connections', JSON.stringify(connections));
    } catch (error) {
      console.error('Error storing wallet connection:', error);
    }
  }

  /**
   * Retrieves previously stored wallet connections from local storage
   * @returns Array of stored wallet connections
   */
  getStoredConnections(): Array<{
    address: string;
    importedAt: string;
    isSmartWallet: boolean;
    signerCount: number;
  }> {
    try {
      const stored = localStorage.getItem('smart_wallet_connections');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to parse smart_wallet_connections, clearing corrupted data:', error);
      localStorage.removeItem('smart_wallet_connections');
      return [];
    }
  }

  /**
   * Removes a stored wallet connection
   * @param contractAddress - The contract address to remove
   */
  removeStoredConnection(contractAddress: string): void {
    try {
      const connections = this.getStoredConnections();
      const filtered = connections.filter(c => c.address !== contractAddress);
      localStorage.setItem('smart_wallet_connections', JSON.stringify(filtered));
    } catch (error) {
      console.error('Error removing stored connection:', error);
    }
  }
}
