---
name: configure-project
description: Supervisor role to configure (or reconfigure a project)
version: 1.0.0
type: supervisor
skills:
  - create-role-plan
apps:
container: {}

risk: HIGH

credentials:
  - CLAUDE_CODE_OAUTH_TOKEN
---



Help user setup a project for mason

1. Determine {project-dir} in a docker will be in the 'project' subdirectory or `/home/mason/workspace/project`
2. create a role plan for project
3. implement role plan for project
4. 
