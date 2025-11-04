import { randomUUID } from 'crypto';
import { app } from 'electron';
import { getLogger } from './logging';
import { preferencesService } from './preferencesService';

/**
 * Telemetry event types
 */
export type TelemetryEventType =
  | 'app_start'
  | 'app_shutdown'
  | 'chat_started'
  | 'chat_message_sent'
  | 'model_selected'
  | 'provider_configured'
  | 'error_occurred';

/**
 * Telemetry event data
 */
export interface TelemetryEvent {
  type: TelemetryEventType;
  timestamp: string;
  sessionId: string;
  userId: string;
  data?: Record<string, any>;
}

/**
 * Crash report data
 */
export interface CrashReport {
  timestamp: string;
  version: string;
  platform: string;
  error: {
    message: string;
    stack?: string;
    type: string;
  };
  sessionId: string;
  userId: string;
}

/**
 * TelemetryService
 *
 * Privacy-first telemetry system with explicit opt-in.
 * All data is anonymous and minimal by design.
 *
 * Features:
 * - Anonymous user ID (UUID v4)
 * - Session tracking
 * - Basic usage metrics
 * - Crash reporting
 * - Fully disableable
 *
 * @example
 * ```typescript
 * telemetryService.initialize();
 * telemetryService.trackEvent('chat_started', { provider: 'openai' });
 * ```
 */
export class TelemetryService {
  private logger = getLogger();
  private sessionId: string;
  private userId: string | null = null;
  private initialized = false;

  constructor() {
    this.sessionId = randomUUID();
  }

  /**
   * Initialize telemetry service
   * Generates or retrieves anonymous user ID
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Get or generate anonymous user ID
      this.userId = await this.getOrCreateUserId();

      this.initialized = true;
      this.logger.core.info('TelemetryService initialized', {
        sessionId: this.sessionId,
        userId: this.userId
      });

      // Track app start
      await this.trackEvent('app_start', {
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch
      });
    } catch (error) {
      this.logger.core.error('Failed to initialize TelemetryService', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  /**
   * Track a telemetry event
   * Only tracks if telemetry is enabled in preferences
   */
  async trackEvent(
    type: TelemetryEventType,
    data?: Record<string, any>
  ): Promise<void> {
    if (!this.initialized || !this.userId) {
      this.logger.core.debug('Telemetry not initialized, skipping event', { type });
      return;
    }

    // Check if telemetry is enabled
    const telemetryConfig = preferencesService.get('telemetry');

    if (!telemetryConfig.enabled) {
      this.logger.core.debug('Telemetry disabled, skipping event', { type });
      return;
    }

    // Check if anonymous usage is enabled for non-critical events
    const isCriticalEvent = type === 'error_occurred' || type === 'app_start' || type === 'app_shutdown';
    if (!isCriticalEvent && !telemetryConfig.anonymousUsage) {
      this.logger.core.debug('Anonymous usage tracking disabled, skipping event', { type });
      return;
    }

    try {
      const event: TelemetryEvent = {
        type,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        userId: this.userId,
        data
      };

      // Log the event locally
      this.logger.core.info('Telemetry event tracked', {
        type,
        sessionId: this.sessionId,
        hasData: !!data
      });

      // Send to telemetry backend (no-op if endpoint not configured)
      await this.sendToBackend(event);
    } catch (error) {
      this.logger.core.error('Failed to track telemetry event', {
        type,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  /**
   * Report a crash
   * Only sends if crash reports are enabled
   */
  async reportCrash(error: Error): Promise<void> {
    if (!this.initialized || !this.userId) {
      return;
    }

    // Check if crash reports are enabled
    const telemetryConfig = preferencesService.get('telemetry');

    if (!telemetryConfig.enabled || !telemetryConfig.crashReports) {
      this.logger.core.debug('Crash reports disabled, skipping report');
      return;
    }

    try {
      const crashReport: CrashReport = {
        timestamp: new Date().toISOString(),
        version: app.getVersion(),
        platform: process.platform,
        error: {
          message: error.message,
          stack: error.stack,
          type: error.name
        },
        sessionId: this.sessionId,
        userId: this.userId
      };

      // Log the crash report locally
      this.logger.core.error('Crash report generated', {
        errorType: error.name,
        errorMessage: error.message,
        sessionId: this.sessionId
      });

      // Send to crash reporting backend (no-op if endpoint not configured)
      await this.sendCrashReport(crashReport);
    } catch (reportError) {
      this.logger.core.error('Failed to report crash', {
        error: reportError instanceof Error ? reportError.message : reportError
      });
    }
  }

  /**
   * Get telemetry status
   */
  getStatus(): {
    enabled: boolean;
    anonymousUsage: boolean;
    crashReports: boolean;
    userId: string | null;
    sessionId: string;
  } {
    const telemetryConfig = preferencesService.get('telemetry');

    return {
      enabled: telemetryConfig.enabled,
      anonymousUsage: telemetryConfig.anonymousUsage,
      crashReports: telemetryConfig.crashReports,
      userId: this.userId,
      sessionId: this.sessionId
    };
  }

  /**
   * Cleanup on app shutdown
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      await this.trackEvent('app_shutdown', {
        sessionDuration: Date.now()
      });

      this.logger.core.info('TelemetryService shutdown');
    } catch (error) {
      this.logger.core.error('Failed to shutdown TelemetryService', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  /**
   * Send telemetry event to backend
   * STUB: Ready for implementation when backend is configured
   *
   * To enable:
   * 1. Set TELEMETRY_ENDPOINT environment variable
   * 2. Choose backend: PostHog, Mixpanel, Amplitude, or custom
   * 3. Uncomment the fetch call in trackEvent()
   * 4. Update privacy policy with backend details
   */
  private async sendToBackend(event: TelemetryEvent): Promise<void> {
    const endpoint = process.env.TELEMETRY_ENDPOINT;

    if (!endpoint) {
      this.logger.core.debug('No telemetry endpoint configured, skipping send');
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `Levante/${app.getVersion()}`
        },
        body: JSON.stringify(event),
        // Timeout after 5 seconds to not block the app
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
      }

      this.logger.core.debug('Telemetry event sent successfully', { type: event.type });
    } catch (error) {
      // Fail silently - telemetry should never break the app
      this.logger.core.debug('Failed to send telemetry event', {
        error: error instanceof Error ? error.message : error,
        type: event.type
      });
    }
  }

  /**
   * Send crash report to backend
   * STUB: Ready for implementation when backend is configured
   *
   * Recommended backends:
   * - Sentry (https://sentry.io)
   * - Bugsnag (https://www.bugsnag.com)
   * - Custom endpoint
   */
  private async sendCrashReport(report: CrashReport): Promise<void> {
    const endpoint = process.env.CRASH_REPORT_ENDPOINT;

    if (!endpoint) {
      this.logger.core.debug('No crash report endpoint configured, skipping send');
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `Levante/${app.getVersion()}`
        },
        body: JSON.stringify(report),
        signal: AbortSignal.timeout(10000) // 10s timeout for crash reports
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
      }

      this.logger.core.debug('Crash report sent successfully');
    } catch (error) {
      // Fail silently
      this.logger.core.debug('Failed to send crash report', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  /**
   * Get or create anonymous user ID
   * Stored in preferences, never sent with PII
   */
  private async getOrCreateUserId(): Promise<string> {
    try {
      // Try to get existing user ID from a hidden preference
      const allPrefs = preferencesService.getAll();
      const existingUserId = (allPrefs as any).telemetryUserId;

      if (existingUserId && typeof existingUserId === 'string') {
        return existingUserId;
      }

      // Generate new anonymous UUID
      const newUserId = randomUUID();

      // Store it (this will require updating the type, but for now we cast)
      preferencesService.set('telemetry' as any, {
        ...preferencesService.get('telemetry'),
        userId: newUserId
      } as any);

      return newUserId;
    } catch (error) {
      this.logger.core.error('Failed to get/create user ID', {
        error: error instanceof Error ? error.message : error
      });
      // Fallback to session-only ID
      return this.sessionId;
    }
  }
}

// Singleton instance
export const telemetryService = new TelemetryService();
