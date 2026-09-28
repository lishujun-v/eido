import path from "node:path";

export type PlatformPaths = Readonly<{
  rootDir: string;
  runtimeDir: string;
  databaseDir: string;
  workspaceDir: string;
  projectsDir: string;
  graphsDir: string;
  skillsDir: string;
}>;

type PathEnvironment = {
  EIDO_ROOT_DIR?: string;
  EIDO_RUNTIME_DIR?: string;
  EIDO_DATABASE_DIR?: string;
  EIDO_WORKSPACE_DIR?: string;
  EIDO_PROJECTS_DIR?: string;
  EIDO_GRAPHS_DIR?: string;
  EIDO_SKILLS_DIR?: string;
};

export function resolvePlatformPaths(
  environment: PathEnvironment = process.env as PathEnvironment,
  currentWorkingDirectory = process.cwd(),
): PlatformPaths {
  const rootDir = path.resolve(environment.EIDO_ROOT_DIR || currentWorkingDirectory);
  const resolveFromRoot = (override: string | undefined, fallback: string) =>
    path.resolve(rootDir, override || fallback);
  const runtimeDir = resolveFromRoot(environment.EIDO_RUNTIME_DIR, "runtime");
  const resolveFromRuntime = (override: string | undefined, fallback: string) =>
    override ? path.resolve(rootDir, override) : path.join(runtimeDir, fallback);

  return Object.freeze({
    rootDir,
    runtimeDir,
    databaseDir: resolveFromRoot(environment.EIDO_DATABASE_DIR, "database"),
    workspaceDir: resolveFromRuntime(environment.EIDO_WORKSPACE_DIR, "workspace"),
    projectsDir: resolveFromRuntime(environment.EIDO_PROJECTS_DIR, "projects"),
    graphsDir: resolveFromRuntime(environment.EIDO_GRAPHS_DIR, "graphs"),
    skillsDir: resolveFromRoot(environment.EIDO_SKILLS_DIR, path.join("database", "agents", "skills")),
  });
}

/** Resolve lazily so tests and server processes can set overrides before use. */
export function platformPaths(): PlatformPaths {
  return resolvePlatformPaths();
}

/**
 * Resolve a workspace path stored on an Agent profile.
 *
 * `workspace` was the historical logical value written to the database. Keep
 * accepting it (and its descendants) after the physical directory moved under
 * `runtime/`, so existing profiles do not require a data migration.
 */
export function resolveWorkspaceDirectory(
  configuredPath: string | null | undefined,
  paths = platformPaths(),
): string {
  const configured = configuredPath?.trim();
  if (!configured) return paths.workspaceDir;
  if (path.isAbsolute(configured)) {
    const legacyWorkspace = path.join(paths.rootDir, "workspace");
    const relativeToLegacy = path.relative(legacyWorkspace, configured);
    if (relativeToLegacy === "" || (!relativeToLegacy.startsWith("..") && !path.isAbsolute(relativeToLegacy))) {
      return path.resolve(paths.workspaceDir, relativeToLegacy);
    }
    return path.resolve(configured);
  }

  const normalized = path.normalize(configured);
  const [first, ...rest] = normalized.split(path.sep);
  return first === "workspace"
    ? path.resolve(paths.workspaceDir, ...rest)
    : path.resolve(paths.rootDir, normalized);
}
