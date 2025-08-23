import { useState } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import ChatPage from '@/pages/ChatPage'
import SettingsPage from '@/pages/SettingsPage'
import ModelPage from '@/pages/ModelPage'
import StorePage from '@/pages/StorePage'

function App() {
  const [currentPage, setCurrentPage] = useState('chat')

  const getPageTitle = (page: string) => {
    switch (page) {
      case 'chat': return 'Chat'
      case 'settings': return 'Settings'
      case 'model': return 'Model'
      case 'store': return 'Store'
      default: return 'Chat'
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

  return (
    <MainLayout 
      title={getPageTitle(currentPage)}
      currentPage={currentPage}
      onPageChange={setCurrentPage}
    >
      {renderPage()}
    </MainLayout>
  )
}

export default App