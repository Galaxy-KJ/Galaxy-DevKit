import { WebAuthNProvider } from 'packages/core/wallet/auth/src/providers/WebAuthNProvider';
import { SocialLoginProvider } from 'packages/core/wallet/auth/src/providers/SocialLoginProvider';

async function runWebAuthnExample() {
  const webAuthNProvider = new WebAuthNProvider({
    rpId: 'localhost',
    rpName: 'Galaxy DevKit Example',
  });

  const { available, types, enrolled } = await webAuthNProvider.checkAvailability();
  console.log('WebAuthn available:', available, 'types:', types, 'enrolled:', enrolled);
  if (!available) throw new Error('WebAuthn not available in this environment');

  // registration
  const newCredential = await webAuthNProvider.registerCredential('any');
  console.log('Registered credential:', newCredential);

  // option: server persist credential ID and public key based on user identity
  const userId = 'example-user-123';
  const socialLogin = new SocialLoginProvider(webAuthNProvider);
  const onboardResult = await socialLogin.onboard(userId);
  console.log('SocialLogin onboard result:', onboardResult);

  // assertion
  const loginResult = await socialLogin.login(userId);
  console.log('SocialLogin login OK:', loginResult);

  // execute smart wallet signing sequence (simplified pseudo-code):
  // const authEntry = await smartWalletService.simulateTransaction(tx);
  // const authEntryHash = await crypto.subtle.digest('SHA-256', authEntry.toXDR());
  // const challenge = new Uint8Array(authEntryHash);
  // const assertion = await navigator.credentials.get({ publicKey: { challenge, rpId: 'localhost', allowCredentials: [{ id: base64UrlToUint8Array(loginResult.credentialId), type: 'public-key' }], userVerification: 'required' } });
  // const signedXdr = await smartWalletService.sign(contractAddress, tx, loginResult.credentialId);
  // console.log('Signed transaction XDR', signedXdr);

  return { newCredential, onboardResult, loginResult };
}

runWebAuthnExample().catch(error => {
  console.error('WebAuthn setup example failed:', error);
});
