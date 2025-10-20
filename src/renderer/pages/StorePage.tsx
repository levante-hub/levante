import React from 'react';
import { StoreLayout } from '@/components/mcp/store-page/store-layout';
import { Toaster } from 'sonner';

const StorePage = () => {
  return (
    <div className="h-full overflow-y-auto">
      <StoreLayout />
      <Toaster position="top-right" />
    </div>
  )
}

export default StorePage