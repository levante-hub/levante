import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import type { SkillDescriptor, InstallSkillOptions, UninstallSkillOptions } from '../../../types/skills'

const DEFAULT_SKILL_IDS = new Set(['custom/skill-creator', 'custom/pdf'])
import { useSkillsStore } from '@/stores/skillsStore'
import { useProjectStore } from '@/stores/projectStore'
import { SkillInstallScopeModal } from './SkillInstallScopeModal'
import { SkillUninstallScopeModal } from './SkillUninstallScopeModal'

interface SkillDetailsModalProps {
  skill: SkillDescriptor | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SkillDetailsModal({ skill, open, onOpenChange }: SkillDetailsModalProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [showInstallScope, setShowInstallScope] = useState(false)
  const [showUninstallScope, setShowUninstallScope] = useState(false)
  const { t } = useTranslation('chat')

  const { isInstalledAnywhere, getInstalledBySkillId, installSkill, uninstallSkill } = useSkillsStore()
  const { projects } = useProjectStore()

  if (!skill) return null

  const projectsWithCwd = projects.filter((p) => p.cwd && p.cwd.trim() !== '')
  const installedInstances = getInstalledBySkillId(skill.id)
  const installedAnywhere = isInstalledAnywhere(skill.id)
  const isDefault = DEFAULT_SKILL_IDS.has(skill.id)

  const doInstall = async (options: InstallSkillOptions) => {
    setIsProcessing(true)
    setShowInstallScope(false)
    try {
      await installSkill(skill, options)
      toast.success(`Skill "${skill.name}" installed`)
      onOpenChange(false)
    } catch (err: any) {
      toast.error(`Failed to install: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleInstall = () => {
    if (projectsWithCwd.length > 0) {
      setShowInstallScope(true)
    } else {
      doInstall({ scope: 'global' })
    }
  }

  const doUninstall = async (options: UninstallSkillOptions) => {
    setIsProcessing(true)
    setShowUninstallScope(false)
    try {
      await uninstallSkill(skill.id, options)
      toast.success(`Skill "${skill.name}" removed`)
      onOpenChange(false)
    } catch (err: any) {
      toast.error(`Failed to remove: ${err.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUninstall = () => {
    if (installedInstances.length === 1) {
      doUninstall({ scope: installedInstances[0].scope, projectId: installedInstances[0].projectId })
    } else {
      setShowUninstallScope(true)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="grid max-h-[85vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-6 pt-6 pr-14">
            <DialogTitle className="flex items-center gap-2">
              {skill.name}
              {skill.version && (
                <span className="text-sm font-normal text-muted-foreground">v{skill.version}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-6">
            <div className="flex flex-col gap-3 pb-6 pr-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Category: </span>
                  <span>{skill.category}</span>
                </div>
                {skill.author && (
                  <div>
                    <span className="text-muted-foreground">Author: </span>
                    <span>{skill.author}</span>
                  </div>
                )}
                {skill.model && (
                  <div>
                    <span className="text-muted-foreground">Model: </span>
                    <span>{skill.model}</span>
                  </div>
                )}
                {skill.allowedTools && (
                  <div>
                    <span className="text-muted-foreground">Tools: </span>
                    <span className="text-xs">{skill.allowedTools}</span>
                  </div>
                )}
              </div>

              <p className="text-sm text-muted-foreground">{skill.description}</p>

              {skill.tags && skill.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {skill.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              <Separator />

              <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-3 rounded-md">
                {skill.content}
              </pre>
            </div>
          </div>

          <DialogFooter className="shrink-0 px-6 pb-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>

            <Button onClick={handleInstall} disabled={isProcessing}>
              <Download className="h-4 w-4 mr-2" />
              {isProcessing ? 'Installing...' : 'Install Skill'}
            </Button>

            {installedAnywhere && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="destructive"
                        onClick={handleUninstall}
                        disabled={isProcessing || isDefault}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove Skill
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {isDefault && (
                    <TooltipContent side="bottom">
                      <p>{t('tools_menu.skills.default_skill_tooltip')}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showInstallScope && (
        <SkillInstallScopeModal
          open={showInstallScope}
          skillName={skill.name}
          projects={projects}
          onConfirm={doInstall}
          onCancel={() => setShowInstallScope(false)}
        />
      )}

      {showUninstallScope && (
        <SkillUninstallScopeModal
          open={showUninstallScope}
          skillName={skill.name}
          instances={installedInstances}
          onConfirm={doUninstall}
          onCancel={() => setShowUninstallScope(false)}
        />
      )}
    </>
  )
}
