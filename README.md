# 🎹 OpenJammer

**Node-based music generation tool for live performances**

OpenJammer is a free, open-source, client-side music workstation that runs entirely in your browser. Create loops, record sounds, and jam with virtual instruments—all offline after your first visit.

![OpenJammer Screenshot](https://via.placeholder.com/800x450/0a0a0f/6366f1?text=OpenJammer)

## ✨ Features

- **Node-Based Workflow** - Connect instruments, effects, and loopers visually
- **Virtual Instruments** - Piano, Cello, Saxophone with keyboard control
- **Live Looping** - Auto-record loops with configurable duration
- **Audio Effects** - Distortion, Reverb, Delay, Pitch Shift
- **Microphone Input** - Record live audio
- **Offline Support** - Works without internet after first load
- **Export/Import** - Save and share your workflows as JSON
- **Zero Cost** - No backend, no subscriptions, 100% client-side

## 🚀 Quick Start

### Use Online
Visit [openjammer.vercel.app](https://openjammer.vercel.app) and start jamming!

### Run Locally

```bash
# Clone the repository
git clone https://github.com/yourusername/openjammer.git
cd openjammer

# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build
```

## 🎵 How to Use

1. **Add Nodes** - Right-click on the canvas to open the node menu
2. **Connect Nodes** - Click on a port and drag to another compatible port
3. **Play Instruments** - Select an instrument and press "Play" to use keyboard
4. **Record Loops** - Connect an instrument to a Looper and press Record
5. **Add Effects** - Insert Effect nodes between instruments and output
6. **Export Workflow** - Click "Export" to save your setup as JSON

### Keyboard Layout (When Instrument Active)

| Row | Keys | Notes |
|-----|------|-------|
| High | 1-0 | Higher octave |
| Mid | Q-P | Middle octave |
| Low | A-L | Lower octave |
| Lower | Z-/ | Lowest octave |

## 🏗️ Architecture

```
src/
├── audio/           # Web Audio API layer
│   ├── AudioEngine.ts      # Context management
│   ├── Instruments.ts      # Piano, Cello, Saxophone
│   ├── Looper.ts           # Loop recording/playback
│   └── Effects.ts          # Audio effects
├── components/      # React UI components
│   ├── Canvas/             # Node graph canvas
│   ├── Nodes/              # Individual node types
│   └── Toolbar/            # Top toolbar
├── engine/          # Node graph logic
│   ├── types.ts            # TypeScript definitions
│   ├── registry.ts         # Node definitions
│   └── serialization.ts    # Import/export
└── store/           # Zustand state management
```

## 🛠️ Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite 7** - Build tool with PWA support
- **Zustand** - State management
- **Web Audio API** - Audio processing

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Guidelines

- Follow existing code style
- Add types for all new code
- Test audio features in multiple browsers
- Keep bundle size minimal

## 📋 Roadmap

- [ ] MIDI input support
- [ ] Custom node plugins
- [ ] More instrument types
- [ ] Sample-based instruments
- [ ] Multi-track recording export
- [ ] Collaborative jamming (WebRTC)

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Inspired by [ComfyUI](https://github.com/comfyanonymous/ComfyUI) for the node interface
- Built with [Vite](https://vitejs.dev/) and [React](https://react.dev/)

---

Made with ❤️ for musicians everywhere
