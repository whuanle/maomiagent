import { createServiceNamespace } from "../../../../shared/ioc";

import type {
  DesktopGitCommandPort,
  DesktopGitPort,
  DesktopGitQueryPort,
} from "../ports/desktop-git.ports";

const desktopGit = createServiceNamespace("desktop.git");

export const DESKTOP_GIT_PORT = desktopGit.token<DesktopGitPort>("git");
export const DESKTOP_GIT_QUERY_PORT =
  desktopGit.token<DesktopGitQueryPort>("git-query");
export const DESKTOP_GIT_COMMAND_PORT =
  desktopGit.token<DesktopGitCommandPort>("git-command");