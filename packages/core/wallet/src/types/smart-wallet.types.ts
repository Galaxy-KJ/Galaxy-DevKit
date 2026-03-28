export interface CredentialBackend {
  get(options: CredentialRequestOptions): Promise<PublicKeyCredential | null>;
  create?(
    options: CredentialCreationOptions
  ): Promise<PublicKeyCredential | null>;
}

export interface SmartWalletWebAuthnProvider {
  readonly relyingPartyId: string;
}
