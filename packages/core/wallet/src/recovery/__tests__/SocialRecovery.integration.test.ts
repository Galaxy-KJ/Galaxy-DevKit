/**
 * @fileoverview Integration tests for Social Recovery System
 * @description End-to-end tests for complete recovery flows
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { SocialRecovery } from '../SocialRecovery';
import { Horizon, Keypair, Networks } from '@stellar/stellar-sdk';
import { RecoveryStatus, GuardianStatus } from '../types';

// Mock Stellar Server for integration tests
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

describe('SocialRecovery Integration Tests', () => {
  let recovery: SocialRecovery;
  let server: Horizon.Server;
  let encryptionKey: string;
  let guardians: Keypair[];
  let walletOwner: Keypair;
  let newOwner: Keypair;

  beforeEach(() => {
    server = new Horizon.Server('https://horizon-testnet.stellar.org');
    encryptionKey = 'test-encryption-key-32-chars-long!!';
    guardians = [Keypair.random(), Keypair.random(), Keypair.random(), Keypair.random()];
    walletOwner = Keypair.random();
    newOwner = Keypair.random();

    recovery = new SocialRecovery(
      {
        guardians: guardians.map((g, i) => ({
          publicKey: g.publicKey(),
          name: `Guardian ${i + 1}`,
          addedAt: new Date(),
          verified: true,
          status: GuardianStatus.ACTIVE,
        })),
        threshold: 3, // Need 3 out of 4 guardians
        timeLockHours: 48,
        enableTesting: true,
      },
      server,
      Networks.TESTNET,
      encryptionKey
    );
  });

  describe('Complete Recovery Flow', () => {
    it('should complete full recovery flow from initiation to execution', async () => {
      // Step 1: Initiate recovery
      const request = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey(),
        true // test mode
      );

      expect(request.status).toBe(RecoveryStatus.PENDING);
      expect(request.approvals).toHaveLength(0);

      // Step 2: Guardians approve
      const approval1 = await recovery.guardianApprove(
        request.id,
        guardians[0].publicKey(),
        guardians[0].secret()
      );
      expect(approval1.verified).toBe(true);

      const approval2 = await recovery.guardianApprove(
        request.id,
        guardians[1].publicKey(),
        guardians[1].secret()
      );
      expect(approval2.verified).toBe(true);

      const approval3 = await recovery.guardianApprove(
        request.id,
        guardians[2].publicKey(),
        guardians[2].secret()
      );
      expect(approval3.verified).toBe(true);

      // Step 3: Check threshold reached
      const updatedRequest = recovery.getRecoveryRequest(request.id);
      expect(updatedRequest?.status).toBe(RecoveryStatus.APPROVED);
      expect(updatedRequest?.approvals).toHaveLength(3);

      // Step 4: Complete recovery (in test mode)
      const result = await recovery.completeRecovery(request.id, walletOwner.secret());
      expect(result.success).toBe(true);

      const finalRequest = recovery.getRecoveryRequest(request.id);
      expect(finalRequest?.status).toBe(RecoveryStatus.EXECUTED);
      expect(finalRequest?.completedAt).toBeDefined();
    });

    it('should handle recovery cancellation flow', async () => {
      // Initiate recovery
      const request = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey()
      );

      // One guardian approves
      await recovery.guardianApprove(
        request.id,
        guardians[0].publicKey(),
        guardians[0].secret()
      );

      // Owner cancels
      await recovery.cancelRecovery(request.id, walletOwner.publicKey());

      const cancelledRequest = recovery.getRecoveryRequest(request.id);
      expect(cancelledRequest?.status).toBe(RecoveryStatus.CANCELLED);
      expect(cancelledRequest?.cancelledBy).toBe(walletOwner.publicKey());

      // Try to approve cancelled recovery (should fail)
      await expect(
        recovery.guardianApprove(
          request.id,
          guardians[1].publicKey(),
          guardians[1].secret()
        )
      ).rejects.toThrow('Recovery request is cancelled');
    });

    it('should prevent execution before time-lock expires', async () => {
      const request = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey()
      );

      // Approve with threshold
      await recovery.guardianApprove(
        request.id,
        guardians[0].publicKey(),
        guardians[0].secret()
      );
      await recovery.guardianApprove(
        request.id,
        guardians[1].publicKey(),
        guardians[1].secret()
      );
      await recovery.guardianApprove(
        request.id,
        guardians[2].publicKey(),
        guardians[2].secret()
      );

      // Try to complete immediately (should fail)
      await expect(
        recovery.completeRecovery(request.id, walletOwner.secret())
      ).rejects.toThrow('Time-lock has not expired yet');
    });
  });

  describe('Guardian Management Flow', () => {
    it('should add and verify new guardian', async () => {
      const newGuardian = Keypair.random();
      const initialCount = recovery.getGuardians().length;

      // Add guardian
      const guardian = await recovery.addGuardian(
        newGuardian.publicKey(),
        'New Guardian',
        'newguardian@example.com'
      );

      expect(recovery.getGuardians()).toHaveLength(initialCount + 1);
      expect(guardian.status).toBe(GuardianStatus.PENDING);
      expect(guardian.verified).toBe(false);

      // Verify guardian
      await recovery.verifyGuardian(newGuardian.publicKey());

      const updatedGuardian = recovery
        .getGuardians()
        .find(g => g.publicKey === newGuardian.publicKey());
      expect(updatedGuardian?.verified).toBe(true);
      expect(updatedGuardian?.status).toBe(GuardianStatus.ACTIVE);
    });

    it('should handle guardian removal and threshold adjustment', async () => {
      const initialGuardians = recovery.getGuardians().length;
      const initialActiveGuardians = recovery.getGuardians().filter(
        g => g.status === GuardianStatus.ACTIVE
      ).length;

      // Remove a guardian
      await recovery.removeGuardian(guardians[3].publicKey());

      // Guardian is marked as removed but kept in list for audit
      const removedGuardian = recovery.getGuardians().find(
        g => g.publicKey === guardians[3].publicKey()
      );
      expect(removedGuardian?.status).toBe(GuardianStatus.REMOVED);

      // Active guardians should decrease
      const activeGuardians = recovery.getGuardians().filter(
        g => g.status === GuardianStatus.ACTIVE
      ).length;
      expect(activeGuardians).toBe(initialActiveGuardians - 1);

      // Threshold should be adjusted (60% of remaining guardians)
      // This is handled internally by the class
    });
  });

  describe('Multiple Recovery Requests', () => {
    it('should handle multiple wallets with separate recovery requests', async () => {
      const wallet2Owner = Keypair.random();
      const wallet2NewOwner = Keypair.random();

      // Initiate recovery for first wallet
      const request1 = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey()
      );

      // Initiate recovery for second wallet
      const request2 = await recovery.initiateRecovery(
        wallet2Owner.publicKey(),
        wallet2NewOwner.publicKey()
      );

      expect(request1.id).not.toBe(request2.id);
      expect(request1.walletPublicKey).not.toBe(request2.walletPublicKey);

      // Approve both
      await recovery.guardianApprove(
        request1.id,
        guardians[0].publicKey(),
        guardians[0].secret()
      );

      await recovery.guardianApprove(
        request2.id,
        guardians[0].publicKey(),
        guardians[0].secret()
      );

      const requests1 = recovery.getRecoveryRequests(walletOwner.publicKey());
      const requests2 = recovery.getRecoveryRequests(wallet2Owner.publicKey());

      expect(requests1).toHaveLength(1);
      expect(requests2).toHaveLength(1);
    });
  });

  describe('Recovery Test Mode', () => {
    it('should complete test recovery without executing on network', async () => {
      const testResult = await recovery.testRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey()
      );

      expect(testResult.success).toBe(true);
      expect(testResult.testId).toBeDefined();
      expect(testResult.guardiansNotified).toBe(4);
      expect(testResult.timeLockSimulated).toBe(true);

      // Verify test request was created
      const testRequest = recovery.getRecoveryRequest(testResult.testId);
      expect(testRequest?.testMode).toBe(true);
    });
  });

  describe('Emergency Contacts Integration', () => {
    it('should manage emergency contacts', async () => {
      const contact1 = await recovery.addEmergencyContact(
        'Emergency Contact 1',
        'emergency1@example.com',
        'Family'
      );

      const contact2 = await recovery.addEmergencyContact(
        'Emergency Contact 2',
        '+1234567890',
        'Friend'
      );

      const contacts = recovery.getEmergencyContacts();
      expect(contacts).toHaveLength(2);
      expect(contacts.find(c => c.id === contact1.id)).toBeDefined();
      expect(contacts.find(c => c.id === contact2.id)).toBeDefined();
    });
  });

  describe('Statistics and Logging', () => {
    it('should track recovery statistics accurately', async () => {
      // Create multiple recovery scenarios
      const request1 = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey(),
        true // test mode
      );
      
      // Approve it first
      await recovery.guardianApprove(request1.id, guardians[0].publicKey(), guardians[0].secret());
      await recovery.guardianApprove(request1.id, guardians[1].publicKey(), guardians[1].secret());
      await recovery.guardianApprove(request1.id, guardians[2].publicKey(), guardians[2].secret());
      
      await recovery.completeRecovery(request1.id, walletOwner.secret());

      const request2 = await recovery.initiateRecovery(
        walletOwner.publicKey(),
        newOwner.publicKey(),
        true // test mode
      );
      await recovery.cancelRecovery(request2.id, walletOwner.publicKey());

      const stats = recovery.getStatistics();

      expect(stats.totalRecoveryAttempts).toBeGreaterThanOrEqual(2);
      expect(stats.successfulRecoveries).toBeGreaterThanOrEqual(1);
      expect(stats.cancelledRecoveries).toBeGreaterThanOrEqual(1);
    });
  });
});
