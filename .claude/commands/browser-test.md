---
description: Test a page in the browser using an isolated Chrome DevTools agent
---

Spawn an isolated Claude instance with Chrome DevTools MCP to test the specified page.

## Prerequisites Check

First, verify Chrome is running with remote debugging:
```bash
pgrep -f "remote-debugging-port=9222" || echo "Chrome not running with debugging. Start it with: google-chrome --remote-debugging-port=9222"
```

## Spawn Isolated Browser Agent

Run this command to spawn an isolated Claude instance with only the Chrome DevTools MCP:

```bash
claude --model sonnet --mcp-config .claude/mcp-configs/browser.json --print "
You are a browser testing agent with Chrome DevTools access.

TARGET: $ARGUMENTS

If no URL specified, use http://localhost:3000

ERROR HANDLING:
- If Chrome connection fails: Report 'Chrome not running with --remote-debugging-port=9222' and exit
- If page doesn't load in 30s: Report timeout with any partial info gathered
- If DevTools disconnects mid-test: Retry once, then report partial results
- If TARGET is empty: Test http://localhost:3000 as default

INSTRUCTIONS:
1. Connect to Chrome via DevTools Protocol
2. Navigate to the target URL
3. Check for console errors/warnings
4. Verify page elements load correctly
5. Test interactive functionality
6. Take screenshots to document findings
7. Report any issues found

Provide a clear summary of:
- Page load status
- Errors/warnings found
- Functionality verified
- Screenshots taken
- Issues discovered
"
```

Report the results back to the user.
