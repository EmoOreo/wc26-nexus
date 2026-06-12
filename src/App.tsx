import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Trophy, Users, Calendar, MapPin, Play } from 'lucide-react';

interface Match {
  id: number;
  home: string;
  away: string;
  score?: string;
  time: string;
  group: string;
}

const liveMatches: Match[] = [
  { id: 1, home: "Mexico", away: "South Africa", score: "1-0", time: "LIVE", group: "A" },
  { id: 2, home: "South Korea", away: "Czechia", score: "0-0", time: "45'", group: "A" },
  { id: 3, home: "USA", away: "Wales", score: "-", time: "Upcoming", group: "B" },
];

function Globe() {
  return (
    <mesh>
      <sphereGeometry args={[3, 64, 64]} />
      <meshStandardMaterial 
        color="#0a2540" 
        emissive="#1e3a8a"
        metalness={0.8}
        roughness={0.2}
      />
    </mesh>
  );
}

function MatchPin({ position, match }: { position: [number, number, number]; match: Match }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.15]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" />
      </mesh>
      <pointLight color="#22c55e" intensity={2} distance={2} />
    </group>
  );
}

function WC26Nexus() {
  const [activeTab, setActiveTab] = useState<'overview' | 'groups' | 'fixtures' | 'bracket'>('overview');
  const [nextMatchTime, setNextMatchTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const opener = new Date(Date.UTC(2026, 5, 11, 19, 0, 0)); // June 11, 15:00 ET = 19:00 UTC
      const diff = opener.getTime() - now.getTime();
      
      if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        setNextMatchTime(`${days}d ${hours}h AWAY`);
      } else {
        setNextMatchTime('LIVE NOW! 🔥');
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* HUD Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-cyan-500/30 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-emerald-400 rounded-full flex items-center justify-center">
            ⚽
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tighter">WC26 NEXUS</h1>
            <p className="text-xs text-cyan-400">2026 FIFA WORLD CUP • IMMERSIVE ORBIT</p>
          </div>
        </div>
        
        <div className="flex gap-6 text-sm">
          {['overview', 'groups', 'fixtures', 'bracket'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-5 py-2 rounded-full transition-all uppercase tracking-widest text-sm ${activeTab === tab ? 'bg-white text-black font-medium' : 'hover:bg-white/10'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500 rounded-full flex items-center gap-2">
            <Play className="w-4 h-4" /> LIVE MODE
          </div>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 12], fov: 45 }}>
          <ambientLight intensity={0.3} />
          <pointLight position={[10, 10, 10]} />
          <Globe />
          {liveMatches.map((match, i) => (
            <MatchPin 
              key={match.id}
              position={[
                Math.sin(i) * 4.5, 
                Math.cos(i) * 1.5, 
                Math.cos(i) * 4
              ]} 
              match={match} 
            />
          ))}
          <Stars radius={300} depth={60} count={800} factor={4} saturation={0} fade speed={0.5} />
          <OrbitControls enablePan={false} enableZoom={true} autoRotate autoRotateSpeed={0.2} />
          <Environment preset="night" />
        </Canvas>
      </div>

      {/* Floating HUD Panels */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="max-w-7xl mx-auto pt-24 px-6">
          {/* Overview Panel */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pointer-events-auto">
              {/* Next Match Card */}
              <div 
                onClick={() => setActiveTab('fixtures')}
                className="bg-black/70 backdrop-blur-xl border border-cyan-400/50 rounded-3xl p-8 hover:border-emerald-400 cursor-pointer transition-all group"
              >
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="uppercase tracking-[3px] text-xs text-cyan-400">NEXT / LIVE</div>
                    <div className="text-4xl font-bold mt-1 group-hover:text-emerald-400 transition-colors">MEXICO vs SOUTH AFRICA</div>
                  </div>
                  <Trophy className="w-10 h-10 text-amber-400" />
                </div>
                <div className="text-6xl font-mono font-bold text-emerald-400 mb-2">{nextMatchTime}</div>
                <div className="text-sm opacity-75">Estadio Azteca • Group A • FOX / Telemundo</div>
              </div>

              {/* Stats */}
              <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
                <div className="text-6xl font-bold mb-1">48</div>
                <div className="text-xl opacity-75">TEAMS</div>
                <div className="h-1.5 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded mt-6"></div>
              </div>

              <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-8 flex flex-col justify-between">
                <div>
                  <div className="text-6xl font-bold mb-1">104</div>
                  <div className="text-xl opacity-75">MATCHES</div>
                </div>
                <div className="text-emerald-400 text-sm mt-8">39 DAYS OF GLORY • JUNE 11 - JULY 19</div>
              </div>
            </div>
          )}

          {/* Other tabs placeholder - expand as needed */}
          {activeTab === 'groups' && (
            <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center">
              <h2 className="text-5xl font-bold mb-4">GROUP STAGE STANDINGS</h2>
              <p className="text-xl opacity-75">Live data coming soon • Click pins on the globe</p>
            </div>
          )}

          {activeTab === 'fixtures' && (
            <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-10">
              <h2 className="text-5xl font-bold mb-8">TODAY'S FIXTURES</h2>
              <div className="space-y-6">
                {liveMatches.map(m => (
                  <div key={m.id} className="flex items-center justify-between bg-white/5 p-6 rounded-2xl">
                    <div className="flex-1 text-right pr-8">
                      <div className="font-semibold text-xl">{m.home}</div>
                    </div>
                    <div className="text-center px-8">
                      <div className="text-4xl font-mono font-bold text-emerald-400">{m.score || m.time}</div>
                      <div className="text-xs uppercase tracking-widest text-cyan-400">GROUP {m.group}</div>
                    </div>
                    <div className="flex-1 pl-8">
                      <div className="font-semibold text-xl">{m.away}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'bracket' && (
            <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center">
              <h2 className="text-5xl font-bold mb-4">KNOCKOUT BRACKET</h2>
              <p className="text-xl opacity-75">Interactive 3D bracket coming in next update</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md border border-cyan-500/30 px-8 py-3 rounded-full flex items-center gap-8 text-sm">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4" /> 16 Venues • 3 Countries
        </div>
        <div>48 TEAMS • 12 GROUPS</div>
        <div>🇲🇽 🇺🇸 🇨🇦 HOSTS</div>
      </div>
    </div>
  );
}

export default WC26Nexus;
