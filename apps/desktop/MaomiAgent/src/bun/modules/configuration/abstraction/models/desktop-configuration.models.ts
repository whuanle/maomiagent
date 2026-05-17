export type DesktopConfigurationSource = {
  name: string;
  path?: string;
};

export type DesktopConfigurationValues = Record<string, unknown>;

export type DesktopConfigurationInput = Partial<{
  files: string[];
  values: DesktopConfigurationValues;
  environment: Record<string, string | undefined>;
}>;

export type DesktopConfigurationSnapshot = {
  values: DesktopConfigurationValues;
  sources: DesktopConfigurationSource[];
};