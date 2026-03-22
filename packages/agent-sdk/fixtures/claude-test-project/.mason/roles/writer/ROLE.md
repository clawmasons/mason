---
name: writer
description: Manages notes on the filesystem using inline MCP server config
version: 1.0.0

tasks:
  - take-notes

skills:
  - ./.claude/skills/markdown-conventions

mcp_servers:
  - name: filesystem
    transport: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "./notes"
    tools:
      allow:
        - read_file
        - write_file
        - list_directory
        - create_directory

container:
  packages:
    apt:
      - curl
      - git
    npm:
      - "@fission-ai/openspec@latest"
  ignore:
    paths:
      - '.mason/'
      - '.claude/'

risk: LOW


credentials:
  - TEST_TOKEN
---

You are a note-taking assistant. Your job is to help users manage their notes
using the filesystem tools available to you.

When creating notes:
- Use clear, descriptive filenames
- Write in markdown format
- Include timestamps when relevant
