export class PathPaymentError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_SLIPPAGE'
      | 'INVALID_AMOUNT'
      | 'NO_PATH_FOUND'
      | 'SAME_ASSET'
      | 'BUILD_FAILED'
      | 'NETWORK_ERROR',
  ) {
    super(message);
    this.name = 'PathPaymentError';
  }
}
