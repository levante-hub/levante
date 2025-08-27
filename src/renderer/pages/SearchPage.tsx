import { SearchResults } from '@/components/search/SearchResults';
import { useChatStore } from '@/stores/chatStore';

interface SearchPageProps {
  onNavigateToChat?: () => void;
}

export default function SearchPage({ onNavigateToChat }: SearchPageProps) {
  const loadSession = useChatStore((state) => state.loadSession);

  const handleNavigateToSession = async (sessionId: string, messageId: string) => {
    try {
      // Load the session to navigate to the specific message
      await loadSession(sessionId);
      
      // Navigate to chat page
      if (onNavigateToChat) {
        onNavigateToChat();
        
        // Scroll to the specific message after navigation
        setTimeout(() => {
          const messageElement = document.getElementById(`message-${messageId}`);
          if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageElement.classList.add('highlight-message');
            setTimeout(() => {
              messageElement.classList.remove('highlight-message');
            }, 2000);
          }
        }, 300);
      }
      
      console.log(`Navigated to session ${sessionId}, highlighting message ${messageId}`);
    } catch (error) {
      console.error('Failed to navigate to session:', error);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <SearchResults onNavigateToSession={handleNavigateToSession} />
    </div>
  );
}