import { installElectrobunWindowBridge } from "./lib/electrobun-window-bridge";
import { installDesktopZoomGuard } from "./lib/desktop-zoom-guard";
import { installDesktopExternalLinkDelegation } from "./lib/external-link-delegation";
import { installRendererRuntimeErrorLogging } from "./lib/renderer-runtime-error-logging";

installElectrobunWindowBridge();
installDesktopZoomGuard();
installDesktopExternalLinkDelegation();
installRendererRuntimeErrorLogging();

if (typeof document !== "undefined") {
	document.documentElement.dataset.desktopPlatform = navigator.userAgent.includes("Windows")
		? "windows"
		: "other";
	document.documentElement.dataset.desktopRendererRoot = "native";
}

void import("./native-main");
