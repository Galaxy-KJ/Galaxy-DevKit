# ✅ npm Publish Checklist

Use this checklist before publishing Galaxy DevKit packages to npm.

---

## 🔐 Step 1: npm Authentication

- [ ] Have npm account (create at https://www.npmjs.com/signup)
- [ ] Email verified
- [ ] 2FA enabled (required for publishing)
- [ ] Have access to `@galaxy-kj` scope

**Login to npm:**
```bash
npm login
# Enter: username, password, email, 2FA code
```

**Verify login:**
```bash
npm whoami
# Should show your npm username
```

---

## 🛠️ Step 2: Pre-Publish Preparation

- [ ] All changes committed to git
- [ ] All tests passing: `npm test`
- [ ] No lint errors: `npm run lint`
- [ ] TypeScript compiles: `npm run type-check`

**Run automated pre-publish script:**
```bash
./scripts/pre-publish.sh
```

This script will:
- ✅ Check npm authentication
- ✅ Clean previous builds
- ✅ Install dependencies
- ✅ Build all packages
- ✅ Verify all dist/ folders exist

---

## 📦 Step 3: Verify Package Contents

Check that each package has:

- [ ] `packages/core/defi-protocols/dist/` exists with compiled JS/TS
- [ ] `packages/core/oracles/dist/` exists with compiled JS/TS
- [ ] `packages/core/stellar-sdk/dist/` exists with compiled JS/TS
- [ ] `packages/core/invisible-wallet/dist/` exists with compiled JS/TS
- [ ] `packages/core/automation/dist/` exists with compiled JS/TS
- [ ] `tools/cli/dist/` exists with compiled JS/TS

**Quick check:**
```bash
ls -la packages/core/*/dist tools/cli/dist
```

---

## 🚀 Step 4: Publish to npm

### Option A: Use Lerna (Recommended)

```bash
./scripts/publish-to-npm.sh
```

OR manually:

```bash
npx lerna publish
```

Lerna will:
1. Ask you which version to bump (patch/minor/major)
2. Update all package.json files
3. Create git tag
4. Publish to npm
5. Push changes to GitHub

### Option B: Manual Publish (if Lerna fails)

**Publish core packages first:**
```bash
cd packages/core/defi-protocols && npm publish && cd ../../..
cd packages/core/oracles && npm publish && cd ../../..
cd packages/core/stellar-sdk && npm publish && cd ../../..
cd packages/core/invisible-wallet && npm publish && cd ../../..
cd packages/core/automation && npm publish && cd ../../..
```

**Then update CLI dependencies:**
```bash
# Edit tools/cli/package.json
# Change:
#   "@galaxy-kj/core-defi-protocols": "file:../../packages/core/defi-protocols"
# To:
#   "@galaxy-kj/core-defi-protocols": "^1.0.0"

# Then publish CLI
cd tools/cli && npm publish && cd ../..
```

---

## ✅ Step 5: Verify Publication

- [ ] Check npmjs.com: https://www.npmjs.com/search?q=%40galaxy-kj
- [ ] All 6 packages visible
- [ ] Version numbers correct
- [ ] README renders correctly

**Test installation in new project:**
```bash
mkdir /tmp/test-galaxy && cd /tmp/test-galaxy
npm init -y
npm install @galaxy-kj/core-defi-protocols
node -e "console.log(require('@galaxy-kj/core-defi-protocols'))"
```

- [ ] Installation successful
- [ ] No errors on import
- [ ] TypeScript types available

---

## 📝 Step 6: Post-Publish

- [ ] Create GitHub release with changelog
- [ ] Update main README.md with new version
- [ ] Announce on social media / Discord / Telegram
- [ ] Update documentation if needed

**Create GitHub release:**
```bash
gh release create v1.0.0 --title "Release v1.0.0" --notes "
### 🚀 Features
- Initial public release
- Blend Protocol integration
- Oracle system
- CLI tool

### 📦 Packages
- @galaxy-kj/core-defi-protocols@1.0.0
- @galaxy-kj/core-oracles@1.0.0
- @galaxy-kj/core-stellar-sdk@1.0.0
- @galaxy-kj/core-invisible-wallet@1.0.0
- @galaxy-kj/core-automation@1.0.0
- @galaxy-kj/cli@1.0.0
"
```

---

## 🐛 Troubleshooting

### "npm ERR! 403 Forbidden"
- You don't have permission to publish under `@galaxy-kj`
- Contact org admin or change scope to your username

### "npm ERR! 404 Not Found"
- Scope `@galaxy-kj` doesn't exist yet
- Create it: https://www.npmjs.com/org/create
- Or use your username: `@yourusername/core-defi-protocols`

### "npm ERR! need auth"
- Not logged in: `npm login`
- Session expired (2 hours): login again
- Wrong registry: `npm config set registry https://registry.npmjs.org/`

### Build errors
- Run `npm run clean`
- Delete node_modules: `rm -rf node_modules package-lock.json`
- Reinstall: `npm install`
- Build again: `npm run build`

### CLI still uses `file:` dependencies
- This is OK for first publish
- After core packages are on npm, update CLI:
  1. Edit `tools/cli/package.json`
  2. Change `file:` to version numbers
  3. Publish CLI: `cd tools/cli && npm publish`

---

## 📚 Resources

- [npm Publishing Guide](https://docs.npmjs.com/cli/v10/commands/npm-publish)
- [Lerna Documentation](https://lerna.js.org/docs/features/version-and-publish)
- [Semantic Versioning](https://semver.org/)
- [Full Publishing Guide](./PUBLISHING.md)
- [Installation Guide](./INSTALLATION.md)

---

## ✨ Quick Reference

```bash
# Full workflow
npm login
./scripts/pre-publish.sh
./scripts/publish-to-npm.sh

# Verify
open https://www.npmjs.com/search?q=%40galaxy-kj
npm install -g @galaxy-kj/cli
galaxy --version
```
