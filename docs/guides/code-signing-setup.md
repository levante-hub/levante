# macOS Code Signing Setup Guide

This guide covers exporting your Apple Developer certificate and configuring GitHub Secrets for automated code signing.

## Prerequisites
- ✅ Active Apple Developer account
- ✅ Mac with Xcode installed
- ✅ Developer ID Application certificate already created
- ✅ Admin access to levante-hub/levante repository

## Overview

Code signing is required for macOS apps to:
1. Pass Gatekeeper security checks
2. Enable auto-updates
3. Build user trust
4. Distribute outside the Mac App Store

## Part 1: Export Certificate from Keychain

### Step 1: Open Keychain Access
```bash
# Open Keychain Access app
open /Applications/Utilities/Keychain\ Access.app
```

### Step 2: Locate Your Certificate
1. In Keychain Access, select **"login"** keychain (left sidebar)
2. Select **"My Certificates"** category
3. Find certificate named: **"Developer ID Application: [Your Name] ([Team ID])"**

**Example**: `Developer ID Application: Levante Team (ABC123XYZ)`

### Step 3: Export Certificate
1. **Right-click** on the certificate
2. Select **"Export 'Developer ID Application...'"**
3. Save dialog appears:
   - **File name**: `levante-cert.p12`
   - **Location**: Desktop (temporary)
   - **Format**: Personal Information Exchange (.p12)
4. Click **"Save"**

### Step 4: Set Password
A password dialog will appear:
- Enter a **strong password** (you'll need this later)
- **Save this password** in your password manager
- Click **"OK"**

You may be prompted for your Mac login password to allow the export.

### Step 5: Verify Export
Check that `levante-cert.p12` file exists on your Desktop.

## Part 2: Convert Certificate to Base64

### Why Base64?
GitHub Secrets only accept text values, so we need to convert the binary .p12 file to base64 text.

### Convert Command
```bash
# Navigate to Desktop
cd ~/Desktop

# Convert .p12 to base64
base64 -i levante-cert.p12 -o levante-cert-base64.txt

# Verify file was created
ls -lh levante-cert-base64.txt
```

### Copy to Clipboard
```bash
# Copy base64 content to clipboard
cat levante-cert-base64.txt | pbcopy

echo "Base64 certificate copied to clipboard!"
```

**⚠️ Keep this terminal open** - you'll need the clipboard content in the next step.

## Part 3: Create App-Specific Password

Auto-update requires notarization, which needs an app-specific password.

### Step 1: Navigate to Apple ID
1. Go to https://appleid.apple.com/account/manage
2. Sign in with your Apple ID

### Step 2: Generate Password
1. Scroll to **"Security"** section
2. Click on **"App-Specific Passwords"**
3. Click **"Generate an app-specific password"** (or the + button)

### Step 3: Name the Password
- **Name**: `Levante Notarization`
- Click **"Create"**

### Step 4: Save the Password
- A password will be displayed: `xxxx-xxxx-xxxx-xxxx`
- **Copy this password** immediately
- **Save it** in your password manager
- Click **"Done"**

**⚠️ Important**: This password is shown only once!

## Part 4: Find Your Team ID

### Method 1: Apple Developer Portal
1. Go to https://developer.apple.com/account
2. Sign in
3. Click on **"Membership"** in the sidebar
4. Your **Team ID** is shown (10 characters, e.g., `ABC123XYZ`)

### Method 2: From Certificate
In Keychain Access:
1. Double-click your certificate
2. Look for **"Organizational Unit"** field
3. That's your Team ID

**Save your Team ID** - you'll need it for GitHub Secrets.

## Part 5: Configure GitHub Secrets

### Navigate to Repository Secrets
1. Go to https://github.com/levante-hub/levante/settings/secrets/actions
2. Ensure you're on the **"Actions"** tab

### Add Secret 1: Certificate Base64
1. Click **"New repository secret"**
2. **Name**: `APPLE_CERTIFICATE_BASE64`
3. **Value**: Paste from clipboard (the base64 content)
4. Click **"Add secret"**

### Add Secret 2: Certificate Password
1. Click **"New repository secret"**
2. **Name**: `APPLE_CERTIFICATE_PASSWORD`
3. **Value**: The password you set when exporting the .p12
4. Click **"Add secret"**

### Add Secret 3: Apple ID
1. Click **"New repository secret"**
2. **Name**: `APPLE_ID`
3. **Value**: Your Apple ID email (e.g., `developer@example.com`)
4. Click **"Add secret"**

### Add Secret 4: App-Specific Password
1. Click **"New repository secret"**
2. **Name**: `APPLE_ID_PASSWORD`
3. **Value**: The app-specific password from Part 3
4. Click **"Add secret"**

### Add Secret 5: Team ID
1. Click **"New repository secret"**
2. **Name**: `APPLE_TEAM_ID`
3. **Value**: Your Team ID (e.g., `ABC123XYZ`)
4. Click **"Add secret"**

### Verify All Secrets
You should now see 5 secrets:
- ✅ `APPLE_CERTIFICATE_BASE64`
- ✅ `APPLE_CERTIFICATE_PASSWORD`
- ✅ `APPLE_ID`
- ✅ `APPLE_ID_PASSWORD`
- ✅ `APPLE_TEAM_ID`

## Part 6: Security Cleanup

### Delete Temporary Files
```bash
# Securely delete certificate files
cd ~/Desktop
rm -P levante-cert.p12
rm -P levante-cert-base64.txt

# Verify deletion
ls -la ~/Desktop | grep levante-cert
# Should return nothing
```

The `-P` flag overwrites the file before deleting (more secure).

### Clear Clipboard
```bash
# Clear clipboard
echo "" | pbcopy
```

## Part 7: Test Code Signing

### Create Test Script
```bash
# Create test build script
cat > ~/test-signing.sh << 'EOF'
#!/bin/bash
set -e

echo "Testing code signing setup..."

# Import certificate to temporary keychain
KEYCHAIN_PATH="$RUNNER_TEMP/app-signing.keychain-db"
KEYCHAIN_PASSWORD="temp_password"

# Create keychain
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

# Decode and import certificate
echo "$APPLE_CERTIFICATE_BASE64" | base64 --decode > certificate.p12
security import certificate.p12 -k "$KEYCHAIN_PATH" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

# Cleanup
rm certificate.p12
security delete-keychain "$KEYCHAIN_PATH"

echo "✅ Code signing test successful!"
EOF

chmod +x ~/test-signing.sh
```

### Run Test (Local)
This will be tested in GitHub Actions, but you can verify the certificate is valid:

```bash
# Verify certificate in Keychain
security find-identity -v -p codesigning

# You should see your Developer ID Application certificate listed
```

## Troubleshooting

### Issue: "Certificate not found in Keychain"
**Solution**: Make sure you're looking in the "login" keychain, not "System"

### Issue: "Export failed - private key not found"
**Solution**: The certificate and private key must be in the same keychain. Re-download certificate from Apple Developer portal.

### Issue: "GitHub Actions fails with 'No signing identity found'"
**Possible causes**:
1. Base64 encoding is incorrect
2. Certificate password is wrong
3. Certificate expired

**Solution**: Re-export certificate and update secrets

### Issue: "Notarization fails"
**Possible causes**:
1. App-specific password is incorrect
2. Apple ID is wrong
3. Team ID doesn't match

**Solution**: Verify all values and regenerate app-specific password if needed

### Issue: "Certificate expired"
Apple Developer certificates are valid for 3 years.

**Solution**:
1. Create new certificate in Apple Developer portal
2. Download and install
3. Re-export and update GitHub Secrets

## Certificate Expiration

### Check Expiration Date
```bash
# View certificate details
security find-certificate -c "Developer ID Application" -p | openssl x509 -text | grep "Not After"
```

### Set Renewal Reminder
Add calendar reminder **30 days before** certificate expires to renew it.

## References
- [Apple Code Signing Guide](https://developer.apple.com/support/code-signing/)
- [Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [GitHub Actions: Using secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)

---

**Last Updated**: 2025-10-19
**Next Review**: When certificate needs renewal
