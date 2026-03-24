#![no_std]
use soroban_sdk::{contracttype, contracterror, Bytes, BytesN};

#[contracttype]
#[derive(Clone, Debug)]
pub struct Signature {
    pub authenticator_data: Bytes,
    pub client_data_json: Bytes,
    pub id: Bytes,
    pub signature: BytesN<64>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub enum SignerKind {
    Admin,
    Session,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Signer {
    pub public_key: BytesN<65>,
    pub kind: SignerKind,
}

#[contracttype]
#[derive(Clone, Debug)]
pub enum WalletDataKey {
    Signer(Bytes),
    WalletAddress,
    AdminSignerCount,
}

#[contracttype]
#[derive(Clone, Debug)]
pub enum FactoryDataKey {
    WalletWasmHash,
    Deployed(Bytes),
}

#[contracterror]
#[derive(Clone, Debug, Copy, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum WalletError {
    SignerNotFound = 1,
    SignerAlreadyExists = 2,
    LastAdminSigner = 3,
    ChallengeMismatch = 4,
    AlreadyInitialized = 5,
    NotAuthorized = 6,
    InvalidPublicKey = 7,
    InvalidClientData = 8,
}