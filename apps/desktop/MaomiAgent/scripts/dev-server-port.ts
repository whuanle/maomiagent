import { createServer } from "node:net";

export const DEV_SERVER_HOST = "127.0.0.1";

export async function resolveAvailablePort(host = DEV_SERVER_HOST): Promise<number> {
  return await new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer();

    server.once("error", rejectPort);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => {
          rejectPort(new Error("Failed to resolve a local dev server port."));
        });
        return;
      }

      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          rejectPort(closeError);
          return;
        }
        resolvePort(port);
      });
    });
  });
}