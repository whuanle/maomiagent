import { GenericDomainActionHandler } from "./generic-domain-action-handler";

export class BaseDomainActionHandler extends GenericDomainActionHandler {
  constructor() {
    super("base");
  }
}
