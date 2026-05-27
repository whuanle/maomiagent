import type { FrontendConversationLauncherPort } from "./conversation/feature-contracts";

let registeredConversationLauncher: FrontendConversationLauncherPort | null = null;

const defaultConversationLauncher: FrontendConversationLauncherPort = {
  async openConversation(input) {
    const draft = input?.draftText ?? input?.content;
    if (draft && draft.trim()) {
      // Keep compatibility with legacy workbench behavior by forwarding a one-shot draft.
      window.localStorage.setItem("maomi.chat.draft", draft);
    }

    window.location.hash = "chat";
  },
};

export function registerAppServiceConversationLauncher(
  launcher: FrontendConversationLauncherPort | null,
): void {
  registeredConversationLauncher = launcher;
}

export function useAppService(_token: unknown): FrontendConversationLauncherPort {
  return registeredConversationLauncher ?? defaultConversationLauncher;
}
