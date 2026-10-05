#!/bin/bash

# 🚀 Galaxy DevKit - Pre-Publish Script
# This script prepares all packages for publishing to npm

set -e  # Exit on error

echo "🌌 Galaxy DevKit - Pre-Publish Check"
echo "====================================="
echo ""

# Check if node and npm are installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js $(node --version)"
echo "✅ npm $(npm --version)"
echo ""

# Check if logged in to npm
echo "📝 Checking npm authentication..."
if ! npm whoami &> /dev/null; then
    echo "❌ Not logged in to npm."
    echo ""
    echo "Please login to npm first:"
    echo "  npm login"
    echo ""
    echo "You'll need:"
    echo "  - npm username"
    echo "  - npm password"
    echo "  - email"
    echo ""
    exit 1
fi

echo "✅ Logged in as: $(npm whoami)"
echo ""

# Clean previous builds
echo "🧹 Cleaning previous builds..."
npm run clean

if [ $? -ne 0 ]; then
    echo "⚠️  Clean failed, but continuing..."
fi

echo ""

# Build all packages
echo "🔨 Building all packages..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix errors and try again."
    exit 1
fi

echo ""

# Verify builds
echo "🔍 Verifying builds..."
MISSING_BUILDS=0

for package in packages/core/defi-protocols packages/core/oracles packages/core/stellar-sdk packages/core/invisible-wallet packages/core/automation tools/cli; do
    if [ ! -d "$package/dist" ]; then
        echo "❌ Missing dist/ in $package"
        MISSING_BUILDS=1
    else
        FILE_COUNT=$(find "$package/dist" -type f | wc -l | tr -d ' ')
        echo "✅ $package/dist/ ($FILE_COUNT files)"
    fi
done

if [ $MISSING_BUILDS -eq 1 ]; then
    echo ""
    echo "❌ Some packages are missing dist/ folders"
    exit 1
fi

echo ""
echo "✅ All builds successful!"
echo ""
echo "📋 Package Status:"
echo "   - @galaxy-kj/core-defi-protocols ✅"
echo "   - @galaxy-kj/core-oracles ✅"
echo "   - @galaxy-kj/core-stellar-sdk ✅"
echo "   - @galaxy-kj/core-invisible-wallet ✅"
echo "   - @galaxy-kj/core-automation ✅"
echo "   - @galaxy-kj/cli ✅"
echo ""
echo "🎉 Ready to publish!"
echo ""
echo "Next steps:"
echo "  1. Review changes with: git status"
echo "  2. Run tests: npm test"
echo "  3. Publish: ./scripts/publish-to-npm.sh"
echo ""
