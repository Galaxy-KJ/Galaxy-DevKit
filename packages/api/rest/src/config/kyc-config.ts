/**
 * @fileoverview KYC provider configuration.
 * @description Resolves the provider name from the environment. The env is
 *              passed in so the lookup can be tested without touching
 *              process.env.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

export interface KycConfig {
  provider: string;
  isProduction: boolean;
}

export function readKycConfig(env: NodeJS.ProcessEnv = process.env): KycConfig {
  const raw = env.KYC_PROVIDER?.trim().toLowerCase();
  return {
    provider: raw && raw.length > 0 ? raw : 'mock',
    isProduction: env.NODE_ENV === 'production',
  };
}
