/**
 * Skills Page
 * 
 * Main page for managing Agent Skills.
 */

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSkillsStore } from '@/stores/skillsStore';
import { SkillCard } from '@/components/skills/SkillCard';
import { Button } from '@/components/ui/button';
import { RefreshCw, FolderOpen, Sparkles } from 'lucide-react';

export function SkillsPage() {
  const { t } = useTranslation('skills');
  const { 
    skills, 
    loading, 
    error, 
    skillsPath,
    loadSkills, 
    refreshSkills,
    loadSkillsPath,
    toggleSkill,
    setError 
  } = useSkillsStore();

  useEffect(() => {
    loadSkills();
    loadSkillsPath();
  }, [loadSkills, loadSkillsPath]);

  const handleOpenFolder = async () => {
    if (skillsPath) {
      await window.levante.openExternal(`file://${skillsPath}`);
    }
  };

  const enabledCount = skills.filter(s => s.enabled).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{t('title', 'Agent Skills')}</h1>
            <p className="text-muted-foreground text-sm">
              {t('subtitle', 'Extend AI capabilities with custom skills')}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenFolder}
            disabled={!skillsPath}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            {t('open_folder', 'Open Folder')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshSkills}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {t('refresh', 'Refresh')}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Error alert */}
        {error && (
          <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>
              ✕
            </Button>
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            {t('total_skills', '{{count}} skills', { count: skills.length })}
          </span>
          <span>•</span>
          <span>
            {t('enabled_skills', '{{count}} enabled', { count: enabledCount })}
          </span>
          {skillsPath && (
            <>
              <span>•</span>
              <span className="font-mono text-xs truncate max-w-md" title={skillsPath}>
                {skillsPath}
              </span>
            </>
          )}
        </div>

        {/* Loading state */}
        {loading && skills.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty state */}
        {!loading && skills.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {t('empty_title', 'No skills found')}
            </h3>
            <p className="text-muted-foreground max-w-md mb-4">
              {t('empty_description', 'Create a folder with a SKILL.md file in your skills directory to get started.')}
            </p>
            <Button variant="outline" onClick={handleOpenFolder} disabled={!skillsPath}>
              <FolderOpen className="h-4 w-4 mr-2" />
              {t('open_skills_folder', 'Open Skills Folder')}
            </Button>
          </div>
        )}

        {/* Skills grid */}
        {skills.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onToggle={() => toggleSkill(skill.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SkillsPage;
