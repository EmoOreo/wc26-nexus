# WC26 Nexus - 2026 FIFA World Cup Immersive Dashboard

A stunning real-time 3D visualization inspired by **plasma-net**, built with **React + Three.js + React Three Fiber**.

Live globe with glowing match pins, particle effects for goals/momentum, interactive HUD, standings, and full tournament tracking.

## Features
- **3D Interactive Globe** with venue pins and live match indicators
- **Real-time Next Match** countdown (Mexico vs South Africa is LIVE!)
- **Live Fixtures & Scores** (Group A focus + expandable)
- **Group Standings**, Fixtures, and Bracket tabs
- **Sci-fi HUD** with Tailwind + Lucide icons
- OrbitControls for smooth globe interaction
- Particle stars + atmospheric effects

## Tech Stack (Plasma-Net Style)
- React 19 + Vite + TypeScript
- Three.js + @react-three/fiber + @react-three/drei
- Tailwind CSS
- Hybrid data (static + future API integration)

## Run Locally
```bash
cd wc26-nexus
npm install
npm run dev
```

Open http://localhost:5173

## Deploy
```bash
npm run build
# Deploy `dist` folder to GitHub Pages / Vercel / Netlify
```

**Live Demo** (once deployed): https://yourusername.github.io/wc26-nexus

Built for the biggest World Cup ever — 48 teams, 104 matches, USA/Canada/Mexico.

Contributions welcome! Add more venues, live score APIs, goal particle bursts, etc.

⚽ #WC26 #WorldCup2026