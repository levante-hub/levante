'use client';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { Model } from '../../../types/models';

export interface ModelSearchableSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  models: Model[];
  loading?: boolean;
  placeholder?: string;
  className?: string;
}

export const ModelSearchableSelect = ({
  value,
  onValueChange,
  models,
  loading = false,
  placeholder = "Select model...",
  className,
}: ModelSearchableSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Simple fuzzy search function
  const fuzzyMatch = (text: string, query: string): boolean => {
    if (!query) return true;

    const normalizedText = text.toLowerCase();
    const normalizedQuery = query.toLowerCase();

    // Exact match or contains
    if (normalizedText.includes(normalizedQuery)) {
      return true;
    }

    // Simple fuzzy: check if all characters exist in order
    let queryIndex = 0;
    for (let i = 0; i < normalizedText.length && queryIndex < normalizedQuery.length; i++) {
      if (normalizedText[i] === normalizedQuery[queryIndex]) {
        queryIndex++;
      }
    }
    return queryIndex === normalizedQuery.length;
  };

  // Filter models based on search
  const filteredModels = models.filter(model =>
    fuzzyMatch(model.name, search) || fuzzyMatch(model.provider, search)
  );

  // Group models by provider
  const groupedModels = filteredModels.reduce((groups, model) => {
    const provider = model.provider || 'Other';
    if (!groups[provider]) {
      groups[provider] = [];
    }
    groups[provider].push(model);
    return groups;
  }, {} as Record<string, Model[]>);

  const selectedModel = models.find(model => model.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors',
            'hover:bg-accent hover:text-foreground [&[aria-expanded="true"]]:bg-accent [&[aria-expanded="true"]]:text-foreground',
            'justify-between w-[200px] text-left truncate',
            className
          )}
        >
          {loading ? (
            <div className="flex items-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : selectedModel ? (
            <span className="truncate">{selectedModel.name}</span>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search models..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No models found.</CommandEmpty>
            {Object.entries(groupedModels).map(([provider, providerModels]) => (
              <CommandGroup key={provider} heading={provider.charAt(0).toUpperCase() + provider.slice(1)}>
                {providerModels.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={model.id}
                    onSelect={() => {
                      onValueChange?.(model.id);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === model.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col flex-1">
                      <span>{model.name}</span>
                      {model.contextLength && (
                        <span className="text-xs text-muted-foreground">
                          {model.contextLength >= 1000
                            ? `${Math.round(model.contextLength / 1000)}k context`
                            : `${model.contextLength} context`
                          }
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};