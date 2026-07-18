export type KYCStatus = 'pending' | 'approved' | 'rejected' | 'flagged' | 'unverified';

export interface KYCVerificationResult {
  status: KYCStatus;
  riskScore: number;
  provider: string;
  verifiedAt: Date;
  details?: Record<string, any>;
}

export interface IKYCProvider {
  name: string;
  verifyIdentity(userId: string, documentData: any): Promise<KYCVerificationResult>;
  checkSanctions(userId: string, walletAddress?: string): Promise<boolean>;
  getRiskScore(userId: string): Promise<number>;
}

export interface KYCStatusRecord {
  id: string;
  userId: string;
  provider: string;
  status: KYCStatus;
  riskScore: number;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
