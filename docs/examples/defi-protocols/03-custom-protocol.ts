/**
 * @fileoverview Example: Implementing a Custom DeFi Protocol
 * @description Shows how to extend BaseProtocol to create a custom protocol integration
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * 
 * This example demonstrates:
 * - Extending the BaseProtocol abstract class
 * - Implementing required abstract methods
 * - Registering the protocol with the factory
 * - Proper error handling patterns
 */

import {
    BaseProtocol,
    ProtocolConfig,
    ProtocolType,
    ProtocolStats,
    Asset,
    TransactionResult,
    Position,
    HealthFactor,
    APYInfo,
    ProtocolFactory,
    getProtocolFactory,
    TESTNET_CONFIG
} from '@galaxy/core-defi-protocols';

// ============================================
// Step 1: Define Your Protocol Class
// ============================================

/**
 * Example custom protocol implementation
 * This demonstrates a lending protocol similar to Blend
 */
class CustomLendingProtocol extends BaseProtocol {
    // Internal state
    private poolContractId: string = '';

    /**
     * Return the protocol type
     * This is required by the BaseProtocol abstract class
     */
    protected getProtocolType(): ProtocolType {
        return ProtocolType.LENDING;
    }

    /**
     * Protocol-specific initialization
     * Called during initialize() after base validation
     */
    protected async setupProtocol(): Promise<void> {
        // Get the pool contract address from config
        this.poolContractId = this.getContractAddress('pool');

        // Perform any protocol-specific setup
        // e.g., verify contract exists, load initial state
        console.log(`Initialized ${this.name} with pool: ${this.poolContractId}`);
    }

    /**
     * Get protocol statistics
     */
    public async getStats(): Promise<ProtocolStats> {
        this.ensureInitialized();

        // In a real implementation, you would query the contract
        return {
            totalSupply: '1000000.0000000',
            totalBorrow: '500000.0000000',
            tvl: '1000000.0000000',
            utilizationRate: 50,
            timestamp: new Date()
        };
    }

    /**
     * Supply assets to the protocol
     */
    public async supply(
        walletAddress: string,
        privateKey: string,
        asset: Asset,
        amount: string
    ): Promise<TransactionResult> {
        this.ensureInitialized();
        this.validateAddress(walletAddress);
        this.validateAsset(asset);
        this.validateAmount(amount);

        try {
            // Build and submit the supply transaction
            // In a real implementation, this would call the Soroban contract

            // Simulated result
            return this.buildTransactionResult(
                'SIMULATED_TX_HASH_123',
                'success',
                12345,
                { operation: 'supply', asset: asset.code, amount }
            );
        } catch (error) {
            this.handleError(error, 'supply');
        }
    }

    /**
     * Borrow assets from the protocol
     */
    public async borrow(
        walletAddress: string,
        privateKey: string,
        asset: Asset,
        amount: string
    ): Promise<TransactionResult> {
        this.ensureInitialized();
        this.validateAddress(walletAddress);
        this.validateAsset(asset);
        this.validateAmount(amount);

        // Check health factor before borrowing
        const healthFactor = await this.getHealthFactor(walletAddress);
        if (!healthFactor.isHealthy) {
            throw new Error('Health factor too low to borrow');
        }

        return this.buildTransactionResult(
            'SIMULATED_TX_HASH_456',
            'success',
            12346,
            { operation: 'borrow', asset: asset.code, amount }
        );
    }

    /**
     * Repay borrowed assets
     */
    public async repay(
        walletAddress: string,
        privateKey: string,
        asset: Asset,
        amount: string
    ): Promise<TransactionResult> {
        this.ensureInitialized();
        this.validateAddress(walletAddress);
        this.validateAsset(asset);
        this.validateAmount(amount);

        return this.buildTransactionResult(
            'SIMULATED_TX_HASH_789',
            'success',
            12347,
            { operation: 'repay', asset: asset.code, amount }
        );
    }

    /**
     * Withdraw supplied assets
     */
    public async withdraw(
        walletAddress: string,
        privateKey: string,
        asset: Asset,
        amount: string
    ): Promise<TransactionResult> {
        this.ensureInitialized();
        this.validateAddress(walletAddress);
        this.validateAsset(asset);
        this.validateAmount(amount);

        return this.buildTransactionResult(
            'SIMULATED_TX_HASH_ABC',
            'success',
            12348,
            { operation: 'withdraw', asset: asset.code, amount }
        );
    }

    /**
     * Get user position
     */
    public async getPosition(address: string): Promise<Position> {
        this.ensureInitialized();
        this.validateAddress(address);

        // In a real implementation, query the contract for user's position
        return {
            address,
            supplied: [],
            borrowed: [],
            healthFactor: '1.5',
            collateralValue: '0',
            debtValue: '0'
        };
    }

    /**
     * Get user health factor
     */
    public async getHealthFactor(address: string): Promise<HealthFactor> {
        this.ensureInitialized();
        this.validateAddress(address);

        return {
            value: '1.5',
            liquidationThreshold: '0.8',
            maxLTV: '0.75',
            isHealthy: true
        };
    }

    /**
     * Get supply APY for an asset
     */
    public async getSupplyAPY(asset: Asset): Promise<APYInfo> {
        this.ensureInitialized();
        this.validateAsset(asset);

        return {
            supplyAPY: '3.5',
            borrowAPY: '5.2',
            timestamp: new Date()
        };
    }

    /**
     * Get borrow APY for an asset
     */
    public async getBorrowAPY(asset: Asset): Promise<APYInfo> {
        this.ensureInitialized();
        this.validateAsset(asset);

        return {
            supplyAPY: '3.5',
            borrowAPY: '5.2',
            timestamp: new Date()
        };
    }

    /**
     * Get total supply for an asset
     */
    public async getTotalSupply(asset: Asset): Promise<string> {
        this.ensureInitialized();
        this.validateAsset(asset);
        return '1000000.0000000';
    }

    /**
     * Get total borrow for an asset
     */
    public async getTotalBorrow(asset: Asset): Promise<string> {
        this.ensureInitialized();
        this.validateAsset(asset);
        return '500000.0000000';
    }
}

// ============================================
// Step 2: Register the Protocol
// ============================================

// Get the singleton factory instance
const factory = getProtocolFactory();

// Register your protocol with a unique ID
factory.register('custom-lending', CustomLendingProtocol);

// ============================================
// Step 3: Use the Protocol
// ============================================

async function main() {
    // Create protocol configuration
    const config: ProtocolConfig = {
        protocolId: 'custom-lending',
        name: 'My Custom Lending Protocol',
        network: TESTNET_CONFIG,
        contractAddresses: {
            pool: 'CCUSTOM_POOL_CONTRACT_ADDRESS'
        },
        metadata: {
            website: 'https://example.com',
            docs: 'https://docs.example.com'
        }
    };

    // Create protocol instance via factory
    const protocol = factory.createProtocol(config);

    // Initialize the protocol
    await protocol.initialize();
    console.log('Protocol initialized:', protocol.isInitialized());

    // Get protocol stats
    const stats = await protocol.getStats();
    console.log('TVL:', stats.tvl);
    console.log('Utilization:', stats.utilizationRate, '%');

    // Example: Supply assets
    const usdcAsset: Asset = {
        code: 'USDC',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        type: 'credit_alphanum4'
    };

    const walletAddress = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3SACD63Z2N3G';
    const privateKey = 'YOUR_PRIVATE_KEY'; // Never hardcode in production!

    const result = await protocol.supply(walletAddress, privateKey, usdcAsset, '1000.0000000');
    console.log('Supply result:', result.status, result.hash);

    // Get user position
    const position = await protocol.getPosition(walletAddress);
    console.log('Health Factor:', position.healthFactor);
}

// Run the example
main().catch(console.error);
