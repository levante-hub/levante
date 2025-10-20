# Release Process Guide

Complete guide for creating production and beta releases for Levante.

## Overview

Levante uses automated releases via GitHub Actions. When you push a tag, the system automatically:
1. Builds for macOS and Windows
2. Signs macOS builds
3. Creates a draft release on GitHub
4. Uploads build artifacts

## Release Types

### Production Release
- **Tag format**: `v1.0.0`, `v1.0.1`, `v1.1.0`
- **Branch**: `main`
- **Workflow**: `.github/workflows/release.yml`
- **Visibility**: Public release for all users

### Beta Release
- **Tag format**: `v1.0.0-beta.1`, `v1.1.0-beta.2`
- **Branch**: `develop` or feature branches
- **Workflow**: `.github/workflows/beta-release.yml`
- **Visibility**: Pre-release for beta testers only

## Production Release Process

### Step 1: Prepare Release Branch

```bash
# Ensure main is up to date
git checkout main
git pull origin main

# Optional: Create release branch for final prep
git checkout -b release/v1.0.0

# Make any final adjustments
# - Update CHANGELOG.md
# - Review documentation
# - Final testing
```

### Step 2: Bump Version

```bash
# For patch release (1.0.0 → 1.0.1)
npm version patch --no-git-tag-version

# For minor release (1.0.0 → 1.1.0)
npm version minor --no-git-tag-version

# For major release (1.0.0 → 2.0.0)
npm version major --no-git-tag-version

# Commit version bump
git add package.json
git commit -m "chore: bump version to v1.0.0"
```

### Step 3: Create Pull Request (if using release branch)

```bash
# Push release branch
git push origin release/v1.0.0
```

1. Go to https://github.com/levante-hub/levante/pulls
2. Create PR from `release/v1.0.0` → `main`
3. Title: `Release v1.0.0`
4. Add changelog to description
5. Get approval from team
6. Merge PR

### Step 4: Create Annotated Tag

```bash
# Ensure you're on updated main
git checkout main
git pull origin main

# Create annotated tag with release notes
git tag -a v1.0.0 -m "Release v1.0.0

## Features
- Feature A: Description
- Feature B: Description

## Improvements
- Improvement X
- Improvement Y

## Bug Fixes
- Fix for issue #123
- Fix for issue #456

## Breaking Changes
- None (or list breaking changes)
"
```

**Tag Message Tips**:
- Use markdown formatting
- Include all notable changes
- Reference issue numbers with #
- Mention breaking changes clearly

### Step 5: Push Tag

```bash
# Push tag to trigger release workflow
git push origin v1.0.0

# Verify tag was pushed
git ls-remote --tags origin | grep v1.0.0
```

**⚡ This triggers the automated build process!**

### Step 6: Monitor GitHub Actions

1. Go to https://github.com/levante-hub/levante/actions
2. Find the workflow run for your tag
3. Monitor both jobs:
   - **Build & Release - macos-latest**
   - **Build & Release - windows-latest**

**Expected duration**: 15-20 minutes total

**Workflow steps**:
- ✅ Checkout code
- ✅ Setup Node.js and pnpm
- ✅ Install dependencies
- ✅ Import Apple certificate (macOS)
- ✅ Build application
- ✅ Package & publish
- ✅ Create draft release

### Step 7: Review Draft Release

Once both jobs complete successfully:

1. Go to https://github.com/levante-hub/levante/releases
2. Find the draft release (not published yet)
3. Review:
   - **Release title**: Should be `v1.0.0`
   - **Release notes**: Should match your tag message
   - **Assets**: Should include:
     - `Levante-darwin-arm64-1.0.0.dmg` (macOS Apple Silicon)
     - `Levante-darwin-arm64-1.0.0.zip` (macOS Apple Silicon)
     - `Levante-darwin-x64-1.0.0.dmg` (macOS Intel - if built)
     - `Levante-darwin-x64-1.0.0.zip` (macOS Intel - if built)
     - `Levante-1.0.0 Setup.exe` (Windows installer)
     - `Levante-win32-x64-1.0.0.zip` (Windows portable)
   - **Pre-release**: Should be unchecked
   - **Target**: Should be `main` branch

### Step 8: Publish Release

If everything looks good:
1. Click **"Edit"** on the draft release
2. Review/edit release notes if needed
3. Ensure **"Set as the latest release"** is checked
4. Click **"Publish release"**

**🎉 Release is now live!**

### Step 9: Verify Auto-Update

The release should now be available via auto-update:
1. Users running old versions will be notified within 1 hour
2. They can download and install the update
3. Monitor update adoption in analytics (if configured)

### Step 10: Announce Release

- Post announcement in user channels (Discord, Slack, etc.)
- Update website/documentation
- Send email to users (if applicable)
- Share on social media

### Step 11: Merge Back to Develop

```bash
# Merge main back to develop to keep them in sync
git checkout develop
git pull origin develop
git merge main
git push origin develop
```

## Beta Release Process

Beta releases are for testing new features before production.

### Step 1: Prepare Beta Version

```bash
# On your feature branch or develop
git checkout feat/new-feature

# Bump to beta version
npm version prerelease --preid=beta --no-git-tag-version
# This creates: 1.0.0 → 1.0.1-beta.0

# Or manually set version for first beta
npm version 1.1.0-beta.1 --no-git-tag-version

# Commit
git add package.json
git commit -m "chore: bump version to v1.1.0-beta.1"
```

### Step 2: Merge to Develop

```bash
# Merge to develop (or beta branch)
git checkout develop
git merge feat/new-feature
git push origin develop
```

### Step 3: Create Beta Tag

```bash
# Create beta tag
git tag -a v1.1.0-beta.1 -m "Beta Release v1.1.0-beta.1

Testing new features:
- Feature A: Description
- Feature B: Description

## Known Issues
- Issue X (will fix in beta.2)

## Beta Testers
Please test:
1. Feature A functionality
2. Feature B edge cases
3. Performance with large datasets
"

# Push tag
git push origin v1.1.0-beta.1
```

### Step 4: Monitor Workflow

Same as production release - monitor GitHub Actions.

### Step 5: Distribute to Beta Testers

1. Go to https://github.com/levante-hub/levante/releases
2. Find the **pre-release** (marked with "Pre-release" tag)
3. Copy release URL
4. Share with beta testers via:
   - Private Slack/Discord channel
   - Email
   - Internal documentation

**Example message**:
```
🚀 Beta v1.1.0-beta.1 is ready for testing!

Download: https://github.com/levante-hub/levante/releases/tag/v1.1.0-beta.1

New features:
- Feature A
- Feature B

Please test and report any issues in #beta-feedback channel.

Testing checklist: [link to checklist]
```

### Step 6: Collect Feedback

Create a testing checklist for beta testers (example in testing-checklist.md).

Monitor feedback channels and track issues.

### Step 7: Iterate or Promote

**If issues found**:
1. Fix issues in feature branch
2. Create `v1.1.0-beta.2`
3. Repeat testing

**If testing successful**:
1. Proceed with production release (`v1.1.0`)
2. Follow production release process

## Hotfix Release Process

For critical bugs in production that need immediate fixes.

### Step 1: Create Hotfix Branch

```bash
# From main, create hotfix branch
git checkout main
git pull origin main
git checkout -b hotfix/v1.0.1

# Make the fix
# ... edit files ...

# Commit fix
git add .
git commit -m "fix: critical bug in feature X

Fixes #123"
```

### Step 2: Bump Patch Version

```bash
npm version patch --no-git-tag-version
# 1.0.0 → 1.0.1

git add package.json
git commit -m "chore: bump version to v1.0.1"
```

### Step 3: Test the Fix

Run full test suite:
```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

### Step 4: Merge to Main

```bash
# Push hotfix branch
git push origin hotfix/v1.0.1

# Create PR to main
# - Title: "Hotfix v1.0.1: Fix critical bug"
# - Get expedited review
# - Merge PR
```

Or merge directly (if urgent):
```bash
git checkout main
git merge hotfix/v1.0.1
git push origin main
```

### Step 5: Tag and Release

```bash
# Create tag
git tag -a v1.0.1 -m "Hotfix v1.0.1

## Bug Fixes
- Fixed critical bug in feature X (#123)

## Impact
This fix addresses [describe impact and urgency]
"

# Push tag
git push origin v1.0.1
```

### Step 6: Merge Back to Develop

```bash
git checkout develop
git merge hotfix/v1.0.1
git push origin develop
```

### Step 7: Monitor and Communicate

- Monitor release workflow
- Publish release immediately
- Communicate urgency to users
- Monitor update adoption closely

## Release Checklist Template

Copy this checklist for each release:

```markdown
## Release Checklist: v{{ VERSION }}

### Pre-Release
- [ ] All tests passing (`pnpm typecheck && pnpm lint && pnpm test`)
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated
- [ ] Release notes drafted
- [ ] Beta testing completed (if applicable)
- [ ] No critical bugs outstanding
- [ ] Dependencies reviewed (`pnpm run check:outdated`)
- [ ] Security audit clean (`pnpm audit`)

### Release
- [ ] Release branch created (if applicable)
- [ ] PR created and approved
- [ ] PR merged to main
- [ ] Tag created with release notes
- [ ] Tag pushed to origin
- [ ] GitHub Actions workflow triggered
- [ ] macOS build completed successfully
- [ ] Windows build completed successfully
- [ ] Draft release created on GitHub

### Post-Release
- [ ] Draft release reviewed
- [ ] Assets verified (DMG, ZIP, EXE)
- [ ] Release notes finalized
- [ ] Release published
- [ ] Announcement sent to users
- [ ] Documentation updated
- [ ] Main merged back to develop
- [ ] Monitoring enabled

### Success Metrics (Monitor for 7 days)
- [ ] Update adoption > 80%
- [ ] Update success rate > 95%
- [ ] No critical bugs reported
- [ ] No rollback required
- [ ] User feedback positive
```

## Versioning Strategy

Levante follows [Semantic Versioning](https://semver.org/):

**Format**: `MAJOR.MINOR.PATCH[-PRERELEASE]`

### When to Bump

**MAJOR** (1.0.0 → 2.0.0):
- Breaking changes to API
- Major UI/UX redesign
- Incompatible data format changes
- Removal of deprecated features

**MINOR** (1.0.0 → 1.1.0):
- New features (backwards compatible)
- New AI provider support
- New settings/preferences
- Significant performance improvements

**PATCH** (1.0.0 → 1.0.1):
- Bug fixes
- Security patches
- Minor UI tweaks
- Documentation updates
- Performance optimizations

**PRERELEASE** (1.1.0-beta.1):
- Beta releases for testing
- Release candidates
- Alpha releases (internal testing)

### Version Examples

```
v1.0.0         → Initial release with auto-update
v1.0.1         → Bug fix for chat history
v1.1.0         → New model provider support
v1.1.0-beta.1  → Beta testing new provider
v1.1.0-beta.2  → Second beta with fixes
v1.1.0         → Production release
v2.0.0         → Major redesign with breaking changes
```

## Rollback Procedure

If a critical bug is discovered after release:

### Option 1: Quick Hotfix
1. Create hotfix branch immediately
2. Fix the bug
3. Release new patch version (v1.0.2)
4. Fast-track through testing
5. Publish new release

### Option 2: Unpublish (if caught quickly)
1. Delete the release from GitHub
2. Delete the tag locally and remotely
```bash
gh release delete v1.0.1 --yes
git tag -d v1.0.1
git push origin :refs/tags/v1.0.1
```
3. Fix the bug
4. Re-release with same version

### Option 3: Rollback Release
1. Unpublish current release
2. Re-publish previous stable release as "latest"
3. Work on fix in parallel
4. Release fixed version when ready

## Troubleshooting

### Workflow Failed

**Check logs**:
1. Go to Actions tab
2. Click on failed workflow
3. Expand failed step
4. Review error messages

**Common issues**:
- **Certificate expired**: Update Apple certificate
- **Secrets missing**: Verify all GitHub Secrets are set
- **Build failed**: Check build logs for TypeScript/build errors
- **Notarization timeout**: Apple servers slow, retry

### Release Not Appearing in Auto-Update

**Check**:
1. Release is published (not draft)
2. Release is marked as "latest"
3. Version number is higher than current
4. Wait 1 hour (update check interval)

**Test manually**:
```bash
# Check what update.electronjs.org sees
curl https://update.electronjs.org/levante-hub/levante/darwin/v1.0.0
```

### Assets Missing from Release

**Cause**: Build failed for one platform
**Solution**:
1. Check workflow logs for errors
2. Fix issue
3. Re-run workflow or create new tag

## References

- [Semantic Versioning](https://semver.org/)
- [GitHub Releases Documentation](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [Git Tagging](https://git-scm.com/book/en/v2/Git-Basics-Tagging)

---

**Last Updated**: 2025-10-19
