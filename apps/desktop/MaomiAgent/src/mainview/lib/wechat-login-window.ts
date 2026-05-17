const WECHAT_LOGIN_WINDOW_LABEL = "wechat-login";
const WECHAT_LOGIN_WINDOW_WIDTH = 520;
const WECHAT_LOGIN_WINDOW_HEIGHT = 820;

export type ReservedWechatLoginWindow = {
  blocked: boolean;
  open: (url: string) => Promise<boolean>;
  close: () => void;
};

function buildBrowserPopupFeatures(): string {
  return [
    "popup=yes",
    `width=${WECHAT_LOGIN_WINDOW_WIDTH}`,
    `height=${WECHAT_LOGIN_WINDOW_HEIGHT}`,
  ].join(",");
}

function renderBrowserLoadingPage(popup: Window) {
  popup.document.open();
  popup.document.write([
    "<!doctype html>",
    "<html lang=\"zh-CN\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    "  <title>微信扫码登录</title>",
    "  <style>",
    "    body { margin: 0; font-family: 'Segoe UI', sans-serif; background: #f5f7fb; color: #122033; }",
    "    main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }",
    "    section { width: min(360px, 100%); padding: 28px; border-radius: 18px; background: #ffffff; box-shadow: 0 18px 60px rgba(15, 23, 42, 0.12); }",
    "    h1 { margin: 0 0 12px; font-size: 22px; }",
    "    p { margin: 0; line-height: 1.7; font-size: 14px; color: #526277; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <section>",
    "      <h1>正在打开微信扫码页...</h1>",
    "      <p>扫码页会在当前窗口自动加载。</p>",
    "    </section>",
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n"));
  popup.document.close();
}

function reserveBrowserPopup(): Window | null {
  if (typeof window === "undefined") {
    return null;
  }

  const popup = window.open(
    "about:blank",
    WECHAT_LOGIN_WINDOW_LABEL,
    buildBrowserPopupFeatures(),
  );
  if (!popup) {
    return null;
  }

  try {
    renderBrowserLoadingPage(popup);
  } catch {
    // Ignore rendering failures and still navigate the popup later.
  }

  popup.focus();
  return popup;
}

export function reserveWechatLoginWindow(): ReservedWechatLoginWindow {
  const popup = reserveBrowserPopup();

  return {
    blocked: !popup,
    open: async (url: string) => {
      if (!popup || popup.closed) {
        return false;
      }

      try {
        popup.opener = null;
      } catch {
        // Best-effort hardening only.
      }

      popup.location.replace(url);
      popup.focus();
      return true;
    },
    close: () => {
      if (!popup || popup.closed) {
        return;
      }
      popup.close();
    },
  };
}
