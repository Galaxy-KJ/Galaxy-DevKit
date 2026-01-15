# 🏗️ Galaxy DevKit - Architecture Documentation

## 📋 Table of Contents
- [System Overview](#system-overview)
- [Core Components](#core-components)
- [DeFi Integration Architecture](#defi-integration-architecture)
- [Oracle System](#oracle-system)
- [Data Flow](#data-flow)
- [Security Architecture](#security-architecture)
- [Scalability](#scalability)

---

## 🎯 System Overview

Galaxy DevKit is a **modular, layered architecture** for Stellar blockchain development.

```mermaid
graph TB
    subgraph "User Applications"
        WebApp[Web Apps]
        MobileApp[Mobile Apps]
        CLI[CLI Tools]
        Scripts[Scripts]
    end

    subgraph "SDK Layer"
        TSSDK[TypeScript SDK]
        PySdk[Python SDK]
        RustSdk[Rust SDK]
    end

    subgraph "API Layer"
        REST[REST API]
        GraphQL[GraphQL API]
        WS[WebSocket API]
    end

    subgraph "Business Logic Layer"
        IW[Invisible Wallet]
        SS[Stellar SDK]
        AE[Automation Engine]
        DP[DeFi Protocols]
        OS[Oracle Service]
        SC[Smart Contracts]
    end

    subgraph "Infrastructure Layer"
        Supabase[(Supabase DB)]
        Horizon[Stellar Horizon]
        Soroban[Soroban Runtime]
    end

    WebApp --> TSSDK
    MobileApp --> TSSDK
    CLI --> TSSDK
    Scripts --> PySdk

    TSSDK --> REST
    TSSDK --> GraphQL
    TSSDK --> WS
    PySdk --> REST

    REST --> IW
    REST --> SS
    REST --> AE
    GraphQL --> IW
    GraphQL --> DP
    WS --> OS

    IW --> Supabase
    IW --> SS
    SS --> Horizon
    AE --> SS
    AE --> DP
    DP --> Soroban
    OS --> Soroban
    SC --> Soroban

    style IW fill:#e1f5ff
    style DP fill:#fff3e0
    style OS fill:#f3e5f5
```

---

## 🔧 Core Components

### 1. Invisible Wallet System

**Purpose**: Provide seamless wallet management without exposing private keys to users.

```mermaid
graph TB
    subgraph "InvisibleWalletService"
        direction TB

        subgraph "KeyManagementService"
            Gen[generateKeypair]
            Derive[deriveFromMnemonic]
            Encrypt[encryptPrivateKey<br/>AES-256-GCM]
            Decrypt[decryptPrivateKey]
            Session[createSession]
            Validate[validateSession]
        end

        subgraph "StellarService"
            AccInfo[getAccountInfo]
            Send[sendPayment]
            History[getTransactionHistory]
        end

        subgraph "Storage Layer"
            WalletTable[(invisible_wallets)]
            SessionTable[(wallet_sessions)]
            EventTable[(wallet_events)]
        end
    end

    Gen --> Encrypt
    Encrypt --> WalletTable
    Session --> SessionTable
    Validate --> SessionTable
    Send --> AccInfo
    History --> EventTable

    style KeyManagementService fill:#e3f2fd
    style StellarService fill:#f3e5f5
    style Storage fill:#fff3e0
```

**Key Features**:
- ED25519 keypair generation (Stellar native)
- BIP39/BIP44 mnemonic derivation (m/44'/148'/0')
- AES-256-GCM encryption with PBKDF2 key derivation
- Session-based authentication with configurable timeout
- Multi-device support with device fingerprinting
- Event logging for audit trail

**Database Schema**:
```sql
-- Wallets table
CREATE TABLE invisible_wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  encrypted_seed TEXT,
  network JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  last_accessed_at TIMESTAMP,
  metadata JSONB,
  backup_status JSONB
);

-- Sessions table
CREATE TABLE wallet_sessions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES invisible_wallets(id),
  user_id TEXT NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT true,
  device_info JSONB
);

-- Events table
CREATE TABLE wallet_events (
  id TEXT PRIMARY KEY,
  wallet_id TEXT REFERENCES invisible_wallets(id),
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  metadata JSONB
);
```

---

### 2. Stellar SDK Wrapper

**Purpose**: Abstract and simplify Stellar SDK operations.

```mermaid
classDiagram
    class StellarService {
        -NetworkConfig config
        -Horizon server
        -NetworkUtils utils
        -Supabase client

        +createWallet(config, password) Wallet
        +createWalletFromMnemonic(mnemonic, password) Wallet
        +generateMnemonic(strength) string
        +getAccountInfo(publicKey) AccountInfo
        +isAccountFunded(publicKey) boolean
        +getBalance(publicKey, asset) Balance
        +sendPayment(wallet, params, password) PaymentResult
        +addTrustline(wallet, asset, issuer, limit) PaymentResult
        +getTransactionHistory(publicKey, limit) TransactionInfo[]
        +switchNetwork(networkConfig) void
        +estimateFee() string
    }

    class NetworkConfig {
        +network: testnet | mainnet
        +horizonUrl: string
        +passphrase: string
    }

    class Wallet {
        +id: string
        +publicKey: string
        +privateKey: string (encrypted)
        +network: NetworkConfig
        +createdAt: Date
        +metadata: Record
    }

    class PaymentParams {
        +destination: string
        +amount: string
        +asset: string
        +issuer?: string
        +memo?: string
        +fee?: number
    }

    StellarService --> NetworkConfig
    StellarService --> Wallet
    StellarService --> PaymentParams
```

**Network Configurations**:
```typescript
// Testnet
{
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015'
}

// Mainnet
{
  network: 'mainnet',
  horizonUrl: 'https://horizon.stellar.org',
  passphrase: 'Public Global Stellar Network ; September 2015'
}
```

---

### 3. Automation Engine

**Purpose**: Enable DeFi automation with triggers, conditions, and actions.

```mermaid
graph LR
    subgraph "AutomationService"
        CM[CronManager<br/>Schedule jobs]
        EM[EventManager<br/>Blockchain events]
        CE[ConditionEvaluator<br/>Eval rules]
        EE[ExecutionEngine<br/>Execute actions]
        PO[PriceOracle<br/>Price feeds]
        MT[MetricsTracker<br/>Analytics]
    end

    Trigger[Trigger Fired] --> CE
    CE -->|Conditions Met| EE
    CE -->|Conditions Not Met| Log[Log Event]
    EE --> Action[Execute Action]
    Action --> MT
    MT --> DB[(Metrics DB)]

    CM -.->|Schedule| Trigger
    EM -.->|Event| Trigger
    PO -.->|Price Alert| Trigger

    style CM fill:#e3f2fd
    style EM fill:#f3e5f5
    style CE fill:#fff3e0
    style EE fill:#e8f5e9
```

**Trigger Types**:
```mermaid
graph TD
    Triggers[Trigger Types]
    Triggers --> CRON[CRON<br/>Time-based<br/>0 */6 * * *]
    Triggers --> EVENT[EVENT<br/>Blockchain events<br/>Payment received]
    Triggers --> PRICE[PRICE<br/>Price conditions<br/>XLM > $0.15]
    Triggers --> VOLUME[VOLUME<br/>Trading volume<br/>Volume > 1M]
    Triggers --> CUSTOM[CUSTOM<br/>Custom logic<br/>JavaScript]

    style CRON fill:#e3f2fd
    style EVENT fill:#f3e5f5
    style PRICE fill:#fff3e0
    style VOLUME fill:#e8f5e9
    style CUSTOM fill:#fce4ec
```

**Execution Flow**:
```mermaid
sequenceDiagram
    participant Trigger
    participant AutomationService
    participant ConditionEvaluator
    participant ExecutionEngine
    participant StellarNetwork
    participant MetricsDB

    Trigger->>AutomationService: Trigger Fired
    AutomationService->>AutomationService: Validate Rule
    AutomationService->>ConditionEvaluator: Evaluate Conditions
    ConditionEvaluator->>ConditionEvaluator: Build Context
    ConditionEvaluator->>ConditionEvaluator: Check AND/OR Logic

    alt Conditions Met
        ConditionEvaluator->>ExecutionEngine: Execute Action
        ExecutionEngine->>StellarNetwork: Submit Transaction
        StellarNetwork-->>ExecutionEngine: Transaction Result
        ExecutionEngine->>MetricsDB: Record Metrics
        ExecutionEngine-->>AutomationService: Success
    else Conditions Not Met
        ConditionEvaluator-->>AutomationService: Skip Execution
    end

    AutomationService->>MetricsDB: Update Analytics
```

---

## 💰 DeFi Integration Architecture

### Protocol Abstraction Layer

```typescript
interface IDefiProtocol {
  readonly name: string;
  readonly protocolId: string;
  readonly contractAddress: string;

  // Lending & Borrowing
  supply(asset: Asset, amount: string): Promise<TransactionResult>;
  borrow(asset: Asset, amount: string): Promise<TransactionResult>;
  repay(asset: Asset, amount: string): Promise<TransactionResult>;
  withdraw(asset: Asset, amount: string): Promise<TransactionResult>;

  // Position Management
  getPosition(address: string): Promise<Position>;
  getHealth(address: string): Promise<HealthFactor>;

  // Protocol Info
  getSupplyAPY(asset: Asset): Promise<number>;
  getBorrowAPY(asset: Asset): Promise<number>;
  getTotalSupply(asset: Asset): Promise<string>;
  getTotalBorrow(asset: Asset): Promise<string>;
}
```

### Blend Protocol Integration

**Blend** is a lending protocol on Stellar Soroban.

```mermaid
classDiagram
    class IDefiProtocol {
        <<interface>>
        +supply(asset, amount)
        +borrow(asset, amount)
        +repay(asset, amount)
        +withdraw(asset, amount)
        +getPosition(address)
        +getHealth(address)
    }

    class BlendProtocolService {
        -contractAddress: string
        -sorobanClient: SorobanRpc.Client
        -networkPassphrase: string

        +supply(wallet, asset, amount)
        +withdraw(wallet, asset, amount)
        +borrow(wallet, asset, amount)
        +repay(wallet, asset, amount)
        +getPosition(address)
        +getHealthFactor(address)
        +getSupplyAPY(asset)
        +getBorrowAPY(asset)
        +liquidate(wallet, target, asset)
    }

    class SoroswapProtocolService {
        -routerContract: string
        -factoryContract: string

        +swap(wallet, tokenIn, tokenOut, amountIn, minOut)
        +addLiquidity(wallet, tokenA, tokenB, amountA, amountB)
        +removeLiquidity(wallet, tokenA, tokenB, liquidity)
        +getPrice(tokenIn, tokenOut)
        +getReserves(pairAddress)
    }

    class DexAggregatorService {
        -dexes: IDefiProtocol[]

        +getBestQuote(tokenIn, tokenOut, amount)
        +getAllQuotes(tokenIn, tokenOut, amount)
        +executeSwap(wallet, quote, slippage)
    }

    IDefiProtocol <|.. BlendProtocolService
    IDefiProtocol <|.. SoroswapProtocolService
    DexAggregatorService --> IDefiProtocol
```

**Example Usage**:
```typescript
const blend = new BlendProtocolService({
  contractAddress: 'BLEND_CONTRACT_ADDRESS',
  network: 'mainnet'
});

// Supply USDC to earn interest
await blend.supply(wallet, { code: 'USDC', issuer: 'USDC_ISSUER' }, '1000');

// Borrow XLM against supplied collateral
await blend.borrow(wallet, { code: 'XLM' }, '500');

// Check position health
const health = await blend.getHealthFactor(wallet.publicKey);
console.log('Health factor:', health); // > 1.0 is healthy
```

### DEX Aggregator Flow

```mermaid
sequenceDiagram
    participant User
    participant DexAggregator
    participant Soroswap
    participant StellarDEX
    participant Aquarius
    participant Wallet

    User->>DexAggregator: getBestQuote(XLM, USDC, 1000)

    par Fetch quotes in parallel
        DexAggregator->>Soroswap: getQuote(XLM, USDC, 1000)
        DexAggregator->>StellarDEX: getQuote(XLM, USDC, 1000)
        DexAggregator->>Aquarius: getQuote(XLM, USDC, 1000)
    end

    Soroswap-->>DexAggregator: Quote: 150 USDC
    StellarDEX-->>DexAggregator: Quote: 148 USDC
    Aquarius-->>DexAggregator: Quote: 152 USDC

    DexAggregator->>DexAggregator: Compare quotes
    DexAggregator-->>User: Best: Aquarius - 152 USDC

    User->>DexAggregator: executeSwap(wallet, quote)
    DexAggregator->>Aquarius: executeSwap()
    Aquarius->>Wallet: Sign Transaction
    Wallet-->>Aquarius: Signed TX
    Aquarius-->>DexAggregator: TX Hash
    DexAggregator-->>User: Success: 152 USDC received
```

---

## 🔮 Oracle System

### Architecture

```mermaid
graph TB
    subgraph "Oracle Service"
        OC[On-Chain Oracle<br/>Soroban Contract]
        OA[Off-Chain Aggregator<br/>Node.js Service]

        subgraph "Price Sources"
            Soroswap[Soroswap DEX]
            SDEX[Stellar DEX]
            CG[CoinGecko API]
            CMC[CoinMarketCap API]
        end
    end

    OA -->|Fetch| Soroswap
    OA -->|Fetch| SDEX
    OA -->|Fetch| CG
    OA -->|Fetch| CMC

    OA -->|Aggregate| Med[Calculate Median]
    Med -->|Update| OC

    OC -->|Store| Prices[(Price History)]
    OC -->|Provide| Contracts[Smart Contracts]
    OC -->|Provide| Automation[Automation Engine]

    style OC fill:#e3f2fd
    style OA fill:#f3e5f5
    style Med fill:#fff3e0
```

### On-Chain Oracle Contract

```rust
pub struct PriceOracle;

#[contractimpl]
impl PriceOracle {
    /// Set price (only trusted sources)
    pub fn set_price(
        env: &Env,
        source: Address,
        pair: Symbol,
        price: u128,
        timestamp: u64
    );

    /// Get latest price
    pub fn get_price(env: &Env, pair: Symbol) -> PriceData;

    /// Get TWAP (Time-Weighted Average Price)
    pub fn get_twap(env: &Env, pair: Symbol, window: u64) -> u128;

    /// Add trusted source
    pub fn add_trusted_source(env: &Env, source: Address);
}
```

### Price Update Flow

```mermaid
sequenceDiagram
    participant Scheduler
    participant OracleService
    participant Soroswap
    participant SDEX
    participant CoinGecko
    participant OnChainOracle
    participant Database
    participant WebSocket

    Scheduler->>OracleService: Every 60 seconds

    par Fetch prices in parallel
        OracleService->>Soroswap: getPrice(XLM/USDC)
        OracleService->>SDEX: getPrice(XLM/USDC)
        OracleService->>CoinGecko: getPrice(XLM/USDC)
    end

    Soroswap-->>OracleService: $0.1501
    SDEX-->>OracleService: $0.1499
    CoinGecko-->>OracleService: $0.1502

    OracleService->>OracleService: Calculate Median: $0.1501
    OracleService->>OracleService: Validate (no outliers)

    OracleService->>OnChainOracle: set_price(XLM/USDC, 0.1501)
    OnChainOracle-->>OracleService: Success

    OracleService->>Database: Store historical price
    OracleService->>WebSocket: Broadcast price update
    WebSocket-->>Subscribers: {pair: "XLM/USDC", price: 0.1501}
```

---

## 🔄 Data Flow

### Wallet Creation Flow

```mermaid
sequenceDiagram
    participant User
    participant API
    participant IWService as InvisibleWalletService
    participant KeyMgmt as KeyManagementService
    participant Encryption
    participant Supabase
    participant Session

    User->>API: POST /api/v1/wallets<br/>{email, password}
    API->>IWService: createWallet(config, password)
    IWService->>KeyMgmt: generateKeypair()
    KeyMgmt-->>IWService: {publicKey, secretKey}

    IWService->>Encryption: encryptPrivateKey(secretKey, password)
    Encryption->>Encryption: PBKDF2 key derivation
    Encryption->>Encryption: AES-256-GCM encryption
    Encryption-->>IWService: encryptedPrivateKey

    IWService->>Supabase: INSERT INTO invisible_wallets
    Supabase-->>IWService: wallet_id

    IWService->>Session: createSession(wallet_id, user_id)
    Session-->>IWService: sessionToken

    IWService-->>API: {wallet, session}
    API-->>User: 201 Created
```

### Payment Flow

```mermaid
sequenceDiagram
    participant User
    participant API
    participant IWService as InvisibleWalletService
    participant KeyMgmt as KeyManagementService
    participant StellarService
    participant Horizon
    participant EventLog

    User->>API: POST /api/v1/payments<br/>{walletId, destination, amount}
    API->>IWService: sendPayment(walletId, sessionToken, params)

    IWService->>KeyMgmt: validateSession(sessionToken)
    KeyMgmt-->>IWService: valid

    IWService->>KeyMgmt: decryptPrivateKey(password)
    KeyMgmt-->>IWService: privateKey

    IWService->>StellarService: sendPayment(wallet, params)
    StellarService->>StellarService: buildTransaction()
    StellarService->>StellarService: signTransaction(privateKey)

    StellarService->>Horizon: submitTransaction()

    alt Success
        Horizon-->>StellarService: {hash, ledger, status: success}
        StellarService->>EventLog: Log TRANSACTION_SENT
        StellarService-->>IWService: PaymentResult
        IWService-->>API: {hash, status, ledger}
        API-->>User: 200 OK
    else Failure
        Horizon-->>StellarService: Error
        StellarService->>StellarService: Retry (up to 3 times)
        StellarService-->>API: Error details
        API-->>User: 400 Bad Request
    end
```

### Automation Execution Flow

```mermaid
flowchart TD
    Start[Trigger Fired<br/>CRON/Event/Price] --> Validate{Validate Rule}
    Validate -->|Invalid| LogError[Log Error]
    Validate -->|Valid| CheckStatus{Check Status}

    CheckStatus -->|Inactive| Skip[Skip Execution]
    CheckStatus -->|Active| CheckLimits{Check Limits}

    CheckLimits -->|Exceeded| Disable[Disable Rule]
    CheckLimits -->|OK| BuildContext[Build Context<br/>Market data, Account data]

    BuildContext --> EvalConditions[Evaluate Conditions]
    EvalConditions --> ConditionsMet{Conditions Met?}

    ConditionsMet -->|No| LogConditions[Log: Conditions Not Met]
    ConditionsMet -->|Yes| Execute[Execute Action]

    Execute --> ActionType{Action Type}

    ActionType -->|PAYMENT| SendPayment[Send Payment]
    ActionType -->|SWAP| ExecuteSwap[Execute Swap]
    ActionType -->|CONTRACT| CallContract[Call Contract]
    ActionType -->|WEBHOOK| CallWebhook[Call Webhook]

    SendPayment --> RecordMetrics
    ExecuteSwap --> RecordMetrics
    CallContract --> RecordMetrics
    CallWebhook --> RecordMetrics

    RecordMetrics[Record Metrics] --> Emit[Emit Event]
    Emit --> Broadcast[WebSocket Broadcast]
    Broadcast --> End[End]

    LogError --> End
    Skip --> End
    Disable --> End
    LogConditions --> End

    style Start fill:#e3f2fd
    style Execute fill:#e8f5e9
    style RecordMetrics fill:#fff3e0
    style End fill:#f3e5f5
```

---

## 🔐 Security Architecture

### Encryption

**Wallet Private Keys**:
```mermaid
graph LR
    PK[Private Key<br/>Plain Text] --> PBKDF2[PBKDF2<br/>100k iterations]
    Password[Password] --> PBKDF2
    Salt[Salt<br/>32 bytes] --> PBKDF2

    PBKDF2 --> DerivedKey[Derived Key<br/>256 bits]

    DerivedKey --> AES[AES-256-GCM<br/>Encryption]
    PK --> AES
    IV[IV<br/>16 bytes] --> AES

    AES --> Ciphertext[Ciphertext]
    AES --> AuthTag[Auth Tag<br/>16 bytes]

    Ciphertext --> Store[(Encrypted Data<br/>Supabase)]
    AuthTag --> Store
    Salt --> Store
    IV --> Store

    style PBKDF2 fill:#e3f2fd
    style AES fill:#f3e5f5
    style Store fill:#fff3e0
```

**Encrypted Data Structure**:
```typescript
interface EncryptedData {
  ciphertext: string;  // Base64
  iv: string;          // Base64
  salt: string;        // Base64
  authTag: string;     // Base64
  algorithm: 'aes-256-gcm';
}
```

### Access Control

```mermaid
graph TD
    Request[HTTP Request] --> CheckAPI{API Key Valid?}
    CheckAPI -->|No| Reject1[401 Unauthorized]
    CheckAPI -->|Yes| CheckRL{Rate Limit OK?}

    CheckRL -->|No| Reject2[429 Too Many Requests]
    CheckRL -->|Yes| CheckSession{Session Valid?}

    CheckSession -->|No| Reject3[403 Forbidden]
    CheckSession -->|Yes| CheckOwnership{Resource Ownership?}

    CheckOwnership -->|No| Reject4[403 Forbidden]
    CheckOwnership -->|Yes| Execute[Execute Operation]

    Execute --> LogEvent[Log Audit Event]
    LogEvent --> Response[200 OK]

    style Request fill:#e3f2fd
    style Execute fill:#e8f5e9
    style LogEvent fill:#fff3e0
```

### Audit Logging

```typescript
interface WalletEvent {
  id: string;
  walletId: string;
  userId: string;
  eventType: WalletEventType;
  timestamp: Date;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: DeviceInfo;
    [key: string]: any;
  };
}

enum WalletEventType {
  CREATED = 'created',
  UNLOCKED = 'unlocked',
  LOCKED = 'locked',
  TRANSACTION_SENT = 'transaction_sent',
  BACKUP_CREATED = 'backup_created',
  PASSWORD_CHANGED = 'password_changed',
  RECOVERY_INITIATED = 'recovery_initiated'
}
```

---

## 📈 Scalability

### Horizontal Scaling

```mermaid
graph TB
    LB[Load Balancer<br/>Nginx/HAProxy]

    subgraph "API Servers (Stateless)"
        API1[API Server 1]
        API2[API Server 2]
        API3[API Server N]
    end

    subgraph "WebSocket Servers"
        WS1[WS Server 1]
        WS2[WS Server 2]
        WS3[WS Server N]
        Redis[(Redis Adapter<br/>Pub/Sub)]
    end

    subgraph "Background Workers"
        W1[Worker 1<br/>Automation]
        W2[Worker 2<br/>Oracles]
        W3[Worker N<br/>Jobs]
        Queue[(Job Queue<br/>Bull/BullMQ)]
    end

    subgraph "Database Layer"
        Primary[(Primary DB<br/>Write)]
        Replica1[(Replica 1<br/>Read)]
        Replica2[(Replica N<br/>Read)]
    end

    LB --> API1
    LB --> API2
    LB --> API3

    LB --> WS1
    LB --> WS2
    LB --> WS3

    WS1 --> Redis
    WS2 --> Redis
    WS3 --> Redis

    API1 --> Primary
    API2 --> Replica1
    API3 --> Replica2

    Queue --> W1
    Queue --> W2
    Queue --> W3

    W1 --> Primary
    W2 --> Primary
    W3 --> Primary

    style LB fill:#e3f2fd
    style Redis fill:#fff3e0
    style Queue fill:#f3e5f5
    style Primary fill:#e8f5e9
```

### Caching Strategy

```mermaid
graph LR
    Request[Request] --> L1{Redis Cache<br/>Layer 1}

    L1 -->|Hit| Return1[Return Cached]
    L1 -->|Miss| L2{Application Cache<br/>Layer 2}

    L2 -->|Hit| Return2[Return + Cache L1]
    L2 -->|Miss| DB[(Database)]

    DB --> Cache[Cache Result]
    Cache --> Return3[Return]

    style L1 fill:#e3f2fd
    style L2 fill:#f3e5f5
    style DB fill:#fff3e0
```

**Cache TTLs**:
- Account Info: 60 seconds
- Transaction History: 300 seconds (5 minutes)
- Price Data: 60 seconds
- Protocol Stats: 300 seconds (5 minutes)

### Rate Limiting

```mermaid
graph TD
    Request[Incoming Request] --> Identify[Identify Client<br/>API Key / IP]
    Identify --> Check{Rate Limit<br/>Check}

    Check -->|Within Limit| Allow[Allow Request]
    Check -->|Exceeded| Block[Block Request<br/>429 Too Many Requests]

    Allow --> Tiers{Client Tier}

    Tiers -->|Free| T1[100 req/min]
    Tiers -->|Basic| T2[1,000 req/min]
    Tiers -->|Pro| T3[10,000 req/min]
    Tiers -->|Enterprise| T4[Unlimited]

    style Request fill:#e3f2fd
    style Allow fill:#e8f5e9
    style Block fill:#ffebee
```

---

## 🧪 Testing Strategy

```mermaid
graph TB
    subgraph "Testing Pyramid"
        E2E[E2E Tests<br/>Full user flows]
        Integration[Integration Tests<br/>API + DB + Stellar]
        Unit[Unit Tests<br/>Core logic<br/>90%+ coverage]
    end

    subgraph "Contract Testing"
        Soroban[Soroban Contract Tests<br/>Every public function]
        Edge[Edge Cases<br/>Failure scenarios]
    end

    subgraph "CI/CD Pipeline"
        Lint[Linting<br/>ESLint/Prettier]
        Type[Type Check<br/>TypeScript]
        Test[Run Tests]
        Build[Build]
        Deploy[Deploy]
    end

    Unit --> Integration
    Integration --> E2E

    Soroban --> Edge

    Lint --> Type
    Type --> Test
    Test --> Build
    Build --> Deploy

    style Unit fill:#e8f5e9
    style Integration fill:#fff3e0
    style E2E fill:#e3f2fd
    style Soroban fill:#f3e5f5
```

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
