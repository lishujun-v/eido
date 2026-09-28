---
name: skill-creator
description: Create or update Eido AgentSkills with concise SKILL.md instructions and optional scripts, references, and assets.
---

# Skill Creator

Create a folder named with lowercase letters, digits, and hyphens under the requested skill catalog. Include `SKILL.md` with YAML `name` and `description`; keep triggering conditions in the description and procedural guidance in the body.

Use progressive disclosure:

- `SKILL.md` for the essential workflow;
- `scripts/` for deterministic or repeatedly generated operations;
- `references/` for detailed domain or API material;
- `assets/` for templates and files used in outputs.

Keep the body concise and avoid auxiliary README, changelog, or installation-guide files. Adapt all tool names to Eido's actual equipped tools. Validate frontmatter, referenced paths, dependencies, safety boundaries, and at least one representative trigger before considering the skill complete.
