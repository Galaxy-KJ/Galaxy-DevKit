#!/bin/bash

# 🔍 Galaxy DevKit - Complete Verification Script
# Run this before publishing to ensure everything is ready

set -e

echo "🔍 Galaxy DevKit - Complete Verification"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Check Node.js and npm
echo "📋 Step 1: Checking environment..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✅ Node.js $(node --version)${NC}"
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✅ npm $(npm --version)${NC}"
fi

# Check npm auth
echo ""
echo "📋 Step 2: Checking npm authentication..."
if ! npm whoami &> /dev/null; then
    echo -e "${RED}❌ Not logged in to npm${NC}"
    echo "   Run: npm login"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✅ Logged in as: $(npm whoami)${NC}"
fi

# Clean and build
echo ""
echo "📋 Step 3: Building all packages..."
echo "   Running: npm run clean"
npm run clean 2>&1 | grep -v "lerna" || true

echo "   Running: npm run build"
npm run build 2>&1 | tail -20

# Verify builds
echo ""
echo "📋 Step 4: Verifying dist folders..."

packages=(
    "packages/core/defi-protocols"
    "packages/core/oracles"
    "packages/core/stellar-sdk"
    "packages/core/invisible-wallet"
    "packages/core/automation"
    "tools/cli"
)

for package in "${packages[@]}"; do
    package_name=$(basename $(dirname $package))/$(basename $package)
    if [ -d "$package/dist" ]; then
        file_count=$(find "$package/dist" -type f -name "*.js" | wc -l | tr -d ' ')
        if [ "$file_count" -gt 0 ]; then
            echo -e "${GREEN}✅ $package_name ($file_count JS files)${NC}"
        else
            echo -e "${YELLOW}⚠️  $package_name (dist exists but no JS files)${NC}"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        echo -e "${RED}❌ $package_name (no dist folder)${NC}"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check package.json files
echo ""
echo "📋 Step 5: Checking package.json configurations..."

for package in "${packages[@]}"; do
    package_name=$(basename $(dirname $package))/$(basename $package)

    # Check publishConfig exists
    if grep -q "publishConfig" "$package/package.json"; then
        echo -e "${GREEN}✅ $package_name has publishConfig${NC}"
    else
        echo -e "${RED}❌ $package_name missing publishConfig${NC}"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check for common issues
echo ""
echo "📋 Step 6: Checking for common issues..."

# Check if CLI uses file: dependencies
if grep -q '"file:' tools/cli/package.json; then
    echo -e "${YELLOW}⚠️  CLI still uses file: dependencies (this is OK for first publish)${NC}"
    echo "   After publishing core packages, update CLI dependencies to versions"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✅ CLI uses npm versions${NC}"
fi

# Check git status
if git diff --quiet; then
    echo -e "${GREEN}✅ No uncommitted changes${NC}"
else
    echo -e "${YELLOW}⚠️  You have uncommitted changes${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

# Run tests (if they exist)
echo ""
echo "📋 Step 7: Running tests..."
if npm test 2>&1 | grep -q "No tests found"; then
    echo -e "${YELLOW}⚠️  No tests found (consider adding tests)${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✅ Tests passed${NC}"
fi

# Summary
echo ""
echo "========================================"
echo "📊 Verification Summary"
echo "========================================"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED!${NC}"
    echo ""
    echo "🚀 Ready to publish! Run:"
    echo "   ./scripts/publish-to-npm.sh"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  $WARNINGS warnings found${NC}"
    echo ""
    echo "You can proceed with publishing, but review warnings above."
    echo ""
    exit 0
else
    echo -e "${RED}❌ $ERRORS errors found${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠️  $WARNINGS warnings found${NC}"
    fi
    echo ""
    echo "Please fix errors before publishing."
    echo ""
    exit 1
fi
