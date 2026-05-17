import { createServiceNamespace } from "../../../../shared/ioc";

import type {
  DesktopMcpCommandPort,
  DesktopMcpMarketPort,
  DesktopMcpPort,
  DesktopMcpQueryPort,
} from "../ports/desktop-mcp.ports";

const desktopMcp = createServiceNamespace("desktop.mcp");

export const DESKTOP_MCP_PORT = desktopMcp.token<DesktopMcpPort>("mcp");
export const DESKTOP_MCP_QUERY_PORT = desktopMcp.token<DesktopMcpQueryPort>("mcp-query");
export const DESKTOP_MCP_COMMAND_PORT = desktopMcp.token<DesktopMcpCommandPort>("mcp-command");
export const DESKTOP_MCP_MARKET_PORT = desktopMcp.token<DesktopMcpMarketPort>("mcp-market");
