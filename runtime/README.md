# Runtime data

This directory groups mutable files used while Eido is running:

- `workspace/`: the shared default Agent workspace and generated artifacts;
- `projects/`: runnable project packages and project-owned storage;
- `graphs/`: Graph definitions, Python logic, run records, and trash.

Application code must resolve these locations through `src/config/paths.ts` or
the corresponding `AgentConfig` properties in the Python service. Do not build
paths from the process working directory or assume these directories are
siblings of `database/`.

`database/` intentionally remains at the repository root so it can be migrated
or initialized independently. Deployments can relocate the complete runtime
tree with `EIDO_RUNTIME_DIR`, or override one child with
`EIDO_WORKSPACE_DIR`, `EIDO_PROJECTS_DIR`, or `EIDO_GRAPHS_DIR`.
