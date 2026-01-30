#!/bin/bash

# 🧪 Test Build All Packages
# Quick script to test if all packages compile

set -e

echo "🧪 Testing Build - All Packages"
echo "================================"
echo ""

# Clean first
echo "🧹 Cleaning..."
npm run clean 2>&1 | grep -v "lerna" || true
echo ""

# Build
echo "🔨 Building all packages..."
npm run build

echo ""
echo "================================"
echo "✅ Build completed!"
echo ""
echo "📦 Checking dist folders..."

packages=(
    "packages/core/defi-protocols"
    "packages/core/oracles"
    "packages/core/stellar-sdk"
    "packages/core/invisible-wallet"
    "packages/core/automation"
    "tools/cli"
)

success=0
for package in "${packages[@]}"; do
    if [ -d "$package/dist" ]; then
        file_count=$(find "$package/dist" -type f -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
        if [ "$file_count" -gt 0 ]; then
            echo "✅ $package ($file_count JS files)"
            success=$((success + 1))
        else
            echo "⚠️  $package (dist exists but no JS files)"
        fi
    else
        echo "❌ $package (no dist folder)"
    fi
done

echo ""
echo "================================"
echo "📊 Result: $success/6 packages built successfully"
echo ""

if [ $success -eq 6 ]; then
    echo "🎉 All packages compiled successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Decide on scope: @galaxy-kj or @kevinbrenes"
    echo "  2. Run: ./scripts/publish-to-npm.sh"
    exit 0
else
    echo "⚠️  Some packages didn't compile completely"
    echo "Review errors above"
    exit 1
fi
