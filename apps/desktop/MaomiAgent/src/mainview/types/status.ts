export type RuntimeSnapshot = {
  runtimeName: string;
  version: string;
  startedAt: string;
  moduleIds: string[];
};

export type RequestProbe = {
  requestId: string;
};

export type RuntimeStatus = {
  loading: boolean;
  entryUrl: string;
  healthy: boolean | null;
  runtime?: RuntimeSnapshot;
  request?: RequestProbe;
  checkedAt?: number;
  error?: string;
};