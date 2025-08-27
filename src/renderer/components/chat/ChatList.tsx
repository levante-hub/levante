import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, MoreVertical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { ChatSession } from '../../../types/database';
import { cn } from '@/lib/utils';
import { searchTextMatch } from '@/utils/textUtils';

interface ChatListProps {
  sessions: ChatSession[];
  currentSessionId?: string;
  onSessionSelect: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (sessionId: string) => void;
  loading?: boolean;
}

export function ChatList({
  sessions,
  currentSessionId,
  onSessionSelect,
  onNewChat,
  onDeleteChat,
  loading = false
}: ChatListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSessions, setFilteredSessions] = useState<ChatSession[]>(sessions);

  // Filter sessions based on search query (accent-insensitive)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSessions(sessions);
    } else {
      const filtered = sessions.filter(session =>
        searchTextMatch(session.title || '', searchQuery) ||
        searchTextMatch(session.model, searchQuery)
      );
      setFilteredSessions(filtered);
    }
  }, [sessions, searchQuery]);

  // Group sessions by date
  const groupedSessions = filteredSessions.reduce((groups, session) => {
    const date = new Date(session.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let key: string;

    if (date.toDateString() === today.toDateString()) {
      key = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      key = 'Yesterday';
    } else if (date.getTime() > today.getTime() - 7 * 24 * 60 * 60 * 1000) {
      key = 'This Week';
    } else if (date.getTime() > today.getTime() - 30 * 24 * 60 * 60 * 1000) {
      key = 'This Month';
    } else {
      key = 'Older';
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(session);
    return groups;
  }, {} as Record<string, ChatSession[]>);

  // Sort groups by date (most recent first)
  const sortedGroupKeys = Object.keys(groupedSessions).sort((a, b) => {
    const order = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
    return order.indexOf(a) - order.indexOf(b);
  });


  return (
    <div className="flex flex-col h-full">
      {/* Header with New Chat button */}
      <div className="p-4 border-b">
        <Button
          onClick={onNewChat}
          className="w-full mb-3 justify-start gap-2"
          disabled={loading}
        >
          <Plus size={16} />
          New Chat
        </Button>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground">
            Loading chats...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {searchQuery ? 'No chats found' : 'No chats yet'}
          </div>
        ) : (
          sortedGroupKeys.map(groupKey => (
            <div key={groupKey}>
              {/* Group Header */}
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {groupKey}
              </div>

              {/* Sessions in Group */}
              {groupedSessions[groupKey]
                .sort((a, b) => b.updated_at - a.updated_at) // Most recent first
                .map(session => (
                  <div
                    key={session.id}
                    className={cn(
                      "group mx-4 mb-1 rounded-lg cursor-pointer transition-colors",
                      "hover:bg-accent/50",
                      currentSessionId === session.id && "bg-accent"
                    )}
                    onClick={() => onSessionSelect(session.id)}
                  >
                    <div className="flex items-center gap-2 p-1">

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {session.title || 'Untitled Chat'}
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteChat(session.id);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 size={14} className="mr-2" />
                            Delete Chat
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}