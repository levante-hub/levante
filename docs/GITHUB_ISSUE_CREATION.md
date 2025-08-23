# GitHub Issue Creation Process

This document describes the process for creating GitHub issues from PRD files using the `gh` CLI command.

## Prerequisites

1. **GitHub CLI installed**: Ensure `gh` command is available
2. **Authentication**: Run `gh auth login` to authenticate with GitHub
3. **Repository access**: Ensure you have write access to the target repository

## Source Files Structure

Issues are defined in `docs/PRD/ISSUES/` with the following structure:

```
docs/PRD/ISSUES/
├── INDEX.yaml          # Master list of all issues
├── 0001-issue-name.md   # Individual issue files
├── 0002-issue-name.md
└── ...
```

### INDEX.yaml Format

```yaml
issues:
  - id: 0001
    title: Issue Title
    labels: [label1, label2, label3]
    priority: P0
    role: Role Name
```

### Issue File Format

Each issue file follows this markdown structure:

```markdown
---
id: 0001
title: Issue Title
labels: [label1, label2]
priority: P0
role: Role Name
depends_on: [0002, 0003]  # Optional dependencies
---

## Summary
Brief description of the issue.

## Acceptance Criteria
- Criterion 1
- Criterion 2

## Deliverables
- Deliverable 1
- Deliverable 2

## Notes
Additional notes or references.
```

## Creation Process

### 1. Automated Creation Script

Use the following bash commands to create all issues:

```bash
# Create issues without labels (if labels don't exist in repo)
for file in docs/PRD/ISSUES/[0-9]*.md; do
  # Extract title from frontmatter
  title=$(grep "^title:" "$file" | sed 's/title: //')
  
  # Create issue with body from file content
  gh issue create --repo levante-hub/levante \
    --title "$title" \
    --body "$(cat "$file" | sed '1,/^---$/d' | sed '1,/^---$/d')"
done
```

### 2. Manual Creation Commands

For individual issues, use this template:

```bash
gh issue create --repo levante-hub/levante \
  --title "Issue Title" \
  --body "$(cat <<'EOF'
## Summary
Issue description

## Acceptance Criteria
- Criterion 1
- Criterion 2

## Deliverables  
- Deliverable 1

**Priority:** P0
**Role:** Role Name
**Labels:** label1, label2, label3
**ID:** 0001
**Depends on:** Issue #X
EOF
)"
```

## Handling Labels

If repository labels don't exist, issues are created without the `--label` flag and labels are included in the issue body instead:

```bash
# Without labels (when labels don't exist)
gh issue create --repo levante-hub/levante \
  --title "Title" \
  --body "Content with labels in body"

# With labels (when labels exist)
gh issue create --repo levante-hub/levante \
  --title "Title" \
  --label "label1,label2,label3" \
  --body "Content"
```

## Example Execution

The following commands were used to create the initial MVP issues:

```bash
# Issue #1 - Foundations
gh issue create --repo levante-hub/levante \
  --title "Foundations — Electron + React + Local DB (MVP)" \
  --body "$(cat <<'EOF'
## Summary
Set up the Electron + React + TypeScript app with hexagonal structure and local SQLite (Turso‑compatible) for sessions/messages/settings.

## Acceptance Criteria
- App boots on Win/macOS/Linux showing a placeholder chat view.
- Local SQLite initialized; migration `0001_init.sql` applied.
- Basic logging and error boundary in renderer.

## Deliverables
- Project scaffold (main/preload/renderer), scripts: dev/build/package.
- DB service with `init` and `runMigrations`.

## Notes
See `docs/ARCHITECTURE.md`, `docs/TECH_SPEC.md`, and `docs/DB/MIGRATIONS/0001_init.sql`.

**Priority:** P0  
**Role:** Platform Engineer  
**Labels:** mvp, platform, electron, react, db  
**ID:** 0001
EOF
)"
```

## Results

The process successfully created 5 issues:

1. [Issue #1](https://github.com/levante-hub/levante/issues/1) - Foundations — Electron + React + Local DB (MVP)
2. [Issue #2](https://github.com/levante-hub/levante/issues/2) - AI SDK — Multi‑model support + streaming  
3. [Issue #3](https://github.com/levante-hub/levante/issues/3) - MCP — Basic integration with consent and audit
4. [Issue #4](https://github.com/levante-hub/levante/issues/4) - Security — OS keychain + opt‑in telemetry
5. [Issue #5](https://github.com/levante-hub/levante/issues/5) - Search — Text search across chat history

## Best Practices

1. **Consistent formatting**: Use the same markdown structure for all issues
2. **Include metadata**: Always include priority, role, labels, and ID in the body
3. **Reference dependencies**: Link to dependent issues using `Issue #X` format
4. **Batch creation**: Create related issues together to maintain sequential numbering
5. **Verify results**: Check created issues on GitHub to ensure proper formatting

## Updating Existing Issues

After creating issues, you may need to update them based on changes to the PRD files or feedback. Use the `gh issue edit` command:

### Update Issue Title and Body

```bash
# Update issue title
gh issue edit 1 --repo levante-hub/levante --title "New Title"

# Update issue body from file
gh issue edit 1 --repo levante-hub/levante --body-file updated-issue.md

# Update issue body directly
gh issue edit 1 --repo levante-hub/levante --body "$(cat <<'EOF'
## Updated Summary
New description

## Updated Acceptance Criteria
- New criterion 1
- New criterion 2
EOF
)"
```

### Update Labels and Assignees

```bash
# Add labels (if they exist in repo)
gh issue edit 1 --repo levante-hub/levante --add-label "enhancement,priority-high"

# Remove labels
gh issue edit 1 --repo levante-hub/levante --remove-label "bug"

# Add assignees
gh issue edit 1 --repo levante-hub/levante --add-assignee "@me,username"

# Remove assignees
gh issue edit 1 --repo levante-hub/levante --remove-assignee "username"
```

### Update Milestone and Projects

```bash
# Set milestone
gh issue edit 1 --repo levante-hub/levante --milestone "v1.0"

# Remove milestone
gh issue edit 1 --repo levante-hub/levante --remove-milestone

# Add to project
gh issue edit 1 --repo levante-hub/levante --add-project "MVP Development"
```

### Automated Update from PRD Changes

When PRD files are updated, you can create a script to sync changes:

```bash
#!/bin/bash
# update-issues.sh

REPO="levante-hub/levante"

# Function to update issue from file
update_issue_from_file() {
  local issue_file="$1"
  local issue_number="$2"
  
  # Extract title from frontmatter
  local title=$(grep "^title:" "$issue_file" | sed 's/title: //')
  
  # Extract content (remove frontmatter)
  local body=$(cat "$issue_file" | sed '1,/^---$/d' | sed '1,/^---$/d')
  
  # Update issue
  gh issue edit "$issue_number" --repo "$REPO" \
    --title "$title" \
    --body "$body"
    
  echo "Updated issue #$issue_number: $title"
}

# Update specific issue
# update_issue_from_file "docs/PRD/ISSUES/0001-foundations-electron-react-db.md" 1

# Or batch update all issues
for file in docs/PRD/ISSUES/[0-9]*.md; do
  # Extract issue ID from filename
  issue_id=$(basename "$file" | sed 's/^0*//' | sed 's/-.*//')
  update_issue_from_file "$file" "$issue_id"
done
```

### Update Workflow

1. **Modify PRD file**: Update the issue definition in `docs/PRD/ISSUES/XXXX-name.md`
2. **Review changes**: Compare current issue with updated PRD
3. **Update issue**: Use `gh issue edit` to apply changes
4. **Verify update**: Check the issue on GitHub to ensure proper formatting

### Example Update

If you need to update issue #1 with new acceptance criteria:

```bash
# Read the updated PRD file
UPDATED_BODY=$(cat docs/PRD/ISSUES/0001-foundations-electron-react-db.md | sed '1,/^---$/d' | sed '1,/^---$/d')

# Update the issue
gh issue edit 1 --repo levante-hub/levante --body "$UPDATED_BODY"
```

## Troubleshooting

- **Label errors**: If labels don't exist, create issues without `--label` flag
- **Authentication errors**: Run `gh auth status` and re-authenticate if needed
- **Repository access**: Ensure you have write permissions to the target repository
- **Malformed markdown**: Validate issue file format before creation
- **Update conflicts**: If issue was modified externally, review changes before overwriting
- **Project permissions**: For project updates, run `gh auth refresh -s project`