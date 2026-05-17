import { message, notification } from "antd";

type MessageApi = Pick<typeof message, "success" | "info" | "warning" | "error">;
type NotificationApi = Pick<typeof notification, "info" | "warning">;

let scopedMessageApi: MessageApi | null = null;
let scopedNotificationApi: NotificationApi | null = null;

function normalizeDuration(durationMs?: number): number | undefined {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) {
    return undefined;
  }

  return Math.max(0, durationMs) / 1000;
}

function getMessageApi(): MessageApi {
  return scopedMessageApi ?? message;
}

function getNotificationApi(): NotificationApi {
  return scopedNotificationApi ?? notification;
}

export function bindNotificationApis(apis: {
  message: MessageApi;
  notification: NotificationApi;
} | null): void {
  scopedMessageApi = apis?.message ?? null;
  scopedNotificationApi = apis?.notification ?? null;
}

export const notifier = {
  success(content: string, durationMs?: number) {
    void getMessageApi().success({
      content,
      duration: normalizeDuration(durationMs),
    });
  },
  info(content: string, durationMs?: number) {
    void getMessageApi().info({
      content,
      duration: normalizeDuration(durationMs),
    });
  },
  warning(content: string, durationMs?: number) {
    void getMessageApi().warning({
      content,
      duration: normalizeDuration(durationMs),
    });
  },
  error(content: string, durationMs?: number) {
    void getMessageApi().error({
      content,
      duration: normalizeDuration(durationMs),
    });
  },
};

export const notificationCenter = {
  info(
    content: string | { title?: string; description?: string; duration?: number; key?: string },
    options?: { key?: string; duration?: number; description?: string },
  ) {
    const payload = typeof content === "string"
      ? {
          message: content,
          description: options?.description,
          duration: options?.duration,
          key: options?.key,
        }
      : {
          message: content.title ?? "",
          description: content.description,
          duration: content.duration,
          key: content.key,
        };

    void getNotificationApi().info({
      key: payload.key,
      message: payload.message,
      description: payload.description,
      duration: payload.duration,
    });
  },
  warning(
    content: string | { title?: string; description?: string; duration?: number; key?: string },
    options?: { key?: string; duration?: number; description?: string },
  ) {
    const payload = typeof content === "string"
      ? {
          message: content,
          description: options?.description,
          duration: options?.duration,
          key: options?.key,
        }
      : {
          message: content.title ?? "",
          description: content.description,
          duration: content.duration,
          key: content.key,
        };

    void getNotificationApi().warning({
      key: payload.key,
      message: payload.message,
      description: payload.description,
      duration: payload.duration,
    });
  },
};
