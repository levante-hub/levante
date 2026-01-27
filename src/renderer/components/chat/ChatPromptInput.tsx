import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { ModelSearchableSelect } from '@/components/ai-elements/model-searchable-select';
import { ToolsMenu } from '@/components/chat/ToolsMenu';
import { ContextPreview } from '@/components/chat/ContextPreview';
import { AddContextMenu } from '@/components/chat/AddContextMenu';
import { useTranslation } from 'react-i18next';
import { getRendererLogger } from '@/services/logger';
import type { Model, GroupedModelsByProvider } from '../../../types/models';
import type { ChatStatus } from 'ai';
import type { SelectedResource, SelectedPrompt, MCPResource, MCPPrompt } from '@/hooks/useMCPResources';

const logger = getRendererLogger();

/**
 * Get smart placeholder text based on current model type
 */
function getPlaceholderText(taskType?: string): string {
  if (!taskType || taskType === 'chat' || taskType === 'image-text-to-text') {
    return 'Type a message...';
  }

  switch (taskType) {
    case 'text-to-image':
      return 'Describe the image you want to generate...';
    case 'image-to-image':
      return 'Describe the changes or attach an image...';
    case 'text-to-speech':
    case 'text-to-video':
      return 'Enter text to synthesize...';
    case 'automatic-speech-recognition':
      return 'Attach an audio file...';
    case 'visual-question-answering':
    case 'document-question-answering':
      return 'Ask a question about the image...';
    default:
      return 'Type a message...';
  }
}

interface ChatPromptInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  enableMCP: boolean;
  onMCPChange: (enabled: boolean) => void;
  model: string;
  onModelChange: (modelId: string) => void;
  availableModels: Model[];
  groupedModelsByProvider?: GroupedModelsByProvider;
  modelsLoading: boolean;
  status?: ChatStatus;
  modelTaskType?: string; // Add task type for smart placeholders
  // File attachment props
  attachedFiles?: File[];
  onFilesSelected?: (files: File[]) => void;
  onFileRemove?: (index: number) => void;
  enableFileAttachment?: boolean;
  fileAccept?: string;
  // MCP Resources props
  selectedResources?: SelectedResource[];
  onResourceSelected?: (serverId: string, serverName: string, resource: MCPResource) => void;
  onResourceRemove?: (serverId: string, uri: string) => void;
  // MCP Prompts props
  selectedPrompts?: SelectedPrompt[];
  onPromptSelected?: (serverId: string, serverName: string, prompt: MCPPrompt, args?: Record<string, any>) => void;
  onPromptRemove?: (serverId: string, name: string) => void;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}

export function ChatPromptInput({
  input,
  onInputChange,
  onSubmit,
  enableMCP,
  onMCPChange,
  model,
  onModelChange,
  availableModels,
  groupedModelsByProvider,
  modelsLoading,
  status,
  modelTaskType,
  attachedFiles = [],
  onFilesSelected,
  onFileRemove,
  enableFileAttachment = false,
  fileAccept = 'image/*,audio/*',
  selectedResources = [],
  onResourceSelected,
  onResourceRemove,
  selectedPrompts = [],
  onPromptSelected,
  onPromptRemove,
  inputRef,
}: ChatPromptInputProps) {
  const { t } = useTranslation('chat');

  // Get smart placeholder based on model type
  const placeholder = getPlaceholderText(modelTaskType);

  // Check if we have any context to show
  const hasContext = attachedFiles.length > 0 || selectedResources.length > 0 || selectedPrompts.length > 0;

  // Handle paste event to extract files from clipboard
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    logger.core.debug('Paste event triggered', {
      hasOnFilesSelected: !!onFilesSelected,
      status,
      clipboardDataAvailable: !!e.clipboardData,
    });

    // Match AddContextMenu behavior: only disabled when streaming
    if (!onFilesSelected || status === 'streaming') {
      logger.core.debug('Paste blocked', {
        hasOnFilesSelected: !!onFilesSelected,
        status,
      });
      return;
    }

    const items = e.clipboardData?.items;
    if (!items) {
      logger.core.debug('No clipboard items');
      return;
    }

    const files: File[] = [];

    // Extract files from clipboard items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      logger.core.debug('Clipboard item', {
        kind: item.kind,
        type: item.type,
      });
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          logger.core.debug('File found in clipboard', {
            name: file.name,
            type: file.type,
            size: file.size,
          });
          files.push(file);
        }
      }
    }

    // If we found files, prevent default paste behavior and process them
    if (files.length > 0) {
      logger.core.info('Processing pasted files', { count: files.length });
      e.preventDefault();
      await onFilesSelected(files);
    } else {
      logger.core.debug('No files found in clipboard');
    }
  };

  // Handle file remove with null check
  const handleFileRemove = (index: number) => {
    if (onFileRemove) {
      onFileRemove(index);
    }
  };

  // Handle resource remove with null check
  const handleResourceRemove = (serverId: string, uri: string) => {
    if (onResourceRemove) {
      onResourceRemove(serverId, uri);
    }
  };

  // Handle prompt remove with null check
  const handlePromptRemove = (serverId: string, name: string) => {
    if (onPromptRemove) {
      onPromptRemove(serverId, name);
    }
  };

  return (
    <PromptInput onSubmit={onSubmit} className="max-w-3xl mx-auto w-full p-2">
      {/* Context Preview Area (files + MCP resources + MCP prompts) */}
      {hasContext && (
        <ContextPreview
          resources={selectedResources}
          prompts={selectedPrompts}
          files={attachedFiles}
          onRemoveResource={handleResourceRemove}
          onRemovePrompt={handlePromptRemove}
          onRemoveFile={handleFileRemove}
          className="border-b"
        />
      )}

      {/* Text Input */}
      <PromptInputTextarea
        ref={inputRef}
        onChange={(e) => onInputChange(e.target.value)}
        onPaste={handlePaste}
        value={input}
        rows={1}
        className="p-2 border-none"
        placeholder={placeholder}
      />

      {/* Toolbar */}
      <PromptInputToolbar className="p-0 border-none">
        <PromptInputTools>
          <ToolsMenu
            enableMCP={enableMCP}
            onMCPChange={onMCPChange}
          />
          {/* Add Context Menu (MCP resources + prompts + file upload) */}
          {onFilesSelected && (
            <AddContextMenu
              onFilesSelected={onFilesSelected}
              onResourceSelected={onResourceSelected}
              onPromptSelected={onPromptSelected}
              disabled={status === 'streaming'}
              fileAccept={fileAccept}
            />
          )}
        </PromptInputTools>
        <div className="flex items-center gap-2">
          <ModelSearchableSelect
            value={model}
            onValueChange={onModelChange}
            models={availableModels}
            groupedModels={groupedModelsByProvider}
            loading={modelsLoading}
            placeholder={availableModels.length === 0 ? t('model_selector.no_models') : t('model_selector.label')}
          />
          <PromptInputSubmit
            disabled={
              !model ||
              model.trim() === '' ||
              (status !== 'streaming' && !input && attachedFiles.length === 0 && selectedResources.length === 0 && selectedPrompts.length === 0)
            }
            status={status}
          />
        </div>
      </PromptInputToolbar>
    </PromptInput>
  );
}
