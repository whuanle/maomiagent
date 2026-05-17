const FEISHU_AUTH_WINDOW_LABEL = "feishu-authorization"
const FEISHU_AUTH_WINDOW_WIDTH = 560
const FEISHU_AUTH_WINDOW_HEIGHT = 760

export type ReservedFeishuAuthorizationWindow = {
  blocked: boolean
  open: (url: string) => Promise<boolean>
  close: () => void
}

function buildBrowserPopupFeatures(): string {
  return [
    "popup=yes",
    `width=${FEISHU_AUTH_WINDOW_WIDTH}`,
    `height=${FEISHU_AUTH_WINDOW_HEIGHT}`,
  ].join(",")
}

function renderBrowserLoadingPage(popup: Window) {
  popup.document.open()
  popup.document.write([
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    "  <title>Feishu Authorization</title>",
    "  <style>",
    "    body { margin: 0; font-family: 'Segoe UI', sans-serif; background: #f5f7fb; color: #122033; }",
    "    main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }",
    "    section { width: min(420px, 100%); padding: 28px; border-radius: 18px; background: #ffffff; box-shadow: 0 18px 60px rgba(15, 23, 42, 0.12); }",
    "    h1 { margin: 0 0 12px; font-size: 22px; }",
    "    p { margin: 0; line-height: 1.7; font-size: 14px; color: #526277; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <section>",
    "      <h1>Opening Feishu authorization...</h1>",
    "      <p>The authorization page will load automatically.</p>",
    "    </section>",
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n"))
  popup.document.close()
}

function reserveBrowserPopup(): Window | null {
  if (typeof window === "undefined") {
    return null
  }

  const popup = window.open(
    "about:blank",
    FEISHU_AUTH_WINDOW_LABEL,
    buildBrowserPopupFeatures(),
  )
  if (!popup) {
    return null
  }

  try {
    renderBrowserLoadingPage(popup)
  } catch {
    // Ignore rendering failures and still navigate the popup later.
  }

  popup.focus()
  return popup
}

export function reserveFeishuAuthorizationWindow(): ReservedFeishuAuthorizationWindow {
  const popup = reserveBrowserPopup()

  return {
    blocked: !popup,
    open: async (url: string) => {
      if (!popup || popup.closed) {
        return false
      }

      try {
        popup.opener = null
      } catch {
        // Best-effort hardening only.
      }

      popup.location.replace(url)
      popup.focus()
      return true
    },
    close: () => {
      if (!popup || popup.closed) {
        return
      }
      popup.close()
    },
  }
}
