import { GenericDomainActionHandler } from "./generic-domain-action-handler";

export class MeetingsDomainActionHandler extends GenericDomainActionHandler {
  constructor() {
    super("meetings");
  }
}
