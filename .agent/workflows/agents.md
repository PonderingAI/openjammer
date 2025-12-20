# AGENTS.md – Development Guidelines

## Package Manager: Bun Only

**Always use `bun` instead of npm/yarn/pnpm.**

```bash
# Install dependencies
bun install

# Run dev server
bun dev

# Build for production
bun run build

# Add a package
bun add <package>

# Add dev dependency
bun add -d <package>
```

Do not use `npm`, `npx`, `yarn`, or `pnpm` commands anywhere in the codebase or documentation.

---

## Code Standards

### File Structure
- Components in `/src/components/`
- Nodes in `/src/nodes/` with one file per node type
- Audio engine in `/src/audio/`
- State management in `/src/state/`
- Theming in `/src/themes/`

### Naming
- Components: PascalCase (`KeyboardNode.tsx`)
- Utilities: camelCase (`audioUtils.ts`)
- Constants: SCREAMING_SNAKE_CASE

### Commits
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `style:`, `test:`
- Keep commits atomic and focused

---

## Architecture Notes

### Port Types and Colors

**Port type determines color:**
- `type: 'audio'` → **Blue** (music/sound)
- `type: 'technical'` → **Grey** (numbers/triggers)

**Examples:**
- Keyboard outputs: `technical` (sends numbers, not sound)
- Instrument inputs: `technical` (receives triggers)
- Instrument outputs: `audio` (makes sound)
- Effects: `audio` (processes sound)

### Future Integrations (Design With These in Mind)
- **MIDI support**: Node inputs should be abstracted to accept MIDI events
- **Custom nodes**: Plugin architecture for community-contributed nodes
- **Themes**: CSS variables for all colors, stored in theme JSON files

### Performance
- Web Audio API nodes should be created/destroyed carefully to prevent memory leaks
- Use `requestAnimationFrame` for visual updates, not audio timing
- Audio timing must use `AudioContext.currentTime`

### Offline Support
- Service Worker for caching all assets
- No external API calls required for core functionality

---

## Testing Locally

```bash
bun dev
```

Opens at `http://localhost:5173` (or similar). Test audio features with headphones to avoid feedback loops when testing microphone input.

---

## Contributing Checklist

- [ ] Used `bun` for all package operations
- [ ] Followed existing code style
- [ ] Tested with audio actually playing
- [ ] Updated README if adding new node types
- [ ] No console errors or warnings