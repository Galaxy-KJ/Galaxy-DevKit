/**
 * @fileoverview Tests for SponsoredReservesManager
 * @description Unit tests for the sponsored reserves manager class
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { SponsoredReservesManager } from '../services/sponsored-reserves-manager.js';
import { SponsorshipConfig, RevokeSponsorshipTarget } from '../types/sponsored-reserves-types.js';

// Mock Stellar SDK
const mockServer = {
  loadAccount: jest.fn(),
  submitTransaction: jest.fn(),
  feeStats: jest.fn(),
  accounts: jest.fn(),
  claimableBalances: jest.fn(),
  offers: jest.fn(),
};
const mockRpcServer = { getLedgerEntries: jest.fn() };
const mockLedgerEntry = {
  ext: () => ({
    switch: () => ({ name: 'ledgerEntryExtensionV1' }),
    v1: () => ({
      sponsoringId: () => ({ ed25519: () => new Uint8Array(32) }),
    }),
  }),
  data: () => ({ data: () => ({ dataName: () => 'profile' }) }),
};

jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: {
    fromSecret: jest.fn(secret => ({
      publicKey: jest.fn(() =>
        secret.startsWith('SSPONSOR')
          ? 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
          : 'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      ),
      secret: jest.fn(() => secret),
    })),
    fromPublicKey: jest.fn(key => ({
      publicKey: jest.fn(() => key),
      xdrAccountId: jest.fn(() => ({ accountId: key })),
    })),
  },
  StrKey: {
    isValidEd25519PublicKey: jest.fn(key => key.startsWith('G') && key.length > 40),
    isValidEd25519SecretSeed: jest.fn(key => key.startsWith('S') && key.length > 40),
    isValidPreAuthTx: jest.fn(() => true),
    isValidSha256Hash: jest.fn(() => true),
    encodeEd25519PublicKey: jest.fn(() => 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
  },
  Asset: Object.assign(
    jest.fn((code, issuer) => ({ code, issuer, type: 'credit_alphanum4' })),
    { native: jest.fn(() => ({ code: 'XLM', type: 'native' })) }
  ),
  Operation: {
    beginSponsoringFutureReserves: jest.fn(opts => ({
      type: 'beginSponsoringFutureReserves',
      ...opts,
    })),
    endSponsoringFutureReserves: jest.fn(opts => ({
      type: 'endSponsoringFutureReserves',
      ...opts,
    })),
    revokeAccountSponsorship: jest.fn(opts => ({
      type: 'revokeAccountSponsorship',
      ...opts,
    })),
    revokeTrustlineSponsorship: jest.fn(opts => ({
      type: 'revokeTrustlineSponsorship',
      ...opts,
    })),
    revokeOfferSponsorship: jest.fn(opts => ({
      type: 'revokeOfferSponsorship',
      ...opts,
    })),
    revokeDataSponsorship: jest.fn(opts => ({
      type: 'revokeDataSponsorship',
      ...opts,
    })),
    revokeClaimableBalanceSponsorship: jest.fn(opts => ({
      type: 'revokeClaimableBalanceSponsorship',
      ...opts,
    })),
    revokeSignerSponsorship: jest.fn(opts => ({
      type: 'revokeSignerSponsorship',
      ...opts,
    })),
  },
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    addMemo: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn(() => ({
      sign: jest.fn(),
      toXDR: jest.fn(() => 'mock_xdr'),
      fee: 300,
    })),
    fromXDR: jest.fn(() => ({
      sign: jest.fn(),
      fee: 300,
    })),
  })),
  Horizon: { Server: jest.fn(() => mockServer) },
  rpc: { Server: jest.fn(() => mockRpcServer) },
  xdr: {
    LedgerKey: { data: jest.fn(key => key) },
    LedgerKeyData: jest.fn(options => options),
    LedgerEntry: { fromXDR: jest.fn(() => mockLedgerEntry) },
  },
  BASE_FEE: '100',
  Claimant: {
    predicateUnconditional: jest.fn(() => ({ type: 'unconditional' })),
    predicateAnd: jest.fn((a, b) => ({ type: 'and', predicates: [a, b] })),
    predicateOr: jest.fn((a, b) => ({ type: 'or', predicates: [a, b] })),
    predicateNot: jest.fn(p => ({ type: 'not', predicate: p })),
    predicateBeforeAbsoluteTime: jest.fn(t => ({ type: 'beforeAbsoluteTime', time: t })),
    predicateBeforeRelativeTime: jest.fn(t => ({ type: 'beforeRelativeTime', time: t })),
  },
}));

describe('SponsoredReservesManager', () => {
  const mockNetworkConfig = {
    network: 'testnet' as const,
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  };

  let manager: SponsoredReservesManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new SponsoredReservesManager(mockNetworkConfig);
    mockRpcServer.getLedgerEntries.mockResolvedValue({ entries: [] });

    mockServer.feeStats.mockResolvedValue({
      max_fee: { mode: '100' },
    });
  });

  describe('Constructor & Initialization', () => {
    it('should initialize with correct network configuration', () => {
      const config = manager.getNetworkConfig();
      expect(config).toEqual(mockNetworkConfig);
    });

    it('should initialize Horizon server with correct URL', () => {
      const { Horizon } = require('@stellar/stellar-sdk');
      expect(Horizon.Server).toHaveBeenCalledWith(mockNetworkConfig.horizonUrl);
    });
  });

  describe('beginSponsoringFutureReserves', () => {
    it('should create begin sponsoring operation for valid public key', () => {
      const sponsoredKey = 'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      manager.beginSponsoringFutureReserves(sponsoredKey);

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.beginSponsoringFutureReserves).toHaveBeenCalledWith({
        sponsoredId: sponsoredKey,
      });
    });

    it('should throw error for invalid public key', () => {
      expect(() => {
        manager.beginSponsoringFutureReserves('INVALID');
      }).toThrow('Invalid sponsored public key');
    });
  });

  describe('endSponsoringFutureReserves', () => {
    it('should create end sponsoring operation with sponsored as source', () => {
      const sponsoredKey = 'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      manager.endSponsoringFutureReserves(sponsoredKey);

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.endSponsoringFutureReserves).toHaveBeenCalledWith({
        source: sponsoredKey,
      });
    });

    it('should throw error for invalid public key', () => {
      expect(() => {
        manager.endSponsoringFutureReserves('INVALID');
      }).toThrow('Invalid sponsored public key');
    });
  });

  describe('revokeSponsorship', () => {
    it('should create account revocation operation', () => {
      const target: RevokeSponsorshipTarget = {
        entryType: 'account',
        accountPublicKey: 'GACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      manager.revokeSponsorship(target);

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.revokeAccountSponsorship).toHaveBeenCalledWith({
        account: target.accountPublicKey,
      });
    });

    it('should create trustline revocation operation', () => {
      const target: RevokeSponsorshipTarget = {
        entryType: 'trustline',
        accountPublicKey: 'GACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        asset: { code: 'USDC', issuer: 'GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' },
      };

      manager.revokeSponsorship(target);

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.revokeTrustlineSponsorship).toHaveBeenCalled();
    });

    it('should create offer revocation operation', () => {
      const target: RevokeSponsorshipTarget = {
        entryType: 'offer',
        accountPublicKey: 'GACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        offerId: '12345',
      };

      manager.revokeSponsorship(target);

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.revokeOfferSponsorship).toHaveBeenCalledWith({
        seller: target.accountPublicKey,
        offerId: target.offerId,
      });
    });

    it('should create data revocation operation', () => {
      const target: RevokeSponsorshipTarget = {
        entryType: 'data',
        accountPublicKey: 'GACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        dataName: 'my_data',
      };

      manager.revokeSponsorship(target);

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.revokeDataSponsorship).toHaveBeenCalledWith({
        account: target.accountPublicKey,
        name: target.dataName,
      });
    });

    it('should create claimable balance revocation operation', () => {
      const target: RevokeSponsorshipTarget = {
        entryType: 'claimable_balance',
        balanceId: '00000000abc123',
      };

      manager.revokeSponsorship(target);

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.revokeClaimableBalanceSponsorship).toHaveBeenCalledWith({
        balanceId: target.balanceId,
      });
    });

    it('should create signer revocation operation', () => {
      const target: RevokeSponsorshipTarget = {
        entryType: 'signer',
        accountPublicKey: 'GACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        signerKey: 'GSIGNERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      manager.revokeSponsorship(target);

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.revokeSignerSponsorship).toHaveBeenCalled();
    });

    it('should throw error for missing account in account revocation', () => {
      const target: RevokeSponsorshipTarget = {
        entryType: 'account',
      };

      expect(() => {
        manager.revokeSponsorship(target);
      }).toThrow('Account public key required for account revocation');
    });
  });

  describe('calculateSponsorshipCost', () => {
    it('should calculate cost for account sponsorship', () => {
      const config: SponsorshipConfig = {
        sponsorPublicKey: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        sponsoredPublicKey: 'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        entryType: 'account',
      };

      const cost = manager.calculateSponsorshipCost(config);

      expect(cost.totalCost).toBe('1.0000000'); // Account = 2 base reserves
      expect(cost.baseReserve).toBe('0.5');
      expect(cost.entryCount).toBe(1);
    });

    it('should calculate cost for trustline sponsorship', () => {
      const config: SponsorshipConfig = {
        sponsorPublicKey: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        sponsoredPublicKey: 'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        entryType: 'trustline',
      };

      const cost = manager.calculateSponsorshipCost(config);

      expect(cost.totalCost).toBe('0.5000000'); // Trustline = 1 base reserve
    });

    it('should calculate cost for data entry sponsorship', () => {
      const config: SponsorshipConfig = {
        sponsorPublicKey: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        sponsoredPublicKey: 'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        entryType: 'data',
      };

      const cost = manager.calculateSponsorshipCost(config);

      expect(cost.totalCost).toBe('0.5000000');
    });
  });

  describe('calculateMultipleSponsorshipCost', () => {
    it('should calculate cost for multiple entries', () => {
      const entryTypes = [
        { type: 'account', count: 1 },
        { type: 'trustline', count: 3 },
        { type: 'data', count: 2 },
      ];

      const cost = manager.calculateMultipleSponsorshipCost(entryTypes);

      // Account: 1.0 + Trustlines: 1.5 + Data: 1.0 = 3.5
      expect(cost.totalCost).toBe('3.5000000');
      expect(cost.breakdown.length).toBe(3);
    });
  });

  describe('checkSponsorshipEligibility', () => {
    it('should return eligible for sufficient balance', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          { asset_type: 'native', balance: '100.0000000' },
        ],
      });

      const config: SponsorshipConfig = {
        sponsorPublicKey: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        sponsoredPublicKey: 'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        entryType: 'trustline',
      };

      const eligibility = await manager.checkSponsorshipEligibility(
        'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        config
      );

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.currentBalance).toBe('100.0000000');
    });

    it('should return not eligible for insufficient balance', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          { asset_type: 'native', balance: '0.5000000' },
        ],
      });

      const config: SponsorshipConfig = {
        sponsorPublicKey: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        sponsoredPublicKey: 'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        entryType: 'account',
      };

      const eligibility = await manager.checkSponsorshipEligibility(
        'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        config
      );

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.shortfall).toBeDefined();
    });

    it('should handle account not found', async () => {
      mockServer.loadAccount.mockRejectedValue(new Error('404 Not Found'));

      const config: SponsorshipConfig = {
        sponsorPublicKey: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        sponsoredPublicKey: 'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        entryType: 'trustline',
      };

      const eligibility = await manager.checkSponsorshipEligibility(
        'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        config
      );

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toContain('not found');
    });
  });

  describe('getSponsoredEntries', () => {
    it('should return sponsored entries for account', async () => {
      mockServer.loadAccount.mockResolvedValue({
        sponsor: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        balances: [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: 'GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            balance: '100.0000000',
            sponsor: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          },
        ],
        signers: [],
        data_attr: {},
      });

      const entries = await manager.getSponsoredEntries(
        'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      );

      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].sponsor).toBe('GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    });

    it('should return empty array for unfunded account', async () => {
      mockServer.loadAccount.mockRejectedValue(new Error('404 Not Found'));

      const entries = await manager.getSponsoredEntries(
        'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      );

      expect(entries).toEqual([]);
    });

    it('should filter by entry type', async () => {
      mockServer.loadAccount.mockResolvedValue({
        sponsor: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        balances: [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: 'GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            balance: '100.0000000',
            sponsor: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          },
        ],
        signers: [],
        data_attr: {},
      });

      const entries = await manager.getSponsoredEntries(
        'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        { entryType: 'trustline' }
      );

      expect(entries.every(e => e.entryType === 'trustline')).toBe(true);
    });

    it('should resolve data-entry sponsorship through RPC ledger entries', async () => {
      mockServer.loadAccount.mockResolvedValue({
        sponsor: undefined,
        balances: [],
        signers: [],
        data_attr: { profile: 'encoded-value' },
      });
      mockRpcServer.getLedgerEntries.mockResolvedValue({ entries: [{ xdr: 'mock-xdr' }] });

      const entries = await manager.getSponsoredEntries(
        'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        { entryType: 'data' }
      );

      expect(entries).toEqual([expect.objectContaining({
        entryType: 'data',
        sponsor: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        entryId: 'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX:profile',
      })]);
      expect(mockRpcServer.getLedgerEntries).toHaveBeenCalledTimes(1);
    });
  });

  describe('getEntriesSponsoredBy', () => {
    it('collects sponsored accounts from all Horizon pages and honors query options', async () => {
      const secondPage = {
        records: [{
          account_id: 'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          sponsor: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          balances: [],
          signers: [],
          data_attr: {},
        }],
      };
      const firstPage = {
        records: [{
          account_id: 'GSPONSORED2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          sponsor: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          balances: [],
          signers: [],
          data_attr: {},
        }],
        next: jest.fn().mockResolvedValue(secondPage),
      };
      const queryBuilder = {
        forSponsor: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue(firstPage),
      };
      mockServer.accounts.mockReturnValue(queryBuilder);

      const entries = await manager.getEntriesSponsoredBy(
        'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        {
          entryType: 'account',
          cursor: 'account:GSPONSORED2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          order: 'asc',
          limit: 1,
        }
      );

      expect(entries).toHaveLength(1);
      expect(entries[0].sponsoredAccount).toBe('GSPONSORED2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
      expect(firstPage.next).toHaveBeenCalledTimes(1);
      expect(queryBuilder.forSponsor).toHaveBeenCalledWith(
        'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      );
      expect(queryBuilder.call).toHaveBeenCalledTimes(1);
    });

    it('applies one cursor to combined account and claimable-balance results', async () => {
      const sponsoredAccount = 'GSPONSOREDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockServer.accounts.mockReturnValue({
        forSponsor: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue({
          records: [{
            account_id: sponsoredAccount,
            sponsor: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            balances: [],
            signers: [],
            data_attr: {},
          }],
        }),
      });
      mockServer.claimableBalances.mockReturnValue({
        sponsor: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue({
          records: [{ id: 'claimable-id', claimants: [], asset: 'native', amount: '1' }],
        }),
      });
      mockServer.offers.mockReturnValue({
        sponsor: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue({ records: [] }),
      });

      const entries = await manager.getEntriesSponsoredBy(
        'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        { cursor: `account:${sponsoredAccount}`, order: 'asc' }
      );

      expect(entries.map((entry) => entry.entryType)).toEqual(['claimable_balance']);
    });

    it('queries sponsored claimable balances and offers', async () => {
      const claimableBuilder = {
        sponsor: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue({
          records: [{
            id: 'claimable-id',
            claimants: [{ destination: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' }],
            asset: 'native',
            amount: '2.0000000',
          }],
        }),
      };
      const offersBuilder = {
        sponsor: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue({
          records: [{
            id: 7,
            seller: 'GOFFERSELLERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            selling: { asset_type: 'native' },
            buying: { asset_type: 'credit_alphanum4', asset_code: 'USD' },
            amount: '1.0000000',
            price: '1/2',
          }],
        }),
      };
      mockServer.claimableBalances.mockReturnValue(claimableBuilder);
      mockServer.offers.mockReturnValue(offersBuilder);
      const sponsor = 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

      const balances = await manager.getEntriesSponsoredBy(sponsor, {
        entryType: 'claimable_balance',
      });
      const offers = await manager.getEntriesSponsoredBy(sponsor, { entryType: 'offer' });

      expect(claimableBuilder.sponsor).toHaveBeenCalledWith(sponsor);
      expect(balances[0]).toEqual(expect.objectContaining({
        entryType: 'claimable_balance',
        entryId: 'claimable-id',
      }));
      expect(offersBuilder.sponsor).toHaveBeenCalledWith(sponsor);
      expect(offers[0]).toEqual(expect.objectContaining({ entryType: 'offer', entryId: '7' }));
    });
  });

  describe('switchNetwork', () => {
    it('should switch to mainnet configuration', () => {
      const mainnetConfig = {
        network: 'mainnet' as const,
        horizonUrl: 'https://horizon.stellar.org',
        passphrase: 'Public Global Stellar Network ; September 2015',
      };

      manager.switchNetwork(mainnetConfig);

      const currentConfig = manager.getNetworkConfig();
      expect(currentConfig.network).toBe('mainnet');
    });
  });

  describe('buildClaimPredicate', () => {
    it('should build unconditional predicate', () => {
      manager.buildClaimPredicate({ unconditional: true });

      const { Claimant } = require('@stellar/stellar-sdk');
      expect(Claimant.predicateUnconditional).toHaveBeenCalled();
    });

    it('should build beforeAbsoluteTime predicate', () => {
      manager.buildClaimPredicate({
        beforeAbsoluteTime: '1704067200'
      });

      const { Claimant } = require('@stellar/stellar-sdk');
      expect(Claimant.predicateBeforeAbsoluteTime).toHaveBeenCalledWith('1704067200');
    });

    it('should build AND predicate', () => {
      manager.buildClaimPredicate({
        and: [
          { unconditional: true },
          { beforeAbsoluteTime: '1704067200' },
        ],
      });

      const { Claimant } = require('@stellar/stellar-sdk');
      expect(Claimant.predicateAnd).toHaveBeenCalled();
    });

    it('should build OR predicate', () => {
      manager.buildClaimPredicate({
        or: [
          { unconditional: true },
          { beforeAbsoluteTime: '1704067200' },
        ],
      });

      const { Claimant } = require('@stellar/stellar-sdk');
      expect(Claimant.predicateOr).toHaveBeenCalled();
    });

    it('should build NOT predicate', () => {
      manager.buildClaimPredicate({
        not: { beforeAbsoluteTime: '1704067200' },
      });

      const { Claimant } = require('@stellar/stellar-sdk');
      expect(Claimant.predicateNot).toHaveBeenCalled();
    });
  });
});
