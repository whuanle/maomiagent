import { createContext, useRef, type ReactNode } from "react";

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

export const BrowserDomainContext = createContext<BrowserDomainContextValue | null>(null);

type BrowserProviderProps = {
  children: ReactNode;
  initialState?: DesktopBrowserStateSnapshot;
  store?: BrowserStore;
  controller?: BrowserController;
  rpc?: BrowserControllerRpc;
};

export function BrowserProvider(props: BrowserProviderProps) {
  const valueRef = useRef<BrowserDomainContextValue | null>(null);

  if (!valueRef.current) {
    const store = props.store ?? createBrowserStore(props.initialState);
    const controller = props.controller ?? createBrowserController({
      store,
      rpc: props.rpc,
    });

    valueRef.current = {
      store,
      controller,
    };
  }

  return (
    <BrowserDomainContext.Provider value={valueRef.current}>
      {props.children}
    </BrowserDomainContext.Provider>
  );
}
