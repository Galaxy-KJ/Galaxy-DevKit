#!/bin/bash

# 🚀 Galaxy DevKit - Publish to GitHub Packages
# This script helps publish all packages to GitHub Packages

set -e  # Exit on error

echo "🌌 Galaxy DevKit - Publishing to GitHub Packages"
echo "================================================="
echo ""

# Check if logged in to npm
echo "📝 Checking npm authentication..."
if ! npm whoami &> /dev/null; then
    echo "❌ Not logged in to npm. Please login first:"
    echo "   npm login --registry=https://npm.pkg.github.com"
    exit 1
fi

echo "✅ Authenticated"
echo ""

# Build all packages
echo "🔨 Building all packages..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix errors and try again."
    exit 1
fi

echo "✅ Build successful"
echo ""

# Ask for confirmation
echo "📦 Ready to publish the following packages:"
echo "   - @galaxy/core-defi-protocols"
echo "   - @galaxy/core-oracles"
echo "   - @galaxy/core-stellar-sdk"
echo "   - @galaxy/core-invisible-wallet"
echo "   - @galaxy/core-automation"
echo "   - @galaxy/cli"
echo ""

read -p "Do you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Publish cancelled"
    exit 0
fi

echo ""
echo "🚀 Publishing packages..."
echo ""

# Publish with Lerna
npx lerna publish --registry=https://npm.pkg.github.com

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All packages published successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Verify packages at: https://github.com/orgs/galaxy-devkit/packages"
    echo "   2. Test installation in a new project"
    echo "   3. Update CHANGELOG.md"
    echo ""
else
    echo ""
    echo "❌ Publish failed. Check errors above."
    exit 1
fi
