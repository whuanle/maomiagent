import type {
  DesktopConfigurationSnapshot,
  DesktopConfigurationValues,
} from "../models/desktop-configuration.models";

export type DesktopConfigurationPort = {
  get<TValue = unknown>(key: string): TValue | undefined;
  getString(key: string, fallback?: string): string | undefined;
  getBoolean(key: string, fallback?: boolean): boolean | undefined;
  getNumber(key: string, fallback?: number): number | undefined;
  getRecord(key: string): DesktopConfigurationValues | undefined;
  requireString(key: string): string;
  snapshot(): DesktopConfigurationSnapshot;
};