import { createServiceNamespace } from "../../../../shared/ioc";
import type {
  DesktopSkillsCommandPort,
  DesktopSkillsMarketPort,
  DesktopSkillsPort,
  DesktopSkillsQueryPort,
} from "../ports/desktop-skills.ports";

const desktopSkills = createServiceNamespace("desktop.skills");

export const DESKTOP_SKILLS_PORT =
  desktopSkills.token<DesktopSkillsPort>("skills");
export const DESKTOP_SKILLS_QUERY_PORT =
  desktopSkills.token<DesktopSkillsQueryPort>("skills-query");
export const DESKTOP_SKILLS_COMMAND_PORT =
  desktopSkills.token<DesktopSkillsCommandPort>("skills-command");
export const DESKTOP_SKILLS_MARKET_PORT =
  desktopSkills.token<DesktopSkillsMarketPort>("skills-market");