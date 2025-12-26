# Semantic Release Setup Guide

This document describes the automated release setup for the `ubersearch` package using semantic-release with GitHub Actions.

## ⚠️ Important Note on OIDC/Trusted Publisher

**Current Status**: Using npm token authentication
- semantic-release's npm plugin **does not yet fully support** OIDC/Trusted Publisher
- Tracking issue: [npm/cli#8525](https://github.com/npm/cli/issues/8525)
- Using traditional npm token with provenance enabled for security

**To use OIDC in the future** (when semantic-release supports it):
- Revert workflow to use OIDC token setup
- Remove `NPM_TOKEN` from workflow
- Ensure Trusted Publisher is configured in npm package settings

## Overview

The release workflow automatically:
- Runs tests and linting
- Builds the package
- Analyzes commits using conventional commit format
- Determines the next version (major/minor/patch)
- Publishes to npm with provenance
- Creates a GitHub release with changelog

## Architecture

### Workflow Configuration
- **File**: `.github/workflows/release.yml`
- **Trigger**: Push to `main` branch or manual dispatch
- **Runtime**: Ubuntu with Bun
- **Authentication**: GitHub OIDC (no stored tokens needed)

### Key Features
- ✅ Bun for fast dependency management and building
- ✅ Semantic versioning with conventional commits
- ✅ Automated changelog generation
- ✅ Pre-publish validation (lint, test, build)
- ✅ OIDC authentication for secure npm publishing
- ✅ GitHub release creation with notes
- ✅ npm provenance for enhanced security

## GitHub Repository Configuration

### Required Setup

**1. Create npm automation token** (Required for now):
   - Go to: https://www.npmjs.com/settings/your-name/tokens
   - Click "Create New Token"
   - Select "Automation" token type
   - Copy the token

**2. Add token to GitHub Secrets**:
   - Go to: **Settings** → **Secrets and variables** → **Actions**
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Paste your npm automation token
   - Click "Add secret"

**3. GitHub Actions permissions**:
   - Go to: **Settings** → **Actions** → **General**
   - Under **Workflow permissions**, select:
     - ✅ **Read and write permissions**
   - Click **Save**

These permissions allow the workflow to:
- Create git tags for version releases
- Push commits that update package.json
- Create GitHub releases with release notes

## Conventional Commit Format

Semantic-release analyzes your commit messages to determine version bumps. Follow this format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Release Types

These commit types trigger releases:

| Type | Bump | Example |
|------|------|---------|
| `feat:` | Minor (0.x.0) | `feat: add Tavily search provider` |
| `fix:` | Patch (0.0.x) | `fix: resolve timeout issue with SearXNG` |
| `perf:` | Patch | `perf: optimize search query performance` |
| `refactor:` | Patch | `refactor: simplify provider configuration` |
| `docs:` | Patch | `docs: update installation instructions` |

These commit types don't trigger releases (hidden in changelog):

| Type | Shown? | Example |
|------|--------|---------|
| `chore:` | ❌ | `chore: update dependencies` |
| `style:` | ❌ | `style: format code with biome` |
| `test:` | ❌ | `test: add unit tests for search providers` |
| `build:` | ❌ | `build: update build script` |

### Examples

```bash
# Feature - triggers minor release
git commit -m "feat: add support for custom search providers"

# Bug fix - triggers patch release
git commit -m "fix: handle empty results gracefully"

# Documentation - triggers patch release
git commit -m "docs: add API reference for configuration options"

# Refactoring - triggers patch release
git commit -m "refactor: extract provider validation to separate module"

# Performance - triggers patch release
git commit -m "perf: cache provider instances to reduce initialization"

# Chores - doesn't trigger release
git commit -m "chore: bump biome to v2.3.8"
```

## Testing the Workflow

### Phase 1: Local Dry-Run

Test what semantic-release would do without actually releasing:

```bash
# Run semantic-release in dry-run mode
bun run semantic-release:dry-run

# Or via bunx
bunx semantic-release --dry-run
```

This will show:
- Which commits would be included
- What version would be released
- What the changelog would look like

**Note**: Local dry-run may show authentication errors - that's expected. The key is to check if it analyzes commits correctly.

### Phase 2: Workflow Dry-Run

The workflow is currently configured with `--dry-run` for safe testing:

1. Make a commit with conventional format:
   ```bash
   git commit -m "feat: test semantic release setup"
   ```

2. Push to main:
   ```bash
   git push origin main
   ```

3. Check the Actions tab in GitHub to see the workflow run

4. Look for output like:
   ```
   [semantic-release] › ✔  There is a new version: 1.0.0
   [semantic-release] › ℹ  This release is being dry-run
   ```

### Phase 3: Enable Actual Publishing

Once dry-run works correctly:

1. Remove `--dry-run` from `.github/workflows/release.yml` line 54:
   ```yaml
   - name: Publish to npm
     run: bunx semantic-release
   ```

2. Also update the step name:
   ```yaml
   - name: Publish to npm
   ```

3. Commit and push:
   ```bash
   git commit -m "chore: enable semantic-release publishing"
   git push origin main
   ```

## What Happens During Release

### 1. Workflow Triggers
On push to `main`, the workflow starts

### 2. Validation
- ✅ Checkout full git history
- ✅ Install dependencies with Bun
- ✅ Run linting (`bun run lint`)
- ✅ Run tests (`bun run test`)
- ✅ Build package (`bun run build`)

### 3. Release Analysis
semantic-release analyzes commits since the last release:
- Identifies conventional commits
- Determines version bump (major/minor/patch)
- Generates changelog notes
- Skips if no release-worthy commits

### 4. Publishing
If a release is needed:
- Updates `package.json` version
- Creates git tag (e.g., `v1.0.0`)
- Publishes package to npm with provenance
- Creates GitHub release with notes
- Pushes tag and updated `package.json`

## Troubleshooting

### Workflow Fails at "Publish to npm"

**Check**:
- GitHub Actions permissions are set to "Read and write"
- `id-token: write` permission is in workflow file
- Package name in package.json is available on npm

### "No GitHub token specified" Error

**Solution**: This shouldn't happen in GitHub Actions as `GITHUB_TOKEN` is automatic. If it occurs:
- Verify `permissions: contents: write` is set
- Check GitHub Actions permissions in repo settings

### "Invalid npm token" Error

**Solution**: With OIDC, this means the token exchange failed:
- Verify `id-token: write` permission
- Check `NPM_CONFIG_PROVENANCE: true` is set
- Ensure npm registry is `https://registry.npmjs.org/`

### No Release Created

**Causes**:
- No conventional commits since last release
- Only `chore:`, `test:`, `style:`, or `build:` commits
- Release already exists for this commit

**Solution**:
- Check commits follow conventional format
- Ensure at least one `feat:`, `fix:`, `perf:`, `refactor:`, or `docs:` commit
- Use dry-run to see what would be released

### Wrong Version Number

**Cause**: Commits don't follow expected types

**Solution**:
- `feat:` commits trigger minor versions (0.x.0)
- `fix:`, `perf:`, `refactor:`, `docs:` trigger patch (0.0.x)
- `BREAKING CHANGE:` in body triggers major (x.0.0)

## Scripts Available

```bash
# Run semantic-release (normally called by CI)
bun run semantic-release

# Dry-run to test without releasing
bun run semantic-release:dry-run

# Build and release in one command
bun run release
```

## Current Configuration

### Release Rules
From `.releaserc.json`:

```json
{
  "feat": "minor",      // New features
  "fix": "patch",       // Bug fixes
  "perf": "patch",      // Performance improvements
  "refactor": "patch",  // Code refactoring
  "docs": "patch"       // Documentation changes
}
```

### Branch Configuration
- **Release branch**: `main`
- **Trigger**: Push to main

### Plugin Configuration
- `@semantic-release/commit-analyzer`: Analyzes commits
- `@semantic-release/release-notes-generator`: Generates changelog
- `@semantic-release/npm`: Publishes to npm
- `@semantic-release/github`: Creates GitHub releases

## Rollback Procedure

If a release fails or needs to be reverted:

1. **Check GitHub Actions logs** for the failure reason
2. **Fix the issue** and create a new commit
3. **Push to main** - semantic-release will retry automatically
4. **Manual npm unpublish** (only if absolutely necessary, within 72 hours):
   ```bash
   npm unpublish ubersearch@<version>
   ```

Note: npm automatically unpublishes failed publishes, so manual intervention is rarely needed.

## Security Best Practices

✅ **OIDC Authentication**: No long-lived tokens stored
✅ **Provenance Enabled**: All packages signed with npm provenance
✅ **Read-Only Token**: Minimal permissions required
✅ **Automated Validation**: Tests and linting before every release
✅ **Conventional Commits**: Clear audit trail of changes

## Additional Resources

- [semantic-release Documentation](https://github.com/semantic-release/semantic-release)
- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [GitHub Actions OIDC with npm](https://docs.npmjs.com/generating-provenance-statements)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)
