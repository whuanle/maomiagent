import type {
  DesktopConversationCapabilityDescriptor,
  DesktopConversationCapabilityListQuery,
  DesktopConversationCapabilityListResponse,
} from "../../abstraction/models/desktop-conversation.models";
import type {
  DesktopConversationCapabilityProvider,
  DesktopConversationCapabilityRegistryPort,
} from "../../abstraction/ports/desktop-conversation-capabilities.ports";

function sortCapabilities(
  items: DesktopConversationCapabilityDescriptor[],
): DesktopConversationCapabilityDescriptor[] {
  return [...items].sort((left, right) =>
    left.title.localeCompare(right.title, "zh-CN", { sensitivity: "base" })
    || left.moduleId.localeCompare(right.moduleId, "en", { sensitivity: "base" })
    || left.capabilityId.localeCompare(right.capabilityId, "en", { sensitivity: "base" }),
  );
}

function dedupeCapabilities(
  items: DesktopConversationCapabilityDescriptor[],
): DesktopConversationCapabilityDescriptor[] {
  const deduped: DesktopConversationCapabilityDescriptor[] = [];
  const seen = new Set<string>();

  for (const item of sortCapabilities(items)) {
    if (seen.has(item.capabilityId)) {
      continue;
    }

    seen.add(item.capabilityId);
    deduped.push(item);
  }

  return deduped;
}

export class DesktopConversationCapabilityRegistryService
  implements DesktopConversationCapabilityRegistryPort {
  constructor(
    private readonly providers: readonly DesktopConversationCapabilityProvider[] = [],
  ) {}

  async listCapabilities(
    input: DesktopConversationCapabilityListQuery,
  ): Promise<DesktopConversationCapabilityListResponse> {
    const groups = await Promise.all(this.providers.map(async (provider) => {
      try {
        return await provider.listCapabilities(input);
      } catch {
        return [];
      }
    }));

    return {
      items: dedupeCapabilities(groups.flat()),
      updatedAt: new Date().toISOString(),
    };
  }
}