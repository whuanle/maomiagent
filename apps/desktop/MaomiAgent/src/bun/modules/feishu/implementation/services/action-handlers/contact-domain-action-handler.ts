import { GenericDomainActionHandler } from "./generic-domain-action-handler";

export class ContactDomainActionHandler extends GenericDomainActionHandler {
  constructor() {
    super("contact");
  }
}
