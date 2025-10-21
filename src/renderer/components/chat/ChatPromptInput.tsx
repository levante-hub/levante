import {
  PromptInput,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { ModelSearchableSelect } from '@/components/ai-elements/model-searchable-select';
import { ToolsMenu } from '@/components/chat/ToolsMenu';
import type { Model } from '../../../types/models';
import type { ChatStatus } from 'ai';

interface ChatPromptInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  webSearch: boolean;
  enableMCP: boolean;
  onWebSearchChange: (enabled: boolean) => void;
  onMCPChange: (enabled: boolean) => void;
  model: string;
  onModelChange: (modelId: string) => void;
  availableModels: Model[];
  modelsLoading: boolean;
  status?: ChatStatus;
}

export function ChatPromptInput({
  input,
  onInputChange,
  onSubmit,
  webSearch,
  enableMCP,
  onWebSearchChange,
  onMCPChange,
  model,
  onModelChange,
  availableModels,
  modelsLoading,
  status
}: ChatPromptInputProps) {
  return (
    <PromptInput onSubmit={onSubmit} className="max-w-3xl mx-auto w-full p-2">
      <PromptInputTextarea
        onChange={(e) => onInputChange(e.target.value)}
        value={input}
        rows={1}
        className="p-2 border-none"
      />
      <PromptInputToolbar className="p-0 border-none">
        <PromptInputTools>
          <ToolsMenu
            webSearch={webSearch}
            enableMCP={enableMCP}
            onWebSearchChange={onWebSearchChange}
            onMCPChange={onMCPChange}
          />
        </PromptInputTools>
        <div className="flex items-center gap-2">
          <ModelSearchableSelect
            value={model}
            onValueChange={onModelChange}
            models={availableModels}
            loading={modelsLoading}
            placeholder={availableModels.length === 0 ? "No models available" : "Select model..."}
          />
          <PromptInputSubmit disabled={!input} status={status} />
        </div>
      </PromptInputToolbar>
    </PromptInput>
  );
}
