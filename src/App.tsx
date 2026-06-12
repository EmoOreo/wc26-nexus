import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Environment } from '@react-three/drei';
import { Trophy, MapPin, Play, WifiOff } from 'lucide-react';

interface Match {
  id: number;
  home: string;
  away: string;
  score?: string;
  time: string;
  group: string;
  venue?: string;
}

type ActiveTab = 'overview' | 'groups' | 'fixtures' | 'bracket';
type DataStatus = 'loading' | 'public-api' | 'no-data' | 'api-error';

const WORLD_CUP_OPENER_UTC = Date.UTC(2026, 5, 11, 19, 0, 0);
const API_BASE = import.meta.env.VITE_WC26_API_URL || 'https://worldcup26.ir';

function normalizeMatch(raw: any, index: number): Match {
  const home = raw?.home || raw?.home_team || raw?.team1 || raw?.team_a || raw?.localteam || raw?.local_team || 'TBD';
  const away = raw?.away || raw?.away_team || raw?.team2 || raw?.team_b || raw?.visitorteam || raw?.visitor_team || 'TBD';
  const score = raw?.score || raw?.result || raw?.full_time_score || raw?.score_text || undefined;
  const time = raw?.status || raw?.time || raw?.date || raw?.kickoff || raw?.match_time || 'SCHEDULED';
  const group = raw?.group || raw?.stage || raw?.round || '-';
  const venue = raw?.venue || raw?.stadium || raw?.location || undefined;

  return {
    id: Number(raw?.id ?? raw?.match_id ?? index + 1),
    home: String(home),
    away: String(away),
    score: score ? String(score) : undefined,
    time: String(time),
    group: String(group),
    venue: venue ? String(venue) : undefined,
  };
}

function Globe() {
  return (
    <mesh>
      <sphereGeometry args={[3, 64, 64]} />
      <meshStandardMaterial color="#0a2540" emissive="#1e3a8a" metalness={0.8} roughness={0.2} />
    </mesh>
  );
}

function MatchPin({ position }: { position: [number, number, number]; match: Match }) {
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

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
      <div className="text-2xl font-bold mb-2">{title}</div>
      <div className="text-sm opacity-75">{message}</div>
    </div>
  );
}

function WC26Nexus() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [nextMatchTime, setNextMatchTime] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [status, setStatus] = useState<DataStatus>('loading');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        setStatus('loading');

        const [matchesRes, groupsRes] = await Promise.all([
          fetch(`${API_BASE}/get/games`, { cache: 'no-store' }),
          fetch(`${API_BASE}/get/groups`, { cache: 'no-store' }),
        ]);

        if (!matchesRes.ok || !groupsRes.ok) {
          throw new Error(`API request failed: games ${matchesRes.status}, groups ${groupsRes.status}`);
        }

        const matchesData = await matchesRes.json();
        const groupsData = await groupsRes.json();

        const normalizedMatches = Array.isArray(matchesData)
          ? matchesData.slice(0, 12).map((match, index) => normalizeMatch(match, index))
          : [];

        setMatches(normalizedMatches);
        setGroups(Array.isArray(groupsData) ? groupsData : []);
        setLastUpdated(new Date().toLocaleTimeString());
        setStatus(normalizedMatches.length > 0 || (Array.isArray(groupsData) && groupsData.length > 0) ? 'public-api' : 'no-data');
      } catch (error) {
        console.error('WC26 API fetch failed:', error);
        setMatches([]);
        setGroups([]);
        setStatus('api-error');
      }
    };

    fetchLiveData();
    const interval = window.setInterval(fetchLiveData, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const diff = WORLD_CUP_OPENER_UTC - Date.now();

      if (matches.length > 0) {
        setNextMatchTime(matches[0].time || 'MATCH DATA ONLINE');
        return;
      }

      if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        setNextMatchTime(`${days}d ${hours}h AWAY`);
      } else {
        setNextMatchTime('AWAITING LIVE FEED');
      }
    };

    updateTime();
    const interval = window.setInterval(updateTime, 30000);
    return () => window.clearInterval(interval);
  }, [matches]);

  const visiblePins = useMemo(() => matches.slice(0, 8), [matches]);
  const featuredMatch = matches[0];
  const statusText = status === 'public-api' ? 'PUBLIC API' : status === 'loading' ? 'SYNCING' : status === 'no-data' ? 'NO DATA' : 'API OFFLINE';

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-cyan-500/30 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-emerald-400 rounded-full flex items-center justify-center">⚽</div>
          <div>
            <h1 className="text-3xl font-bold tracking-tighter">WC26 NEXUS</h1>
            <p className="text-xs text-cyan-400">2026 FIFA WORLD CUP • IMMERSIVE ORBIT</p>
          </div>
        </div>

        <div className="flex gap-6 text-sm">
          {(['overview', 'groups', 'fixtures', 'bracket'] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-full transition-all uppercase tracking-widest text-sm ${
                activeTab === tab ? 'bg-white text-black font-medium' : 'hover:bg-white/10'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500 rounded-full flex items-center gap-2">
            {status === 'api-error' ? <WifiOff className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {statusText}
          </div>
        </div>
      </div>

      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 12], fov: 45 }}>
          <ambientLight intensity={0.3} />
          <pointLight position={[10, 10, 10]} />
          <Globe />
          {visiblePins.map((match, i) => (
            <MatchPin
              key={match.id}
              position={[Math.sin(i) * 4.5, Math.cos(i) * 1.5, Math.cos(i) * 4]}
              match={match}
            />
          ))}
          <Stars radius={300} depth={60} count={800} factor={4} saturation={0} fade speed={0.5} />
          <OrbitControls enablePan={false} enableZoom autoRotate autoRotateSpeed={0.2} />
          <Environment preset="night" />
        </Canvas>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="max-w-7xl mx-auto pt-24 px-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pointer-events-auto">
              <div
                onClick={() => setActiveTab('fixtures')}
                className="bg-black/70 backdrop-blur-xl border border-cyan-400/50 rounded-3xl p-8 hover:border-emerald-400 cursor-pointer transition-all group"
              >
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="uppercase tracking-[3px] text-xs text-cyan-400">NEXT / DATA FEED</div>
                    <div className="text-4xl font-bold mt-1 group-hover:text-emerald-400 transition-colors">
                      {featuredMatch ? `${featuredMatch.home} vs ${featuredMatch.away}` : 'NO MATCH DATA'}
                    </div>
                  </div>
                  <Trophy className="w-10 h-10 text-amber-400" />
                </div>
                <div className="text-6xl font-mono font-bold text-emerald-400 mb-2">{nextMatchTime}</div>
                <div className="text-sm opacity-75">
                  {featuredMatch?.venue || 'Venue unavailable'} • {featuredMatch?.group ? `Group/Stage ${featuredMatch.group}` : 'Stage unavailable'}
                </div>
              </div>

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
                <div className="text-emerald-400 text-sm mt-8">{lastUpdated ? `UPDATED ${lastUpdated}` : 'AWAITING SYNC'}</div>
              </div>
            </div>
          )}

          {activeTab === 'groups' && (
            <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-10 pointer-events-auto">
              <h2 className="text-5xl font-bold mb-4">GROUP STAGE STANDINGS</h2>
              {groups.length === 0 ? (
                <EmptyState title="No group data loaded" message="The app will show groups here once the public API returns group data." />
              ) : (
                <pre className="text-left whitespace-pre-wrap text-xs bg-white/5 rounded-2xl p-6 overflow-auto max-h-[55vh]">
                  {JSON.stringify(groups, null, 2)}
                </pre>
              )}
            </div>
          )}

          {activeTab === 'fixtures' && (
            <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-10 pointer-events-auto">
              <h2 className="text-5xl font-bold mb-8">FIXTURES / MATCH FEED</h2>
              <div className="space-y-6">
                {matches.length === 0 ? (
                  <EmptyState title="No fixtures loaded" message="No fake scores are being shown. Check the API endpoint or add a verified data source." />
                ) : (
                  matches.map((match) => (
                    <div key={match.id} className="flex items-center justify-between bg-white/5 p-6 rounded-2xl">
                      <div className="flex-1 text-right pr-8">
                        <div className="font-semibold text-xl">{match.home}</div>
                      </div>
                      <div className="text-center px-8">
                        <div className="text-4xl font-mono font-bold text-emerald-400">{match.score || match.time}</div>
                        <div className="text-xs uppercase tracking-widest text-cyan-400">{match.group}</div>
                      </div>
                      <div className="flex-1 pl-8">
                        <div className="font-semibold text-xl">{match.away}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'bracket' && (
            <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center pointer-events-auto">
              <h2 className="text-5xl font-bold mb-4">KNOCKOUT BRACKET</h2>
              <p className="text-xl opacity-75">Bracket data is not available yet. No placeholder bracket is being rendered.</p>
            </div>
          )}
        </div>
      </div>

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
