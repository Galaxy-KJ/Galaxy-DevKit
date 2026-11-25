# Galaxy REST API

REST API implementation for Galaxy DevKit with comprehensive authentication system.

## Features

- **JWT Authentication** - Secure user authentication using Supabase JWT tokens
- **API Key Authentication** - Server-to-server authentication with API keys
- **Rate Limiting** - Configurable rate limiting per user, API key, and IP address
- **Session Management** - Secure session handling with refresh tokens
- **User Management** - User profile and permission management
- **Security** - Password hashing, API key hashing, and comprehensive security measures

## Installation

```bash
npm install
npm run build
```

## Configuration

### Environment Variables

```env
# Supabase Configuration
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# JWT Configuration
JWT_SECRET=your-jwt-secret
JWT_EXPIRY=3600
JWT_REFRESH_EXPIRY=604800

# API Key Configuration
API_KEY_LENGTH=32
API_KEY_PREFIX_LENGTH=8

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_API_KEY_MAX=1000
RATE_LIMIT_IP_MAX=20

# Session Configuration
SESSION_EXPIRY=3600
SESSION_REFRESH_EXPIRY=604800
SESSION_CLEANUP_INTERVAL=3600000

# Security
BCRYPT_ROUNDS=12
PASSWORD_MIN_LENGTH=8

# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# KYC provider (default: mock; refused when NODE_ENV=production)
KYC_PROVIDER=mock
```

## Usage

### Starting the Server

```bash
npm start
# or
npm run dev
```

### Authentication

#### JWT Authentication

```typescript
import { authenticate } from '@galaxy/api-rest';

// Use in Express routes
app.get('/protected', authenticate(), (req, res) => {
  // req.user is available
  res.json({ user: req.user });
});
```

#### API Key Authentication

```typescript
import { requireApiKey } from '@galaxy/api-rest';

// Use in Express routes
app.get('/api/data', requireApiKey(), (req, res) => {
  // req.apiKey is available
  res.json({ apiKey: req.apiKey });
});
```

#### Optional Authentication

```typescript
import { optionalAuthenticate } from '@galaxy/api-rest';

// Use in Express routes
app.get('/public', optionalAuthenticate(), (req, res) => {
  // req.user may or may not be available
  if (req.user) {
    // User is authenticated
  }
});
```

### Rate Limiting

```typescript
import { rateLimiterMiddleware, userRateLimiter, apiKeyRateLimiter } from '@galaxy/api-rest';

// Apply rate limiting to all routes
app.use(rateLimiterMiddleware());

// Apply specific rate limiter
app.use('/api', userRateLimiter());
```

### Permission Checks

```typescript
import { requirePermission, requireAdmin } from '@galaxy/api-rest';

// Require specific permission
app.get('/admin', authenticate(), requirePermission('admin'), (req, res) => {
  // User has admin permission
});

// Require admin permission (shortcut)
app.get('/admin', authenticate(), requireAdmin(), (req, res) => {
  // User is admin
});
```

## API Endpoints

### Authentication

#### POST /api/v1/auth/login
Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "user": {
    "userId": "user-id",
    "email": "user@example.com",
    "permissions": ["user"]
  },
  "token": "jwt-token",
  "refreshToken": "refresh-token",
  "sessionToken": "session-token"
}
```

#### POST /api/v1/auth/refresh
Refresh JWT token.

**Request:**
```json
{
  "refreshToken": "refresh-token"
}
```

**Response:**
```json
{
  "accessToken": "new-jwt-token",
  "refreshToken": "new-refresh-token",
  "expiresIn": 3600,
  "refreshExpiresIn": 604800
}
```

#### POST /api/v1/auth/logout
Logout and revoke session.

**Headers:**
```text
Authorization: Bearer jwt-token
X-Session-Token: session-token
```

### API Keys

#### POST /api/v1/api-keys
Create a new API key.

**Headers:**
```text
Authorization: Bearer jwt-token
```

**Request:**
```json
{
  "name": "My API Key",
  "scopes": ["read", "write"],
  "rateLimit": 1000,
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

**Response:**
```json
{
  "apiKey": {
    "id": "api-key-id",
    "name": "My API Key",
    "keyPrefix": "abc12345",
    "scopes": ["read", "write"],
    "rateLimit": 1000,
    "expiresAt": "2024-12-31T23:59:59Z",
    "createdAt": "2024-12-01T00:00:00Z"
  },
  "key": "full-api-key-returned-only-once"
}
```

### Users

#### GET /api/v1/users/me
Get current user profile.

**Headers:**
```text
Authorization: Bearer jwt-token
```

**Response:**
```json
{
  "id": "user-id",
  "email": "user@example.com",
  "permissions": ["user"],
  "profileData": {},
  "createdAt": "2024-12-01T00:00:00Z",
  "updatedAt": "2024-12-01T00:00:00Z"
}
```

#### PUT /api/v1/users/me
Update current user profile.

**Headers:**
```text
Authorization: Bearer jwt-token
```

**Request:**
```json
{
  "profileData": {
    "name": "John Doe",
    "avatar": "https://example.com/avatar.jpg"
  }
}
```

### DeFi Operations

#### GET /api/v1/defi/swap/quote
Get a swap quote from Soroswap.

**Query Parameters:**
- `assetIn`: Asset to swap from (e.g., "XLM", "USDC:G...")
- `assetOut`: Asset to swap to
- `amountIn`: Amount to swap

#### POST /api/v1/defi/swap
Create an unsigned swap transaction for Soroswap.

**Request:**
```json
{
  "assetIn": "XLM",
  "assetOut": "USDC:G...",
  "amountIn": "100",
  "minAmountOut": "95",
  "signerPublicKey": "GD..."
}
```

#### GET /api/v1/defi/blend/position/:publicKey
Get a user's position, supplied and borrowed assets in Blend.

#### POST /api/v1/defi/blend/supply
Create an unsigned supply transaction for Blend.

**Request:**
```json
{
  "asset": "USDC:G...",
  "amount": "100",
  "signerPublicKey": "GD..."
}
```

#### POST /api/v1/defi/blend/withdraw
Create an unsigned withdraw transaction for Blend (similar body to supply).

#### POST /api/v1/defi/blend/borrow
Create an unsigned borrow transaction for Blend (similar body to supply).

#### POST /api/v1/defi/blend/repay
Create an unsigned repay transaction for Blend (similar body to supply).


## Security

### Password Security
- Passwords are hashed using bcrypt with 12 salt rounds
- Minimum password length is 8 characters
- Password strength validation

### API Key Security
- API keys are hashed using SHA-256 before storage
- Only key prefix is stored for display
- API keys can be revoked and expired
- Rate limiting per API key

### JWT Security
- Tokens are validated via Supabase
- Token expiration is enforced
- Refresh token rotation
- Email confirmation required

### Rate Limiting
- Per-user rate limiting (100 requests per 15 minutes)
- Per-API-key rate limiting (configurable, default 1000 requests per 15 minutes)
- IP-based rate limiting (20 requests per 15 minutes)
- Configurable per endpoint

## Error Handling

All errors are returned in a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message",
    "details": {}
  }
}
```

### Error Codes

- `AUTH_ERROR` - Authentication error
- `INVALID_TOKEN` - Invalid JWT token
- `EXPIRED_TOKEN` - Expired JWT token
- `MISSING_TOKEN` - Missing authentication token
- `INVALID_API_KEY` - Invalid API key
- `EXPIRED_API_KEY` - Expired API key
- `REVOKED_API_KEY` - Revoked API key
- `INSUFFICIENT_PERMISSIONS` - Insufficient permissions
- `RATE_LIMIT_EXCEEDED` - Rate limit exceeded
- `VALIDATION_ERROR` - Validation error
- `USER_NOT_FOUND` - User not found

## Development

### Running Tests

```bash
npm test
```

### Building

```bash
npm run build
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## Database Migration

Run the database migration to create the required tables:

```bash
npx supabase migration up
```

The migration creates:
- `api_keys` table - For API key storage
- `api_sessions` table - For session management

## License

MIT


## Custom metrics and KPIs (issue #413)

Apply `20261125000000_custom_metrics.sql` and `20261125000001_custom_metric_alerts.sql` before deploying the API and worker. All routes below are under `/api/v1/metrics`, require the existing authentication middleware, and produce audit records through the existing request audit middleware.

| Method | Path | Result |
| --- | --- | --- |
| GET / POST | `/definitions` | List owned definitions / create one |
| PATCH / PUT / DELETE | `/definitions/:id` | Partially update / replace / delete an owned definition |
| POST | `/preview` | Evaluate a complete unsaved definition without writes |
| GET | `/:id/value?asset=XLM` | Current/previous values; optional supported source filters |
| GET | `/:id/series?start=2026-11-01T00:00:00Z&end=2026-11-02T00:00:00Z&bucketMs=3600000` | Historical, half-open buckets; explicit bucket size required |
| GET / POST | `/export` / `/import` | Versioned JSON portability; imports allocate new IDs and remap internal references atomically |

Example definition (POST `/definitions`, or `/preview`):

```json
{
  "name": "Daily XLM transferred",
  "source": "transactions",
  "aggregation": "sum",
  "field": "amount",
  "window": "24h",
  "filters": { "asset": "XLM", "status": "completed" },
  "dimensions": [],
  "unit": "XLM",
  "target": 100,
  "direction": "higher_is_better"
}
```

Use the actual persisted status values for your deployment. Transaction amounts remain recorded asset units: filter or group by `asset` for numeric aggregates. The API rejects a USD unit for transaction amounts because the database does not record a USD valuation.

Supported persisted sources:

| Source | Recorded table | Dimensions | Numeric fields |
| --- | --- | --- | --- |
| `transactions` | `transactions` scoped by `user_id` | asset, protocol (metadata.protocol), network, wallet, user | amount |
| `oracle_prices` | shared `market_data` | asset (symbol), protocol (feed source) | price, volume_24h |
| `automation_executions` | `automation_execution_attempts`, owner via automations | wallet, user | none; count/rate/distinct_count available |

`id` is available for counting/distinct counting; transaction and execution `status` can be filtered or counted distinctly. Missing metadata dimensions appear as null. Oracle rows are shared market observations; metric definitions and snapshots remain private to their owner. There is no organization/team sharing in this persisted-data implementation.

Wallet events, DeFi position history, API request history, team/endpoint dimensions, and historical USD transaction valuations are unavailable in the current schema and are rejected. This change does not introduce recording or valuation pipelines. In particular, the issue's API-error-rate and USD-volume examples cannot be calculated honestly from existing rows.

Aggregations: `count`, `sum`, `avg`, `min`, `max`, `p50`, `p95`, `p99`, `rate`, `distinct_count`. Percentiles use linear interpolation; rate is events per second. Numeric aggregates ignore null/non-numeric values and return null for an empty sample; count and distinct_count return zero. Numeric arithmetic uses JavaScript finite numbers, not accounting-grade decimal precision.

Windows: `5m`, `1h`, `24h`, `7d`, `30d`, `day_to_date`, `week_to_date`, `month_to_date`. Calendar boundaries are UTC, weeks begin Monday, and the previous period compares equal elapsed time capped by the previous month's length. Values include absolute delta, target attainment and direction-aware trend. Grouped results compare the same dimension tuples. Missing groups remain null rather than implying zero.

Derived definitions use `source: "derived"`, `field: "id"`, `aggregation: "count"` (ignored for derived arithmetic), `expression: "volume / executions"`, and `references: { "volume": "<metric UUID>", "executions": "<metric UUID>" }`. References must belong to the caller and share window and dimensions. Only numbers, named references, parentheses and `+ - * /` are supported. Cycles, unknown references and executable syntax are rejected; missing values and division by zero produce null. Put source filters on referenced definitions; derived definitions do not accept override filters.

Limits: 50 definitions per user, 10 direct references, 1,024 expression characters, 128 tokens, depth 16, 5,000 rows per source period and 20,000 rows per whole evaluation. Creates, updates and imports check exact current/previous source row counts before saving; the evaluation checks the budget again as data grows. Source requests use an eight-second abort deadline. Limit failures return 422 and timeouts 408, never partial totals. Historical series provide on-demand backfill over at most 60 days and 120 buckets, minimum one-minute buckets; the same total row budget applies. Backfill reads existing records, not unrecorded history.

The existing #343 cache stores owner/revision/filter-scoped results with TTLs of 15 seconds (`5m`), 60 seconds (`1h`) and five minutes (other windows), with stale-while-revalidate disabled. A changed dependency revision changes the cache key. The existing worker entry point also materializes enabled definitions in non-overlapping batches of ten every minute, with a rotating cursor. Run one scheduler instance; larger deployments can take multiple ticks to refresh every definition. On-demand evaluation remains bounded for all windows. Snapshots expire and are checked before reuse.

Custom threshold alerts use POST `/api/v1/monitoring/alerts` with `alertType: "custom_metric_above"` or `"custom_metric_below"`, `protocol: "custom"`, `customMetricId`, numeric `threshold`, `channel: "webhook"`, existing `channelConfig` and cooldown options. Omit `accountAddress`. The referenced metric must be enabled, owned by the alert user and ungrouped. Alert references are stored with a composite owner foreign key; deletion of referenced metrics fails. The existing worker persists events and dispatches webhooks using the existing cooldown/delivery path. Email/WebSocket delivery and the worker's pre-existing retry-loop limitation are not expanded here.

The analytics dashboard displays custom KPI cards separately from wallet portfolio data. Hosts should call `panel.setMetricsJwt(sessionToken)` on sign-in/token refresh and `panel.setMetricsJwt(undefined)` on logout; tokens stay in memory. Click **Load custom metrics**, or inject `loadCustomMetrics` for a host-managed session. Names, units and dimensions are rendered as text.

Verification:

```bash
npm test -w @galaxy-kj/api-rest -- --runInBand src/services/metrics src/worker/__tests__/position-monitor.worker.test.ts
npm test -w @galaxy-kj/frontend -- --runInBand src/tests/analytics-dashboard.panel.test.ts
# In a disposable test dependency directory, install @electric-sql/pglite.
# Set PGLITE_MODULE to its absolute package path if not locally resolvable.
node supabase/tests/custom-metrics.test.cjs
```

The PostgreSQL test creates an isolated in-memory schema and tests migrations, RLS, transactional rollback, cycles, owner boundaries and alert references; it never connects to a deployed database.
