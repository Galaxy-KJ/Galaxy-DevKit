use soroban_sdk::{contracttype, contracterror, Bytes, BytesN};

/// WebAuthn passkey signature payload passed into `__check_auth`.
///
/// The TypeScript / browser side is responsible for converting DER-encoded
/// ECDSA signatures into the 64-byte compact R‖S form before submission.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Signature {
    /// Raw authenticator data returned by the authenticator (CBOR-decoded).
    pub authenticator_data: Bytes,
    /// The full `clientDataJSON` blob produced by `navigator.credentials.get()`.
    pub client_data_json: Bytes,
    /// The credential ID that identifies which passkey was used.
    pub id: Bytes,
    /// 64-byte compact ECDSA signature (R‖S, each 32 bytes, big-endian).
    pub signature: BytesN<64>,
}

/// Signer metadata stored on-chain.
#[contracttype]
#[derive(Clone, Debug)]
pub enum SignerKind {
    Admin,
    Session,
}

/// Stored signer entry keyed by credential ID.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Signer {
    /// 65-byte SEC-1 uncompressed public key (0x04 ‖ X ‖ Y).
    pub public_key: BytesN<65>,
    /// Whether this is a persistent admin signer or a temporary session signer.
    pub kind: SignerKind,
}

/// Storage keys used by the wallet contract.
#[contracttype]
#[derive(Clone, Debug)]
pub enum WalletDataKey {
    /// Maps credential ID → Signer.
    Signer(Bytes),
    /// The address of the wallet contract itself (set once during init).
    WalletAddress,
    /// Number of admin signers (u32). Used to prevent removing the last one.
    AdminSignerCount,
}

/// Storage keys used by the factory contract.
#[contracttype]
#[derive(Clone, Debug)]
pub enum FactoryDataKey {
    /// The WASM hash of the wallet contract, stored at initialization.
    WalletWasmHash,
    /// Tracks deployed wallets: credential_id → wallet address.
    Deployed(Bytes),
}

#[contracterror]
#[derive(Clone, Debug, Copy, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum WalletError {
    /// The signer (credential ID) was not found in storage.
    SignerNotFound = 1,
    /// The signer already exists.
    SignerAlreadyExists = 2,
    /// Cannot remove the last admin signer — wallet would be permanently locked.
    LastAdminSigner = 3,
    /// The challenge inside `clientDataJSON` does not match `signature_payload`.
    ChallengeMismatch = 4,
    /// The wallet has already been initialized.
    AlreadyInitialized = 5,
    /// Not authorized to perform this operation.
    NotAuthorized = 6,
    /// Invalid public key format (must be 65 bytes, starting with 0x04).
    InvalidPublicKey = 7,
    /// clientDataJSON is malformed or missing required fields.
    InvalidClientData = 8,
}