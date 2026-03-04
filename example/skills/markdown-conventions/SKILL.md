# Markdown Conventions

## File Naming

- Use kebab-case: `meeting-notes.md`, `project-ideas.md`
- Prefix date-stamped notes with `YYYY-MM-DD`: `2026-03-03-standup.md`

## Structure

Every note must include:

1. **Title** — A single `#` heading at the top
2. **Date** — ISO 8601 date on the line below the title
3. **Body** — Content under `##` section headings

## Formatting Rules

- Use `##` for sections, `###` for subsections — never skip heading levels
- Use `-` for unordered lists, `1.` for ordered lists
- Wrap inline code in backticks, use fenced blocks for multi-line code
- One blank line between sections, no trailing whitespace

## Example

```markdown
# Weekly Standup

2026-03-03

## Progress

- Completed the authentication module
- Fixed 3 bugs in the dashboard

## Blockers

- Waiting on API spec from backend team

## Next Steps

1. Start on the notification system
2. Review PR #42
```
