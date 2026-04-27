export type BlendAssetType = 'native' | 'credit_alphanum4' | 'credit_alphanum12';

export interface BlendAsset {
  code: string;
  type: BlendAssetType;
  issuer?: string;
}

export interface BlendPositionItem {
  amount: string;
  valueUSD?: string;
}

export interface BlendPositionResponse {
  address?: string;
  supplied?: BlendPositionItem[];
  borrowed?: BlendPositionItem[];
  collateralValue?: string;
  debtValue?: string;
  healthFactor?: string;
}

export interface BlendTransactionRequest {
  signerPublicKey: string;
  asset: BlendAsset;
  amount: string;
  jwt?: string;
}

export interface BlendTransactionResponse {
  hash?: string;
  status?: string;
  ledger?: number;
  xdr?: string;
  [key: string]: unknown;
}

export interface BlendClientOptions {
  baseUrl?: string;
  jwt?: string;
}

export class BlendClient {
  private readonly baseUrl: string;
  private jwt?: string;

  constructor(options: BlendClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? '/api/v1/defi';
    this.jwt = options.jwt;
  }

  setJwt(token: string | undefined): void {
    this.jwt = token;
  }

  async getPosition(publicKey: string): Promise<BlendPositionResponse> {
    if (!publicKey.trim()) {
      throw new Error('publicKey is required');
    }

    return this.request<BlendPositionResponse>(
      `${this.baseUrl}/blend/position/${encodeURIComponent(publicKey)}`,
      { method: 'GET' }
    );
  }

  async borrow(params: BlendTransactionRequest): Promise<BlendTransactionResponse> {
    return this.submitTx('borrow', params);
  }

  async repay(params: BlendTransactionRequest): Promise<BlendTransactionResponse> {
    return this.submitTx('repay', params);
  }

  private async submitTx(
    op: 'borrow' | 'repay',
    params: BlendTransactionRequest
  ): Promise<BlendTransactionResponse> {
    const { signerPublicKey, asset, amount } = params;
    if (!signerPublicKey.trim()) {
      throw new Error('signerPublicKey is required');
    }
    if (!amount.trim() || Number(amount) <= 0) {
      throw new Error('amount must be a positive number');
    }
    if (!asset?.code || !asset?.type) {
      throw new Error('asset is required');
    }

    const assetString = asset.type === 'native'
      ? 'XLM'
      : `${asset.code}:${asset.issuer ?? ''}`;

    return this.request<BlendTransactionResponse>(`${this.baseUrl}/blend/${op}`, {
      method: 'POST',
      body: JSON.stringify({
        signerPublicKey,
        amount,
        asset: assetString,
      }),
      headers: this.authHeaders(params.jwt),
    });
  }

  private authHeaders(overrideJwt?: string): Record<string, string> {
    const token = overrideJwt ?? this.jwt;
    if (!token?.trim()) {
      return {};
    }

    return {
      Authorization: `Bearer ${token}`,
    };
  }

  private async request<T>(
    url: string,
    init: RequestInit
  ): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const message = payload?.error?.message ?? payload?.message ?? `Request failed with status ${res.status}`;
      throw new Error(message);
    }

    return payload as T;
  }
}
