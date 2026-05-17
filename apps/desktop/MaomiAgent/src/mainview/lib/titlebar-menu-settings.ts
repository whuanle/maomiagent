import { TITLEBAR_MENU_ITEMS, type TitlebarMenuItem } from "../config/titlebar";

const TITLEBAR_MENU_SETTINGS_STORAGE_KEYS = ["maomiagent.titlebar-menu-settings"] as const;
const TITLEBAR_MENU_SETTINGS_VERSION = 1;
const DEFAULT_COLLAPSED_MENU_KEYS = ["git", "settings", "browser"] as const;

type TitlebarMenuKey = TitlebarMenuItem["key"];

export type TitlebarMenuSettings = {
  version: number;
  orderedMenuKeys: TitlebarMenuKey[];
  collapsedMenuKeys: TitlebarMenuKey[];
};

export type TitlebarMenuMoveDirection = "up" | "down";
export type TitlebarMenuDropPosition = "before" | "after";

function resolveMenuItems(menuItems?: TitlebarMenuItem[]): TitlebarMenuItem[] {
  return menuItems && menuItems.length > 0 ? menuItems : TITLEBAR_MENU_ITEMS;
}

function normalizeMenuKey(value: unknown, allowedKeys: Set<TitlebarMenuKey>): TitlebarMenuKey | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  const normalized = (normalizedValue === "programming" ? "chat" : normalizedValue) as TitlebarMenuKey;
  return allowedKeys.has(normalized) ? normalized : null;
}

function normalizeOrderedMenuKeys(value: unknown, menuItems: TitlebarMenuItem[]): TitlebarMenuKey[] {
  const allowedKeys = new Set(menuItems.map((item) => item.key));
  const requested = Array.isArray(value) ? value : [];
  const normalized: TitlebarMenuKey[] = [];

  for (const item of requested) {
    const key = normalizeMenuKey(item, allowedKeys);
    if (!key || normalized.includes(key)) {
      continue;
    }
    normalized.push(key);
  }

  for (const item of menuItems) {
    if (!normalized.includes(item.key)) {
      normalized.push(item.key);
    }
  }

  return normalized;
}

function normalizeCollapsedMenuKeys(value: unknown, orderedMenuKeys: TitlebarMenuKey[]): TitlebarMenuKey[] {
  const allowedKeys = new Set(orderedMenuKeys);
  const requested = Array.isArray(value) ? value : DEFAULT_COLLAPSED_MENU_KEYS;
  const normalized: TitlebarMenuKey[] = [];

  for (const item of requested) {
    const key = normalizeMenuKey(item, allowedKeys);
    if (!key || normalized.includes(key)) {
      continue;
    }
    normalized.push(key);
  }

  return orderedMenuKeys.filter((key) => normalized.includes(key));
}

export function normalizeTitlebarMenuSettings(
  input?: Partial<TitlebarMenuSettings> | null,
  menuItems?: TitlebarMenuItem[],
): TitlebarMenuSettings {
  const resolvedMenuItems = resolveMenuItems(menuItems);
  const orderedMenuKeys = normalizeOrderedMenuKeys(input?.orderedMenuKeys, resolvedMenuItems);

  return {
    version: TITLEBAR_MENU_SETTINGS_VERSION,
    orderedMenuKeys,
    collapsedMenuKeys: normalizeCollapsedMenuKeys(input?.collapsedMenuKeys, orderedMenuKeys),
  };
}

export function readTitlebarMenuSettings(menuItems?: TitlebarMenuItem[]): TitlebarMenuSettings {
  if (typeof window === "undefined") {
    return normalizeTitlebarMenuSettings(undefined, menuItems);
  }

  for (const key of TITLEBAR_MENU_SETTINGS_STORAGE_KEYS) {
    try {
      const rawValue = window.localStorage.getItem(key);
      if (!rawValue) {
        continue;
      }
      return normalizeTitlebarMenuSettings(JSON.parse(rawValue) as Partial<TitlebarMenuSettings>, menuItems);
    } catch {
      continue;
    }
  }

  return normalizeTitlebarMenuSettings(undefined, menuItems);
}

export function writeTitlebarMenuSettings(settings: TitlebarMenuSettings, menuItems?: TitlebarMenuItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = JSON.stringify(normalizeTitlebarMenuSettings(settings, menuItems));
  for (const key of TITLEBAR_MENU_SETTINGS_STORAGE_KEYS) {
    window.localStorage.setItem(key, normalized);
  }
}

export function resolveOrderedTitlebarMenuItems(
  menuItems: TitlebarMenuItem[],
  orderedMenuKeys: TitlebarMenuKey[],
): TitlebarMenuItem[] {
  const itemMap = new Map(menuItems.map((item) => [item.key, item]));
  return normalizeOrderedMenuKeys(orderedMenuKeys, menuItems)
    .map((key) => itemMap.get(key) ?? null)
    .filter((item): item is TitlebarMenuItem => item !== null);
}

export function resolveExpandedTitlebarMenuItems(
  menuItems: TitlebarMenuItem[],
  collapsedMenuKeys: TitlebarMenuKey[],
  orderedMenuKeys: TitlebarMenuKey[],
): TitlebarMenuItem[] {
  const collapsedKeySet = new Set(collapsedMenuKeys);
  return resolveOrderedTitlebarMenuItems(menuItems, orderedMenuKeys).filter((item) => !collapsedKeySet.has(item.key));
}

export function resolveCollapsedTitlebarMenuItems(
  menuItems: TitlebarMenuItem[],
  collapsedMenuKeys: TitlebarMenuKey[],
  orderedMenuKeys: TitlebarMenuKey[],
): TitlebarMenuItem[] {
  const collapsedKeySet = new Set(collapsedMenuKeys);
  return resolveOrderedTitlebarMenuItems(menuItems, orderedMenuKeys).filter((item) => collapsedKeySet.has(item.key));
}

export function moveTitlebarMenuKey(
  orderedMenuKeys: TitlebarMenuKey[],
  key: TitlebarMenuKey,
  direction: TitlebarMenuMoveDirection,
): TitlebarMenuKey[] {
  const next = [...orderedMenuKeys];
  const currentIndex = next.indexOf(key);
  if (currentIndex < 0) {
    return next;
  }
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= next.length) {
    return next;
  }
  const [item] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

export function reorderTitlebarMenuKeys(
  orderedMenuKeys: TitlebarMenuKey[],
  sourceKey: TitlebarMenuKey,
  targetKey: TitlebarMenuKey,
  position: TitlebarMenuDropPosition,
): TitlebarMenuKey[] {
  if (sourceKey === targetKey) {
    return orderedMenuKeys;
  }

  const next = orderedMenuKeys.filter((key) => key !== sourceKey);
  const targetIndex = next.indexOf(targetKey);
  if (targetIndex < 0) {
    return orderedMenuKeys;
  }
  next.splice(position === "before" ? targetIndex : targetIndex + 1, 0, sourceKey);
  return next;
}