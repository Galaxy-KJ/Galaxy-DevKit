# 🌐 Galaxy DevKit API Reference

Complete API documentation for Galaxy DevKit services.

## 📋 Table of Contents

- [Authentication](#-authentication)
- [REST API](#-rest-api)
- [GraphQL API](#-graphql-api)
- [WebSocket API](#-websocket-api)
- [Error Handling](#-error-handling)
- [Rate Limits](#-rate-limits)

## 🔐 Authentication

### API Key Authentication
```bash
# Header
Authorization: Bearer your-api-key

# Or in SDK
const galaxy = new GalaxySDK({
  apiKey: 'your-api-key'
});
```

### JWT Authentication
```bash
# For user-specific operations
Authorization: Bearer jwt-token
```

## 🌐 REST API

### Base URLs
- **Production**: `https://api.galaxy-devkit.com`
- **Testnet**: `https://testnet-api.galaxy-devkit.com`
- **Local**: `http://localhost:3000`

### Wallets API

#### Create Wallet
```http
POST /api/v1/wallets
Content-Type: application/json
Authorization: Bearer your-api-key

{
  "userId": "user123",
  "network": "testnet",
  "metadata": {
    "name": "My Wallet",
    "description": "Personal wallet"
  }
}
```

**Response:**
```json
{
  "id": "wallet_abc123",
  "publicKey": "GABC123...",
  "privateKey": "SABC123...",
  "network": "testnet",
  "createdAt": "2024-12-01T00:00:00Z",
  "metadata": {
    "name": "My Wallet",
    "description": "Personal wallet"
  }
}
```

#### Get Wallet
```http
GET /api/v1/wallets/{walletId}
Authorization: Bearer your-api-key
```

**Response:**
```json
{
  "id": "wallet_abc123",
  "publicKey": "GABC123...",
  "network": "testnet",
  "balance": [
    {
      "asset": "XLM",
      "amount": "1000.0000000",
      "limit": null
    }
  ],
  "createdAt": "2024-12-01T00:00:00Z"
}
```

#### List Wallets
```http
GET /api/v1/wallets?userId=user123&limit=10&offset=0
Authorization: Bearer your-api-key
```

#### Update Wallet
```http
PUT /api/v1/wallets/{walletId}
Content-Type: application/json
Authorization: Bearer your-api-key

{
  "metadata": {
    "name": "Updated Wallet Name"
  }
}
```

#### Delete Wallet
```http
DELETE /api/v1/wallets/{walletId}
Authorization: Bearer your-api-key
```

### Payments API

#### Send Payment
```http
POST /api/v1/payments
Content-Type: application/json
Authorization: Bearer your-api-key

{
  "from": "source-address",
  "to": "destination-address",
  "amount": "10.5",
  "asset": "XLM",
  "memo": "Payment description",
  "fee": "0.00001"
}
```

**Response:**
```json
{
  "id": "payment_xyz789",
  "hash": "abc123def456...",
  "status": "success",
  "ledger": "12345",
  "createdAt": "2024-12-01T00:00:00Z",
  "from": "source-address",
  "to": "destination-address",
  "amount": "10.5",
  "asset": "XLM"
}
```

#### Get Payment
```http
GET /api/v1/payments/{paymentId}
Authorization: Bearer your-api-key
```

#### List Payments
```http
GET /api/v1/payments?walletId=wallet123&limit=10&offset=0
Authorization: Bearer your-api-key
```

### Transactions API

#### Get Transaction
```http
GET /api/v1/transactions/{txHash}
Authorization: Bearer your-api-key
```

**Response:**
```json
{
  "hash": "abc123def456...",
  "source": "source-address",
  "destination": "destination-address",
  "amount": "10.5",
  "asset": "XLM",
  "memo": "Payment description",
  "status": "success",
  "ledger": "12345",
  "createdAt": "2024-12-01T00:00:00Z"
}
```

#### List Transactions
```http
GET /api/v1/transactions?walletId=wallet123&limit=10&offset=0
Authorization: Bearer your-api-key
```

### Smart Contracts API

#### Deploy Contract
```http
POST /api/v1/contracts/deploy
Content-Type: application/json
Authorization: Bearer your-api-key

{
  "contractType": "smart-swap",
  "network": "testnet",
  "parameters": {
    "fee": "0.01",
    "admin": "admin-address"
  }
}
```

**Response:**
```json
{
  "id": "contract_def456",
  "address": "contract-address",
  "type": "smart-swap",
  "network": "testnet",
  "status": "deployed",
  "createdAt": "2024-12-01T00:00:00Z"
}
```

#### Call Contract
```http
POST /api/v1/contracts/{contractId}/call
Content-Type: application/json
Authorization: Bearer your-api-key

{
  "method": "swap",
  "parameters": {
    "fromAsset": "XLM",
    "toAsset": "USDC",
    "amount": "100"
  }
}
```

#### Get Contract
```http
GET /api/v1/contracts/{contractId}
Authorization: Bearer your-api-key
```

#### List Contracts
```http
GET /api/v1/contracts?userId=user123&limit=10&offset=0
Authorization: Bearer your-api-key
```

### Automation API

#### Create Automation Rule
```http
POST /api/v1/automation/rules
Content-Type: application/json
Authorization: Bearer your-api-key

{
  "name": "Auto Buy XLM",
  "trigger": {
    "type": "price",
    "condition": {
      "asset": "XLM",
      "operator": "less_than",
      "value": "0.10"
    }
  },
  "action": {
    "type": "buy",
    "parameters": {
      "asset": "XLM",
      "amount": "100"
    }
  }
}
```

#### List Automation Rules
```http
GET /api/v1/automation/rules?userId=user123
Authorization: Bearer your-api-key
```

#### Update Automation Rule
```http
PUT /api/v1/automation/rules/{ruleId}
Content-Type: application/json
Authorization: Bearer your-api-key

{
  "name": "Updated Auto Buy XLM",
  "enabled": true
}
```

#### Delete Automation Rule
```http
DELETE /api/v1/automation/rules/{ruleId}
Authorization: Bearer your-api-key
```

## 🔍 GraphQL API

### Endpoint
```
https://api.galaxy-devkit.com/graphql
```

### Schema

#### Queries

```graphql
# Get user wallets
query GetWallets($userId: String!) {
  wallets(userId: $userId) {
    id
    publicKey
    network
    balance {
      asset
      amount
      limit
    }
    createdAt
  }
}

# Get wallet transactions
query GetWalletTransactions($walletId: String!, $limit: Int) {
  wallet(id: $walletId) {
    transactions(limit: $limit) {
      hash
      source
      destination
      amount
      asset
      status
      createdAt
    }
  }
}

# Get smart contracts
query GetContracts($userId: String!) {
  contracts(userId: $userId) {
    id
    address
    type
    network
    status
    createdAt
  }
}
```

#### Mutations

```graphql
# Create wallet
mutation CreateWallet($input: CreateWalletInput!) {
  createWallet(input: $input) {
    id
    publicKey
    network
    createdAt
  }
}

# Send payment
mutation SendPayment($input: SendPaymentInput!) {
  sendPayment(input: $input) {
    id
    hash
    status
    createdAt
  }
}

# Deploy contract
mutation DeployContract($input: DeployContractInput!) {
  deployContract(input: $input) {
    id
    address
    type
    status
    createdAt
  }
}
```

#### Subscriptions

```graphql
# Real-time wallet updates
subscription WalletUpdates($walletId: String!) {
  walletUpdated(walletId: $walletId) {
    id
    balance {
      asset
      amount
    }
    lastTransaction {
      hash
      amount
      createdAt
    }
  }
}

# Real-time transaction updates
subscription TransactionUpdates($walletId: String!) {
  transactionCreated(walletId: $walletId) {
    hash
    source
    destination
    amount
    asset
    status
    createdAt
  }
}

# Real-time contract events
subscription ContractEvents($contractId: String!) {
  contractEvent(contractId: $contractId) {
    id
    event
    data
    createdAt
  }
}
```

## 🔌 WebSocket API

### Connection
```javascript
const ws = new WebSocket('wss://api.galaxy-devkit.com/ws');

ws.onopen = () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'your-api-key'
  }));
};
```

### Message Types

#### Subscribe to Channel
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'wallet:wallet123'
}));
```

#### Unsubscribe from Channel
```javascript
ws.send(JSON.stringify({
  type: 'unsubscribe',
  channel: 'wallet:wallet123'
}));
```

#### Real-time Updates
```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'wallet_updated':
      console.log('Wallet balance updated:', data.balance);
      break;
    case 'transaction_created':
      console.log('New transaction:', data.transaction);
      break;
    case 'contract_event':
      console.log('Contract event:', data.event);
      break;
  }
};
```

### Available Channels

- `wallet:{walletId}` - Wallet updates
- `transactions:{walletId}` - Transaction updates
- `contract:{contractId}` - Contract events
- `automation:{userId}` - Automation updates

## ❌ Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request parameters",
    "details": {
      "field": "amount",
      "reason": "Must be a positive number"
    }
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_REQUEST` | Invalid request parameters |
| `UNAUTHORIZED` | Invalid or missing API key |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `RATE_LIMITED` | Rate limit exceeded |
| `INTERNAL_ERROR` | Server error |

## 🚦 Rate Limits

### Limits per API Key
- **REST API**: 1000 requests/hour
- **GraphQL**: 500 queries/hour
- **WebSocket**: 10 concurrent connections

### Headers
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## 📝 SDK Examples

### TypeScript SDK
```typescript
import { GalaxySDK } from '@galaxy/sdk-typescript';

const galaxy = new GalaxySDK({
  apiKey: 'your-api-key',
  network: 'testnet'
});

// Create wallet
const wallet = await galaxy.wallets.create({
  userId: 'user123'
});

// Send payment
const payment = await galaxy.payments.send({
  from: wallet.publicKey,
  to: 'destination-address',
  amount: '10',
  asset: 'XLM'
});

// Subscribe to updates
galaxy.websocket.subscribe('wallet:wallet123', (update) => {
  console.log('Wallet updated:', update);
});
```

### Python SDK
```python
from galaxy_sdk import GalaxySDK

galaxy = GalaxySDK(
    api_key='your-api-key',
    network='testnet'
)

# Create wallet
wallet = galaxy.wallets.create(
    user_id='user123'
)

# Send payment
payment = galaxy.payments.send(
    from_address=wallet.public_key,
    to_address='destination-address',
    amount='10',
    asset='XLM'
)
```

### JavaScript SDK
```javascript
import { GalaxySDK } from '@galaxy/sdk-javascript';

const galaxy = new GalaxySDK({
  apiKey: 'your-api-key',
  network: 'testnet'
});

// Create wallet
const wallet = await galaxy.wallets.create({
  userId: 'user123'
});

// Send payment
const payment = await galaxy.payments.send({
  from: wallet.publicKey,
  to: 'destination-address',
  amount: '10',
  asset: 'XLM'
});
```
