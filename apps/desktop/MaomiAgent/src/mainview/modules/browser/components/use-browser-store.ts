import { useContext, useSyncExternalStore } from "react";

import { BrowserDomainContext } from "./browser-provider";

export function useBrowserStore() {
  const context = useContext(BrowserDomainContext);
  if (!context) {
    throw new Error("BrowserProvider is required.");
  }

  const state = useSyncExternalStore(
    context.store.subscribe,
    context.store.getState,
    context.store.getState,
  );

  return {
    state,
    store: context.store,
    controller: context.controller,
  };
}

export function useBrowserState() {
  return useBrowserStore().state;
}

export function useBrowserController() {
  const context = useContext(BrowserDomainContext);
  if (!context) {
    throw new Error("BrowserProvider is required.");
  }

  return context.controller;
}
