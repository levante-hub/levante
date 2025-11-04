# Telemetry System

**Status:** Implemented (Local logging only)
**Backend:** Not configured
**Default:** Disabled (opt-in required)

---

## Overview

Levante includes a privacy-first telemetry system that allows collecting anonymous usage data to improve the app. The system is fully implemented but currently only logs events locally. No data is sent to external servers until a backend is configured.

## Architecture

```
User Action → TelemetryService → Local Logging
                                → Backend (when configured)
```

### Components

1. **TelemetryService** ([src/main/services/TelemetryService.ts](../src/main/services/TelemetryService.ts))
   - Privacy-first event tracking
   - Anonymous user ID (UUID v4)
   - Session tracking
   - Crash reporting

2. **UI Controls** ([src/renderer/components/settings/TelemetrySection.tsx](../src/renderer/components/settings/TelemetrySection.tsx))
   - Enable/disable telemetry
   - Anonymous usage statistics toggle
   - Crash reports toggle

3. **Preferences** ([src/types/preferences.ts](../src/types/preferences.ts))
   - Stored in `~/levante/ui-preferences.json`
   - Default: all disabled (opt-in)

## Event Types

```typescript
type TelemetryEventType =
  | 'app_start'
  | 'app_shutdown'
  | 'chat_started'
  | 'chat_message_sent'
  | 'model_selected'
  | 'provider_configured'
  | 'error_occurred';
```

## Privacy Guarantees

✅ **Anonymous**: UUID v4, no PII
✅ **Opt-in**: Disabled by default
✅ **Transparent**: Clear UI about what's collected
✅ **Granular**: Separate controls for usage stats and crash reports
✅ **Local-first**: Works offline, backend is optional

---

## Enabling Backend (Future)

### Option 1: PostHog (Recommended)

**Why PostHog?**
- Open-source, self-hostable
- Privacy-focused with GDPR compliance
- Feature flags, A/B testing, session replay
- Generous free tier

**Setup:**

1. Create PostHog account at [posthog.com](https://posthog.com)

2. Add to `.env.local`:
```bash
TELEMETRY_ENDPOINT=https://app.posthog.com/capture/
POSTHOG_PROJECT_KEY=your_project_key_here
```

3. Update `sendToBackend()` in TelemetryService.ts:
```typescript
private async sendToBackend(event: TelemetryEvent): Promise<void> {
  const endpoint = process.env.TELEMETRY_ENDPOINT;
  const apiKey = process.env.POSTHOG_PROJECT_KEY;

  if (!endpoint || !apiKey) return;

  // PostHog format
  const payload = {
    api_key: apiKey,
    event: event.type,
    properties: {
      distinct_id: event.userId,
      $session_id: event.sessionId,
      ...event.data
    },
    timestamp: event.timestamp
  };

  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000)
  });
}
```

### Option 2: Mixpanel

**Setup:**

1. Create Mixpanel project at [mixpanel.com](https://mixpanel.com)

2. Add to `.env.local`:
```bash
TELEMETRY_ENDPOINT=https://api.mixpanel.com/track
MIXPANEL_TOKEN=your_token_here
```

3. Update payload format:
```typescript
const payload = {
  event: event.type,
  properties: {
    token: process.env.MIXPANEL_TOKEN,
    distinct_id: event.userId,
    $session_id: event.sessionId,
    time: new Date(event.timestamp).getTime(),
    ...event.data
  }
};
```

### Option 3: Custom Backend

**Setup:**

1. Create your own endpoint (Node.js, Python, Go, etc.)

2. Add to `.env.local`:
```bash
TELEMETRY_ENDPOINT=https://your-domain.com/api/telemetry
TELEMETRY_API_KEY=your_secret_key
```

3. Update authentication:
```typescript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.TELEMETRY_API_KEY}`
}
```

---

## Crash Reporting

### Option 1: Sentry (Recommended)

**Setup:**

1. Create Sentry project at [sentry.io](https://sentry.io)

2. Add to `.env.local`:
```bash
CRASH_REPORT_ENDPOINT=https://o123456.ingest.sentry.io/api/789/envelope/
SENTRY_DSN=your_dsn_here
```

3. Update `sendCrashReport()` with Sentry format

### Option 2: Bugsnag

Similar setup with Bugsnag-specific payload format.

---

## Testing

```bash
# Test telemetry locally
DEBUG_ENABLED=true pnpm dev

# Enable telemetry in Settings > Telemetry & Privacy
# Check logs for "Telemetry event tracked" messages
```

---

## Privacy Policy

**Before enabling backend, update:**

1. **Privacy Policy** with:
   - What data is collected
   - Where it's stored (PostHog, Mixpanel, etc.)
   - How long it's retained
   - User's rights (GDPR, CCPA)

2. **UI Text** in locales:
   - Update `privacy_notice` with backend details
   - Add link to full privacy policy

3. **Documentation**:
   - Update README with telemetry information
   - Add opt-out instructions

---

## Current Status

🟡 **Implementation Complete**
🔴 **Backend Not Configured**
🟢 **Privacy Controls Active**

**Next Steps:**
1. Choose backend provider (PostHog recommended)
2. Configure endpoints in `.env.local`
3. Update privacy policy
4. Test with real backend
5. Deploy to production

---

## References

- [TelemetryService.ts](../src/main/services/TelemetryService.ts) - Main implementation
- [TelemetrySection.tsx](../src/renderer/components/settings/TelemetrySection.tsx) - UI controls
- [preferences.ts](../src/types/preferences.ts) - Type definitions
- [PostHog Docs](https://posthog.com/docs)
- [Mixpanel Docs](https://developer.mixpanel.com/docs)
- [Sentry Docs](https://docs.sentry.io/)
