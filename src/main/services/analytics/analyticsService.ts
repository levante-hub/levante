import { app } from 'electron';
import { SupabaseClient } from './supabaseClient';
import { userProfileService } from '../userProfileService';
import { getLogger } from '../logging';

export class AnalyticsService {
    private supabaseClient: SupabaseClient;

    constructor() {
        this.supabaseClient = new SupabaseClient();
    }

    private async canTrack(): Promise<boolean> {
        try {
            const profile = await userProfileService.getProfile();
            return profile.analytics?.hasConsented === true;
        } catch (error) {
            getLogger().analytics?.info('Error checking consent', { error });
            return false;
        }
    }

    private async getUserId(): Promise<string | null> {
        try {
            const profile = await userProfileService.getProfile();
            return profile.analytics?.anonymousUserId || null;
        } catch (error) {
            getLogger().analytics?.info('Error getting user ID', { error });
            return null;
        }
    }

    async trackUser(): Promise<void> {
        try {
            // Get user ID and consent status from profile
            const userId = await this.getUserId();
            if (!userId) return;

            const profile = await userProfileService.getProfile();
            const sharingData = profile.analytics?.hasConsented === true;

            // Track user record creation regardless of consent, but with correct sharing_data value
            const success = await this.supabaseClient.insertUser(userId, sharingData);
            if (success) {
                getLogger().analytics?.info('User tracked successfully', { userId, sharingData });
            } else {
                throw new Error('Failed to insert user record');
            }
        } catch (error) {
            getLogger().analytics?.error('Error tracking user', { error });
            throw error; // Re-throw so frontend sees it
        }
    }

    async trackAppOpen(force: boolean = false): Promise<void> {
        try {
            // Only track app opens if user has consented, unless forced (e.g., initial onboarding)
            if (!force && !await this.canTrack()) return;

            const userId = await this.getUserId();
            if (!userId) return;

            const version = app.getVersion();
            let platform = process.platform as string;
            if (platform === 'darwin') platform = 'macOS';
            if (platform === 'win32') platform = 'Windows';
            if (platform === 'linux') platform = 'Linux';

            await this.supabaseClient.insertAppOpen(userId, version, platform);
            getLogger().analytics?.info('App open tracked', { userId, version, platform, forced: force });
        } catch (error) {
            getLogger().analytics?.info('Error tracking app open', { error });
        }
    }

    async trackConversation(): Promise<void> {
        try {
            if (!await this.canTrack()) return;
            const userId = await this.getUserId();
            if (!userId) return;

            await this.supabaseClient.insertConversation(userId);
        } catch (error) {
            getLogger().analytics?.info('Error tracking conversation', { error });
        }
    }

    async trackMCPUsage(name: string, status: 'active' | 'removed'): Promise<void> {
        try {
            if (!await this.canTrack()) return;
            const userId = await this.getUserId();
            if (!userId) return;

            await this.supabaseClient.insertMCPUsage(userId, name, status);
        } catch (error) {
            getLogger().analytics?.info('Error tracking MCP usage', { error });
        }
    }

    async trackModelUsage(modelId: string, provider: string): Promise<void> {
        try {
            if (!await this.canTrack()) return;
            const userId = await this.getUserId();
            if (!userId) return;

            await this.supabaseClient.insertModelUsage(userId, modelId, provider);
        } catch (error) {
            getLogger().analytics?.info('Error tracking model usage', { error });
        }
    }

    async trackRuntimeUsage(
        runtimeType: import('../../../types/runtime').RuntimeType,
        runtimeVersion: string,
        runtimeSource: 'system' | 'shared',
        action: 'installed' | 'used',
        mcpServerId?: string
    ): Promise<void> {
        try {
            if (!await this.canTrack()) return;
            const userId = await this.getUserId();
            if (!userId) return;

            await this.supabaseClient.insertRuntimeUsage(
                userId,
                runtimeType,
                runtimeVersion,
                runtimeSource,
                action,
                mcpServerId
            );
        } catch (error) {
            getLogger().analytics?.info('Error tracking runtime usage', { error });
        }
    }

    async disableAnalytics(): Promise<void> {
        try {
            // We don't check canTrack here because we want to update the record to say sharing_data = false
            // even if the local state has already been updated to false
            const userId = await this.getUserId();
            if (!userId) return;

            await this.supabaseClient.updateUser(userId, { sharing_data: false });
        } catch (error) {
            getLogger().analytics?.info('Error disabling analytics', { error });
        }
    }

    async enableAnalytics(): Promise<void> {
        try {
            // Update the record to say sharing_data = true
            const userId = await this.getUserId();
            if (!userId) return;

            await this.supabaseClient.updateUser(userId, { sharing_data: true });
        } catch (error) {
            getLogger().analytics?.info('Error enabling analytics', { error });
        }
    }

    async ensureUserTracked(): Promise<void> {
        try {
            // Check if user has UUID
            const existingUserId = await this.getUserId();

            // If user already has UUID, nothing to do
            if (existingUserId) return;

            getLogger().analytics?.info('User has no UUID, creating one with default settings');

            // Generate new UUID and save to profile with sharing_data: false
            const newUserId = crypto.randomUUID();
            const profile = await userProfileService.getProfile();

            await userProfileService.updateProfile({
                ...profile,
                analytics: {
                    hasConsented: false,
                    consentedAt: new Date().toISOString(),
                    anonymousUserId: newUserId,
                },
            });

            getLogger().analytics?.info('Created UUID for user', { userId: newUserId });

            // Track user and initial app open (fire-and-forget, don't await)
            this.trackUser()
                .then(() => {
                    getLogger().analytics?.info('User tracked successfully');
                    return this.trackAppOpen(true);
                })
                .then(() => {
                    getLogger().analytics?.info('Initial app open tracked');
                })
                .catch((error) => {
                    getLogger().analytics?.error('Error tracking user/app open', { error });
                });
        } catch (error) {
            getLogger().analytics?.error('Error ensuring user tracked', { error });
        }
    }
}

export const analyticsService = new AnalyticsService();
