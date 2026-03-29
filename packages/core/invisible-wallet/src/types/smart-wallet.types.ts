export interface SmartWallet {
    id: string;
    user_id: string;
    contract_address: string;
    passkey_credential_id: string;
    public_key_65bytes: string; // hex-encoded SEC-1 uncompressed
    network: 'testnet' | 'mainnet';
    created_at: string;
}
