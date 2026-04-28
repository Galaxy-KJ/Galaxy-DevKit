import { networkManager, Network } from './utils/network';

export async function switchNetwork(newNetwork: Network): Promise<void> {
  const current = networkManager.getNetwork();
  if (current === newNetwork) return;

  // Potential for additional validation or cleanup here
  console.log(`Switching network from ${current} to ${newNetwork}`);
  
  networkManager.setNetwork(newNetwork);
}

export function isActionRestricted(): boolean {
  return networkManager.isReadOnly();
}

export function handleRestrictedAction(actionName: string): boolean {
  if (isActionRestricted()) {
    const msg = `Action "${actionName}" is disabled: Mainnet is in read-only mode.`;
    alert(msg);
    console.warn(msg);
    return true;
  }
  return false;
}
