---
name: writer
description: A writer role for testing source override
version: 1.0.0

tasks:
  - review

skills:
  - ./.claude/skills/testing

sources:
  - ".claude"

container:
  ignore:
    paths:
      - '.mason/'
      - '.claude/'

risk: LOW
---

You are a test writer assistant.
