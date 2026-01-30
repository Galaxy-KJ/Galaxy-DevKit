#!/bin/bash

# Switch from GitHub Packages to npm public registry

echo "🔄 Switching to npm public registry..."
echo ""

# Find all package.json files (excluding node_modules)
find . -name "package.json" -not -path "*/node_modules/*" -type f | while read -r file; do
    echo "Processing: $file"

    # Remove publishConfig section using perl (works on macOS)
    perl -i -0pe 's/,?\s*"publishConfig":\s*\{[^}]*\}//gs' "$file"

    # Clean up any double commas or trailing commas before closing braces
    perl -i -pe 's/,(\s*[}\]])/$1/g' "$file"
    perl -i -pe 's/,,/,/g' "$file"
done

echo ""
echo "✅ Done! All packages configured for npm public registry"
echo ""
echo "Next steps:"
echo "1. Create npm account: https://www.npmjs.com/signup"
echo "2. Login: npm login"
echo "3. Verify: npm whoami"
echo "4. Publish: npm run build && npx lerna publish"
