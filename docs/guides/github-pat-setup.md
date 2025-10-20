# GitHub Personal Access Token Setup

This guide walks through creating a GitHub Personal Access Token (PAT) for automated releases.

## Prerequisites
- GitHub account with admin access to `levante-hub/levante` repository

## Steps

### 1. Navigate to GitHub Settings
1. Go to https://github.com/settings/tokens
2. Click on **"Personal access tokens"** → **"Tokens (classic)"**

### 2. Generate New Token
1. Click **"Generate new token (classic)"**
2. You may be asked to confirm your password or 2FA

### 3. Configure Token

**Name:** `LEVANTE_RELEASE_TOKEN`

**Expiration:** 90 days (we'll set a reminder to renew)

**Select Scopes:**
- ✅ **repo** (Full control of private repositories)
  - repo:status
  - repo_deployment
  - public_repo
  - repo:invite
  - security_events
- ✅ **write:packages** (Upload packages to GitHub Package Registry)
  - read:packages

**Leave unchecked:**
- workflow (not needed for releases)
- admin:org
- Everything else

### 4. Generate and Copy Token
1. Scroll to bottom and click **"Generate token"**
2. **IMPORTANT**: Copy the token immediately - it will only be shown once!
3. Store it temporarily in a secure location (password manager)

Token format: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 5. Add Token to Repository Secrets

#### Navigate to Repository Settings
1. Go to https://github.com/levante-hub/levante/settings/secrets/actions
2. Click **"New repository secret"**

#### Add Secret
- **Name**: `GH_TOKEN`
- **Value**: Paste the PAT token you copied
- Click **"Add secret"**

### 6. Verify Secret is Added
You should see `GH_TOKEN` listed under "Repository secrets" with a green checkmark.

## Token Renewal

### Set Reminder
Since the token expires in 90 days, set a calendar reminder for **75 days from now** to renew it.

**Reminder Date**: {{ 75 days from creation date }}

### Renewal Process
1. Go to https://github.com/settings/tokens
2. Find `LEVANTE_RELEASE_TOKEN`
3. Click **"Regenerate token"**
4. Copy new token
5. Update `GH_TOKEN` secret in repository:
   - Go to https://github.com/levante-hub/levante/settings/secrets/actions
   - Click on `GH_TOKEN`
   - Click **"Update secret"**
   - Paste new token
   - Click **"Update secret"**

## Security Best Practices

### ✅ Do:
- Store token in GitHub Secrets only
- Use minimum required scopes
- Set expiration dates
- Rotate tokens regularly
- Use different tokens for different purposes

### ❌ Don't:
- Commit token to git
- Share token in Slack/email
- Use same token for multiple projects
- Set "No expiration"
- Log token in console/files

## Troubleshooting

### Issue: "Resource not accessible by integration"
**Cause**: Token doesn't have `repo` scope
**Solution**: Regenerate token with `repo` scope checked

### Issue: "Bad credentials"
**Cause**: Token expired or invalid
**Solution**: Generate new token and update secret

### Issue: Workflow can't create releases
**Cause**: Token doesn't have `write:packages` or `repo` scope
**Solution**: Verify token has both scopes

## Testing the Token

After adding the secret, test it by triggering a release workflow:

```bash
# Create a test tag
git tag v0.0.1-test
git push origin v0.0.1-test

# Check GitHub Actions
# Go to: https://github.com/levante-hub/levante/actions

# Clean up test
gh release delete v0.0.1-test --yes
git tag -d v0.0.1-test
git push origin :refs/tags/v0.0.1-test
```

## References
- [GitHub PAT Documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
