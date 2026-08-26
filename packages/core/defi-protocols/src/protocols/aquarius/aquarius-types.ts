import { Asset } from '../../types/defi-types.js';

export interface AquariusPool {
  pool_id: string;
  name: string;
  asset_a: Asset;
  asset_b: Asset;
  fee_tier: number;
}
