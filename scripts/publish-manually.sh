#!/bin/bash

# Manual Publish Script
# Publishes the 6 main packages to npm one by one

set -e

echo "🚀 Publishing Galaxy DevKit Packages Manually"
echo "=============================================="
echo ""

# Check npm auth
if ! npm whoami &> /dev/null; then
    echo "❌ Not logged in to npm. Please run: npm login"
    exit 1
fi

echo "✅ Logged in as: $(npm whoami)"
echo ""

# Packages to publish (in order)
packages=(
    "packages/core/oracles"
    "packages/core/defi-protocols"
    "packages/core/stellar-sdk"
    "packages/core/invisible-wallet"
    "packages/core/automation"
    "tools/cli"
)

echo "📦 Will publish 6 packages:"
for pkg in "${packages[@]}"; do
    name=$(cat "$pkg/package.json" | grep '"name"' | head -1 | cut -d'"' -f4)
    version=$(cat "$pkg/package.json" | grep '"version"' | head -1 | cut -d'"' -f4)
    echo "   - $name@$version"
done
echo ""

read -p "Continue with publication? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "❌ Cancelled"
    exit 0
fi

echo ""
echo "🚀 Publishing packages..."
echo ""

success=0
failed=0

for pkg in "${packages[@]}"; do
    name=$(cat "$pkg/package.json" | grep '"name"' | head -1 | cut -d'"' -f4)
    echo "📦 Publishing $name..."

    if (cd "$pkg" && npm publish 2>&1); then
        echo "✅ $name published successfully"
        success=$((success + 1))
    else
        echo "❌ Failed to publish $name"
        failed=$((failed + 1))
    fi
    echo ""
done

echo "=============================================="
echo "📊 Publication Summary:"
echo "   ✅ Success: $success/6"
if [ $failed -gt 0 ]; then
    echo "   ❌ Failed: $failed/6"
fi
echo ""

if [ $success -eq 6 ]; then
    echo "🎉 All packages published successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Verify: https://www.npmjs.com/search?q=%40galaxy-kj"
    echo "  2. Test install: npm install @galaxy-kj/core-defi-protocols"
    echo "  3. Push to GitHub: git push origin main --tags"
    exit 0
else
    echo "⚠️ Some packages failed to publish"
    exit 1
fi
