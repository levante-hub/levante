import { createClient, SupabaseClient as SupabaseClientType } from '@supabase/supabase-js';
import { UserRecord } from '../../../types/analytics';
import { getLogger } from '../logging';

const SUPABASE_URL = 'https://fgwotpadzuuvnaritbcx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnd290cGFkenV1dm5hcml0YmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MzI1NzQsImV4cCI6MjA2MzUwODU3NH0.1Dp7YdPWk4-xrPfwaYiUqlxiogW9y1tERqzLvUjfql8';

export class SupabaseClient {
    private client: SupabaseClientType<any, "app_metrics", any> | null = null;

    constructor() {
        this.initializeClient();
    }

    private initializeClient() {
        try {
            this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                },
                db: {
                    schema: 'app_metrics',
                },
            });
        } catch (error) {
            getLogger().analytics?.error('Failed to initialize Supabase client', { error });
        }
    }

    async insertUser(userId: string, sharingData: boolean): Promise<boolean> {
        if (!this.client) return false;
        try {
            const { error } = await this.client
                .from('users')
                .upsert(
                    {
                        user_id: userId,
                        first_seen_at: new Date().toISOString(),
                        last_seen_at: new Date().toISOString(),
                        sharing_data: sharingData,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'user_id', ignoreDuplicates: true }
                );

            if (error) {
                getLogger().analytics?.error('Supabase insert error details', {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint
                });
                throw error;
            }
            return true;
        } catch (error: any) {
            getLogger().analytics?.error('Failed to insert user', {
                message: error.message || error,
                stack: error.stack
            });
            return false;
        }
    }

    async updateUser(userId: string, updates: Partial<UserRecord>): Promise<boolean> {
        if (!this.client) return false;
        try {
            const { error } = await this.client
                .from('users')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId);

            if (error) throw error;
            return true;
        } catch (error) {
            getLogger().analytics?.error('Failed to update user', { error });
            return false;
        }
    }

    async insertAppOpen(userId: string, version: string, platform: string): Promise<boolean> {
        if (!this.client) return false;
        try {
            const { error } = await this.client.from('app_opens').insert({
                user_id: userId,
                app_version: version,
                platform: platform,
                opened_at: new Date().toISOString(),
            });

            if (error) throw error;
            return true;
        } catch (error) {
            getLogger().analytics?.error('Failed to insert app open', { error });
            return false;
        }
    }

    async insertConversation(userId: string): Promise<boolean> {
        if (!this.client) return false;
        try {
            const { error } = await this.client.from('conversations').insert({
                user_id: userId,
                created_at: new Date().toISOString(),
            });

            if (error) throw error;
            return true;
        } catch (error) {
            getLogger().analytics?.error('Failed to insert conversation', { error });
            return false;
        }
    }

    async insertMCPUsage(userId: string, mcpName: string, status: 'active' | 'removed'): Promise<boolean> {
        if (!this.client) return false;
        try {
            const { error } = await this.client.from('mcp_usage').insert({
                user_id: userId,
                mcp_name: mcpName,
                status: status,
                event_at: new Date().toISOString(),
            });

            if (error) throw error;
            return true;
        } catch (error) {
            getLogger().analytics?.error('Failed to insert MCP usage', { error });
            return false;
        }
    }

    async insertModelUsage(userId: string, modelId: string, provider: string): Promise<boolean> {
        if (!this.client) return false;
        try {
            const { error } = await this.client.rpc('log_model_usage', {
                p_user_id: userId,
                p_model_id: modelId,
                p_provider: provider,
            });

            if (error) throw error;
            return true;
        } catch (error) {
            getLogger().analytics?.error('Failed to insert model usage', { error });
            return false;
        }
    }
    async insertRuntimeUsage(
        userId: string,
        runtimeType: import('../../../types/runtime').RuntimeType,
        runtimeVersion: string,
        runtimeSource: 'system' | 'shared',
        action: 'installed' | 'used',
        mcpServerId?: string
    ): Promise<boolean> {
        if (!this.client) return false;
        try {
            const { error } = await this.client.from('runtime_usage').insert({
                user_id: userId,
                runtime_type: runtimeType,
                runtime_version: runtimeVersion,
                runtime_source: runtimeSource,
                action: action,
                mcp_server_id: mcpServerId,
                event_at: new Date().toISOString(),
            });

            if (error) throw error;
            return true;
        } catch (error) {
            getLogger().analytics?.error('Failed to insert runtime usage', { error });
            return false;
        }
    }
}
