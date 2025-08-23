import { MainLayout } from '@/components/layout/MainLayout'
import ChatPage from '@/pages/ChatPage'

function App() {
  return (
    <MainLayout title="Chat">
      <ChatPage />
    </MainLayout>
  )
}

export default App