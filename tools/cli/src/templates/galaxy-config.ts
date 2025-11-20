/**
 * @fileoverview Galaxy configuration template generator
 * @description Generates galaxy.config.js content for different project types
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import type { ConfigOptions } from '../utils/config-generator.js';

export class GalaxyConfig {
  /**
   * Generates galaxy.config.js content based on project options
   * @param options - Configuration options
   * @returns string
   */
  static generate(options: ConfigOptions): string {
    const { projectType, features, stellarNetwork, ecosystemProviderUrl } = options;

    // Determine RPC URL based on network
    let rpcUrl: string | undefined;
    switch (stellarNetwork) {
      case 'futurenet':
        rpcUrl = 'https://rpc-futurenet.stellar.org';
        break;
      case 'testnet':
        rpcUrl = 'https://soroban-testnet.stellar.org';
        break;
      case 'mainnet':
        rpcUrl = ecosystemProviderUrl;
        if (!rpcUrl) {
          console.error('For mainnet, an ecosystem provider URL must be provided via ecosystemProviderUrl option.');
        }
        break;
      default:
        throw new Error(`Unsupported stellar network: ${stellarNetwork}`);
    }

    let config = `/**
 * Galaxy DevKit Configuration
 * Generated for ${projectType} project with features: ${features.join(', ')}
 */

export default {
  // Project configuration
  project: {
    type: '${projectType}',
    features: ${JSON.stringify(features, null, 2)},
  },

  // Stellar network configuration
  stellar: {
    network: '${stellarNetwork}',
    horizonUrl: 'https://horizon${stellarNetwork === 'mainnet' ? '' : `-${stellarNetwork}`}.stellar.org',
    networkPassphrase: '${this.getNetworkPassphrase(stellarNetwork)}',
  },
`;

    // Add feature-specific configurations
    if (features.includes('wallet')) {
      config += `
  // Wallet configuration
  wallet: {
    encryption: true,
    storage: './.galaxy/wallet',
    autoLock: true,
    lockTimeout: 15 * 60 * 1000, // 15 minutes
  },
`;
    }

    if (features.includes('automation')) {
      config += `
  // Automation configuration
  automation: {
    enabled: true,
    database: './.galaxy/automation.db',
    logLevel: 'info',
    maxConcurrentJobs: 5,
    retryAttempts: 3,
  },
`;
    }

    if (features.includes('api')) {
      config += `
  // API configuration
  api: {
    port: process.env.GALAXY_API_PORT || 3001,
    host: process.env.GALAXY_API_HOST || 'localhost',
    cors: {
      origin: process.env.GALAXY_API_CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    },
  },
`;
    }

    if (features.includes('contracts')) {
      config += `
  // Smart contracts configuration
  contracts: {
    sourceDir: './contracts',
    buildDir: './build/contracts',
    testDir: './test/contracts',
    networks: {
      ${stellarNetwork}: {
        networkId: '${this.getNetworkId(stellarNetwork)}',
        ${rpcUrl ? `rpcUrl: '${rpcUrl}',` : ''}
      },
    },
  },
`;
    }

    // Add framework-specific configurations
    config += this.getFrameworkConfig(projectType);

    config += `
  // Development configuration
  dev: {
    hotReload: true,
    sourceMaps: true,
    debug: process.env.NODE_ENV === 'development',
  },

  // Build configuration
  build: {
    outDir: './dist',
    sourcemap: true,
    minify: true,
  },
};
`;

    return config;
  }

  /**
   * Gets the Stellar network passphrase
   * @param network - Network name
   * @returns string
   */
  private static getNetworkPassphrase(network: string): string {
    switch (network) {
      case 'mainnet':
        return 'Public Global Stellar Network ; September 2015';
      case 'testnet':
        return 'Test SDF Network ; September 2015';
      case 'futurenet':
        return 'Test SDF Future Network ; October 2022';
      default:
        return 'Test SDF Network ; September 2015';
    }
  }

  /**
   * Gets the network ID for contracts
   * @param network - Network name
   * @returns string
   */
  private static getNetworkId(network: string): string {
    switch (network) {
      case 'mainnet':
        return 'mainnet';
      case 'testnet':
        return 'testnet';
      case 'futurenet':
        return 'futurenet';
      default:
        return 'testnet';
    }
  }

  /**
   * Gets framework-specific configuration
   * @param projectType - Project type
   * @returns string
   */
  private static getFrameworkConfig(projectType: string): string {
    switch (projectType) {
      case 'react':
      case 'next':
        return `
  // React/Next.js configuration
  react: {
    fastRefresh: true,
    strictMode: true,
    galaxyProvider: true,
  },
`;

      case 'vue':
      case 'nuxt':
        return `
  // Vue/Nuxt.js configuration
  vue: {
    runtimeCompiler: false,
    productionTip: false,
    galaxyPlugin: true,
  },
`;

      case 'angular':
        return `
  // Angular configuration
  angular: {
    enableIvy: true,
    galaxyModule: true,
  },
`;

      case 'svelte':
        return `
  // Svelte configuration
  svelte: {
    preprocess: true,
    galaxyStore: true,
  },
`;

      case 'node':
        return `
  // Node.js configuration
  node: {
    target: 'es2020',
    module: 'commonjs',
  },
`;

      default:
        return `
  // Generic configuration
  generic: {
    target: 'es2020',
  },
`;
    }
  }
}