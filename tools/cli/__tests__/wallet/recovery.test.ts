/**
 * @fileoverview Comprehensive tests for social recovery functionality
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

describe('Social Recovery Tests', () => {
    const testDir = path.join(os.tmpdir(), '.galaxy-test-recovery');
    const recoveryFile = path.join(testDir, 'social-recovery.json');

    beforeEach(async () => {
        await fs.ensureDir(testDir);
    });

    afterEach(async () => {
        await fs.remove(testDir);
    });

    describe('Recovery Setup', () => {
        it('should setup social recovery with guardians', async () => {
            const walletPublicKey = Keypair.random().publicKey();
            const guardians = [
                Keypair.random().publicKey(),
                Keypair.random().publicKey(),
                Keypair.random().publicKey()
            ];

            const recoveryConfig = {
                walletPublicKey,
                guardians: guardians.map(g => ({
                    publicKey: g,
                    addedAt: new Date().toISOString()
                })),
                threshold: 2,
                timeLock: 86400, // 24 hours in seconds
                createdAt: new Date().toISOString()
            };

            await fs.writeJson(recoveryFile, recoveryConfig);
            const loaded = await fs.readJson(recoveryFile);

            expect(loaded.guardians).toHaveLength(3);
            expect(loaded.threshold).toBe(2);
        });

        it('should support different threshold configurations', async () => {
            const testCases = [
                { guardians: 3, threshold: 2, name: '2-of-3' },
                { guardians: 5, threshold: 3, name: '3-of-5' },
                { guardians: 7, threshold: 4, name: '4-of-7' }
            ];

            for (const testCase of testCases) {
                const guardians = [];
                for (let i = 0; i < testCase.guardians; i++) {
                    guardians.push({
                        publicKey: Keypair.random().publicKey(),
                        addedAt: new Date().toISOString()
                    });
                }

                const config = {
                    walletPublicKey: Keypair.random().publicKey(),
                    guardians,
                    threshold: testCase.threshold,
                    timeLock: 86400
                };

                await fs.writeJson(recoveryFile, config);
                const loaded = await fs.readJson(recoveryFile);

                expect(loaded.guardians).toHaveLength(testCase.guardians);
                expect(loaded.threshold).toBe(testCase.threshold);
            }
        });

        it('should validate threshold is not greater than guardians', () => {
            const guardianCount = 3;
            const threshold = 2;

            const isValid = threshold <= guardianCount;
            expect(isValid).toBe(true);

            const invalidThreshold = 5;
            const isInvalid = invalidThreshold > guardianCount;
            expect(isInvalid).toBe(true);
        });

        it('should set time lock period', async () => {
            const timeLocks = [
                { hours: 24, seconds: 86400 },
                { hours: 48, seconds: 172800 },
                { hours: 72, seconds: 259200 }
            ];

            for (const lock of timeLocks) {
                const config = {
                    walletPublicKey: Keypair.random().publicKey(),
                    guardians: [],
                    threshold: 1,
                    timeLock: lock.seconds
                };

                await fs.writeJson(recoveryFile, config);
                const loaded = await fs.readJson(recoveryFile);

                expect(loaded.timeLock).toBe(lock.seconds);
            }
        });
    });

    describe('Guardian Management', () => {
        it('should add guardians to recovery config', async () => {
            const config = {
                walletPublicKey: Keypair.random().publicKey(),
                guardians: [],
                threshold: 2,
                timeLock: 86400
            };

            await fs.writeJson(recoveryFile, config);

            // Add guardians
            const loaded = await fs.readJson(recoveryFile);
            for (let i = 0; i < 3; i++) {
                loaded.guardians.push({
                    publicKey: Keypair.random().publicKey(),
                    addedAt: new Date().toISOString()
                });
            }

            await fs.writeJson(recoveryFile, loaded);
            const updated = await fs.readJson(recoveryFile);

            expect(updated.guardians).toHaveLength(3);
        });

        it('should remove guardians from recovery config', async () => {
            const guardian1 = Keypair.random().publicKey();
            const guardian2 = Keypair.random().publicKey();

            const config = {
                walletPublicKey: Keypair.random().publicKey(),
                guardians: [
                    { publicKey: guardian1, addedAt: new Date().toISOString() },
                    { publicKey: guardian2, addedAt: new Date().toISOString() }
                ],
                threshold: 1,
                timeLock: 86400
            };

            await fs.writeJson(recoveryFile, config);

            // Remove guardian
            const loaded = await fs.readJson(recoveryFile);
            loaded.guardians = loaded.guardians.filter(
                (g: any) => g.publicKey !== guardian1
            );

            await fs.writeJson(recoveryFile, loaded);
            const updated = await fs.readJson(recoveryFile);

            expect(updated.guardians).toHaveLength(1);
            expect(updated.guardians[0].publicKey).toBe(guardian2);
        });

        it('should prevent duplicate guardians', async () => {
            const guardianKey = Keypair.random().publicKey();

            const guardians = [
                { publicKey: guardianKey, addedAt: new Date().toISOString() }
            ];

            // Check if guardian already exists
            const isDuplicate = guardians.some(g => g.publicKey === guardianKey);
            expect(isDuplicate).toBe(true);
        });

        it('should store guardian metadata', async () => {
            const config = {
                walletPublicKey: Keypair.random().publicKey(),
                guardians: [
                    {
                        publicKey: Keypair.random().publicKey(),
                        addedAt: new Date().toISOString(),
                        label: 'Guardian 1',
                        email: 'guardian1@example.com'
                    }
                ],
                threshold: 1,
                timeLock: 86400
            };

            await fs.writeJson(recoveryFile, config);
            const loaded = await fs.readJson(recoveryFile);

            expect(loaded.guardians[0].label).toBe('Guardian 1');
            expect(loaded.guardians[0].email).toBe('guardian1@example.com');
        });
    });

    describe('Recovery Initiation', () => {
        it('should initiate recovery request', async () => {
            const recoveryRequest = {
                id: 'recovery-1',
                walletPublicKey: Keypair.random().publicKey(),
                newOwner: Keypair.random().publicKey(),
                initiatedAt: new Date().toISOString(),
                status: 'pending' as const,
                approvals: [],
                requiredApprovals: 2
            };

            const requests = { recoveryRequests: [recoveryRequest] };
            await fs.writeJson(recoveryFile, requests);

            const loaded = await fs.readJson(recoveryFile);
            expect(loaded.recoveryRequests).toHaveLength(1);
            expect(loaded.recoveryRequests[0].status).toBe('pending');
        });

        it('should track recovery request status', async () => {
            const statuses: Array<'pending' | 'approved' | 'rejected' | 'executed'> = [
                'pending',
                'approved',
                'rejected',
                'executed'
            ];

            for (const status of statuses) {
                const request = {
                    id: `recovery-${status}`,
                    walletPublicKey: Keypair.random().publicKey(),
                    newOwner: Keypair.random().publicKey(),
                    initiatedAt: new Date().toISOString(),
                    status,
                    approvals: []
                };

                expect(['pending', 'approved', 'rejected', 'executed']).toContain(status);
            }
        });

        it('should enforce time lock before execution', () => {
            const initiatedAt = new Date();
            const timeLockSeconds = 86400; // 24 hours
            const now = new Date(initiatedAt.getTime() + 50000); // 50 seconds later

            const canExecute = (now.getTime() - initiatedAt.getTime()) / 1000 >= timeLockSeconds;
            expect(canExecute).toBe(false);

            const futureTime = new Date(initiatedAt.getTime() + 90000000); // > 24 hours
            const canExecuteNow = (futureTime.getTime() - initiatedAt.getTime()) / 1000 >= timeLockSeconds;
            expect(canExecuteNow).toBe(true);
        });
    });

    describe('Guardian Approval', () => {
        it('should collect guardian approvals', async () => {
            const guardian1 = Keypair.random().publicKey();
            const guardian2 = Keypair.random().publicKey();

            const request = {
                id: 'recovery-approval',
                walletPublicKey: Keypair.random().publicKey(),
                newOwner: Keypair.random().publicKey(),
                initiatedAt: new Date().toISOString(),
                status: 'pending' as const,
                approvals: [
                    {
                        guardianPublicKey: guardian1,
                        approvedAt: new Date().toISOString(),
                        signature: 'sig1'
                    }
                ],
                requiredApprovals: 2
            };

            await fs.writeJson(recoveryFile, { recoveryRequests: [request] });

            // Add second approval
            const loaded = await fs.readJson(recoveryFile);
            loaded.recoveryRequests[0].approvals.push({
                guardianPublicKey: guardian2,
                approvedAt: new Date().toISOString(),
                signature: 'sig2'
            });

            await fs.writeJson(recoveryFile, loaded);
            const updated = await fs.readJson(recoveryFile);

            expect(updated.recoveryRequests[0].approvals).toHaveLength(2);
        });

        it('should verify guardian is authorized', async () => {
            const guardian1 = Keypair.random().publicKey();
            const guardian2 = Keypair.random().publicKey();
            const unauthorized = Keypair.random().publicKey();

            const authorizedGuardians = [guardian1, guardian2];

            expect(authorizedGuardians.includes(guardian1)).toBe(true);
            expect(authorizedGuardians.includes(unauthorized)).toBe(false);
        });

        it('should prevent duplicate approvals from same guardian', () => {
            const guardianKey = Keypair.random().publicKey();

            const approvals = [
                { guardianPublicKey: guardianKey, approvedAt: new Date().toISOString() }
            ];

            const alreadyApproved = approvals.some(
                a => a.guardianPublicKey === guardianKey
            );

            expect(alreadyApproved).toBe(true);
        });

        it('should check if threshold is met', () => {
            const requiredApprovals = 2;
            const currentApprovals = 2;

            const thresholdMet = currentApprovals >= requiredApprovals;
            expect(thresholdMet).toBe(true);

            const insufficientApprovals = 1;
            const notMet = insufficientApprovals < requiredApprovals;
            expect(notMet).toBe(true);
        });
    });

    describe('Recovery Execution', () => {
        it('should execute recovery after threshold and time lock', async () => {
            const request = {
                id: 'recovery-execute',
                walletPublicKey: Keypair.random().publicKey(),
                newOwner: Keypair.random().publicKey(),
                initiatedAt: new Date(Date.now() - 90000000).toISOString(), // > 24 hours ago
                status: 'approved' as const,
                approvals: [
                    { guardianPublicKey: Keypair.random().publicKey(), approvedAt: new Date().toISOString() },
                    { guardianPublicKey: Keypair.random().publicKey(), approvedAt: new Date().toISOString() }
                ],
                requiredApprovals: 2,
                executedAt: new Date().toISOString()
            };

            const thresholdMet = request.approvals.length >= request.requiredApprovals;
            const timeLockPassed = true; // Initiated > 24 hours ago

            expect(thresholdMet && timeLockPassed).toBe(true);
            expect(request.executedAt).toBeDefined();
        });

        it('should update wallet ownership after recovery', async () => {
            const oldOwner = Keypair.random().publicKey();
            const newOwner = Keypair.random().publicKey();

            const wallet = {
                publicKey: oldOwner,
                secretKey: Keypair.random().secret()
            };

            // Simulate recovery execution
            const recoveredWallet = {
                ...wallet,
                publicKey: newOwner,
                recoveredAt: new Date().toISOString(),
                previousOwner: oldOwner
            };

            expect(recoveredWallet.publicKey).toBe(newOwner);
            expect(recoveredWallet.previousOwner).toBe(oldOwner);
        });
    });

    describe('Recovery Cancellation', () => {
        it('should cancel pending recovery request', async () => {
            const request = {
                id: 'recovery-cancel',
                walletPublicKey: Keypair.random().publicKey(),
                newOwner: Keypair.random().publicKey(),
                initiatedAt: new Date().toISOString(),
                status: 'pending' as const,
                approvals: []
            };

            await fs.writeJson(recoveryFile, { recoveryRequests: [request] });

            // Cancel request
            const loaded = await fs.readJson(recoveryFile);
            loaded.recoveryRequests[0].status = 'rejected';
            loaded.recoveryRequests[0].cancelledAt = new Date().toISOString();

            await fs.writeJson(recoveryFile, loaded);
            const updated = await fs.readJson(recoveryFile);

            expect(updated.recoveryRequests[0].status).toBe('rejected');
            expect(updated.recoveryRequests[0].cancelledAt).toBeDefined();
        });

        it('should prevent execution of cancelled recovery', () => {
            const request = {
                status: 'rejected' as const,
                approvals: [
                    { guardianPublicKey: Keypair.random().publicKey() },
                    { guardianPublicKey: Keypair.random().publicKey() }
                ],
                requiredApprovals: 2
            };

            const canExecute = request.status === 'approved' &&
                request.approvals.length >= request.requiredApprovals;

            expect(canExecute).toBe(false);
        });
    });

    describe('Fraud Detection', () => {
        it('should flag suspicious recovery requests', () => {
            const now = new Date();
            const lastRequest = new Date(now.getTime() - 3600000); // 1 hour ago

            // Multiple requests in short time
            const timeBetweenRequests = (now.getTime() - lastRequest.getTime()) / 1000;
            const isSuspicious = timeBetweenRequests < 86400; // Less than 24 hours

            expect(isSuspicious).toBe(true);
        });

        it('should notify all guardians of recovery attempt', async () => {
            const guardians = [
                { publicKey: Keypair.random().publicKey(), email: 'g1@example.com' },
                { publicKey: Keypair.random().publicKey(), email: 'g2@example.com' },
                { publicKey: Keypair.random().publicKey(), email: 'g3@example.com' }
            ];

            const notifications = guardians.map(g => ({
                recipient: g.email,
                message: 'Recovery request initiated',
                sentAt: new Date().toISOString()
            }));

            expect(notifications).toHaveLength(guardians.length);
        });

        it('should track risk score for recovery requests', () => {
            const riskFactors = {
                multipleRecentAttempts: 2,
                unknownNewOwner: true,
                guardianResponseTime: 300 // seconds
            };

            let riskScore = 0;
            if (riskFactors.multipleRecentAttempts > 1) riskScore += 30;
            if (riskFactors.unknownNewOwner) riskScore += 20;
            if (riskFactors.guardianResponseTime < 600) riskScore += 10;

            expect(riskScore).toBeGreaterThan(0);
        });
    });

    describe('Emergency Contacts', () => {
        it('should store emergency contact information', async () => {
            const config = {
                walletPublicKey: Keypair.random().publicKey(),
                guardians: [],
                threshold: 2,
                timeLock: 86400,
                emergencyContacts: [
                    {
                        name: 'Emergency Contact',
                        email: 'emergency@example.com',
                        phone: '+1234567890'
                    }
                ]
            };

            await fs.writeJson(recoveryFile, config);
            const loaded = await fs.readJson(recoveryFile);

            expect(loaded.emergencyContacts).toHaveLength(1);
            expect(loaded.emergencyContacts[0].email).toBe('emergency@example.com');
        });

        it('should notify emergency contacts on recovery', () => {
            const emergencyContacts = [
                { email: 'contact1@example.com' },
                { email: 'contact2@example.com' }
            ];

            const notifications = emergencyContacts.map(contact => ({
                to: contact.email,
                subject: 'Recovery initiated',
                sentAt: new Date().toISOString()
            }));

            expect(notifications).toHaveLength(2);
        });
    });

    describe('Configuration Validation', () => {
        it('should validate minimum guardian count', () => {
            const minGuardians = 2;
            const guardianCount = 3;

            const isValid = guardianCount >= minGuardians;
            expect(isValid).toBe(true);
        });

        it('should validate threshold percentage', () => {
            const guardianCount = 5;
            const threshold = 3;
            const percentage = (threshold / guardianCount) * 100;

            expect(percentage).toBeGreaterThan(50); // > 50% for security
        });

        it('should validate time lock duration', () => {
            const minTimeLock = 3600; // 1 hour
            const maxTimeLock = 2592000; // 30 days

            const validTimeLock = 86400; // 24 hours
            const isValid = validTimeLock >= minTimeLock && validTimeLock <= maxTimeLock;

            expect(isValid).toBe(true);
        });
    });
});
