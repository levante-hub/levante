import { useState } from 'react';
import { StoreLayout } from '@/components/mcp/store-page/store-layout';
import { Toaster } from 'sonner';
import { Store, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

type ViewMode = 'active' | 'store';

const StorePage = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('active');

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-10 pt-6 pb-2">
        <div className="inline-flex items-center rounded-full bg-muted p-1">
          <button
            onClick={() => setViewMode('active')}
            className={cn(
              "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium transition-all",
              viewMode === 'active'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Wrench className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('store')}
            className={cn(
              "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium transition-all",
              viewMode === 'store'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Store className="w-4 h-4" />
          </button>
        </div>
      </div>
      <StoreLayout mode={viewMode} />
      <Toaster position="top-right" />
    </div>
  )
}

export default StorePage