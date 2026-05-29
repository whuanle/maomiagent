export function resolveDirectSessionComposerPopupContainer(triggerNode: HTMLElement | null): HTMLElement {
  if (triggerNode?.ownerDocument?.body) {
    return triggerNode.ownerDocument.body;
  }

  return document.body;
}
