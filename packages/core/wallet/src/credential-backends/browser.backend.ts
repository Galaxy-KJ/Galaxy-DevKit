import type { CredentialBackend } from "../types/smart-wallet.types";

function getCredentialContainer(): CredentialsContainer {
  const credentials = globalThis.navigator?.credentials;

  if (!credentials) {
    throw new Error(
      "BrowserCredentialBackend requires navigator.credentials. " +
        "Inject a custom credentialBackend when using SmartWalletService in Node.js, SSR, React Native, or tests."
    );
  }

  return credentials;
}

export class BrowserCredentialBackend implements CredentialBackend {
  async get(
    options: CredentialRequestOptions
  ): Promise<PublicKeyCredential | null> {
    const credentials = getCredentialContainer();
    return (await credentials.get(options)) as PublicKeyCredential | null;
  }

  async create(
    options: CredentialCreationOptions
  ): Promise<PublicKeyCredential | null> {
    const credentials = getCredentialContainer();
    return (await credentials.create(options)) as PublicKeyCredential | null;
  }
}
