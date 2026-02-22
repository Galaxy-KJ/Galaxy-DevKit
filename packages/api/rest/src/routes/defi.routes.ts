/**
 * @fileoverview DeFi operations routes
 * @description Routes for Soroswap and Blend operations
 * @author Galaxy DevKit Team
 */

import express, { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { ProtocolFactory, ProtocolConfig, Asset, SwapQuote } from '@galaxy-kj/core-defi-protocols';

// Default configuration for protocols (can be moved to a config file or env vars)
const defaultConfig: Omit<ProtocolConfig, 'protocolId'> = {
    name: 'DeFi REST API',
    metadata: {},
    network: {
        network: 'testnet',
        horizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
        sorobanRpcUrl: process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
        passphrase: process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
    },
    contractAddresses: {
        pool: process.env.BLEND_POOL_ADDRESS || 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF',
        oracle: process.env.BLEND_ORACLE_ADDRESS || 'CAZOKR2Y5E2OSWSIBRVZMJ47RUTQPIGVWSAQ2UISGAVC46XKPGDG5PKI',
        backstop: process.env.BLEND_BACKSTOP_ADDRESS || 'CBDVWXT433PRVTUNM56C3JREF3HIZHRBA64NB2C3B2UNCKIS65ZYCLZA',
        emitter: process.env.BLEND_EMITTER_ADDRESS || 'CC3WJVJINN4E3LPMNTWKK7LQZLYDQMZHZA7EZGXATPHHBPKNZRIO3KZ6',
        router: process.env.SOROSWAP_ROUTER_ADDRESS || 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD',
        factory: process.env.SOROSWAP_FACTORY_ADDRESS || 'CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY'
    }
};

/**
 * Helper to parse asset string into Asset object
 * Supports: "XLM", "Native", or "CODE:ISSUER"
 */
function parseAsset(assetStr: string): Asset {
    if (assetStr.toUpperCase() === 'XLM' || assetStr.toUpperCase() === 'NATIVE') {
        return { code: 'XLM', type: 'native' };
    }

    if (assetStr.includes(':')) {
        const [code, issuer] = assetStr.split(':');
        return {
            code,
            issuer,
            type: code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12'
        };
    }

    // Default to credit_alphanum4 for code only (might fail validation if issuer is required)
    return {
        code: assetStr,
        type: assetStr.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12'
    };
}

export function setupDefiRoutes(): express.Router {
    const router = express.Router();

    // Route: Soroswap quote
    // GET /api/v1/defi/swap/quote?assetIn=...&assetOut=...&amountIn=...
    /**
     * @route GET /api/v1/defi/swap/quote
     * @description Get a swap quote from Soroswap
     */
    router.get('/swap/quote', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { assetIn, assetOut, amountIn } = req.query;

            if (!assetIn || !assetOut || !amountIn) {
                res.status(400).json({
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'assetIn, assetOut, and amountIn are required query parameters',
                        details: {},
                    },
                });
                return;
            }

            const factory = ProtocolFactory.getInstance();
            const protocol = factory.createProtocol({ ...defaultConfig, protocolId: 'soroswap' }) as any;
            await protocol.initialize();

            const tokenIn = parseAsset(assetIn as string);
            const tokenOut = parseAsset(assetOut as string);

            if (!protocol.getSwapQuote) {
                throw new Error('getSwapQuote not implemented');
            }
            const quote = await protocol.getSwapQuote(tokenIn, tokenOut, amountIn as string);

            res.json(quote);
        } catch (error) {
            next(error);
        }
    });

    // Route: Soroswap swap
    // POST /api/v1/defi/swap
    /**
     * @route POST /api/v1/defi/swap
     * @description Create a swap transaction on Soroswap
     */
    router.post('/swap', authenticate(), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { assetIn, assetOut, amountIn, minAmountOut, signerPublicKey } = req.body;

            if (!assetIn || !assetOut || !amountIn || !minAmountOut || !signerPublicKey) {
                res.status(400).json({
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'assetIn, assetOut, amountIn, minAmountOut, and signerPublicKey are required in the body',
                        details: {},
                    },
                });
                return;
            }

            const factory = ProtocolFactory.getInstance();
            const protocol = factory.createProtocol({ ...defaultConfig, protocolId: 'soroswap' }) as any;
            await protocol.initialize();

            const tokenIn = parseAsset(assetIn);
            const tokenOut = parseAsset(assetOut);

            if (!protocol.swap) {
                throw new Error('swap not implemented');
            }
            // Pass an empty string for privateKey so the transaction doesn't sign/submit
            const result = await protocol.swap(signerPublicKey, '', tokenIn, tokenOut, amountIn, minAmountOut);

            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    // Route: Blend get position
    // GET /api/v1/defi/blend/position/:publicKey
    /**
     * @route GET /api/v1/defi/blend/position/:publicKey
     * @description Get a user's Blend position
     */
    router.get('/blend/position/:publicKey', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { publicKey } = req.params;

            if (!publicKey) {
                res.status(400).json({
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'publicKey is required in the path',
                        details: {},
                    },
                });
                return;
            }

            const factory = ProtocolFactory.getInstance();
            const protocol = factory.createProtocol({ ...defaultConfig, protocolId: 'blend' });
            await protocol.initialize();

            const position = await protocol.getPosition(publicKey);

            res.json(position);
        } catch (error) {
            next(error);
        }
    });

    // Route: Blend supply
    // POST /api/v1/defi/blend/supply
    /**
     * @route POST /api/v1/defi/blend/supply
     */
    router.post('/blend/supply', authenticate(), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { asset, amount, signerPublicKey } = req.body;

            if (!asset || !amount || !signerPublicKey) {
                res.status(400).json({
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'asset, amount, and signerPublicKey are required in the body',
                        details: {},
                    },
                });
                return;
            }

            const factory = ProtocolFactory.getInstance();
            const protocol = factory.createProtocol({ ...defaultConfig, protocolId: 'blend' });
            await protocol.initialize();

            const tokenAsset = parseAsset(asset);

            // Empty string for privateKey means it will just return the unsigned XDR
            const result = await protocol.supply(signerPublicKey, '', tokenAsset, amount);

            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    // Route: Blend withdraw
    // POST /api/v1/defi/blend/withdraw
    /**
     * @route POST /api/v1/defi/blend/withdraw
     * @description Withdraw an asset from Blend
     */
    router.post('/blend/withdraw', authenticate(), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { asset, amount, signerPublicKey } = req.body;

            if (!asset || !amount || !signerPublicKey) {
                res.status(400).json({
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'asset, amount, and signerPublicKey are required in the body',
                        details: {},
                    },
                });
                return;
            }

            const factory = ProtocolFactory.getInstance();
            const protocol = factory.createProtocol({ ...defaultConfig, protocolId: 'blend' });
            await protocol.initialize();

            const tokenAsset = parseAsset(asset);

            const result = await protocol.withdraw(signerPublicKey, '', tokenAsset, amount);

            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    // Route: Blend borrow
    // POST /api/v1/defi/blend/borrow
    /**
     * @route POST /api/v1/defi/blend/borrow
     * @description Borrow an asset from Blend
     */
    router.post('/blend/borrow', authenticate(), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { asset, amount, signerPublicKey } = req.body;

            if (!asset || !amount || !signerPublicKey) {
                res.status(400).json({
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'asset, amount, and signerPublicKey are required in the body',
                        details: {},
                    },
                });
                return;
            }

            const factory = ProtocolFactory.getInstance();
            const protocol = factory.createProtocol({ ...defaultConfig, protocolId: 'blend' });
            await protocol.initialize();

            const tokenAsset = parseAsset(asset);

            const result = await protocol.borrow(signerPublicKey, '', tokenAsset, amount);

            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    // Route: Blend repay
    // POST /api/v1/defi/blend/repay
    /**
     * @route POST /api/v1/defi/blend/repay
     * @description Repay a borrowed asset to Blend
     */
    router.post('/blend/repay', authenticate(), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { asset, amount, signerPublicKey } = req.body;

            if (!asset || !amount || !signerPublicKey) {
                res.status(400).json({
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'asset, amount, and signerPublicKey are required in the body',
                        details: {},
                    },
                });
                return;
            }

            const factory = ProtocolFactory.getInstance();
            const protocol = factory.createProtocol({ ...defaultConfig, protocolId: 'blend' });
            await protocol.initialize();

            const tokenAsset = parseAsset(asset);

            const result = await protocol.repay(signerPublicKey, '', tokenAsset, amount);

            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    return router;
}
