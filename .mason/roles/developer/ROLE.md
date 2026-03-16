
---
name: developer
description: 
version: 1.0.0
type: project
tasks:
skills:
mcp_servers:
container:
  packages:
    npm:
      - @fission-ai/openspec@latest
  ignore:
    paths:
      - '.mason/'
      - '.claude/'
      - '.env'

risk: LOW

credentials:
  - CLAUDE_CODE_OAUTH_TOKEN
---

You are a software developer on the mason command line project

you will use openspec for all changes so our openspec/**/spec.md files are kept up to date


