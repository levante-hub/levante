import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, MessageSquare, Calendar, User, Bot, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useChatStore } from '@/stores/chatStore';
import { Message } from '../../../types/database';
import { cn } from '@/lib/utils';
import { normalizeSearchText } from '@/utils/textUtils';

interface SearchResultsProps {
  onNavigateToSession?: (sessionId: string, messageId: string) => void;
}

interface SearchResultItemProps {
  message: Message;
  sessionTitle?: string;
  onNavigate?: (sessionId: string, messageId: string) => void;
  searchQuery?: string;
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  
  const normalizedQuery = normalizeSearchText(query);
  const normalizedText = normalizeSearchText(text);
  
  // Find all matches in the normalized text
  const matches: Array<{ start: number; end: number; originalText: string }> = [];
  let searchStart = 0;
  
  while (searchStart < normalizedText.length) {
    const matchIndex = normalizedText.indexOf(normalizedQuery, searchStart);
    if (matchIndex === -1) break;
    
    const matchEnd = matchIndex + normalizedQuery.length;
    matches.push({
      start: matchIndex,
      end: matchEnd,
      originalText: text.substring(matchIndex, matchEnd)
    });
    searchStart = matchEnd;
  }
  
  if (matches.length === 0) return text;
  
  // Build the highlighted result
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  
  matches.forEach((match, index) => {
    // Add text before match
    if (match.start > lastIndex) {
      parts.push(text.substring(lastIndex, match.start));
    }
    
    // Add highlighted match
    parts.push(
      <mark key={`highlight-${index}`} className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">
        {text.substring(match.start, match.end)}
      </mark>
    );
    
    lastIndex = match.end;
  });
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts;
}

function SearchResultItem({ message, sessionTitle, onNavigate, searchQuery }: SearchResultItemProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleNavigate = () => {
    onNavigate?.(message.session_id, message.id);
  };

  return (
    <Card className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={handleNavigate}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {message.role === 'user' ? (
              <User className="h-4 w-4 text-primary" />
            ) : (
              <Bot className="h-4 w-4 text-secondary-foreground" />
            )}
            <Badge variant={message.role === 'user' ? 'default' : 'secondary'}>
              {message.role}
            </Badge>
            {sessionTitle && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {sessionTitle}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(message.created_at)}
            <ChevronRight className="h-3 w-3" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed">
          {searchQuery ? highlightText(message.content, searchQuery) : message.content}
        </p>
      </CardContent>
    </Card>
  );
}

export function SearchResults({ onNavigateToSession }: SearchResultsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  const {
    searchResults,
    searchLoading,
    searchError,
    searchMessages,
    clearSearch,
    sessions
  } = useChatStore();

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchMessages(searchQuery);
      } else {
        clearSearch();
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchMessages, clearSearch]);

  // Keep input focused when search results change
  useEffect(() => {
    if (inputRef.current && searchQuery && !searchLoading) {
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      });
    }
  }, [searchResults, searchLoading, searchQuery]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    setSearchQuery(newValue);
    
    // Preserve focus and cursor position after state update
    requestAnimationFrame(() => {
      if (inputRef.current && cursorPosition !== null) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(cursorPosition, cursorPosition);
      }
    });
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    clearSearch();
    
    // Keep focus on input after clearing
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    });
  }, [clearSearch]);

  // Memoized grouping for performance
  const { groupedResults, resultCount, sessionCount } = useMemo(() => {
    const grouped = searchResults.reduce((groups, message) => {
      const sessionId = message.session_id;
      if (!groups[sessionId]) {
        groups[sessionId] = {
          session: sessions.find(s => s.id === sessionId),
          messages: []
        };
      }
      groups[sessionId].messages.push(message);
      return groups;
    }, {} as Record<string, { session?: any; messages: Message[] }>);

    return {
      groupedResults: grouped,
      resultCount: searchResults.length,
      sessionCount: Object.keys(grouped).length
    };
  }, [searchResults, sessions]);

  return (
    <div className="flex flex-col h-full">
      {/* Search Header */}
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Search Messages</h2>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            ref={inputRef}
            placeholder="Search across all messages..."
            value={searchQuery}
            onChange={handleInputChange}
            className="pl-9 pr-10"
            disabled={searchLoading}
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
              onClick={handleClearSearch}
            >
              ×
            </Button>
          )}
        </div>

        {/* Search Stats */}
        {(searchQuery && !searchLoading) && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {resultCount > 0 ? (
              <>
                <span>{resultCount} message{resultCount !== 1 ? 's' : ''}</span>
                <Separator orientation="vertical" className="h-4" />
                <span>{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
              </>
            ) : searchQuery && !searchLoading ? (
              <span>No messages found</span>
            ) : null}
          </div>
        )}
      </div>

      {/* Search Results */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {searchLoading && (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 animate-pulse" />
                Searching messages...
              </div>
            )}

            {searchError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Search failed: {searchError}
                </AlertDescription>
              </Alert>
            )}

            {!searchLoading && !searchError && searchQuery && resultCount === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2" />
                <p>No messages found matching "{searchQuery}"</p>
                <p className="text-xs mt-1">Try different keywords or check spelling</p>
              </div>
            )}

            {!searchQuery && !searchLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Search Your Messages</h3>
                <p className="text-sm max-w-md mx-auto">
                  Find conversations, specific topics, or answers from your chat history.
                  Search supports accent-insensitive matching.
                </p>
              </div>
            )}

            {Object.entries(groupedResults).map(([sessionId, { session, messages }]) => (
              <div key={sessionId} className="space-y-2">
                {session && (
                  <div className="flex items-center gap-2 px-2 py-1">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">
                      {session.title || 'Untitled Chat'}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {messages.length} match{messages.length !== 1 ? 'es' : ''}
                    </Badge>
                  </div>
                )}
                
                <div className="space-y-2">
                  {messages.map(message => (
                    <SearchResultItem
                      key={message.id}
                      message={message}
                      sessionTitle={session?.title}
                      onNavigate={onNavigateToSession}
                      searchQuery={searchQuery}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}