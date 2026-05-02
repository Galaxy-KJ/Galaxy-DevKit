import { fundWithFriendbot, getXLMBalance } from '../testnet-helpers.js';

// Mock fetch
global.fetch = jest.fn();

// Mock server
jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn().mockResolvedValue({
          balances: [{ asset_type: 'native', balance: '100.0' }]
        })
      }))
    }
  };
});

describe('testnet-helpers unit tests', () => {
  it('should call friendbot with the correct URL', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    await fundWithFriendbot('GA...123');
    expect(global.fetch).toHaveBeenCalledWith('https://friendbot.stellar.org?addr=GA...123');
  });

  it('should get XLM balance correctly', async () => {
    const balance = await getXLMBalance('GA...123');
    expect(balance).toBe('100.0');
  });

  it('should throw error if friendbot fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 400, text: () => Promise.resolve('Error') });
    await expect(fundWithFriendbot('GA...123')).rejects.toThrow('Friendbot funding failed');
  });
});
