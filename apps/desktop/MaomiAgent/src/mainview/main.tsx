import { installElectrobunWindowBridge } from "./lib/electrobun-window-bridge";
import { installDesktopExternalLinkDelegation } from "./lib/external-link-delegation";
import { installRendererRuntimeErrorLogging } from "./lib/renderer-runtime-error-logging";

installElectrobunWindowBridge();
installDesktopExternalLinkDelegation();
installRendererRuntimeErrorLogging();

if (typeof document !== "undefined") {
	document.documentElement.dataset.desktopPlatform = navigator.userAgent.includes("Windows")
		? "windows"
		: "other";
	document.documentElement.dataset.desktopRendererRoot = "native";
}

void import("./native-main");