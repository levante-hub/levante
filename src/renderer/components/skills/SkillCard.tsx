/**
 * Skill Card Component
 * 
 * Displays a single skill with toggle functionality.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Sparkles, User, Tag } from 'lucide-react';
import type { Skill } from '../../../types/skills';

interface SkillCardProps {
  skill: Skill;
  onToggle: () => void;
}

export function SkillCard({ skill, onToggle }: SkillCardProps) {
  const { t } = useTranslation('skills');
  const { metadata, enabled } = skill;

  return (
    <div 
      className={`
        relative p-4 rounded-lg border transition-all
        ${enabled 
          ? 'border-primary/50 bg-primary/5' 
          : 'border-border bg-card hover:border-border/80'
        }
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className={`h-5 w-5 ${enabled ? 'text-primary' : 'text-muted-foreground'}`} />
          <h3 className="font-medium">{metadata.name}</h3>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={t('toggle_skill', 'Toggle skill')}
        />
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
        {metadata.description}
      </p>

      {/* Metadata */}
      <div className="flex flex-wrap gap-2 text-xs">
        {metadata.version && (
          <Badge variant="secondary" className="text-xs">
            v{metadata.version}
          </Badge>
        )}
        {metadata.author && (
          <Badge variant="outline" className="text-xs">
            <User className="h-3 w-3 mr-1" />
            {metadata.author}
          </Badge>
        )}
        {metadata.category && (
          <Badge variant="outline" className="text-xs">
            <Tag className="h-3 w-3 mr-1" />
            {metadata.category}
          </Badge>
        )}
      </div>

      {/* Tags */}
      {metadata.tags && metadata.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {metadata.tags.slice(0, 3).map((tag) => (
            <span 
              key={tag} 
              className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {metadata.tags.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{metadata.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Enabled indicator */}
      {enabled && (
        <div className="absolute top-2 right-12 text-xs text-primary font-medium">
          {t('active', 'Active')}
        </div>
      )}
    </div>
  );
}
