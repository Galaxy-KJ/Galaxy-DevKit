import { SupabaseClient } from '@supabase/supabase-js';
import {
  IKYCProvider,
  KYCStatus,
  KYCStatusLookupError,
  KYCStatusPersistError,
  KYCStatusRecord,
} from '../../types/kyc-types';
import { getSupabaseClient } from '../../utils/supabase';
import { createKYCProvider } from './providers';

export { KYCStatusLookupError, KYCStatusPersistError };

const TABLE = 'kyc_status';

interface KYCStatusRow {
  id: string;
  user_id: string;
  provider: string;
  status: KYCStatus;
  risk_score: number;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

function toRecord(row: KYCStatusRow): KYCStatusRecord {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    status: row.status,
    riskScore: row.risk_score,
    lastVerifiedAt: row.last_verified_at ? new Date(row.last_verified_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface KYCServiceDeps {
  provider?: IKYCProvider;
  client?: SupabaseClient;
}

export class KYCService {
  private providerInstance?: IKYCProvider;
  private clientInstance?: SupabaseClient;

  constructor(deps: KYCServiceDeps = {}) {
    this.providerInstance = deps.provider;
    this.clientInstance = deps.client;
  }

  private get provider(): IKYCProvider {
    this.providerInstance ??= createKYCProvider();
    return this.providerInstance;
  }

  private get client(): SupabaseClient {
    this.clientInstance ??= getSupabaseClient();
    return this.clientInstance;
  }

  async getStatus(userId: string): Promise<KYCStatusRecord | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new KYCStatusLookupError(
        `Failed to read KYC status: ${error.message ?? 'unknown error'}`,
        error
      );
    }
    return data ? toRecord(data as KYCStatusRow) : null;
  }

  async verifyUser(
    userId: string,
    documentData: unknown
  ): Promise<KYCStatusRecord> {
    // A sanctions flag is sticky: re-verification must not clear it.
    const existing = await this.getStatus(userId);
    if (existing?.status === 'flagged') {
      return existing;
    }

    const result = await this.provider.verifyIdentity(userId, documentData);
    return this.persist(userId, {
      provider: result.provider,
      status: result.status,
      risk_score: result.riskScore,
      last_verified_at: result.verifiedAt.toISOString(),
    });
  }

  async checkSanctions(
    userId: string,
    walletAddress?: string
  ): Promise<{ sanctioned: boolean; record: KYCStatusRecord | null }> {
    const sanctioned = await this.provider.checkSanctions(userId, walletAddress);
    if (!sanctioned) {
      return { sanctioned: false, record: await this.getStatus(userId) };
    }

    const record = await this.persist(userId, {
      provider: this.provider.name,
      status: 'flagged',
    });
    return { sanctioned: true, record };
  }

  private async persist(
    userId: string,
    fields: Partial<Omit<KYCStatusRow, 'id' | 'user_id'>>
  ): Promise<KYCStatusRecord> {
    const { data, error } = await this.client
      .from(TABLE)
      .upsert(
        { user_id: userId, ...fields, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error || !data) {
      throw new KYCStatusPersistError(
        `Failed to persist KYC status: ${error?.message ?? 'no row returned'}`,
        error
      );
    }
    return toRecord(data as KYCStatusRow);
  }
}

export const kycService = new KYCService();
