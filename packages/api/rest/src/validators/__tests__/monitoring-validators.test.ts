/**
 * @fileoverview Tests for monitoring-validators, focused on the SSRF-blocking
 *               custom rule on the webhook URL field.
 */

// The validator calls assertNotLiteralPrivateUrl synchronously.
// We test both the real behaviour (literal IPs) and bypass the DNS layer.
describe('webhookConfigSchema – SSRF URL validation', () => {
  // Re-import validators fresh for each env-var scenario by resetting the module
  // registry. This is needed because ALLOWED_WEBHOOK_SCHEMES is evaluated once
  // at module-load time.
  let validate: (url: string) => { error?: { message: string } };

  beforeEach(() => {
    jest.resetModules();
  });

  // Helper to lazily load the validator after env vars are set.
  async function loadSchema(): Promise<void> {
    const mod = await import('../monitoring-validators');
    validate = (url: string) => {
      // Build a minimal valid alert payload with just the channel config we need.
      return mod.createAlertSchema.validate(
        {
          name: 'Test Alert',
          protocol: 'blend',
          accountAddress: 'GABC' + 'A'.repeat(52),
          alertType: 'health_factor_below',
          threshold: 1.5,
          channel: 'webhook',
          channelConfig: { url, secret: 'sixteen-bytes-ok!' },
        },
        { abortEarly: true }
      );
    };
  }

  describe('in production (NODE_ENV=production)', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.MONITORING_WEBHOOK_ALLOW_PRIVATE;
      await loadSchema();
    });

    test.each([
      ['http://127.0.0.1/hook',                  'http scheme is blocked in production'],
      ['https://127.0.0.1/hook',                 'loopback v4'],
      ['https://169.254.169.254/latest/meta-data', 'metadata endpoint'],
      ['https://[::1]/hook',                     'loopback v6'],
      ['https://10.0.0.1/hook',                  'private 10/8'],
      ['https://192.168.1.100/hook',             'private 192.168/16'],
      ['https://172.16.0.1/hook',                'private 172.16/12'],
      ['https://[fc00::1]/hook',                 'ULA IPv6'],
    ])('rejects %s (%s)', (url) => {
      const { error } = validate(url);
      expect(error).toBeDefined();
    });

    it('accepts a public https URL', () => {
      const { error } = validate('https://hook.example.com/alerts');
      expect(error).toBeUndefined();
    });
  });

  describe('in development with MONITORING_WEBHOOK_ALLOW_PRIVATE=true', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'development';
      process.env.MONITORING_WEBHOOK_ALLOW_PRIVATE = 'true';
      await loadSchema();
    });

    afterEach(() => {
      delete process.env.MONITORING_WEBHOOK_ALLOW_PRIVATE;
    });

    it('allows a loopback URL for local development', () => {
      const { error } = validate('http://127.0.0.1/hook');
      expect(error).toBeUndefined();
    });

    it('allows a private-range URL for local development', () => {
      const { error } = validate('http://192.168.1.100/hook');
      expect(error).toBeUndefined();
    });
  });

  describe('in development without the bypass flag', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.MONITORING_WEBHOOK_ALLOW_PRIVATE;
      await loadSchema();
    });

    it('still rejects loopback URLs', () => {
      const { error } = validate('http://127.0.0.1/hook');
      expect(error).toBeDefined();
    });

    it('still rejects the metadata endpoint', () => {
      const { error } = validate('https://169.254.169.254/latest/meta-data');
      expect(error).toBeDefined();
    });
  });
});
