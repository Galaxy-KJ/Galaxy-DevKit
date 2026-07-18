import { IKYCProvider, KYCVerificationResult } from '../../../types/kyc-types';

export class MockKYCProvider implements IKYCProvider {
  name = 'MockKYCProvider';

  async verifyIdentity(userId: string, documentData: any): Promise<KYCVerificationResult> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock logic: reject if documentData is missing
    if (!documentData) {
      return {
        status: 'rejected',
        riskScore: 100,
        provider: this.name,
        verifiedAt: new Date(),
        details: { error: 'Missing document data' },
      };
    }

    return {
      status: 'approved',
      riskScore: 10,
      provider: this.name,
      verifiedAt: new Date(),
    };
  }

  async checkSanctions(userId: string, walletAddress?: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 300));
    // Mock logic: flagged if walletAddress starts with "0xBAD"
    if (walletAddress && walletAddress.startsWith('0xBAD')) {
      return true; // true means sanctioned
    }
    return false;
  }

  async getRiskScore(userId: string): Promise<number> {
    await new Promise(resolve => setTimeout(resolve, 200));
    return 10;
  }
}
