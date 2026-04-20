import { useCallback, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface AddFilesModalProps {
  open: boolean
  onClose: () => void
  projectId: string
  onFilesAdded: () => void
}

export function AddFilesModal({ open, onClose, projectId, onFilesAdded }: AddFilesModalProps) {
  const { t } = useTranslation('chat')
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length === 0) return

    const paths = files
      .map((f) => window.levante.projects.getPathForFile(f))
      .filter((p): p is string => !!p)

    if (paths.length === 0) {
      toast.error(t('chat_list.file_browser.add_modal.no_valid_paths'))
      return
    }

    setIsUploading(true)
    try {
      const result = await window.levante.projects.addFilesWithPaths(projectId, paths)
      if (result.success && result.data && result.data.length > 0) {
        toast.success(t('chat_list.file_browser.add_modal.success', { count: result.data.length }))
        onFilesAdded()
        onClose()
      } else if (!result.success) {
        toast.error(result.error ?? t('chat_list.file_browser.add_modal.error_generic'))
      }
    } finally {
      setIsUploading(false)
    }
  }, [projectId, onFilesAdded, onClose, t])

  const handleBrowse = async () => {
    setIsUploading(true)
    try {
      const result = await window.levante.projects.addFiles(projectId)
      if (result.success && result.data && result.data.length > 0) {
        toast.success(t('chat_list.file_browser.add_modal.success', { count: result.data.length }))
        onFilesAdded()
        onClose()
      }
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('chat_list.file_browser.add_modal.title')}</DialogTitle>
          <DialogDescription>
            {t('chat_list.file_browser.add_modal.description')}
          </DialogDescription>
        </DialogHeader>

        <div
          className={[
            'relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors',
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          ].join(' ')}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isUploading ? (
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-center text-sm text-muted-foreground">
                {t('chat_list.file_browser.add_modal.drop_zone')}
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="w-full" onClick={handleBrowse} disabled={isUploading}>
            {t('chat_list.file_browser.add_modal.browse')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
