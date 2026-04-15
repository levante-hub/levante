import { InValue } from '@libsql/client';
import { databaseService } from './databaseService';
import {
  ChatSession,
  Message,
  PersistedToolCall,
  CreateChatSessionInput,
  CreateMessageInput,
  UpdateChatSessionInput,
  UpdateMessageInput,
  GetMessagesQuery,
  GetChatSessionsQuery,
  DatabaseResult,
  PaginatedResult
} from '../../types/database';
import { getLogger } from './logging';
import { escapeLikePattern } from '../utils/sqlSanitizer';
import {
  collectToolResultAssetIds,
  normalizeToolCallResultForStorage,
} from './toolResults/canonicalToolResultService';
import { deleteImageAssetsIfUnused } from './toolResults/toolResultAssetStore';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function coercePersistedToolCall(value: unknown): PersistedToolCall | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: typeof value.id === 'string' ? value.id : '',
    name: typeof value.name === 'string' ? value.name : '',
    arguments: isRecord(value.arguments) ? value.arguments : {},
    ...(value.result !== undefined ? { result: value.result } : {}),
    status: typeof value.status === 'string' ? value.status : 'success',
  };
}

function parsePersistedToolCalls(toolCalls: string | null | undefined): PersistedToolCall[] | null {
  if (!toolCalls) {
    return null;
  }

  try {
    const parsed = JSON.parse(toolCalls);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed
      .map(coercePersistedToolCall)
      .filter((toolCall): toolCall is PersistedToolCall => toolCall !== null);
  } catch {
    return null;
  }
}

function collectAssetIdsFromToolCalls(toolCalls: PersistedToolCall[] | null | undefined): string[] {
  if (!toolCalls) {
    return [];
  }

  return [...new Set(toolCalls.flatMap((toolCall) => collectToolResultAssetIds(toolCall.result)))];
}

async function normalizeToolCallsForStorage(toolCalls: PersistedToolCall[]): Promise<{
  value: PersistedToolCall[];
  changed: boolean;
  assetIds: string[];
}> {
  const value: PersistedToolCall[] = [];
  const assetIds: string[] = [];
  let changed = false;

  for (const toolCall of toolCalls) {
    const normalizedResult = await normalizeToolCallResultForStorage(toolCall.result);
    value.push({
      ...toolCall,
      ...(normalizedResult.normalized !== undefined
        ? { result: normalizedResult.normalized }
        : {}),
    });
    assetIds.push(...normalizedResult.assetIds);
    if (normalizedResult.changed) {
      changed = true;
    }
  }

  return {
    value,
    changed,
    assetIds: [...new Set(assetIds)],
  };
}

export class ChatService {
  private logger = getLogger();

  private async normalizeToolCallsJsonForStorage(toolCalls: string | null | undefined): Promise<{
    serialized: string | null;
    changed: boolean;
    assetIds: string[];
  }> {
    const parsed = parsePersistedToolCalls(toolCalls);
    if (!parsed) {
      return {
        serialized: toolCalls ?? null,
        changed: false,
        assetIds: [],
      };
    }

    const normalized = await normalizeToolCallsForStorage(parsed);
    const serialized = JSON.stringify(normalized.value);

    return {
      serialized,
      changed: normalized.changed || serialized !== toolCalls,
      assetIds: normalized.assetIds,
    };
  }

  private async rewriteNormalizedToolCalls(messageId: string, toolCalls: string): Promise<string> {
    const normalized = await this.normalizeToolCallsJsonForStorage(toolCalls);
    if (normalized.changed) {
      await databaseService.execute(
        'UPDATE messages SET tool_calls = ? WHERE id = ?',
        [normalized.serialized as InValue, messageId as InValue],
      );
    }

    return normalized.serialized ?? toolCalls;
  }

  private async mapMessageRow(row: any[]): Promise<Message> {
    const toolCalls = typeof row[4] === 'string' && row[4].length > 0
      ? await this.rewriteNormalizedToolCalls(row[0] as string, row[4] as string)
      : ((row[4] as string) || null);

    return {
      id: row[0] as string,
      session_id: row[1] as string,
      role: row[2] as 'user' | 'assistant' | 'system',
      content: row[3] as string,
      tool_calls: toolCalls,
      created_at: row[5] as number,
      attachments: (row[6] as string) || null,
      reasoningText: (row[7] as string) || null,
      input_tokens: (row[8] as number) ?? null,
      output_tokens: (row[9] as number) ?? null,
      total_tokens: (row[10] as number) ?? null,
    };
  }

  private async getAssetIdsForSessionMessages(sessionId: string): Promise<string[]> {
    const result = await databaseService.execute(
      'SELECT tool_calls FROM messages WHERE session_id = ?',
      [sessionId as InValue],
    );

    return [...new Set(
      result.rows.flatMap((row) =>
        collectAssetIdsFromToolCalls(parsePersistedToolCalls((row[0] as string) || null)),
      ),
    )];
  }

  private async getAssetIdsForMessagesAfter(
    sessionId: string,
    afterTimestamp: number,
  ): Promise<string[]> {
    const result = await databaseService.execute(
      'SELECT tool_calls FROM messages WHERE session_id = ? AND created_at > ?',
      [sessionId as InValue, afterTimestamp as InValue],
    );

    return [...new Set(
      result.rows.flatMap((row) =>
        collectAssetIdsFromToolCalls(parsePersistedToolCalls((row[0] as string) || null)),
      ),
    )];
  }

  // Chat Sessions
  async createSession(input: CreateChatSessionInput): Promise<DatabaseResult<ChatSession>> {
    this.logger.database.debug('Creating new chat session', { input });

    try {
      const id = this.generateId();
      const now = Date.now();

      const session: ChatSession = {
        id,
        title: input.title,
        model: input.model,
        session_type: input.session_type || 'chat', // Default to 'chat' if not specified
        folder_id: input.folder_id ?? null, // Convert undefined to null for SQLite
        created_at: now,
        updated_at: now,
        project_id: input.project_id ?? null,
      };

      await databaseService.execute(
        `INSERT INTO chat_sessions (id, title, model, session_type, folder_id, created_at, updated_at, project_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.id as InValue,
          session.title as InValue,
          session.model as InValue,
          session.session_type as InValue, // Add session_type
          (session.folder_id ?? null) as InValue, // Ensure null instead of undefined
          session.created_at as InValue,
          session.updated_at as InValue,
          (session.project_id ?? null) as InValue,
        ]
      );

      this.logger.database.info('Chat session created successfully', {
        sessionId: id,
        sessionType: session.session_type
      });
      return { data: session, success: true };
    } catch (error) {
      this.logger.database.error('Failed to create chat session', {
        error: error instanceof Error ? error.message : error,
        input
      });
      return {
        data: {} as ChatSession,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getSession(id: string): Promise<DatabaseResult<ChatSession | null>> {
    try {
      const result = await databaseService.execute(
        `SELECT id, title, model, session_type, folder_id, created_at, updated_at, project_id
         FROM chat_sessions WHERE id = ?`,
        [id as InValue]
      );

      const row = result.rows[0];
      if (!row) {
        return { data: null, success: true };
      }

      const sessionType = row[3] as string;
      const session: ChatSession = {
        id: row[0] as string,
        title: row[1] as string,
        model: row[2] as string,
        session_type: (sessionType === 'chat' || sessionType === 'inference') ? sessionType : 'chat',
        folder_id: row[4] as string,
        created_at: row[5] as number,
        updated_at: row[6] as number,
        project_id: row[7] as string | null,
      };

      return { data: session, success: true };
    } catch (error) {
      this.logger.database.error('Failed to get chat session', {
        error: error instanceof Error ? error.message : error
      });
      return {
        data: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getSessions(query: GetChatSessionsQuery = {}): Promise<DatabaseResult<PaginatedResult<ChatSession>>> {
    this.logger.database.debug('Getting chat sessions', { query });

    try {
      const { folder_id, project_id, limit = 50, offset = 0 } = query;

      let sql = 'SELECT id, title, model, session_type, folder_id, created_at, updated_at, project_id FROM chat_sessions';
      let countSql = 'SELECT COUNT(*) as total FROM chat_sessions';
      const params: InValue[] = [];
      const countParams: InValue[] = [];

      if (folder_id) {
        sql += ' WHERE folder_id = ?';
        countSql += ' WHERE folder_id = ?';
        params.push(folder_id as InValue);
        countParams.push(folder_id as InValue);
      } else if (project_id === null) {
        sql += ' WHERE project_id IS NULL';
        countSql += ' WHERE project_id IS NULL';
      } else if (project_id !== undefined) {
        sql += ' WHERE project_id = ?';
        countSql += ' WHERE project_id = ?';
        params.push(project_id as InValue);
        countParams.push(project_id as InValue);
      }

      sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
      params.push(limit as InValue, offset as InValue);

      // Get total count
      const countResult = await databaseService.execute(countSql, countParams);
      const total = countResult.rows[0][0] as number;

      // Get sessions
      const result = await databaseService.execute(sql, params);

      const sessions: ChatSession[] = result.rows.map(row => {
        const sessionType = row[3] as string;
        return {
          id: row[0] as string,
          title: row[1] as string,
          model: row[2] as string,
          session_type: (sessionType === 'chat' || sessionType === 'inference') ? sessionType : 'chat',
          folder_id: row[4] as string,
          created_at: row[5] as number,
          updated_at: row[6] as number,
          project_id: row[7] as string | null,
        };
      });

      const paginatedResult: PaginatedResult<ChatSession> = {
        items: sessions,
        total,
        limit,
        offset
      };

      this.logger.database.debug('Retrieved chat sessions', { total, returned: sessions.length, limit, offset });
      return { data: paginatedResult, success: true };
    } catch (error) {
      this.logger.database.error('Failed to get chat sessions', {
        error: error instanceof Error ? error.message : error,
        query
      });
      return {
        data: { items: [], total: 0, limit: 0, offset: 0 },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async updateSession(input: UpdateChatSessionInput): Promise<DatabaseResult<ChatSession | null>> {
    try {
      const { id, ...updates } = input;
      const updateFields: string[] = [];
      const params: InValue[] = [];

      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          updateFields.push(`${key} = ?`);
          params.push(value as InValue);
        }
      });

      if (updateFields.length === 0) {
        return this.getSession(id);
      }

      updateFields.push('updated_at = ?');
      params.push(Date.now() as InValue);
      params.push(id as InValue);

      await databaseService.execute(
        `UPDATE chat_sessions SET ${updateFields.join(', ')} WHERE id = ?`,
        params
      );

      return this.getSession(id);
    } catch (error) {
      this.logger.database.error('Failed to update chat session', {
        error: error instanceof Error ? error.message : error
      });
      return {
        data: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async deleteSession(id: string): Promise<DatabaseResult<boolean>> {
    try {
      const assetIds = await this.getAssetIdsForSessionMessages(id);

      await databaseService.execute(
        'DELETE FROM chat_sessions WHERE id = ?',
        [id as InValue]
      );

      await deleteImageAssetsIfUnused(assetIds);

      return { data: true, success: true };
    } catch (error) {
      this.logger.database.error('Failed to delete chat session', {
        error: error instanceof Error ? error.message : error
      });
      return {
        data: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Messages
  async createMessage(input: CreateMessageInput): Promise<DatabaseResult<Message>> {
    this.logger.database.debug('Creating message', {
      sessionId: input.session_id,
      role: input.role,
      contentLength: input.content.length,
      hasToolCalls: !!input.tool_calls,
      hasAttachments: !!input.attachments,
      attachmentCount: input.attachments?.length || 0,
      providedId: !!input.id // Log if frontend supplied an ID
    });

    try {
      // Use frontend-provided ID when present, otherwise generate a new one
      const id = input.id || this.generateId();
      const now = Date.now();
      const normalizedToolCalls = input.tool_calls
        ? await normalizeToolCallsForStorage(input.tool_calls)
        : null;

      const attachmentsString = input.attachments ? JSON.stringify(input.attachments) : null;
      const reasoningString = input.reasoningText ? JSON.stringify(input.reasoningText) : null;

      this.logger.database.debug('Upserting message into database', {
        messageId: id,
        hasAttachments: !!attachmentsString,
        attachmentsLength: attachmentsString?.length || 0,
        hasReasoning: !!reasoningString,
      });

      const message: Message = {
        id,
        session_id: input.session_id,
        role: input.role,
        content: input.content,
        tool_calls: normalizedToolCalls ? JSON.stringify(normalizedToolCalls.value) : null,
        attachments: attachmentsString,
        reasoningText: reasoningString,
        input_tokens: input.input_tokens ?? null,
        output_tokens: input.output_tokens ?? null,
        total_tokens: input.total_tokens ?? null,
        created_at: now
      };

      // Try to upsert with reasoning + token columns first (new schema)
      // If it fails, retry without those columns (old schema)
      try {
        await databaseService.execute(
          `INSERT INTO messages (
             id, session_id, role, content, tool_calls, attachments, reasoning,
             input_tokens, output_tokens, total_tokens, created_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             content = excluded.content,
             tool_calls = excluded.tool_calls,
             attachments = excluded.attachments,
             reasoning = excluded.reasoning,
             input_tokens = excluded.input_tokens,
             output_tokens = excluded.output_tokens,
             total_tokens = excluded.total_tokens`,
          [
            message.id as InValue,
            message.session_id as InValue,
            message.role as InValue,
            message.content as InValue,
            message.tool_calls as InValue,
            message.attachments as InValue,
            message.reasoningText as InValue,
            (message.input_tokens ?? null) as InValue,
            (message.output_tokens ?? null) as InValue,
            (message.total_tokens ?? null) as InValue,
            message.created_at as InValue,
          ]
        );
      } catch (error: any) {
        // If error is about missing column, retry without reasoning/token columns
        if (error?.message?.includes('no such column')) {
          this.logger.database.warn('New columns not found, upserting with legacy schema (migration pending)', {
            messageId: id
          });
          await databaseService.execute(
            `INSERT INTO messages (id, session_id, role, content, tool_calls, attachments, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               content = excluded.content,
               tool_calls = excluded.tool_calls,
               attachments = excluded.attachments`,
            [
              message.id as InValue,
              message.session_id as InValue,
              message.role as InValue,
              message.content as InValue,
              message.tool_calls as InValue,
              message.attachments as InValue,
              message.created_at as InValue
            ]
          );
        } else {
          throw error; // Re-throw if it's a different error
        }
      }

      this.logger.database.info('Message created successfully', {
        messageId: id,
        sessionId: input.session_id,
        role: input.role
      });

      // Update session's updated_at timestamp
      await databaseService.execute(
        'UPDATE chat_sessions SET updated_at = ? WHERE id = ?',
        [now as InValue, input.session_id as InValue]
      );

      this.logger.database.info('Message created successfully', { messageId: id, sessionId: input.session_id });
      return { data: message, success: true };
    } catch (error) {
      this.logger.database.error('Failed to create message', {
        error: error instanceof Error ? error.message : error,
        input: { ...input, content: `${input.content.substring(0, 100)}...` }
      });
      return {
        data: {} as Message,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getMessages(query: GetMessagesQuery): Promise<DatabaseResult<PaginatedResult<Message>>> {
    try {
      const { session_id, limit = 100, offset = 0 } = query;

      // Get total count
      const countResult = await databaseService.execute(
        'SELECT COUNT(*) as total FROM messages WHERE session_id = ?',
        [session_id as InValue]
      );
      const total = countResult.rows[0][0] as number;

      // Get messages (using SELECT * for compatibility with old/new schema)
      // Column order from PRAGMA table_info(messages):
      // 0: id, 1: session_id, 2: role, 3: content, 4: tool_calls,
      // 5: created_at, 6: attachments, 7: reasoning
      const result = await databaseService.execute(
        'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
        [session_id as InValue, limit as InValue, offset as InValue]
      );

      const messages = await Promise.all(
        result.rows.map((row) => this.mapMessageRow(row as unknown as any[])),
      );

      const paginatedResult: PaginatedResult<Message> = {
        items: messages,
        total,
        limit,
        offset
      };

      return { data: paginatedResult, success: true };
    } catch (error) {
      this.logger.database.error('Failed to get messages', {
        error: error instanceof Error ? error.message : error
      });
      return {
        data: { items: [], total: 0, limit: 0, offset: 0 },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async searchMessages(searchQuery: string, sessionId?: string, limit = 50): Promise<DatabaseResult<Message[]>> {
    this.logger.database.debug('Searching messages', { searchQuery, sessionId, limit });

    try {
      // Security: Escape LIKE wildcards to prevent LIKE injection
      const escapedQuery = escapeLikePattern(searchQuery);

      let sql = 'SELECT * FROM messages WHERE content LIKE ? ESCAPE ?';
      const params: InValue[] = [`%${escapedQuery}%` as InValue, '\\' as InValue];

      if (sessionId) {
        sql += ' AND session_id = ?';
        params.push(sessionId as InValue);
      }

      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit as InValue);

      const result = await databaseService.execute(sql, params);

      // Column order from PRAGMA table_info(messages):
      // 0: id, 1: session_id, 2: role, 3: content, 4: tool_calls,
      // 5: created_at, 6: attachments, 7: reasoning, 8: input_tokens, 9: output_tokens, 10: total_tokens
      const messages = await Promise.all(
        result.rows.map((row) => this.mapMessageRow(row as unknown as any[])),
      );

      this.logger.database.debug('Search completed', { found: messages.length, query: searchQuery });
      return { data: messages, success: true };
    } catch (error) {
      this.logger.database.error('Failed to search messages', {
        error: error instanceof Error ? error.message : error,
        searchQuery,
        sessionId,
        limit
      });
      return {
        data: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update a message's content
   * This is typically used when a user edits their message
   */
  async updateMessage(input: UpdateMessageInput): Promise<DatabaseResult<Message | null>> {
    this.logger.database.debug('Updating message', {
      messageId: input.id,
      hasContent: !!input.content,
      hasToolCalls: !!input.tool_calls
    });

    try {
      const existingMessage = await this.getMessage(input.id);
      const previousToolCalls = existingMessage.success && existingMessage.data?.tool_calls
        ? parsePersistedToolCalls(existingMessage.data.tool_calls)
        : null;
      const previousAssetIds = collectAssetIdsFromToolCalls(previousToolCalls);
      const updateFields: string[] = [];
      const params: InValue[] = [];
      let nextAssetIds = previousAssetIds;

      if (input.content !== undefined) {
        updateFields.push('content = ?');
        params.push(input.content as InValue);
      }

      if (input.tool_calls !== undefined) {
        const normalizedToolCalls = await normalizeToolCallsForStorage(input.tool_calls);
        updateFields.push('tool_calls = ?');
        params.push(JSON.stringify(normalizedToolCalls.value) as InValue);
        nextAssetIds = normalizedToolCalls.assetIds;
      }

      if (updateFields.length === 0) {
        this.logger.database.warn('No fields to update in message', { messageId: input.id });
        return this.getMessage(input.id);
      }

      params.push(input.id as InValue);

      await databaseService.execute(
        `UPDATE messages SET ${updateFields.join(', ')} WHERE id = ?`,
        params
      );

      const orphanedAssetIds = previousAssetIds.filter(
        (assetId) => !nextAssetIds.includes(assetId),
      );
      if (orphanedAssetIds.length > 0) {
        await deleteImageAssetsIfUnused(orphanedAssetIds);
      }

      this.logger.database.info('Message updated successfully', { messageId: input.id });
      return this.getMessage(input.id);
    } catch (error) {
      this.logger.database.error('Failed to update message', {
        error: error instanceof Error ? error.message : error,
        messageId: input.id
      });
      return {
        data: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Delete all messages after a specific timestamp in a session
   * Used when editing a message to remove subsequent conversation
   */
  async deleteMessagesAfter(sessionId: string, afterTimestamp: number): Promise<DatabaseResult<number>> {
    this.logger.database.debug('Deleting messages after timestamp', {
      sessionId,
      afterTimestamp
    });

    try {
      const assetIds = await this.getAssetIdsForMessagesAfter(sessionId, afterTimestamp);
      const result = await databaseService.execute(
        'DELETE FROM messages WHERE session_id = ? AND created_at > ?',
        [sessionId as InValue, afterTimestamp as InValue]
      );

      const deletedCount = result.rowsAffected || 0;

      if (deletedCount > 0) {
        await deleteImageAssetsIfUnused(assetIds);
      }

      this.logger.database.info('Messages deleted successfully', {
        sessionId,
        deletedCount
      });

      return {
        data: deletedCount,
        success: true
      };
    } catch (error) {
      this.logger.database.error('Failed to delete messages', {
        error: error instanceof Error ? error.message : error,
        sessionId,
        afterTimestamp
      });
      return {
        data: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get a single message by ID
   */
  private async getMessage(id: string): Promise<DatabaseResult<Message | null>> {
    try {
      const result = await databaseService.execute(
        'SELECT * FROM messages WHERE id = ?',
        [id as InValue]
      );

      if (result.rows.length === 0) {
        return { data: null, success: true };
      }

      const message = await this.mapMessageRow(result.rows[0] as unknown as any[]);

      return { data: message, success: true };
    } catch (error) {
      this.logger.database.error('Failed to get message', {
        error: error instanceof Error ? error.message : error,
        messageId: id
      });
      return {
        data: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getMessagesForContext(sessionId: string): Promise<DatabaseResult<Message[]>> {
    try {
      const result = await this.getMessages({
        session_id: sessionId,
        limit: 10000,
        offset: 0,
      });

      if (!result.success || !result.data) {
        return {
          data: [],
          success: false,
          error: result.error || 'Failed to load messages for context',
        };
      }

      const messages = result.data.items;
      let compactionIndex = -1;

      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (
          m.role === 'system' &&
          typeof m.content === 'string' &&
          m.content.startsWith('[COMPACTION_SUMMARY]')
        ) {
          compactionIndex = i;
          break;
        }
      }

      return {
        data: compactionIndex >= 0 ? messages.slice(compactionIndex) : messages,
        success: true,
      };
    } catch (error) {
      this.logger.database.error('Failed to get messages for context', {
        sessionId,
        error: error instanceof Error ? error.message : error,
      });

      return {
        data: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Utility methods
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Singleton instance
export const chatService = new ChatService();
