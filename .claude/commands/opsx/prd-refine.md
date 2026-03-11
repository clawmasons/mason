---
# .claude/commands/opsx/prd-refine.md
---

1. Switch to Plan mode
2. **Find PRD to modify** Find the relevant PRD.md in the openspce/prds/ directory using the branch name as a guid 
3. **Find IMPLEMENTATION plan** Find if there is already a IMPLEMENTATION.md with the prd. 


Do a detailed analysis of the PRD.md and if it exists the IMPLEMENTATION.md looking for security vulnerabilities, major gaps in test coverage, and general best practices for a maintainable scalable architecture.

analyize existing code base and any spec.md files that may be relevant

If the PRD.md references external code bases/libraries, do a detailed analysis of those libraries.

write all changes to the PRD.md and then the IMPLEMENTATION.md
