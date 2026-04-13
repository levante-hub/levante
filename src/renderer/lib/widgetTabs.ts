import type { UIMessage } from '@ai-sdk/react';
import { extractUIResources, type UIResource } from '@/types/ui-resource';
import type { WidgetTabInput } from '@/stores/sidePanelStore';

export function getWidgetTitle(resource: UIResource): string {
  const meta = resource.resource?._meta;

  if (typeof meta?.toolName === 'string' && meta.toolName.trim()) {
    return meta.toolName;
  }

  const uri = resource.resource?.uri || '';
  if (uri) {
    const parts = uri.replace(/^ui:\/\//, '').split('/');
    const last = parts[parts.length - 1];
    if (last) return last;
  }

  return 'Widget';
}

export function getWidgetProtocol(resource: UIResource): 'mcp-apps' | 'openai-sdk' | 'mcp-ui' {
  const raw = resource.resource?._meta?.widgetProtocol;
  if (raw === 'mcp-apps' || raw === 'openai-sdk' || raw === 'mcp-ui') {
    return raw;
  }
  return 'mcp-ui';
}

export function getWidgetProtocolLabel(resource: UIResource): string {
  const protocol = getWidgetProtocol(resource);
  if (protocol === 'mcp-apps') return 'MCP Apps';
  if (protocol === 'openai-sdk') return 'Apps SDK';
  return 'MCP-UI';
}

function getServerIdFromToolPart(part: any): string | undefined {
  const toolName = part?.toolName || part?.type?.replace(/^tool-/, '');
  if (!toolName || typeof toolName !== 'string') return undefined;
  const parts = toolName.split('_');
  return parts.length > 1 ? parts[0] : undefined;
}

export function getWidgetTabsFromPart(
  part: any,
  messageId: string,
  partIndex: number
): WidgetTabInput[] {
  if (part?.type?.startsWith('tool-') && part.state === 'output-available') {
    const resources = extractUIResources(part.output);
    const serverId = getServerIdFromToolPart(part);
    const toolCallKey = part.toolCallId || `part-${partIndex}`;

    return resources.map((resource: UIResource, resourceIdx: number) => ({
      id: `widget-${messageId}-${toolCallKey}-${resourceIdx}`,
      title: getWidgetTitle(resource),
      resource,
      serverId,
      messageId,
      toolCallId: part.toolCallId,
    }));
  }

  if (part?.value?.type === 'ui-resource' && part?.value?.resource) {
    const resource = part.value.resource as UIResource;

    return [{
      id: `widget-${messageId}-standalone-${partIndex}`,
      title: getWidgetTitle(resource),
      resource,
      messageId,
    }];
  }

  return [];
}

export function getWidgetTabsFromMessage(message: UIMessage): WidgetTabInput[] {
  if (!Array.isArray(message.parts)) return [];

  return message.parts.flatMap((part: any, partIndex: number) =>
    getWidgetTabsFromPart(part, message.id, partIndex)
  );
}

export function getWidgetTabIdsFromMessages(messages: UIMessage[]): Set<string> {
  return new Set(
    messages.flatMap((message) => getWidgetTabsFromMessage(message).map((widget) => widget.id))
  );
}
