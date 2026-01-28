/**
 * Mock Ledger Transport for testing
 */

import { EventEmitter } from 'events';

/**
 * Mock Transport for Ledger testing
 * Simulates a Ledger device without requiring actual hardware
 */
export class MockLedgerTransport extends EventEmitter {
  public static isSupported = true;
  private exchangeTimeout: number = 30000;
  private isOpen: boolean = true;
  private mockResponses: Map<string, any> = new Map();
  private shouldFail: boolean = false;
  private failureError: any = null;

  constructor() {
    super();
    this.setupDefaultResponses();
  }

  /**
   * Create a mock transport instance
   */
  static async create(): Promise<MockLedgerTransport> {
    return new MockLedgerTransport();
  }

  /**
   * List available devices (mock)
   */
  static async list(): Promise<any[]> {
    return [{ path: 'mock-device-1' }];
  }

  /**
   * Set exchange timeout
   */
  setExchangeTimeout(timeout: number): void {
    this.exchangeTimeout = timeout;
  }

  /**
   * Exchange APDU command
   */
  async exchange(apdu: Buffer): Promise<Buffer> {
    if (!this.isOpen) {
      throw new Error('Transport not open');
    }

    if (this.shouldFail && this.failureError) {
      throw this.failureError;
    }

    // Simulate device delay
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Parse APDU command
    const cla = apdu[0];
    const ins = apdu[1];
    const p1 = apdu[2];
    const p2 = apdu[3];

    const commandKey = `${cla}-${ins}-${p1}-${p2}`;
    const response = this.mockResponses.get(commandKey);

    if (response) {
      return response;
    }

    // Default success response
    return Buffer.from([0x90, 0x00]); // SW_OK
  }

  /**
   * Close transport
   */
  async close(): Promise<void> {
    this.isOpen = false;
    this.emit('disconnect');
  }

  /**
   * Setup default mock responses for Stellar app
   */
  private setupDefaultResponses(): void {
    // Mock public key response
    // Format: [publicKeyLength, ...publicKey, statusCode, statusCode]
    const mockPublicKey = 'GDJKH7FGVQHFSJQY5GJNBMJRWVQ7DVPZUPXYHFXQY7YHO3GGFHK7YX4R';
    const publicKeyBuffer = Buffer.from(mockPublicKey, 'utf8');
    const publicKeyResponse = Buffer.concat([
      Buffer.from([publicKeyBuffer.length]),
      publicKeyBuffer,
      Buffer.from([0x90, 0x00]), // SW_OK
    ]);

    // App configuration response
    const appConfigResponse = Buffer.concat([
      Buffer.from([0x01, 0x00, 0x05]), // version 1.0.5
      Buffer.from([0x90, 0x00]), // SW_OK
    ]);

    // Signature response (64 bytes + status)
    const signatureResponse = Buffer.concat([
      Buffer.alloc(64, 0x01), // Mock signature
      Buffer.from([0x90, 0x00]), // SW_OK
    ]);

    // Store responses (these are simplified; real APDU parsing is more complex)
    this.mockResponses.set('e0-02-00-00', publicKeyResponse); // GET_PUBLIC_KEY
    this.mockResponses.set('e0-02-00-01', publicKeyResponse); // GET_PUBLIC_KEY with display
    this.mockResponses.set('e0-01-00-00', appConfigResponse); // GET_APP_CONFIGURATION
    this.mockResponses.set('e0-04-00-00', signatureResponse); // SIGN_TRANSACTION
    this.mockResponses.set('e0-08-00-00', signatureResponse); // SIGN_HASH
  }

  /**
   * Set mock public key response
   */
  setMockPublicKey(publicKey: string): void {
    const publicKeyBuffer = Buffer.from(publicKey, 'utf8');
    const publicKeyResponse = Buffer.concat([
      Buffer.from([publicKeyBuffer.length]),
      publicKeyBuffer,
      Buffer.from([0x90, 0x00]),
    ]);
    this.mockResponses.set('e0-02-00-00', publicKeyResponse);
    this.mockResponses.set('e0-02-00-01', publicKeyResponse);
  }

  /**
   * Simulate user rejection
   */
  simulateUserRejection(): void {
    this.shouldFail = true;
    this.failureError = {
      statusCode: 0x6985,
      message: 'User rejected',
    };
  }

  /**
   * Simulate app not open
   */
  simulateAppNotOpen(): void {
    this.shouldFail = true;
    this.failureError = {
      statusCode: 0x6d00,
      message: 'App not open',
    };
  }

  /**
   * Simulate device locked
   */
  simulateDeviceLocked(): void {
    this.shouldFail = true;
    this.failureError = {
      statusCode: 0x6e00,
      message: 'Device locked',
    };
  }

  /**
   * Simulate disconnect
   */
  simulateDisconnect(): void {
    this.isOpen = false;
    this.emit('disconnect');
  }

  /**
   * Reset to normal operation
   */
  resetMock(): void {
    this.shouldFail = false;
    this.failureError = null;
    this.isOpen = true;
  }

  /**
   * Set custom response for specific command
   */
  setCustomResponse(commandKey: string, response: Buffer): void {
    this.mockResponses.set(commandKey, response);
  }
}

/**
 * Mock Stellar App for testing
 */
export class MockStellarApp {
  private transport: MockLedgerTransport;

  constructor(transport: MockLedgerTransport) {
    this.transport = transport;
  }

  /**
   * Get app configuration
   */
  async getAppConfiguration(): Promise<{ version: string }> {
    const response = await this.transport.exchange(Buffer.from([0xe0, 0x01, 0x00, 0x00, 0x00]));

    if (response.length < 2) {
      throw new Error('Invalid response');
    }

    const version = `${response[0]}.${response[1]}.${response[2]}`;
    return { version };
  }

  /**
   * Get public key
   */
  async getPublicKey(
    derivationPath: string,
    display: boolean = false,
    returnChainCode: boolean = false
  ): Promise<{ publicKey: string }> {
    const p2 = display ? 0x01 : 0x00;
    const response = await this.transport.exchange(Buffer.from([0xe0, 0x02, 0x00, p2, 0x00]));

    if (response.length < 2) {
      throw new Error('Invalid response');
    }

    const length = response[0];
    const publicKey = response.slice(1, 1 + length).toString('utf8');

    return { publicKey };
  }

  /**
   * Sign transaction
   */
  async signTransaction(derivationPath: string, transactionHash: Buffer): Promise<Buffer> {
    const response = await this.transport.exchange(Buffer.from([0xe0, 0x04, 0x00, 0x00, 0x00]));

    if (response.length < 66) {
      throw new Error('Invalid signature response');
    }

    return response.slice(0, 64);
  }

  /**
   * Sign hash
   */
  async signHash(derivationPath: string, hash: Buffer): Promise<Buffer> {
    const response = await this.transport.exchange(Buffer.from([0xe0, 0x08, 0x00, 0x00, 0x00]));

    if (response.length < 66) {
      throw new Error('Invalid signature response');
    }

    return response.slice(0, 64);
  }
}
