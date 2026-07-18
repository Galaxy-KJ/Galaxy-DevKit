import { IKYCProvider, KYCStatusRecord, KYCVerificationResult } from '../types/kyc-types';
import { MockKYCProvider } from './providers/mock-kyc-provider';

// Assume supabase client is available or injected
// import { supabase } from '../config/supabaseClient';

export class KYCService {
  private provider: IKYCProvider;

  constructor(provider?: IKYCProvider) {
    this.provider = provider || new MockKYCProvider();
  }

  async verifyUser(userId: string, documentData: any): Promise<KYCVerificationResult> {
    const result = await this.provider.verifyIdentity(userId, documentData);
    
    // In a real implementation, we would update the DB here
    /*
    await supabase.from('kyc_status').upsert({
      user_id: userId,
      provider: this.provider.name,
      status: result.status,
      risk_score: result.riskScore,
      last_verified_at: result.verifiedAt,
      updated_at: new Date()
    });
    */

    return result;
  }

  async checkSanctions(userId: string, walletAddress?: string): Promise<boolean> {
    const isSanctioned = await this.provider.checkSanctions(userId, walletAddress);
    if (isSanctioned) {
      // In a real implementation, update DB to flagged
    }
    return isSanctioned;
  }

  async getStatus(userId: string): Promise<KYCStatusRecord | null> {
    // In a real implementation, fetch from DB
    /*
    const { data } = await supabase
      .from('kyc_status')
      .select('*')
      .eq('user_id', userId)
      .single();
    return data;
    */
    
    // Mock return for now
    return {
      id: 'mock-id',
      userId,
      provider: this.provider.name,
      status: 'approved',
      riskScore: 10,
      lastVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

export const kycService = new KYCService();
