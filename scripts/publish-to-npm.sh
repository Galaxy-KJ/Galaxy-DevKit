#!/bin/bash

# 🚀 Galaxy DevKit - Publish to npm
# This script publishes all packages to npm public registry

set -e  # Exit on error

echo "🌌 Galaxy DevKit - Publishing to npm"
echo "===================================="
echo ""

# Check if logged in to npm
echo "📝 Checking npm authentication..."
if ! npm whoami &> /dev/null; then
    echo "❌ Not logged in to npm. Please login first:"
    echo "   npm login"
    exit 1
fi

echo "✅ Authenticated as: $(npm whoami)"
echo ""

# Check if builds exist
echo "🔍 Checking builds..."
MISSING_BUILDS=0

for package in packages/core/defi-protocols packages/core/oracles packages/core/stellar-sdk packages/core/invisible-wallet packages/core/automation tools/cli; do
    if [ ! -d "$package/dist" ]; then
        echo "❌ Missing dist/ in $package"
        MISSING_BUILDS=1
    fi
done

if [ $MISSING_BUILDS -eq 1 ]; then
    echo ""
    echo "❌ Some packages are missing dist/ folders"
    echo "Run this first: ./scripts/pre-publish.sh"
    exit 1
fi

echo "✅ All builds found"
echo ""

# Show what will be published
echo "📦 Packages to publish:"
echo "   1. @galaxy-kj/core-defi-protocols"
echo "   2. @galaxy-kj/core-oracles"
echo "   3. @galaxy-kj/core-stellar-sdk"
echo "   4. @galaxy-kj/core-invisible-wallet"
echo "   5. @galaxy-kj/core-automation"
echo "   6. @galaxy-kj/cli"
echo ""

read -p "Do you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Publish cancelled"
    exit 0
fi

echo ""
echo "🚀 Publishing packages..."
echo ""

# Option 1: Use Lerna (recommended)
if command -v npx &> /dev/null; then
    echo "📦 Using Lerna to publish..."
    npx lerna publish --registry https://registry.npmjs.org

    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ All packages published successfully!"
        echo ""
        echo "📋 Next steps:"
        echo "   1. Verify packages at: https://www.npmjs.com/settings/galaxy-kj/packages"
        echo "   2. Test installation: npm install @galaxy-kj/core-defi-protocols"
        echo "   3. Update CLI dependencies from file: to ^1.0.0"
        echo ""
    else
        echo ""
        echo "❌ Publish failed. Check errors above."
        exit 1
    fi
else
    # Option 2: Manual publish
    echo "📦 Publishing manually (Lerna not available)..."
    echo ""

    # Publish core packages first
    echo "Publishing @galaxy-kj/core-defi-protocols..."
    cd packages/core/defi-protocols && npm publish && cd ../../..

    echo "Publishing @galaxy-kj/core-oracles..."
    cd packages/core/oracles && npm publish && cd ../../..

    echo "Publishing @galaxy-kj/core-stellar-sdk..."
    cd packages/core/stellar-sdk && npm publish && cd ../../..

    echo "Publishing @galaxy-kj/core-invisible-wallet..."
    cd packages/core/invisible-wallet && npm publish && cd ../../..

    echo "Publishing @galaxy-kj/core-automation..."
    cd packages/core/automation && npm publish && cd ../../..

    echo ""
    echo "⚠️  CLI NOT published yet!"
    echo "   First update tools/cli/package.json:"
    echo "   Change:"
    echo '     "@galaxy-kj/core-defi-protocols": "file:../../packages/core/defi-protocols"'
    echo "   To:"
    echo '     "@galaxy-kj/core-defi-protocols": "^1.0.0"'
    echo ""
    echo "   Then run:"
    echo "     cd tools/cli && npm publish"
    echo ""

    echo "✅ Core packages published!"
fi
