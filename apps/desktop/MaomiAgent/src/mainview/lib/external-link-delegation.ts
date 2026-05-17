import { openDesktopExternalUrl } from "./desktop-window";

const EXTERNAL_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export function resolveDesktopExternalNavigationTarget(input: {
  href: string;
  currentLocationHref: string;
}) {
  const normalizedHref = input.href.trim();
  if (!normalizedHref || normalizedHref.startsWith("#")) {
    return null;
  }

  let currentUrl: URL;
  let targetUrl: URL;

  try {
    currentUrl = new URL(input.currentLocationHref);
    targetUrl = new URL(normalizedHref, currentUrl);
  } catch {
    return null;
  }

  if (!EXTERNAL_LINK_PROTOCOLS.has(targetUrl.protocol)) {
    return null;
  }

  if ((targetUrl.protocol === "http:" || targetUrl.protocol === "https:") && targetUrl.origin === currentUrl.origin) {
    return null;
  }

  return targetUrl.toString();
}

function findAnchorFromEventTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest("a[href]");
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

export function installDesktopExternalLinkDelegation(doc: Document = document) {
  const handleClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }

    const anchor = findAnchorFromEventTarget(event.target);
    if (!anchor || anchor.hasAttribute("download")) {
      return;
    }

    const targetUrl = resolveDesktopExternalNavigationTarget({
      href: anchor.getAttribute("href") ?? anchor.href,
      currentLocationHref: doc.location?.href ?? globalThis.location?.href ?? "http://localhost/",
    });

    if (!targetUrl) {
      return;
    }

    event.preventDefault();
    void openDesktopExternalUrl(targetUrl).catch((error) => {
      console.warn("[desktop-links] failed to open external url", error);
    });
  };

  doc.addEventListener("click", handleClick);

  return () => {
    doc.removeEventListener("click", handleClick);
  };
}