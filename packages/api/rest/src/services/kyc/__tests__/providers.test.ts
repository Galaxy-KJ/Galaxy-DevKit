import { createKYCProvider } from '../providers';
import { MockKYCProvider } from '../providers/mock-kyc-provider';

describe('createKYCProvider', () => {
  it('defaults to the mock provider outside production', () => {
    expect(createKYCProvider({})).toBeInstanceOf(MockKYCProvider);
  });

  it('reads KYC_PROVIDER case-insensitively', () => {
    expect(createKYCProvider({ KYC_PROVIDER: 'MOCK' })).toBeInstanceOf(
      MockKYCProvider
    );
  });

  it('throws on an unknown provider', () => {
    expect(() => createKYCProvider({ KYC_PROVIDER: 'nope' })).toThrow(
      /Unknown KYC_PROVIDER/
    );
  });

  it('refuses the mock provider in production by default', () => {
    expect(() => createKYCProvider({ NODE_ENV: 'production' })).toThrow(
      /cannot be used in production/
    );
  });

  it('refuses the explicit mock provider in production', () => {
    expect(() =>
      createKYCProvider({ NODE_ENV: 'production', KYC_PROVIDER: 'mock' })
    ).toThrow(/cannot be used in production/);
  });
});
