# New Project Setup Checklist

Use this checklist when setting up session documentation for a new project.

## Initial Setup

### 1. Create Documentation Structure
- [ ] Create `.claude/` directory in project root
- [ ] Copy `ClaudeCode_README.md` from template project
- [ ] Copy `session-template.md` from template project
- [ ] Create empty `INDEX.md` with header structure
- [ ] Copy this `setup-checklist.md`

### 2. Customize for Project
- [ ] Update project name in `ClaudeCode_README.md` (line 3)
- [ ] Clear any existing session entries from `INDEX.md`
- [ ] Add `.claude/` to `.gitignore`

### 3. First Session Documentation
- [ ] Complete first development session
- [ ] Create first session document using template
- [ ] Update `INDEX.md` with first session entry
- [ ] Commit documentation with code changes

## Template Files to Copy

```bash
# From existing project with session documentation
cp /path/to/template/.claude/ClaudeCode_README.md .claude/
cp /path/to/template/.claude/session-template.md .claude/
cp /path/to/template/.claude/setup-checklist.md .claude/

# Create clean INDEX.md
cat > .claude/INDEX.md << 'EOF'
# Session Index

Quick overview of all development sessions with brief summaries and status indicators.

## [YEAR] Sessions

### [Month]

| Date | Session | Type | Status | Summary |
|------|---------|------|--------|---------|
| MM.DD | [session-name](./MM.DD-session-name.md) | type | status | Brief summary |

## Legend

**Status Indicators:**
- ✅ Complete - Session finished, all objectives met
- 🔄 In Progress - Session ongoing or objectives partially met  
- ❌ Blocked - Session blocked by external dependencies
- 📝 Documentation - Session documented but implementation pending

**Session Types:**
- **feature** - New functionality development
- **bugfix** - Fixing existing issues  
- **refactor** - Code improvement without functional changes
- **infrastructure** - Build, deployment, or tooling changes
- **ui/ux** - User interface and experience improvements
- **integration** - Connecting systems or services
- **documentation** - Adding or updating documentation
- **testing** - Adding tests or improving test coverage
EOF
```

## .gitignore Entry

Add this to your project's `.gitignore`:

```
# Claude Code session documentation
.claude/
```

## Verification

After setup, verify Claude Code can find the documentation:
- [ ] `.claude/ClaudeCode_README.md` exists and is customized
- [ ] `.claude/INDEX.md` exists with clean structure
- [ ] `.claude/session-template.md` exists for future sessions
- [ ] `.claude/` is added to `.gitignore`
- [ ] Directory structure is ready for first session documentation

## Notes

- Claude Code automatically reads `.claude/` folders and will understand the documentation system
- Start documenting from your first development session - even initial setup is valuable
- Claude can automatically update `INDEX.md` when creating session documents
- Keep session files focused - one major task/fix per document