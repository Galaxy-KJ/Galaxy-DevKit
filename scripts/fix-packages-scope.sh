#!/bin/bash

# Fix package scope and repository URLs to match actual GitHub owner

echo "🔧 Fixing package scopes and repository URLs..."
echo "Changing: @galaxy -> @galaxy-kj"
echo "Changing: galaxy-devkit/galaxy-devkit -> Galaxy-KJ/Galaxy-DevKit"
echo ""

# Find all package.json files (excluding node_modules)
find . -name "package.json" -not -path "*/node_modules/*" -type f | while read -r file; do
    echo "Processing: $file"

    # Replace scope in package name
    sed -i '' 's/"@galaxy\//"@galaxy-kj\//g' "$file"

    # Replace repository URL
    sed -i '' 's/galaxy-devkit\/galaxy-devkit/Galaxy-KJ\/Galaxy-DevKit/g' "$file"

    # Replace dependencies with old scope
    sed -i '' 's/"@galaxy\/core-/"@galaxy-kj\/core-/g' "$file"
    sed -i '' 's/"@galaxy\/cli/"@galaxy-kj\/cli/g' "$file"
done

echo ""
echo "✅ Done! All packages updated to @galaxy-kj scope"
echo ""
echo "Next steps:"
echo "1. Update ~/.npmrc:"
echo "   @galaxy-kj:registry=https://npm.pkg.github.com"
echo ""
echo "2. Test authentication:"
echo "   npm whoami --registry=https://npm.pkg.github.com"
echo ""
echo "3. Publish:"
echo "   npm run build"
echo "   npx lerna publish --registry=https://npm.pkg.github.com"
