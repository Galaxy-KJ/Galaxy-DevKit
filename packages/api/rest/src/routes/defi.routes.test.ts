import request from 'supertest';
import express from 'express';
import { setupDefiRoutes } from './defi.routes';
import { ProtocolFactory } from '@galaxy-kj/core-defi-protocols';

// Mock ProtocolFactory and the protocols
jest.mock('@galaxy-kj/core-defi-protocols', () => {
    const originalModule = jest.requireActual('@galaxy-kj/core-defi-protocols');
    return {
        ...originalModule,
        ProtocolFactory: {
            getInstance: jest.fn().mockReturnValue({
                createProtocol: jest.fn().mockImplementation((config) => {
                    if (config.protocolId === 'soroswap') {
                        return {
                            getSwapQuote: jest.fn().mockResolvedValue({
                                amountOut: '98',
                                priceImpact: '0.5'
                            }),
                            swap: jest.fn().mockResolvedValue({ hash: 'mock-unsigned-xdr-swap' }),
                            initialize: jest.fn().mockResolvedValue(undefined),
                        };
                    } else if (config.protocolId === 'blend') {
                        return {
                            getPosition: jest.fn().mockResolvedValue({
                                address: 'mock-address',
                                supplied: [],
                                borrowed: []
                            }),
                            supply: jest.fn().mockResolvedValue({ hash: 'mock-unsigned-xdr-supply' }),
                            withdraw: jest.fn().mockResolvedValue({ hash: 'mock-unsigned-xdr-withdraw' }),
                            borrow: jest.fn().mockResolvedValue({ hash: 'mock-unsigned-xdr-borrow' }),
                            repay: jest.fn().mockResolvedValue({ hash: 'mock-unsigned-xdr-repay' }),
                            initialize: jest.fn().mockResolvedValue(undefined),
                        };
                    }
                    throw new Error('Unknown protocol');
                })
            })
        }
    };
});

// Mock authenticate middleware
jest.mock('../middleware/auth', () => ({
    authenticate: () => (req, res, next) => {
        req.user = { userId: 'mock-user-id' };
        next();
    }
}));

describe('DeFi Routes', () => {
    let app: express.Application;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/api/v1/defi', setupDefiRoutes());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Soroswap Routes', () => {
        it('GET /api/v1/defi/swap/quote should return quote', async () => {
            const response = await request(app)
                .get('/api/v1/defi/swap/quote')
                .query({ assetIn: 'XLM', assetOut: 'USDC', amountIn: '100' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('amountOut', '98');
        });

        it('GET /api/v1/defi/swap/quote should validate missing parameters', async () => {
            const response = await request(app)
                .get('/api/v1/defi/swap/quote')
                .query({ assetIn: 'XLM', assetOut: 'USDC' }); // Missing amountIn

            expect(response.status).toBe(400);
            expect(response.body.error).toBeDefined();
        });

        it('POST /api/v1/defi/swap should return unsigned XDR', async () => {
            const response = await request(app)
                .post('/api/v1/defi/swap')
                .send({
                    assetIn: 'XLM',
                    assetOut: 'USDC',
                    amountIn: '100',
                    minAmountOut: '98',
                    signerPublicKey: 'GD...SIGNER'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('hash', 'mock-unsigned-xdr-swap');
        });

        it('POST /api/v1/defi/swap should validate missing parameters', async () => {
            const response = await request(app)
                .post('/api/v1/defi/swap')
                .send({ assetIn: 'XLM' });

            expect(response.status).toBe(400);
            expect(response.body.error).toBeDefined();
        });
    });

    describe('Blend Routes', () => {
        it('GET /api/v1/defi/blend/position/:publicKey should return position', async () => {
            const response = await request(app)
                .get('/api/v1/defi/blend/position/GB...USER');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('address', 'mock-address');
        });

        it('POST /api/v1/defi/blend/supply should return unsigned XDR', async () => {
            const response = await request(app)
                .post('/api/v1/defi/blend/supply')
                .send({
                    asset: 'USDC',
                    amount: '100',
                    signerPublicKey: 'GD...SIGNER'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('hash', 'mock-unsigned-xdr-supply');
        });

        it('POST /api/v1/defi/blend/supply should validate missing parameters', async () => {
            const response = await request(app)
                .post('/api/v1/defi/blend/supply')
                .send({ asset: 'USDC' });

            expect(response.status).toBe(400);
        });

        it('POST /api/v1/defi/blend/withdraw should return unsigned XDR', async () => {
            const response = await request(app)
                .post('/api/v1/defi/blend/withdraw')
                .send({
                    asset: 'USDC',
                    amount: '50',
                    signerPublicKey: 'GD...SIGNER'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('hash', 'mock-unsigned-xdr-withdraw');
        });

        it('POST /api/v1/defi/blend/borrow should return unsigned XDR', async () => {
            const response = await request(app)
                .post('/api/v1/defi/blend/borrow')
                .send({
                    asset: 'USDC',
                    amount: '50',
                    signerPublicKey: 'GD...SIGNER'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('hash', 'mock-unsigned-xdr-borrow');
        });

        it('POST /api/v1/defi/blend/repay should return unsigned XDR', async () => {
            const response = await request(app)
                .post('/api/v1/defi/blend/repay')
                .send({
                    asset: 'USDC',
                    amount: '50',
                    signerPublicKey: 'GD...SIGNER'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('hash', 'mock-unsigned-xdr-repay');
        });
    });
});
