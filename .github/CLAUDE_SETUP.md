# Claude Code Review Setup Guide

This repository uses Claude AI-powered automated code review through GitHub Actions. This guide explains how to set up and use the system.

## Features

### 🤖 Automated PR Reviews
When you open or update a pull request, Claude automatically:
- Reviews all code changes
- Checks for TypeScript errors, ESLint violations, security issues, and test failures
- **Automatically fixes issues** it finds
- Commits fixes with `[skip ci]` prefix to avoid loops
- Runs up to **5 review-fix iterations** until code is clean
- Posts a summary comment when complete

### 💬 @claude Mention Bot
Comment `@claude` in any PR to get on-demand help:
- **Code fixes**: "@claude fix the TypeScript errors in LoginForm.tsx"
- **Code review**: "@claude review this function for security issues"
- **Explanations**: "@claude explain how the audio engine works"
- **Questions**: "@claude why is this test failing?"

Claude will respond to your comment and can create commits if needed.

### 🔒 Security Reviews
Dedicated security-focused review that checks for:
- XSS and injection vulnerabilities
- Authentication/authorization flaws
- Sensitive data exposure
- Vulnerable dependencies
- Audio/media-specific security risks

## Setup Instructions

### 1. Add ANTHROPIC_API_KEY Secret

**You must configure this secret for the workflows to run.**

1. Get your API key from [Anthropic Console](https://console.anthropic.com/)
2. Go to your repository Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `ANTHROPIC_API_KEY`
5. Value: Paste your API key
6. Click "Add secret"

### 2. Enable Workflows (if disabled)

1. Go to the Actions tab in your repository
2. If workflows are disabled, click "I understand my workflows, go ahead and enable them"
3. The three Claude workflows should appear:
   - Claude Auto Review
   - Claude Mention Bot
   - Claude Security Review

### 3. Configure Branch Protection (Recommended)

To ensure code quality:

1. Go to Settings → Branches
2. Add rule for `main` branch
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
4. Select these status checks:
   - `review` (from Claude Auto Review)
   - `security-review` (from Claude Security Review)

## How It Works

### Automated Review Workflow

```
You open a PR
    ↓
Claude Auto Review triggers
    ↓
Claude reviews your code
    ↓
Issues found? → Yes → Claude fixes them → Commits with [skip ci] → Reviews again
             → No  → Posts "All clear!" comment
    ↓
Repeats up to 5 times or until clean
```

### @claude Mention Workflow

```
You comment: "@claude fix the TypeScript errors"
    ↓
Claude Mention Bot triggers
    ↓
Claude reads the PR and your comment
    ↓
Claude makes the requested changes
    ↓
Claude commits the fixes
    ↓
Claude replies to your comment with what it did
```

## Usage Examples

### Example 1: Automatic Review
```
1. Create a PR with some TypeScript errors
2. Wait a few moments
3. Claude will:
   - Find the errors
   - Fix them
   - Commit: "[skip ci] fix: resolve TypeScript errors in LoginForm"
   - Post a summary comment
```

### Example 2: Request Specific Fix
Comment on your PR:
```
@claude please add type annotations to the handleLogin function
```

Claude responds:
```
Hi @yourusername! 👋

I understood you want type annotations added to handleLogin.

I've added proper TypeScript types:
- Parameters: username: string, password: string
- Return type: Promise<AuthResult>

Committed in a7f9d2c.

---
🤖 Claude Code Bot
```

### Example 3: Ask for Code Review
Comment:
```
@claude review the security of the authentication flow
```

Claude analyzes and responds with findings.

### Example 4: Get Explanation
Comment:
```
@claude explain how the audio scheduling works in LooperNode
```

Claude reads the code and explains it.

## What Gets Checked?

### TypeScript Errors
- Type safety issues
- Missing type annotations
- Type mismatches
- Strict mode violations

### ESLint Issues
- Code style violations
- React hooks rules
- Unused variables
- Missing dependencies in useEffect

### Security Vulnerabilities
- XSS risks (innerHTML, dangerouslySetInnerHTML)
- Input validation gaps
- Authentication bypasses
- Sensitive data exposure
- Vulnerable dependencies

### Test Failures
- Broken unit tests
- Integration test failures
- Missing test coverage for new code

## Workflow Files

| File | Purpose | Triggers |
|------|---------|----------|
| `claude-auto-review.yml` | Automated iterative review & fix | PR opened/updated |
| `claude-mention-bot.yml` | Respond to @claude mentions | Comments with @claude |
| `claude-security-review.yml` | Security-focused deep scan | PR affecting TypeScript files |

## Configuration

### Changing Max Iterations

Edit `.github/workflows/claude-auto-review.yml`:
```yaml
claude_args: |
  --max-turns 5  # Change this number (1-10)
```

### Changing Trigger Phrase

Edit `.github/workflows/claude-mention-bot.yml`:
```yaml
if: github.event.issue.pull_request && contains(github.event.comment.body, '@claude')
```

Change `@claude` to your preferred trigger (e.g., `/claude`, `@bot`).

### Customizing Review Focus

Edit the `prompt` section in any workflow file to adjust what Claude looks for.

## Troubleshooting

### Workflow Not Running

**Check:**
- ✅ Is `ANTHROPIC_API_KEY` secret configured?
- ✅ Are workflows enabled in Actions tab?
- ✅ Did the PR trigger the workflow? (Check Actions tab)

### Bot Not Responding to @mentions

**Check:**
- ✅ Did you mention exactly `@claude` (case sensitive)?
- ✅ Is the comment on a PR (not an issue)?
- ✅ Check Actions tab for error logs

### Commits Creating Infinite Loops

**This shouldn't happen** because:
- Claude uses `[skip ci]` in commit messages
- Workflow has `if: "!contains(..., '[skip ci]')"` condition
- Max iterations limit (5) prevents runaway

**If it does happen:**
- Disable the workflow temporarily
- Check commit messages for missing `[skip ci]`
- Report the issue

### API Rate Limits / Costs

**Monitor usage:**
- [Anthropic Console](https://console.anthropic.com/) → Usage tab
- Check API usage and costs

**Reduce costs:**
- Lower `max_turns` from 5 to 3
- Trigger reviews only on specific file paths
- Use Haiku model for simple checks (requires custom config)

## Cost Estimation

**Rough estimates** (varies by PR size):
- Small PR (<100 lines): $0.10 - $0.30 per review
- Medium PR (100-500 lines): $0.30 - $1.00 per review
- Large PR (500+ lines): $1.00 - $3.00 per review

**With 5 iterations:**
- Multiply by number of iterations actually used
- Most PRs complete in 1-2 iterations

**Monitoring:**
- Check your Anthropic Console for actual usage
- Set up billing alerts if concerned

## Best Practices

### For Developers
1. **Review Claude's changes** - Don't blindly trust, verify the fixes
2. **Use @claude for help** - It's faster than waiting for human review
3. **Keep PRs focused** - Smaller PRs = faster, cheaper reviews
4. **Write clear commit messages** - Helps Claude understand context

### For Maintainers
1. **Monitor API costs** - Check Anthropic Console weekly
2. **Review workflow logs** - Catch issues early
3. **Update prompts** - Tune for your project's needs
4. **Require human approval** - Claude assists, humans decide

## Security Considerations

⚠️ **Important:** Per Anthropic documentation:
- The action is **not hardened against prompt injection**
- Only run on **trusted PRs**
- **Require manual approval** for external contributor PRs
- Keep **branch protection enabled**
- Use **CODEOWNERS** for critical files

### Recommended GitHub Settings
- Enable "Require approval for first-time contributors"
- Enable "Require review from Code Owners"
- Limit who can push to main branch

## Support & Resources

- [Anthropic Claude Code Action](https://github.com/anthropics/claude-code-action)
- [Claude Code Security Review](https://github.com/anthropics/claude-code-security-review)
- [Claude Code Docs](https://docs.anthropic.com/en/docs/claude-code/github-actions)
- [GitHub Actions Docs](https://docs.github.com/en/actions)

## Feedback

If you encounter issues with the Claude workflows:
1. Check the Actions tab for error logs
2. Review this guide's Troubleshooting section
3. Open an issue with details about the problem

---

**Ready to go!** Open a PR and watch Claude review your code automatically. 🚀
