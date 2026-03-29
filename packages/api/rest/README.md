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

