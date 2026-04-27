export type LimitType = 'Daily' | 'Weekly' | 'Monthly' | 'PerTransaction' | 'PerHour' | 'Custom';
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Restricted';

export interface SecurityLimit {
  id: number;
  owner: string;
  limitType: LimitType;
  asset: string;
  maxAmount: number;
  timeWindow: number;
  currentUsage: number;
  lastReset: number;
  isActive: boolean;
  createdAt: number;
}

export interface RiskProfile {
  owner: string;
  riskLevel: RiskLevel;
  maxDailyVolume: number;
  maxSingleTransaction: number;
  allowedAssets: string[];
  blacklistedAssets: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TransactionRecord {
  id: number;
  owner: string;
  asset: string;
  amount: number;
  timestamp: number;
  transactionHash: string;
}

interface StoredState {
  nextLimitId: number;
  nextRecordId: number;
  limits: SecurityLimit[];
  riskProfiles: Record<string, RiskProfile>;
  records: TransactionRecord[];
}

export interface TransactionAllowCheck {
  allowed: boolean;
  reason: string;
}

export interface CreateLimitInput {
  owner: string;
  limitType: LimitType;
  asset: string;
  maxAmount: number;
  customWindowSeconds?: number;
}

export interface SetRiskProfileInput {
  owner: string;
  riskLevel: RiskLevel;
  maxDailyVolume: number;
  maxSingleTransaction: number;
  allowedAssets: string[];
  blacklistedAssets: string[];
}

const DEFAULT_STORAGE_KEY = 'galaxy_security_limits_state';

export class SecurityLimitsClient {
  private readonly storageKey: string;

  constructor(storageKey: string = DEFAULT_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  async createSecurityLimit(input: CreateLimitInput): Promise<SecurityLimit> {
    this.validateCreateInput(input);

    const now = this.now();
    const state = this.read();
    const timeWindow = this.resolveTimeWindow(input.limitType, input.customWindowSeconds);

    const limit: SecurityLimit = {
      id: state.nextLimitId,
      owner: input.owner.trim(),
      limitType: input.limitType,
      asset: input.asset.trim().toUpperCase(),
      maxAmount: input.maxAmount,
      timeWindow,
      currentUsage: 0,
      lastReset: now,
      isActive: true,
      createdAt: now,
    };

    state.nextLimitId += 1;
    state.limits.push(limit);
    this.write(state);

    return limit;
  }

  async listSecurityLimits(owner: string): Promise<SecurityLimit[]> {
    const state = this.read();
    const now = this.now();

    const ownerLimits = state.limits
      .filter((limit) => limit.owner === owner.trim())
      .map((limit) => this.withUsage(limit, state.records, now));

    state.limits = state.limits.map((limit) =>
      limit.owner === owner.trim() ? this.withUsage(limit, state.records, now) : limit
    );
    this.write(state);

    return ownerLimits;
  }

  async setRiskProfile(input: SetRiskProfileInput): Promise<RiskProfile> {
    if (!input.owner.trim()) {
      throw new Error('owner is required');
    }

    const now = this.now();
    const state = this.read();
    const existing = state.riskProfiles[input.owner.trim()];

    const profile: RiskProfile = {
      owner: input.owner.trim(),
      riskLevel: input.riskLevel,
      maxDailyVolume: Math.max(0, input.maxDailyVolume),
      maxSingleTransaction: Math.max(0, input.maxSingleTransaction),
      allowedAssets: input.allowedAssets.map((asset) => asset.toUpperCase()).filter(Boolean),
      blacklistedAssets: input.blacklistedAssets.map((asset) => asset.toUpperCase()).filter(Boolean),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    state.riskProfiles[profile.owner] = profile;
    this.write(state);
    return profile;
  }

  async getRiskProfile(owner: string): Promise<RiskProfile | null> {
    const profile = this.read().riskProfiles[owner.trim()];
    return profile ?? null;
  }

  async checkTransactionAllowed(owner: string, asset: string, amount: number): Promise<TransactionAllowCheck> {
    if (!owner.trim()) {
      throw new Error('owner is required');
    }
    if (!asset.trim()) {
      throw new Error('asset is required');
    }
    if (!(amount > 0)) {
      throw new Error('amount must be a positive number');
    }

    const normalizedOwner = owner.trim();
    const normalizedAsset = asset.trim().toUpperCase();
    const now = this.now();
    const state = this.read();

    const profile = state.riskProfiles[normalizedOwner];
    if (profile) {
      if (profile.blacklistedAssets.includes(normalizedAsset)) {
        return { allowed: false, reason: `${normalizedAsset} is blacklisted for this owner.` };
      }
      if (profile.allowedAssets.length > 0 && !profile.allowedAssets.includes(normalizedAsset)) {
        return { allowed: false, reason: `${normalizedAsset} is not in the allowed asset list.` };
      }
      if (profile.maxSingleTransaction > 0 && amount > profile.maxSingleTransaction) {
        return { allowed: false, reason: `Amount exceeds max single transaction limit (${profile.maxSingleTransaction}).` };
      }

      if (profile.maxDailyVolume > 0) {
        const dayAgo = now - 86400;
        const usedDaily = state.records
          .filter((record) => record.owner === normalizedOwner && record.timestamp >= dayAgo)
          .reduce((sum, record) => sum + record.amount, 0);
        if (usedDaily + amount > profile.maxDailyVolume) {
          return { allowed: false, reason: `Amount exceeds max daily volume (${profile.maxDailyVolume}).` };
        }
      }
    }

    const relevantLimits = state.limits.filter(
      (limit) => limit.owner === normalizedOwner && limit.asset === normalizedAsset && limit.isActive
    );

    for (const limit of relevantLimits) {
      const usageLimit = this.withUsage(limit, state.records, now);
      const nextUsage = usageLimit.currentUsage + amount;
      if (nextUsage > usageLimit.maxAmount) {
        return {
          allowed: false,
          reason: `Amount exceeds ${usageLimit.limitType} limit (${usageLimit.maxAmount}).`,
        };
      }
    }

    return { allowed: true, reason: 'Allowed by current risk profile and limits.' };
  }

  async recordTransaction(
    owner: string,
    asset: string,
    amount: number,
    transactionHash?: string
  ): Promise<TransactionRecord> {
    const check = await this.checkTransactionAllowed(owner, asset, amount);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    const normalizedOwner = owner.trim();
    const normalizedAsset = asset.trim().toUpperCase();

    const state = this.read();
    const record: TransactionRecord = {
      id: state.nextRecordId,
      owner: normalizedOwner,
      asset: normalizedAsset,
      amount,
      timestamp: this.now(),
      transactionHash: transactionHash ?? this.fakeHash(state.nextRecordId),
    };

    state.nextRecordId += 1;
    state.records.push(record);
    state.limits = state.limits.map((limit) =>
      limit.owner === normalizedOwner && limit.asset === normalizedAsset
        ? this.withUsage(limit, state.records, this.now())
        : limit
    );
    this.write(state);

    return record;
  }

  async getTransactionRecords(owner?: string): Promise<TransactionRecord[]> {
    const normalizedOwner = owner?.trim();
    const records = this.read().records
      .filter((record) => (normalizedOwner ? record.owner === normalizedOwner : true))
      .sort((a, b) => b.timestamp - a.timestamp);

    return records;
  }

  async clearAll(): Promise<void> {
    localStorage.removeItem(this.storageKey);
  }

  private validateCreateInput(input: CreateLimitInput): void {
    if (!input.owner.trim()) {
      throw new Error('owner is required');
    }
    if (!input.asset.trim()) {
      throw new Error('asset is required');
    }
    if (!(input.maxAmount > 0)) {
      throw new Error('maxAmount must be a positive number');
    }
    if (input.limitType === 'Custom' && !(input.customWindowSeconds && input.customWindowSeconds > 0)) {
      throw new Error('customWindowSeconds is required for Custom limit type');
    }
  }

  private resolveTimeWindow(limitType: LimitType, customWindowSeconds?: number): number {
    switch (limitType) {
      case 'Daily':
        return 86400;
      case 'Weekly':
        return 604800;
      case 'Monthly':
        return 2592000;
      case 'PerHour':
        return 3600;
      case 'PerTransaction':
        return 1;
      case 'Custom':
        return Math.max(1, customWindowSeconds ?? 1);
      default:
        return 86400;
    }
  }

  private withUsage(limit: SecurityLimit, records: TransactionRecord[], now: number): SecurityLimit {
    const windowStart = now - Math.max(1, limit.timeWindow);
    const usage = records
      .filter((record) =>
        record.owner === limit.owner &&
        record.asset === limit.asset &&
        record.timestamp >= windowStart
      )
      .reduce((sum, record) => sum + record.amount, 0);

    return {
      ...limit,
      currentUsage: usage,
      lastReset: windowStart,
    };
  }

  private fakeHash(id: number): string {
    return `mock-tx-${String(id).padStart(8, '0')}`;
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  private read(): StoredState {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return this.defaultState();
      }
      const parsed = JSON.parse(raw) as StoredState;
      return {
        nextLimitId: parsed.nextLimitId ?? 1,
        nextRecordId: parsed.nextRecordId ?? 1,
        limits: parsed.limits ?? [],
        riskProfiles: parsed.riskProfiles ?? {},
        records: parsed.records ?? [],
      };
    } catch {
      return this.defaultState();
    }
  }

  private write(state: StoredState): void {
    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  private defaultState(): StoredState {
    return {
      nextLimitId: 1,
      nextRecordId: 1,
      limits: [],
      riskProfiles: {},
      records: [],
    };
  }
}
