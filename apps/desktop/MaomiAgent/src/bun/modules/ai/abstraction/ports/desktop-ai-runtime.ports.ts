import type { AiTurnPort } from "../../kernel-bridge";
import type {
  DesktopAiProviderRuntimeBinding,
  DesktopAiProviderRuntimeCreateTurnPortInput,
  DesktopAiProviderRuntimeLookupInput,
} from "../models/desktop-ai-runtime.models";

export interface DesktopAiRuntimePort {
  listProviderRuntimes(): readonly DesktopAiProviderRuntimeBinding[];
  findProviderRuntime(
    input: DesktopAiProviderRuntimeLookupInput,
  ): DesktopAiProviderRuntimeBinding | undefined;
  createTurnPort(
    selector: DesktopAiProviderRuntimeLookupInput,
    input: DesktopAiProviderRuntimeCreateTurnPortInput,
  ): AiTurnPort | undefined;
}