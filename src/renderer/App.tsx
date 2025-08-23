import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import ChatPage from '@/pages/ChatPage'
import SettingsPage from '@/pages/SettingsPage'
import ModelPage from '@/pages/ModelPage'
import StorePage from '@/pages/StorePage'
import { useChatStore, initializeChatStore } from '@/stores/chatStore'
import { modelService } from '@/services/modelService'

function App() {
  const [currentPage, setCurrentPage] = useState('chat')
  
  // Initialize services after component mounts
  useEffect(() => {
    const initializeServices = async () => {
      await Promise.all([
        initializeChatStore(),
        modelService.initialize()
      ]);
    };
    
    initializeServices().catch(console.error);
  }, []);
  
  // Chat management for sidebar - using Zustand selectors
  const currentSession = useChatStore((state) => state.currentSession)
  const sessions = useChatStore((state) => state.sessions)
  const startNewChat = useChatStore((state) => state.startNewChat)
  const loadSession = useChatStore((state) => state.loadSession)
  const deleteSession = useChatStore((state) => state.deleteSession)

  const getPageTitle = (page: string) => {
    switch (page) {
      case 'chat': 
        return currentSession?.title || 'Chat'
      case 'settings': 
        return 'Settings'
      case 'model': 
        return 'Model'
      case 'store': 
        return 'Store'
      default: 
        return 'Chat'
    }
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'chat': return <ChatPage />
      case 'settings': return <SettingsPage />
      case 'model': return <ModelPage />
      case 'store': return <StorePage />
      default: return <ChatPage />
    }
  }

  // Get sidebar content for current page
  const getSidebarContent = () => {
    if (currentPage === 'chat' && typeof ChatPage.getSidebarContent === 'function') {
      return ChatPage.getSidebarContent(
        sessions,
        currentSession?.id,
        loadSession,
        startNewChat, // Start new chat (no session creation yet)
        deleteSession,
        false // loading state
      );
    }
    return null;
  }

  return (
    <MainLayout 
      title={getPageTitle(currentPage)}
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      sidebarContent={getSidebarContent()}
    >
      {renderPage()}
    </MainLayout>
  )
}

export default App