import type { DesktopBrowserStateSnapshot } from "../../../../shared/desktop-browser";
import {
  createBrowserController,
  type BrowserController,
  type BrowserControllerRpc,
} from "./browser-controller";
import { createBrowserStore, type BrowserStore } from "./browser-store";

export type BrowserDomainContextValue = {
  store: BrowserStore;
  controller: BrowserController;
};

export type BrowserDomainValueOptions = {
  initialState?: DesktopBrowserStateSnapshot;
  store?: BrowserStore;
  controller?: BrowserController;
  rpc?: BrowserControllerRpc;
};

export function createBrowserDomainValue(
  props: BrowserDomainValueOptions = {},
): BrowserDomainContextValue {
  const store = props.store ?? createBrowserStore(props.initialState);
  const controller = props.controller ?? createBrowserController({
    store,
    rpc: props.rpc,
  });

  return {
    store,
    controller,
  };
}
