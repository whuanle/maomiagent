import type { FrontendConversationLauncherPort } from "./conversation/feature-contracts";

const defaultConversationLauncher: FrontendConversationLauncherPort = {
  async openConversation(input) {
    const nextUrl = new URL(window.location.href);
    nextUrl.hash = "chat";
    window.history.replaceState(window.history.state, "", nextUrl);
    const draft = input?.draftText ?? input?.content;
    if (draft && draft.trim()) {
      // Keep compatibility with legacy workbench behavior by forwarding a one-shot draft.
      window.localStorage.setItem("maomi.chat.draft", draft);
    }
  },
};

export function useAppService(_token: unknown): FrontendConversationLauncherPort {
  return defaultConversationLauncher;
}
