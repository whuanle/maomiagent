import { GenericDomainActionHandler } from "./generic-domain-action-handler";

export class SheetsDomainActionHandler extends GenericDomainActionHandler {
  constructor() {
    super("sheets");
  }
}
