import { createContext, useRef, type ReactNode } from "react";

import type {
  BrowserDomainContextValue,
  BrowserDomainValueOptions,
} from "./browser-domain";
import { createBrowserDomainValue } from "./browser-domain";

export const BrowserDomainContext = createContext<BrowserDomainContextValue | null>(null);

type BrowserProviderProps = BrowserDomainValueOptions & {
  children: ReactNode;
};

export function BrowserProvider(props: BrowserProviderProps) {
  const valueRef = useRef<BrowserDomainContextValue | null>(null);

  if (!valueRef.current) {
    valueRef.current = createBrowserDomainValue(props);
  }

  return (
    <BrowserDomainContext.Provider value={valueRef.current}>
      {props.children}
    </BrowserDomainContext.Provider>
  );
}
