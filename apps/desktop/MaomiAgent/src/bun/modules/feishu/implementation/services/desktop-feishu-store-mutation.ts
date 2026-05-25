import type {
  DesktopFeishuStorePort,
  DesktopFeishuStoreSnapshot,
} from "../../abstraction/ports/desktop-feishu-store.ports";

export async function runDesktopFeishuStoreMutation<T>(
  store: DesktopFeishuStorePort,
  mutator: (snapshot: DesktopFeishuStoreSnapshot) => Promise<T> | T,
): Promise<T> {
  if (typeof store.mutate === "function") {
    return store.mutate(mutator);
  }

  const snapshot = await store.read();
  const result = await mutator(snapshot);
  await store.write(snapshot);
  return result;
}