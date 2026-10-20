import { IKYCProvider } from '../../../types/kyc-types';
import { readKycConfig } from '../../../config/kyc-config';
import { MockKYCProvider } from './mock-kyc-provider';

const PROVIDERS: Record<string, () => IKYCProvider> = {
  mock: () => new MockKYCProvider(),
};

export function createKYCProvider(
  env: NodeJS.ProcessEnv = process.env
): IKYCProvider {
  const { provider, isProduction } = readKycConfig(env);

  const factory = Object.prototype.hasOwnProperty.call(PROVIDERS, provider)
    ? PROVIDERS[provider]
    : undefined;
  if (!factory) {
    throw new Error(`Unknown KYC_PROVIDER "${provider}"`);
  }

  if (isProduction && provider === 'mock') {
    throw new Error(
      'MockKYCProvider cannot be used in production. Set KYC_PROVIDER to a real provider'
    );
  }

  return factory();
}
