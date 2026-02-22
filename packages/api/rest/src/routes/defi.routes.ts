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
        pool: process.env.BLEND_POOL_ADDRESS || 'CBQ6QVPK6EQQ7YHLU2A4B2NDR2B3W6F25PPMT2C5QFQHXH7QXGZYI6B5',
        router: process.env.SOROSWAP_ROUTER_ADDRESS || 'CBAX22A4F3F73ZY5P7X73A6QY4E2P6Z4FQ3FQ4F3QY4FQ4FQ4FQ4FQ4F',
        factory: process.env.SOROSWAP_FACTORY_ADDRESS || 'CBAX22A4F3F73ZY5P7X73A6QY4E2P6Z4FQ3FQ4F3QY4FQ4FQ4FQ4FQ4F'
    }
};

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

            const tokenIn: Asset = { code: assetIn as string, type: assetIn === 'XLM' ? 'native' : 'credit_alphanum4' };
            const tokenOut: Asset = { code: assetOut as string, type: assetOut === 'XLM' ? 'native' : 'credit_alphanum4' };

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

            const tokenIn: Asset = { code: assetIn, type: assetIn === 'XLM' ? 'native' : 'credit_alphanum4' };
            const tokenOut: Asset = { code: assetOut, type: assetOut === 'XLM' ? 'native' : 'credit_alphanum4' };

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

            const tokenAsset: Asset = { code: asset, type: asset === 'XLM' ? 'native' : 'credit_alphanum4' };

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

            const tokenAsset: Asset = { code: asset, type: asset === 'XLM' ? 'native' : 'credit_alphanum4' };

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

            const tokenAsset: Asset = { code: asset, type: asset === 'XLM' ? 'native' : 'credit_alphanum4' };

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

            const tokenAsset: Asset = { code: asset, type: asset === 'XLM' ? 'native' : 'credit_alphanum4' };

            const result = await protocol.repay(signerPublicKey, '', tokenAsset, amount);

            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    return router;
}
