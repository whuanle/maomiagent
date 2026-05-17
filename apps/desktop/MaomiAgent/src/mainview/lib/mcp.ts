import { fetchDesktopMcpCapabilities } from "./desktop-mcp";

export function fetchMcpCapabilities(_runtimeUrl: string, mcpId: string) {
  return fetchDesktopMcpCapabilities(mcpId);
}
