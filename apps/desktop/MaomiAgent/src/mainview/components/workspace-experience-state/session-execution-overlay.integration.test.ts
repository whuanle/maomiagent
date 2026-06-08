import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("chat workspace pane state uses the shared execution overlay for stop convergence", async () => {
  const source = await readFile(join(import.meta.dir, "../../modules/chat/hooks/use-chat-workspace-pane-state.ts"), "utf8");

  expect(source).toContain("SessionExecutionOverlayState");
  expect(source).toContain("applyStopRequested");
  expect(source).toContain("applyStopRpcResolved");
  expect(source).toContain("applyStopTimedOut");
  expect(source).toContain("resolveSessionExecutionView");
  expect(source).toContain("recordRuntimeEventActivity");
  expect(source).toContain("const [executionOverlays, setExecutionOverlays] = useState<SessionExecutionOverlayState>({});");
});

test("ui designer shell state uses the shared execution overlay for stop convergence", async () => {
  const source = await readFile(join(import.meta.dir, "../../modules/ui-designer/hooks/use-ui-designer-shell-state.ts"), "utf8");

  expect(source).toContain("SessionExecutionOverlayState");
  expect(source).toContain("applyStopRequested");
  expect(source).toContain("applyStopRpcResolved");
  expect(source).toContain("applyStopTimedOut");
  expect(source).toContain("resolveSessionExecutionView");
  expect(source).toContain("recordRuntimeEventActivity");
  expect(source).toContain("const [executionOverlays, setExecutionOverlays] = useState<SessionExecutionOverlayState>({});");
});
