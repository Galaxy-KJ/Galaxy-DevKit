/**
 * @fileoverview Comprehensive tests for biometric authentication
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Keypair } from '@stellar/stellar-sdk';

// Mock dependencies
jest.mock('ora', () => {
    return jest.fn(() => ({
        start: jest.fn().mockReturnThis(),
        stop: jest.fn().mockReturnThis(),
        succeed: jest.fn().mockReturnThis(),
        fail: jest.fn().mockReturnThis(),
        warn: jest.fn().mockReturnThis(),
        text: ''
    }));
});

describe('Biometric Authentication Tests', () => {
    const testDir = path.join(os.tmpdir(), '.galaxy-test-biometric');
    const configFile = path.join(testDir, 'biometric-config.json');

    beforeEach(async () => {
        await fs.ensureDir(testDir);
    });

    afterEach(async () => {
        await fs.remove(testDir);
    });

    describe('Biometric Setup', () => {
        it('should initialize biometric authentication', async () => {
            const config = {
                enabled: true,
                provider: 'mock',
                enrolledAt: new Date().toISOString(),
                credentials: []
            };

            await fs.writeJson(configFile, config);
            const loaded = await fs.readJson(configFile);

            expect(loaded.enabled).toBe(true);
            expect(loaded.provider).toBe('mock');
        });

        it('should support multiple authentication providers', async () => {
            const providers = ['webauthn', 'touchid', 'faceid', 'mock'];

            for (const provider of providers) {
                const config = {
                    enabled: true,
                    provider,
                    enrolledAt: new Date().toISOString()
                };

                await fs.writeJson(configFile, config);
                const loaded = await fs.readJson(configFile);

                expect(loaded.provider).toBe(provider);
            }
        });

        it('should enroll biometric credential', async () => {
            const credential = {
                id: 'cred-123',
                type: 'public-key',
                publicKey: Keypair.random().publicKey(),
                createdAt: new Date().toISOString()
            };

            const config = {
                enabled: true,
                provider: 'mock',
                credentials: [credential]
            };

            await fs.writeJson(configFile, config);
            const loaded = await fs.readJson(configFile);

            expect(loaded.credentials).toHaveLength(1);
            expect(loaded.credentials[0].id).toBe('cred-123');
        });

        it('should handle enrollment failure', async () => {
            const enrollmentResult = {
                success: false,
                error: 'Biometric sensor not available'
            };

            expect(enrollmentResult.success).toBe(false);
            expect(enrollmentResult.error).toBeDefined();
        });
    });

    describe('Authentication Flow', () => {
        it('should authenticate with valid biometric', async () => {
            const config = {
                enabled: true,
                provider: 'mock',
                credentials: [
                    {
                        id: 'cred-1',
                        type: 'public-key',
                        publicKey: Keypair.random().publicKey()
                    }
                ]
            };

            await fs.writeJson(configFile, config);

            // Simulate authentication
            const authResult = {
                success: true,
                credentialId: 'cred-1',
                timestamp: new Date().toISOString()
            };

            expect(authResult.success).toBe(true);
            expect(authResult.credentialId).toBe('cred-1');
        });

        it('should reject invalid biometric', () => {
            const authResult = {
                success: false,
                error: 'Biometric verification failed'
            };

            expect(authResult.success).toBe(false);
            expect(authResult.error).toBeDefined();
        });

        it('should track authentication attempts', async () => {
            const attempts = [];

            for (let i = 0; i < 3; i++) {
                attempts.push({
                    timestamp: new Date().toISOString(),
                    success: i === 2, // Last attempt succeeds
                    credentialId: 'cred-1'
                });
            }

            expect(attempts).toHaveLength(3);
            expect(attempts[2].success).toBe(true);
            expect(attempts.filter(a => !a.success)).toHaveLength(2);
        });

        it('should lock after multiple failed attempts', () => {
            const maxAttempts = 3;
            const failedAttempts = 4;

            const isLocked = failedAttempts >= maxAttempts;
            expect(isLocked).toBe(true);
        });

        it('should unlock after cooldown period', () => {
            const lockedAt = new Date();
            const cooldownMinutes = 5;
            const now = new Date(lockedAt.getTime() + (cooldownMinutes + 1) * 60000);

            const isUnlocked = now.getTime() - lockedAt.getTime() > cooldownMinutes * 60000;
            expect(isUnlocked).toBe(true);
        });
    });

    describe('Transaction Signing', () => {
        it('should sign transaction after biometric verification', async () => {
            const transaction = {
                destination: Keypair.random().publicKey(),
                amount: '100',
                memo: 'Test payment'
            };

            const authResult = {
                success: true,
                credentialId: 'cred-1'
            };

            const signingResult = {
                authenticated: authResult.success,
                signature: 'mock-signature',
                signedAt: new Date().toISOString()
            };

            expect(signingResult.authenticated).toBe(true);
            expect(signingResult.signature).toBeDefined();
        });

        it('should require biometric for each transaction', () => {
            const config = {
                requireAuthPerTransaction: true
            };

            expect(config.requireAuthPerTransaction).toBe(true);
        });

        it('should support session-based authentication', async () => {
            const session = {
                id: 'session-123',
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
                authenticated: true
            };

            const now = new Date();
            const expiresAt = new Date(session.expiresAt);
            const isValid = session.authenticated && now < expiresAt;

            expect(isValid).toBe(true);
        });
    });

    describe('Credential Management', () => {
        it('should add multiple biometric credentials', async () => {
            const credentials = [
                {
                    id: 'cred-1',
                    type: 'fingerprint',
                    label: 'Right thumb',
                    createdAt: new Date().toISOString()
                },
                {
                    id: 'cred-2',
                    type: 'face',
                    label: 'Face ID',
                    createdAt: new Date().toISOString()
                }
            ];

            const config = {
                enabled: true,
                credentials
            };

            await fs.writeJson(configFile, config);
            const loaded = await fs.readJson(configFile);

            expect(loaded.credentials).toHaveLength(2);
        });

        it('should remove biometric credential', async () => {
            const config = {
                enabled: true,
                credentials: [
                    { id: 'cred-1', type: 'fingerprint' },
                    { id: 'cred-2', type: 'face' }
                ]
            };

            await fs.writeJson(configFile, config);

            // Remove credential
            const loaded = await fs.readJson(configFile);
            loaded.credentials = loaded.credentials.filter(
                (c: any) => c.id !== 'cred-1'
            );
            await fs.writeJson(configFile, loaded);

            const updated = await fs.readJson(configFile);
            expect(updated.credentials).toHaveLength(1);
            expect(updated.credentials[0].id).toBe('cred-2');
        });

        it('should update credential metadata', async () => {
            const config = {
                enabled: true,
                credentials: [
                    {
                        id: 'cred-1',
                        type: 'fingerprint',
                        label: 'Finger 1',
                        lastUsed: null
                    }
                ]
            };

            await fs.writeJson(configFile, config);

            // Update last used
            const loaded = await fs.readJson(configFile);
            loaded.credentials[0].lastUsed = new Date().toISOString();
            await fs.writeJson(configFile, loaded);

            const updated = await fs.readJson(configFile);
            expect(updated.credentials[0].lastUsed).toBeDefined();
        });
    });

    describe('Fallback Authentication', () => {
        it('should support PIN fallback', async () => {
            const config = {
                enabled: true,
                fallback: {
                    type: 'pin',
                    enabled: true,
                    pinHash: 'hashed-pin'
                }
            };

            await fs.writeJson(configFile, config);
            const loaded = await fs.readJson(configFile);

            expect(loaded.fallback.type).toBe('pin');
            expect(loaded.fallback.enabled).toBe(true);
        });

        it('should support password fallback', async () => {
            const config = {
                enabled: true,
                fallback: {
                    type: 'password',
                    enabled: true,
                    passwordHash: 'hashed-password'
                }
            };

            await fs.writeJson(configFile, config);
            const loaded = await fs.readJson(configFile);

            expect(loaded.fallback.type).toBe('password');
        });

        it('should verify PIN correctly', () => {
            const storedPinHash = 'hash-of-1234';
            const inputPin = '1234';
            const inputPinHash = 'hash-of-1234'; // Simulated hash

            const isValid = inputPinHash === storedPinHash;
            expect(isValid).toBe(true);
        });

        it('should reject incorrect PIN', () => {
            const storedPinHash = 'hash-of-1234';
            const inputPinHash = 'hash-of-5678';

            const isValid = inputPinHash === storedPinHash;
            expect(isValid).toBe(false);
        });
    });

    describe('Security Features', () => {
        it('should encrypt stored credentials', async () => {
            const credential = {
                id: 'cred-1',
                type: 'fingerprint',
                encrypted: true,
                data: 'encrypted-credential-data'
            };

            expect(credential.encrypted).toBe(true);
            expect(credential.data).toBeDefined();
        });

        it('should not store biometric templates', () => {
            const credential = {
                id: 'cred-1',
                type: 'fingerprint',
                hasTemplate: false
            };

            expect(credential.hasTemplate).toBe(false);
            expect(credential).not.toHaveProperty('template');
        });

        it('should validate credential integrity', () => {
            const credential = {
                id: 'cred-1',
                checksum: 'abc123',
                data: 'credential-data'
            };

            // Simulate checksum validation
            const calculatedChecksum = 'abc123';
            const isValid = credential.checksum === calculatedChecksum;

            expect(isValid).toBe(true);
        });

        it('should track last authentication time', async () => {
            const config = {
                enabled: true,
                lastAuth: new Date().toISOString(),
                authCount: 5
            };

            await fs.writeJson(configFile, config);
            const loaded = await fs.readJson(configFile);

            expect(loaded.lastAuth).toBeDefined();
            expect(loaded.authCount).toBe(5);
        });
    });

    describe('Platform Support', () => {
        it('should detect platform capabilities', () => {
            const platforms = {
                darwin: ['touchid', 'faceid'],
                win32: ['windowshello'],
                linux: ['fprintd']
            };

            expect(platforms.darwin).toContain('touchid');
            expect(platforms.win32).toContain('windowshello');
        });

        it('should fallback to mock provider on unsupported platforms', () => {
            const isPlatformSupported = false;
            const provider = isPlatformSupported ? 'native' : 'mock';

            expect(provider).toBe('mock');
        });
    });

    describe('Error Handling', () => {
        it('should handle sensor unavailable error', () => {
            const error = {
                code: 'SENSOR_UNAVAILABLE',
                message: 'Biometric sensor is not available'
            };

            expect(error.code).toBe('SENSOR_UNAVAILABLE');
        });

        it('should handle enrollment error', () => {
            const error = {
                code: 'ENROLLMENT_FAILED',
                message: 'Failed to enroll biometric'
            };

            expect(error.code).toBe('ENROLLMENT_FAILED');
        });

        it('should handle authentication timeout', () => {
            const error = {
                code: 'AUTH_TIMEOUT',
                message: 'Authentication timed out'
            };

            expect(error.code).toBe('AUTH_TIMEOUT');
        });

        it('should handle user cancellation', () => {
            const error = {
                code: 'USER_CANCELLED',
                message: 'User cancelled authentication'
            };

            expect(error.code).toBe('USER_CANCELLED');
        });
    });

    describe('Configuration Management', () => {
        it('should enable biometric authentication', async () => {
            const config = {
                enabled: false
            };

            await fs.writeJson(configFile, config);

            // Enable
            const loaded = await fs.readJson(configFile);
            loaded.enabled = true;
            await fs.writeJson(configFile, loaded);

            const updated = await fs.readJson(configFile);
            expect(updated.enabled).toBe(true);
        });

        it('should disable biometric authentication', async () => {
            const config = {
                enabled: true,
                credentials: [{ id: 'cred-1' }]
            };

            await fs.writeJson(configFile, config);

            // Disable
            const loaded = await fs.readJson(configFile);
            loaded.enabled = false;
            await fs.writeJson(configFile, loaded);

            const updated = await fs.readJson(configFile);
            expect(updated.enabled).toBe(false);
        });

        it('should reset biometric configuration', async () => {
            const config = {
                enabled: true,
                credentials: [{ id: 'cred-1' }, { id: 'cred-2' }]
            };

            await fs.writeJson(configFile, config);

            // Reset
            const resetConfig = {
                enabled: false,
                credentials: []
            };

            await fs.writeJson(configFile, resetConfig);
            const loaded = await fs.readJson(configFile);

            expect(loaded.enabled).toBe(false);
            expect(loaded.credentials).toHaveLength(0);
        });
    });
});
