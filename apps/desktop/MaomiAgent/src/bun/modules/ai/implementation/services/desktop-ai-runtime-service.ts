import type {
  DesktopAiProviderRuntimeBinding,
  DesktopAiProviderRuntimeCreateTurnPortInput,
  DesktopAiProviderRuntimeLookupInput,
} from "../../abstraction/models/desktop-ai-runtime.models";
import type { DesktopAiRuntimePort } from "../../abstraction/ports/desktop-ai-runtime.ports";
import {
  findDesktopAiProviderRuntimeDescriptor,
  listDesktopAiProviderRuntimeDescriptors,
  type DesktopAiProviderRuntimeDescriptor,
} from "../../provider-runtime-registry";

function toRuntimeBinding(
  descriptor: DesktopAiProviderRuntimeDescriptor,
): DesktopAiProviderRuntimeBinding {
  return {
    id: descriptor.id,
    protocolFamily: descriptor.protocolFamily,
    apiStyle: descriptor.apiStyle,
    adapterId: descriptor.adapterId,
  };
}

export class DesktopAiRuntimeService implements DesktopAiRuntimePort {
  listProviderRuntimes(): readonly DesktopAiProviderRuntimeBinding[] {
    return listDesktopAiProviderRuntimeDescriptors().map(toRuntimeBinding);
  }

  findProviderRuntime(
    input: DesktopAiProviderRuntimeLookupInput,
  ): DesktopAiProviderRuntimeBinding | undefined {
    const descriptor = findDesktopAiProviderRuntimeDescriptor(input);
    return descriptor ? toRuntimeBinding(descriptor) : undefined;
  }

  createTurnPort(
    selector: DesktopAiProviderRuntimeLookupInput,
    input: DesktopAiProviderRuntimeCreateTurnPortInput,
  ) {
    return findDesktopAiProviderRuntimeDescriptor(selector)?.createTurnPort(input);
  }
}