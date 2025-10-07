# 🌟 Galaxy DevKit

**The Ultimate Development Framework for Stellar Ecosystem**

Galaxy DevKit provides both **APIs** and **CLI tools** to build Stellar applications with ease.

## 🚀 What is Galaxy DevKit?

**Galaxy DevKit** is a comprehensive development framework for the Stellar ecosystem that provides both APIs and CLI tools to build Stellar applications with ease.

**CLI (Command Line Interface)** - A powerful command-line tool that lets developers create, build, and deploy Stellar projects with simple commands like `galaxy create my-app` or `galaxy dev`.

**APIs** - REST, GraphQL, and WebSocket endpoints that provide direct access to Stellar operations, wallet management, and smart contract interactions for integration into existing applications.

**Project Structure** - Organized as a monorepo with core packages (Stellar SDK), CLI tools, smart contracts (Rust), and comprehensive documentation, making it easy for developers to build full-stack Stellar applications.

### Key Features:

- **🌐 APIs** - REST, GraphQL, WebSocket endpoints for Stellar operations
- **🛠️ CLI Tools** - Command-line interface for creating Stellar projects
- **📦 SDKs** - TypeScript, Python, JavaScript SDKs
- **🔗 Smart Contracts** - Rust-based Soroban contracts
- **🗄️ Database** - Supabase integration for data management

## 📚 Documentation

- [Documentation](./docs/) - Complete documentation
- [User Guides](./docs/guides/) - How to use Galaxy DevKit
- [API Documentation](./docs/api/) - API reference
- [Examples](./docs/examples/) - Real-world examples
- [Architecture](./docs/architecture/) - System architecture
- [Contributing Guide](./CONTRIBUTING.md) - **Contributor setup guide**

---

## 🚀 Quick Start for Contributors

### Prerequisites
- **Node.js** 18+
- **Rust** 1.70+
- **Docker Desktop** (for Supabase)
- **Git**

### Setup Development Environment

```bash
# 1. Clone the repository
git clone https://github.com/galaxy-devkit/galaxy-devkit.git
cd galaxy-devkit

# 2. Install dependencies
npm install

# 3. Setup Supabase (Database)
# Start Docker Desktop first, then:
npx supabase start

# 4. Build the project
npm run build

# 5. Test CLI
cd tools/cli
npm run build
npm link
galaxy help
```

### 🗄️ Database Setup

**Each contributor needs their own Supabase instance:**

```bash
# Start Docker Desktop
open -a Docker

# Start Supabase local development
npx supabase start

# Verify database is running
npx supabase status

# Access Supabase Studio (Web Interface)
open http://127.0.0.1:54323
```

**Database URLs:**
- **API URL**: `http://127.0.0.1:54321`
- **Database URL**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **GraphQL URL**: `http://127.0.0.1:54321/graphql/v1`

### 🔧 Environment Variables

```bash
# Copy environment template
cp env.example .env.local

# Get your Supabase keys
npx supabase status

# Update .env.local with your keys
```

## 🏗️ Project Structure

```
galaxy-devkit/
├── packages/                    # Core packages
│   └── core/stellar-sdk/       # Stellar SDK wrapper
├── tools/cli/                  # CLI implementation
├── contracts/                  # Smart contracts (Rust)
│   ├── smart-swap/
│   └── security-limits/
├── supabase/                   # Database configuration
└── docs/                       # Documentation
```

## 📝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit changes: `git commit -m 'feat: add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

**Built with ❤️ for the Stellar ecosystem**