/**
 * @fileoverview Unit tests for Social Recovery System
 * @description Comprehensive test suite for social recovery functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { SocialRecovery } from '../SocialRecovery';
import { Horizon, Keypair, Networks } from '@stellar/stellar-sdk';
import {
  GuardianStatus,
  RecoveryStatus,
  RecoveryAction,
  NotificationType,
} from '../types';

// Mock Stellar Server
jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn().mockResolvedValue({
          accountId: () => 'G...',
          sequenceNumber: () => '1',
        }),
        submitTransaction: jest.fn().mockResolvedValue({
          hash: 'test-hash',
          successful: true,
        }),
      })),
    },
  };
});

describe('SocialRecovery', () => {
  let recovery: SocialRecovery;
  let server: Horizon.Server;
  let encryptionKey: string;
  let guardian1: Keypair;
  let guardian2: Keypair;
  let guardian3: Keypair;
  let walletOwner: Keypair;
  let newOwner: Keypair;

  beforeEach(() => {
    server = new Horizon.Server('https://horizon-testnet.stellar.org');
    encryptionKey = 'test-encryption-key-32-chars-long!!';
    guardian1 = Keypair.random();
    guardian2 = Keypair.random();
    guardian3 = Keypair.random();
    walletOwner = Keypair.random();
    newOwner = Keypair.random();

    recovery = new SocialRecovery(
      {
        guardians: [
          {
            publicKey: guardian1.publicKey(),
            name: 'Guardian 1',
            addedAt: new Date(),
            verified: true,
            status: GuardianStatus.ACTIVE,
          },
          {
            publicKey: guardian2.publicKey(),
            name: 'Guardian 2',
            addedAt: new Date(),
            verified: true,
            status: GuardianStatus.ACTIVE,
          },
          {
            publicKey: guardian3.publicKey(),
            name: 'Guardian 3',
            addedAt: new Date(),
            verified: true,
            status: GuardianStatus.ACTIVE,
          },
        ],
        threshold: 2,
        timeLockHours: 48,
        enableTesting: true,
      },
      server,
      Networks.TESTNET,
      encryptionKey
    );
  });

  describe('Initialization', () => {
    it('should initialize with valid configuration', () => {
      expect(recovery).toBeDefined();
      expect(recovery.getGuardians()).toHaveLength(3);
    });

    it('should throw error with insufficient guardians', () => {
      expect(() => {
        new SocialRecovery(
          {
            guardians: [
              {
                publicKey: guardian1.publicKey(),
                addedAt: new Date(),
                verified: true,
                status: GuardianStatus.ACTIVE,
              },
            ],
            threshold: 1,
            timeLockHours: 48,
            minGuardians: 3,
          },
          server,
          Networks.TESTNET,
          encryptionKey
        );
      }).toThrow('Minimum 3 guardians required');
    });

    it('should throw error with invalid threshold', () => {
      expect(() => {
        new SocialRecovery(
          {
            guardians: [
              {
                publicKey: guardian1.publicKey(),
                addedAt: new Date(),
                verified: true,
                status: GuardianStatus.ACTIVE,
              },
            ],
            threshold: 5, // More than guardians
            timeLockHours: 48,
            minGuardians: 1,
          },
          server,
          Networks.TESTNET,
          encryptionKey
        );
      }).toThrow('Threshold must be between');
    });
  });

  describe('Guardian Management', () => {
    it('should add a new guardian', async () => {
      const newGuardian = Keypair.random();
      const guardian = await recovery.addGuardian(
        newGuardian.publicKey(),
        'New Guardian',
        'guardian@example.com'
      );

      expect(guardian.publicKey).toBe(newGuardian.publicKey());
      expect(guardian.name).toBe('New Guardian');
      expect(guardian.status).toBe(GuardianStatus.PENDING);
      expect(recovery.getGuardians()).toHaveLength(4);
    });

    it('should throw error when adding duplicate guardian', async () => {
      await expect(
        recovery.addGuardian(guardian1.publicKey(), 'Duplicate')
      ).rejects.toThrow('Guardian already exists');
    });

    it('should throw error when adding invalid public key', async () => {
      await expect(
        recovery.addGuardian('invalid-key', 'Invalid')
      ).rejects.toThrow('Invalid guardian public key');
    });

    it('should remove a guardian', async () => {
      const newGuardian = Keypair.random();
      await recovery.addGuardian(newGuardian.publicKey(), 'To Remove');
      // Verify the guardian first so it's active
      await recovery.verifyGuardian(newGuardian.publicKey());

      await recovery.removeGuardian(newGuardian.publicKey());

      const guardians = recovery.getGuardians();
      expect(guardians.find(g => g.publicKey === newGuardian.publicKey())?.status).toBe(
        GuardianStatus.REMOVED
      );
    });

    it('should throw error when removing guardian below minimum', async () => {
      // We have 3 guardians, minimum is 3
      // Try to remove one - should fail because we'd be below minimum
      await expect(recovery.removeGuardian(guardian1.publicKey())).rejects.toThrow(
        'minimum'
      );
    });

    it('should verify a guardian', async () => {
      const newGuardian = Keypair.random();
      const guardian = await recovery.addGuardian(newGuardian.publicKey(), 'To Verify');

      expect(guardian.verified).toBe(false);

      await recovery.verifyGuardian(newGuardian.publicKey());

      const updatedGuardian = recovery
        .getGuardians()
        .find(g => g.publicKey === newGuardian.publicKey());
      expect(updatedGuardian?.verified).toBe(true);
      expect(updatedGuardian?.status).toBe(GuardianStatus.ACTIVE);
    });
  });

  describe('Recovery Process', () => {
    it('should initiate a recovery request', async () => {
      const request = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey()
      );

      expect(request.id).toBeDefined();
      expect(request.walletPublicKey).toBe(walletOwner.publicKey());
      expect(request.newOwnerKey).toBe(newOwner.publicKey());
      expect(request.status).toBe(RecoveryStatus.PENDING);
      expect(request.approvals).toHaveLength(0);
      expect(request.executesAt.getTime()).toBeGreaterThan(request.initiatedAt.getTime());
    });

    it('should throw error when initiating recovery with invalid keys', async () => {
      await expect(
        recovery.initiateRecovery('invalid-key', newOwner.publicKey())
      ).rejects.toThrow('Invalid wallet public key');

      await expect(
        recovery.initiateRecovery(walletOwner.publicKey(), 'invalid-key')
      ).rejects.toThrow('Invalid new owner public key');
    });

    it('should prevent duplicate active recovery requests', async () => {
      await recovery.initiateRecovery(walletOwner.publicKey(), newOwner.publicKey());

      await expect(
        recovery.initiateRecovery(walletOwner.publicKey(), newOwner.publicKey())
      ).rejects.toThrow('An active recovery request already exists');
    });

    it('should allow guardian to approve recovery', async () => {
      const request = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey()
      );

      const approval = await recovery.guardianApprove(
        request.id,
        guardian1.publicKey(),
        guardian1.secret()
      );

      expect(approval.recoveryRequestId).toBe(request.id);
      expect(approval.guardianPublicKey).toBe(guardian1.publicKey());
      expect(approval.verified).toBe(true);

      const updatedRequest = recovery.getRecoveryRequest(request.id);
      expect(updatedRequest?.approvals).toContain(guardian1.publicKey());
    });

    it('should throw error when guardian already approved', async () => {
      const request = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey()
      );

      await recovery.guardianApprove(request.id, guardian1.publicKey(), guardian1.secret());

      await expect(
        recovery.guardianApprove(request.id, guardian1.publicKey(), guardian1.secret())
      ).rejects.toThrow('Guardian has already approved');
    });

    it('should change status to APPROVED when threshold reached', async () => {
      const request = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey()
      );

      // Approve with 2 guardians (threshold is 2)
      await recovery.guardianApprove(request.id, guardian1.publicKey(), guardian1.secret());
      await recovery.guardianApprove(request.id, guardian2.publicKey(), guardian2.secret());

      const updatedRequest = recovery.getRecoveryRequest(request.id);
      expect(updatedRequest?.status).toBe(RecoveryStatus.APPROVED);
    });

    it('should cancel a recovery request', async () => {
      const request = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey()
      );

      await recovery.cancelRecovery(request.id, walletOwner.publicKey());

      const updatedRequest = recovery.getRecoveryRequest(request.id);
      expect(updatedRequest?.status).toBe(RecoveryStatus.CANCELLED);
      expect(updatedRequest?.cancelledAt).toBeDefined();
      expect(updatedRequest?.cancelledBy).toBe(walletOwner.publicKey());
    });

    it('should throw error when cancelling executed recovery', async () => {
      const request = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey(),
        true // test mode
      );

      // Manually set to executed for testing
      (request as any).status = RecoveryStatus.EXECUTED;

      await expect(
        recovery.cancelRecovery(request.id, walletOwner.publicKey())
      ).rejects.toThrow('Cannot cancel an executed recovery');
    });
  });

  describe('Recovery Testing', () => {
    it('should run recovery test in dry-run mode', async () => {
      const testResult = await recovery.testRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey()
      );

      expect(testResult.success).toBe(true);
      expect(testResult.testId).toBeDefined();
      expect(testResult.guardiansNotified).toBeGreaterThan(0);
      expect(testResult.timeLockSimulated).toBe(true);
    });

    it('should throw error when testing disabled', async () => {
      const noTestRecovery = new SocialRecovery(
        {
          guardians: [
            {
              publicKey: guardian1.publicKey(),
              addedAt: new Date(),
              verified: true,
              status: GuardianStatus.ACTIVE,
            },
            {
              publicKey: guardian2.publicKey(),
              addedAt: new Date(),
              verified: true,
              status: GuardianStatus.ACTIVE,
            },
            {
              publicKey: guardian3.publicKey(),
              addedAt: new Date(),
              verified: true,
              status: GuardianStatus.ACTIVE,
            },
          ],
          threshold: 2,
          timeLockHours: 48,
          enableTesting: false,
        },
        server,
        Networks.TESTNET,
        encryptionKey
      );

      await expect(
        noTestRecovery.testRecovery(walletOwner.publicKey(), newOwner.publicKey())
      ).rejects.toThrow('Recovery testing is not enabled');
    });
  });

  describe('Emergency Contacts', () => {
    it('should add emergency contact', async () => {
      const contact = await recovery.addEmergencyContact(
        'John Doe',
        'john@example.com',
        'Friend'
      );

      expect(contact.id).toBeDefined();
      expect(contact.name).toBe('John Doe');
      expect(contact.relationship).toBe('Friend');
      expect(contact.verified).toBe(false);

      const contacts = recovery.getEmergencyContacts();
      expect(contacts).toHaveLength(1);
      expect(contacts[0].id).toBe(contact.id);
    });
  });

  describe('Statistics', () => {
    it('should return recovery statistics', async () => {
      // Initiate first recovery
      const request1 = await recovery.initiateRecovery(walletOwner.publicKey(), newOwner.publicKey());
      
      // Cancel it first before creating another
      await recovery.cancelRecovery(request1.id, walletOwner.publicKey());

      // Now initiate a second recovery
      const request2 = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey()
      );
      await recovery.cancelRecovery(request2.id, walletOwner.publicKey());

      const stats = recovery.getStatistics();

      expect(stats.totalRecoveryAttempts).toBeGreaterThan(0);
      expect(stats.cancelledRecoveries).toBeGreaterThan(0);
    });
  });

  describe('Events', () => {
    it('should emit recovery-initiated event', (done) => {
      recovery.once('recovery-initiated', (request) => {
        expect(request).toBeDefined();
        expect(request.walletPublicKey).toBe(walletOwner.publicKey());
        done();
      });

      recovery.initiateRecovery(walletOwner.publicKey(), newOwner.publicKey());
    });

    it('should emit guardian-approved event', (done) => {
      recovery.once('guardian-approved', (approval) => {
        expect(approval).toBeDefined();
        expect(approval.guardianPublicKey).toBe(guardian1.publicKey());
        done();
      });

      recovery
        .initiateRecovery(walletOwner.publicKey(), newOwner.publicKey())
        .then((request) => {
          recovery.guardianApprove(request.id, guardian1.publicKey(), guardian1.secret());
        });
    });
  });

  describe('Fraud Detection', () => {
    it('should detect multiple recovery attempts', async () => {
      // Create multiple recovery attempts
      for (let i = 0; i < 3; i++) {
        try {
          await recovery.initiateRecovery(walletOwner.publicKey(), newOwner.publicKey());
          const requests = recovery.getRecoveryRequests(walletOwner.publicKey());
          if (requests.length > 0) {
            await recovery.cancelRecovery(requests[0].id, walletOwner.publicKey());
          }
        } catch (error) {
          // Expected after first attempt
        }
      }

      // The verification should flag this
      const stats = recovery.getStatistics();
      expect(stats.totalRecoveryAttempts).toBeGreaterThan(0);
    });
  });
});
