# 🌐 API Documentation

Complete API documentation for Galaxy DevKit services.

## 📋 Table of Contents

- [API Reference](./api-reference.md) - Complete API documentation
- [REST API](./rest-api.md) - REST endpoints documentation
- [GraphQL API](./graphql-api.md) - GraphQL schema and queries
- [WebSocket API](./websocket-api.md) - Real-time WebSocket API
- [SDK Examples](./sdk-examples.md) - SDK usage examples

## 🚀 Quick Start

### Authentication
```bash
Authorization: Bearer your-api-key
```

### Base URLs
- **Production**: `https://api.galaxy-devkit.com`
- **Testnet**: `https://testnet-api.galaxy-devkit.com`

### Core Endpoints
- **Wallets**: `/api/v1/wallets`
- **Payments**: `/api/v1/payments`
- **Transactions**: `/api/v1/transactions`
- **Contracts**: `/api/v1/contracts`

## 📚 Available APIs

### REST API
- **Wallets API** - Create, manage, and query wallets
- **Payments API** - Send and track payments
- **Transactions API** - Query transaction history
- **Smart Contracts API** - Deploy and interact with contracts
- **Automation API** - Create and manage automation rules

### GraphQL API
- **Queries** - Fetch data with flexible queries
- **Mutations** - Create, update, and delete operations
- **Subscriptions** - Real-time data updates

### WebSocket API
- **Real-time Updates** - Live wallet and transaction updates
- **Event Streaming** - Contract events and notifications
- **Connection Management** - Persistent connections

## 🛠️ SDKs

### TypeScript SDK
```typescript
import { GalaxySDK } from '@galaxy/sdk-typescript';

const galaxy = new GalaxySDK({
  apiKey: 'your-api-key',
  network: 'testnet'
});
```

### Python SDK
```python
from galaxy_sdk import GalaxySDK

galaxy = GalaxySDK(
    api_key='your-api-key',
    network='testnet'
)
```

### JavaScript SDK
```javascript
import { GalaxySDK } from '@galaxy/sdk-javascript';

const galaxy = new GalaxySDK({
  apiKey: 'your-api-key',
  network: 'testnet'
});
```

## 🔗 Related Documentation

- [User Guide](../guides/user-guide.md) - How to use Galaxy DevKit
- [CLI Guide](../guides/cli-guide.md) - Command line interface
- [Examples](../examples/) - Real-world examples
- [Architecture](../architecture/) - System architecture

---

**Galaxy DevKit APIs - Powering Stellar Applications** 🌟
