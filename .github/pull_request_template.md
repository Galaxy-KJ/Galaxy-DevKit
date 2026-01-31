# Pull Request

## 📋 Description

<!-- Provide a clear description of the changes -->

## 🔗 Related Issues

Closes #issue-number

## 🧪 Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] All tests passing locally

## 📚 Documentation Updates (Required)

<!-- ⚠️ IMPORTANT: Update all relevant documentation before merging -->

- [ ] Updated `docs/AI.md` with new patterns/examples
- [ ] Updated API reference in relevant package README
- [ ] Added/updated code examples
- [ ] Updated ARCHITECTURE.md (if architecture changed)
- [ ] Added inline JSDoc/TSDoc comments
- [ ] Updated ROADMAP.md progress (mark issue as completed)

### Documentation Checklist by Component:

#### If you modified `packages/core/stellar-sdk/`:
- [ ] Updated `packages/core/stellar-sdk/README.md`
- [ ] Added examples to `docs/examples/stellar-sdk/`
- [ ] Updated type definitions documentation

#### If you modified `packages/core/invisible-wallet/`:
- [ ] Updated `packages/core/invisible-wallet/README.md`
- [ ] Added security notes to `docs/SECURITY.md`
- [ ] Updated wallet flow diagrams in `docs/ARCHITECTURE.md`

#### If you modified `packages/core/automation/`:
- [ ] Updated `packages/core/automation/README.md`
- [ ] Added automation examples to `docs/examples/automation/`
- [ ] Updated trigger/action types in docs

#### If you modified `packages/core/defi-protocols/`:
- [ ] Updated `packages/core/defi-protocols/README.md`
- [ ] Added protocol integration guide
- [ ] Updated DeFi architecture section in `docs/ARCHITECTURE.md`

#### If you modified `packages/core/oracles/`:
- [ ] Updated `packages/core/oracles/README.md`
- [ ] Added oracle source documentation
- [ ] Updated price feed examples

#### If you modified `packages/contracts/`:
- [ ] Added Rust documentation comments (///)
- [ ] Updated contract README with deployment instructions
- [ ] Added contract interaction examples

#### If you modified `tools/cli/`:
- [ ] Updated CLI command documentation
- [ ] Added command examples to README
- [ ] Updated help text in command definitions

## 🤖 AI-Friendly Documentation

<!-- Help AI assistants understand your changes -->

### New Files Created

```
List all new files with brief description:
- path/to/file.ts - What it does
```

### Key Functions/Classes Added

```typescript
// Copy main signatures here for AI reference
```

### Patterns Used

<!-- Describe patterns that AI should follow for similar features -->

## 📸 Screenshots (if applicable)

<!-- Add screenshots for UI changes -->

## ⚠️ Breaking Changes

<!-- List any breaking changes and migration steps -->

- [ ] No breaking changes
- [ ] Breaking changes documented in CHANGELOG.md

## 🔄 Deployment Notes

<!-- Any special deployment considerations -->

## ✅ Final Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] No console.log or debug code left
- [ ] Error handling implemented
- [ ] Performance considered
- [ ] Security reviewed
- [ ] Documentation updated (required)
- [ ] ROADMAP.md updated with progress

---

**By submitting this PR, I confirm that**:
- ✅ I have updated all relevant documentation
- ✅ AI.md includes new patterns from my changes
- ✅ Examples are provided for new features
- ✅ The documentation is accurate and helpful for AI assistants and developers
