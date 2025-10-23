# Galaxy WebSocket API

A production-ready WebSocket API server for Galaxy DevKit that provides real-time communication for market data, transaction updates, and automation events.

## Features

- **Real-time Market Data**: Live price updates, orderbook changes, and trade events
- **Transaction Monitoring**: Real-time transaction status updates and confirmations
- **Automation Events**: Automated trading rule triggers and execution notifications
- **Secure Authentication**: JWT-based authentication with Supabase integration
- **Room Management**: Efficient room-based broadcasting with permission controls
- **Event Queuing**: Reliable event delivery with retry mechanisms
- **Rate Limiting**: Built-in protection against abuse
- **Health Monitoring**: Comprehensive health checks and metrics

## Installation

```bash
npm install @galaxy/api-websocket
```

## Quick Start

### 1. Environment Setup

Create a `.env` file with the following variables:

```env
# Server Configuration
WEBSOCKET_PORT=3001
WEBSOCKET_HOST=0.0.0.0
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
CORS_CREDENTIALS=true

# Connection Limits
MAX_CONNECTIONS_PER_USER=5
CONNECTION_TIMEOUT=30000
HEARTBEAT_INTERVAL=30000

# Logging
LOG_LEVEL=info
LOG_CONSOLE=true
LOG_FILE=false
```

### 2. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3001` with WebSocket endpoint at `ws://localhost:3001/socket.io/`

### 3. Connect from Client

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3001', {
  transports: ['websocket', 'polling']
});

// Authenticate
socket.emit('authenticate', { token: 'your_jwt_token' });

// Listen for events
socket.on('market:price_update', (data) => {
  console.log('Price update:', data);
});
```

## API Reference

### Connection Events

#### Client → Server

| Event | Description | Data |
|-------|-------------|------|
| `authenticate` | Authenticate with JWT token | `{ token: string }` |
| `subscribe` | Subscribe to a room | `{ room: string }` |
| `unsubscribe` | Unsubscribe from a room | `{ room: string }` |
| `ping` | Heartbeat ping | `{}` |

#### Server → Client

| Event | Description | Data |
|-------|-------------|------|
| `connected` | Connection established | `{ socketId: string, timestamp: number }` |
| `authenticated` | Authentication successful | `{ userId: string, userEmail: string, permissions: string[] }` |
| `auth_error` | Authentication failed | `{ error: string }` |
| `subscribed` | Room subscription successful | `{ room: string, timestamp: number }` |
| `unsubscribed` | Room unsubscription successful | `{ room: string, timestamp: number }` |
| `ping` | Heartbeat ping | `{ timestamp: number }` |
| `pong` | Heartbeat pong response | `{ timestamp: number }` |

### Market Data Events

#### Client → Server

| Event | Description | Data |
|-------|-------------|------|
| `market:subscribe` | Subscribe to market data | `{ pairs: string[] }` |
| `market:unsubscribe` | Unsubscribe from market data | `{ pairs: string[] }` |
| `market:get_snapshot` | Get current market data | `{ pair: string }` |
| `market:subscribe_orderbook` | Subscribe to orderbook | `{ pair: string }` |
| `market:unsubscribe_orderbook` | Unsubscribe from orderbook | `{ pair: string }` |

#### Server → Client

| Event | Description | Data |
|-------|-------------|------|
| `market:price_update` | Price update | `{ pair: string, price: number, volume: number, change24h: number }` |
| `market:orderbook_update` | Orderbook update | `{ pair: string, bids: [number, number][], asks: [number, number][] }` |
| `market:trade` | Trade execution | `{ pair: string, price: number, volume: number, side: 'buy'\|'sell' }` |

### Transaction Events

#### Client → Server

| Event | Description | Data |
|-------|-------------|------|
| `transaction:subscribe` | Subscribe to transaction updates | `{ walletId: string }` |
| `transaction:unsubscribe` | Unsubscribe from transaction updates | `{ walletId: string }` |
| `transaction:get_status` | Get transaction status | `{ hash: string }` |
| `transaction:get_history` | Get transaction history | `{ walletId: string, limit?: number }` |

#### Server → Client

| Event | Description | Data |
|-------|-------------|------|
| `transaction:pending` | Transaction pending | `{ hash: string, userId: string, walletId: string, fromAddress: string, toAddress: string, amount: number, asset: string, network: string }` |
| `transaction:confirmed` | Transaction confirmed | `{ hash: string, userId: string, walletId: string, confirmedAt: number, blockNumber?: number }` |
| `transaction:failed` | Transaction failed | `{ hash: string, userId: string, walletId: string, error: string, errorCode?: string, failedAt: number }` |

### Automation Events

#### Client → Server

| Event | Description | Data |
|-------|-------------|------|
| `automation:subscribe` | Subscribe to automation events | `{ automationIds: string[] }` |
| `automation:unsubscribe` | Unsubscribe from automation events | `{ automationIds: string[] }` |
| `automation:enable` | Enable automation | `{ automationId: string }` |
| `automation:disable` | Disable automation | `{ automationId: string }` |
| `automation:get_status` | Get automation status | `{ automationId: string }` |
| `automation:list` | List user automations | `{ walletId?: string }` |

#### Server → Client

| Event | Description | Data |
|-------|-------------|------|
| `automation:triggered` | Automation rule triggered | `{ automationId: string, userId: string, walletId: string, triggerCondition: string, triggerData: object }` |
| `automation:executed` | Automation executed | `{ automationId: string, userId: string, walletId: string, result: 'success'\|'failed', executedAt: number, transactionHash?: string, error?: string }` |
| `automation:error` | Automation error | `{ automationId: string, userId: string, walletId: string, error: string, errorCode: string, errorAt: number }` |

## Room Types

### Public Rooms (No Authentication Required)

- `market:BTC_USDC` - Bitcoin/USDC market data
- `market:ETH_USDC` - Ethereum/USDC market data
- `market:XLM_USDC` - Stellar/USDC market data
- `system:notifications` - System-wide notifications

### Private Rooms (Authentication Required)

- `user:{userId}` - User-specific updates
- `wallet:{walletId}` - Wallet-specific updates
- `automation:{automationId}` - Automation-specific updates

## Configuration

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBSOCKET_PORT` | `3001` | Server port |
| `WEBSOCKET_HOST` | `0.0.0.0` | Server host |
| `NODE_ENV` | `development` | Environment |

### Supabase Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |

### CORS Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:3001` | Allowed origins |
| `CORS_CREDENTIALS` | `true` | Allow credentials |

### Connection Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_CONNECTIONS_PER_USER` | `5` | Max connections per user |
| `CONNECTION_TIMEOUT` | `30000` | Connection timeout (ms) |
| `HEARTBEAT_INTERVAL` | `30000` | Heartbeat interval (ms) |
| `ROOM_CLEANUP_INTERVAL` | `300000` | Room cleanup interval (ms) |

### Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `LOG_CONSOLE` | `true` | Log to console |
| `LOG_FILE` | `false` | Log to file |
| `LOG_FILE_PATH` | - | Log file path |

## Health Monitoring

### Health Check Endpoint

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": 1640995200000,
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production"
}
```

### Metrics Endpoint

```bash
curl http://localhost:3001/metrics
```

Response:
```json
{
  "server": {
    "uptime": 3600,
    "memory": { "heapUsed": 12345678, "heapTotal": 16777216 },
    "cpu": { "user": 123456, "system": 78901 },
    "environment": "production",
    "version": "1.0.0"
  },
  "connections": {
    "total": 150,
    "authenticated": 120,
    "timeouts": 5,
    "heartbeats": 145
  },
  "rooms": {
    "total": 25,
    "stats": [...]
  },
  "events": {
    "queueSize": 0,
    "maxQueueSize": 1000,
    "oldestItem": null
  }
}
```

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- TypeScript 5+

### Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test

# Run linting
npm run lint

# Type checking
npm run type-check
```

### Project Structure

```
src/
├── config/           # Configuration management
├── handlers/         # Event handlers
│   ├── connection-handler.ts
│   ├── market-handler.ts
│   ├── transaction-handler.ts
│   └── automation-handler.ts
├── middleware/       # Middleware functions
│   └── auth.ts
├── services/         # Core services
│   ├── room-manager.ts
│   └── event-broadcaster.ts
├── types/           # TypeScript type definitions
│   └── websocket-types.ts
└── index.ts         # Main server file
```

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
npm run test:integration
```

### Test Coverage

```bash
npm run test:coverage
```

## Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
EXPOSE 3001

CMD ["node", "dist/index.js"]
```

### Environment Variables

Ensure all required environment variables are set in your deployment environment.

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure production Supabase credentials
- [ ] Set secure CORS origins
- [ ] Enable file logging
- [ ] Set appropriate connection limits
- [ ] Configure monitoring and alerting
- [ ] Set up SSL/TLS termination
- [ ] Configure load balancing

## Security

### Authentication

- JWT tokens are validated on every authenticated request
- Tokens are not stored in memory longer than necessary
- Rate limiting prevents abuse

### CORS

- Configure allowed origins for your domain
- Never use wildcard (`*`) in production
- Enable credentials only when necessary

### Rate Limiting

- 10 requests per minute per client
- 5-minute block duration for violations
- Automatic cleanup of expired entries

## Troubleshooting

### Common Issues

1. **Connection Timeout**
   - Check `CONNECTION_TIMEOUT` setting
   - Verify network connectivity
   - Check firewall settings

2. **Authentication Failures**
   - Verify Supabase credentials
   - Check JWT token validity
   - Ensure user exists in database

3. **Room Subscription Failures**
   - Verify room name format
   - Check authentication status
   - Ensure user has permission

4. **Event Delivery Issues**
   - Check queue size limits
   - Verify room membership
   - Check network connectivity

### Debug Mode

Set `LOG_LEVEL=debug` for detailed logging:

```bash
LOG_LEVEL=debug npm start
```

### Monitoring

Monitor the following metrics:

- Connection count
- Room membership
- Event queue size
- Memory usage
- CPU usage
- Error rates

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run linting and tests
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:

- GitHub Issues: [Create an issue](https://github.com/galaxy-devkit/galaxy-devkit/issues)
- Documentation: [Read the docs](https://docs.galaxy.dev)
- Community: [Join our Discord](https://discord.gg/galaxy-devkit)
