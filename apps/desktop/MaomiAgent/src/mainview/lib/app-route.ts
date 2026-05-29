import {
  APP_ROUTE_ITEMS,
  type AppRouteKey,
  type AppRouteOwner,
} from "../config/titlebar";

const APP_ROUTE_KEY_SET = new Set<AppRouteKey>(APP_ROUTE_ITEMS.map((route) => route.key));
const APP_ROUTE_OWNER_MAP = new Map<AppRouteKey, AppRouteOwner>(
  APP_ROUTE_ITEMS.map((route) => [route.key, route.owner]),
);
const PERSISTENT_MAINVIEW_ROUTE_SET = new Set<AppRouteKey>(["chat"]);

export function parseRouteFromHash(hash: string): AppRouteKey | null {
  const normalized = hash.replace(/^#/, "").trim();
  if (!normalized) {
    return null;
  }

  return APP_ROUTE_KEY_SET.has(normalized as AppRouteKey)
    ? normalized as AppRouteKey
    : null;
}

export function readInitialRoute(): AppRouteKey {
  if (typeof window === "undefined") {
    return "chat";
  }

  return parseRouteFromHash(window.location.hash) ?? "chat";
}

export function resolveVisibleMainviewRoute(route: AppRouteKey): AppRouteKey {
  return route === "shell" ? "chat" : route;
}

export function shouldKeepMainviewRouteMounted(route: AppRouteKey): boolean {
  return PERSISTENT_MAINVIEW_ROUTE_SET.has(route);
}

export function shouldMountMainviewRoute(route: AppRouteKey, visibleRoute: AppRouteKey): boolean {
  return route === visibleRoute || shouldKeepMainviewRouteMounted(route);
}

export function getMainviewRouteOwner(route: AppRouteKey): AppRouteOwner {
  return APP_ROUTE_OWNER_MAP.get(route) ?? "legacy";
}

export function isNativeMainviewRoute(route: AppRouteKey | null | undefined): route is AppRouteKey {
  if (!route) {
    return false;
  }

  return getMainviewRouteOwner(route) === "native";
}
