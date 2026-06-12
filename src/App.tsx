import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Environment } from '@react-three/drei';
import { Trophy, MapPin, Play, WifiOff, RefreshCw } from 'lucide-react';

type ActiveTab = 'overview' | 'groups' | 'fixtures' | 'bracket';
type DataStatus = 'loading' | 'public-api' | 'no-data' | 'api-error';

interface RawGame {
  id?: string | number;
  home_team_id?: string | number;
  away_team_id?: string | number;
  home_team_name_en?: string;
  away_team_name_en?: string;
  home_score?: string | number;
  away_score?: string | number;
  group?: string;
  matchday?: string | number;
  local_date?: string;
  stadium_id?: string | number;
  finished?: string | boolean;
  time_elapsed?: string;
  type?: string;
  [key: string]: unknown;
}

interface RawGroupTeam {
  team_id?: string | number;
  mp?: string | number;
  w?: string | number;
  l?: string | number;
  d?: string | number;
  pts?: string | number;
  gf?: string | number;
  ga?: string | number;
  gd?: string | number;
  [key: string]: unknown;
}

interface RawGroup {
  name?: string;
  teams?: RawGroupTeam[];
  [key: string]: unknown;
}

interface Match {
  id: number;
  home: string;
  away: string;
  score: string;
  time: string;
  group: string;
  matchday: string;
  venue: string;
  finished: boolean;
  sortTime: number;
}

interface GroupStanding {
  group: string;
  teamId: string;
  teamName: string;
  mp: number;
  w: number;
  d: number;
  l: number;
  pts: number;
  gf: number;
  ga: number;
  gd: number;
}

const WORLD_CUP_OPENER_UTC = Date.UTC(2026, 5, 11, 19, 0, 0);
const API_BASE = import.meta.env.VITE_WC26_API_URL || 'https://worldcup26.ir';

function asArray<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>)[key])) {
    return (data as Record<string, unknown>)[key] as T[];
  }
  return [];
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function isFinished(value: unknown): boolean {
  return String(value).toLowerCase() === 'true' || value === true;
}

function parseLocalDate(value: unknown): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const text = String(value);
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);

  if (match) {
    const [, month, day, year, hour, minute] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
  }

  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function formatMatchTime(value: unknown): string {
  if (!value) return 'TBD';
  const text = String(value);
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);

  if (!match) return text;

  const [, month, day, year, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function normalizeMatch(raw: RawGame, index: number): Match {
  const finished = isFinished(raw.finished);
  const homeScore = toNumber(raw.home_score);
  const awayScore = toNumber(raw.away_score);
  const score = finished ? `${homeScore}-${awayScore}` : 'VS';

  return {
    id: toNumber(raw.id, index + 1),
    home: String(raw.home_team_name_en || raw.home || raw.team1 || 'TBD'),
    away: String(raw.away_team_name_en || raw.away || raw.team2 || 'TBD'),
    score,
    time: finished ? 'FT' : formatMatchTime(raw.local_date || raw.time_elapsed),
    group: String(raw.group || '-'),
    matchday: String(raw.matchday || '-'),
    venue: raw.stadium_id ? `Stadium ${raw.stadium_id}` : 'Venue TBD',
    finished,
    sortTime: parseLocalDate(raw.local_date),
  };
}

function buildTeamNameMap(games: RawGame[]): Map<string, string> {
  const teamNames = new Map<string, string>();

  games.forEach((game) => {
    if (game.home_team_id && game.home_team_name_en) {
      teamNames.set(String(game.home_team_id), game.home_team_name_en);
    }
    if (game.away_team_id && game.away_team_name_en) {
      teamNames.set(String(game.away_team_id), game.away_team_name_en);
    }
  });

  return teamNames;
}

function normalizeStandings(groups: RawGroup[], teamNames: Map<string, string>): GroupStanding[] {
  return groups.flatMap((group) => {
    const groupName = String(group.name || '-');

    return (group.teams || []).map((team) => {
      const teamId = String(team.team_id || '-');

      return {
        group: groupName,
        teamId,
        teamName: teamNames.get(teamId) || `Team ${teamId}`,
        mp: toNumber(team.mp),
        w: toNumber(team.w),
        d: toNumber(team.d),
        l: toNumber(team.l),
        pts: toNumber(team.pts),
        gf: toNumber(team.gf),
        ga: toNumber(team.ga),
        gd: toNumber(team.gd),
      };
    });
  });
}

function Globe() {
  return (
    <mesh>
      <sphereGeometry args={[3, 64, 64]} />
      <meshStandardMaterial color="#0a2540" emissive="#1e3a8a" metalness={0.8} roughness={0.2} />
    </mesh>
  );
}

function MatchPin({ position }: { position: [number, number, number] }) {
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

function StatusBadge({ status, lastUpdated }: { status: DataStatus; lastUpdated: string }) {
  const label =
    status === 'loading'
      ? 'SYNCING'
      : status === 'public-api'
        ? 'PUBLIC API'
        : status === 'api-error'
          ? 'API ERROR'
          : 'NO DATA';

  const icon = status === 'api-error' ? <WifiOff className="w-4 h-4" /> : <Play className="w-4 h-4" />;

  return (
    <div className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500 rounded-full flex items-center gap-2">
      {icon}
      <span>{label}</span>
      {lastUpdated && <span className="opacity-60">• {lastUpdated}</span>}
    </div>
  );
}

function WC26Nexus() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [nextMatchTime, setNextMatchTime] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [standings, setStandings] = useState<GroupStanding[]>([]);
  const [status, setStatus] = useState<DataStatus>('loading');
  const [lastUpdated, setLastUpdated] = useState('');

  const nextMatch = useMemo(() => {
    const now = Date.now();
    const upcoming = matches
      .filter((match) => !match.finished && match.sortTime >= now)
      .sort((a, b) => a.sortTime - b.sortTime);

    return upcoming[0] || matches.find((match) => !match.finished) || matches[0];
  }, [matches]);

  const fixtureList = useMemo(() => {
    return [...matches].sort((a, b) => a.sortTime - b.sortTime).slice(0, 24);
  }, [matches]);

  const standingsByGroup = useMemo(() => {
    const grouped = new Map<string, GroupStanding[]>();

    standings.forEach((standing) => {
      if (!grouped.has(standing.group)) grouped.set(standing.group, []);
      grouped.get(standing.group)?.push(standing);
    });

    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, rows]) => [
        group,
        rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.teamName.localeCompare(b.teamName)),
      ] as const);
  }, [standings]);

  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        setStatus('loading');

        const [gamesResponse, groupsResponse] = await Promise.all([
          fetch(`${API_BASE}/get/games`, { cache: 'no-store' }),
          fetch(`${API_BASE}/get/groups`, { cache: 'no-store' }),
        ]);

        if (!gamesResponse.ok || !groupsResponse.ok) {
          throw new Error(`API request failed: games ${gamesResponse.status}, groups ${groupsResponse.status}`);
        }

        const gamesJson = await gamesResponse.json();
        const groupsJson = await groupsResponse.json();

        const rawGames = asArray<RawGame>(gamesJson, 'games');
        const rawGroups = asArray<RawGroup>(groupsJson, 'groups');
        const teamNames = buildTeamNameMap(rawGames);
        const normalizedMatches = rawGames.map(normalizeMatch);
        const normalizedStandings = normalizeStandings(rawGroups, teamNames);

        setMatches(normalizedMatches);
        setStandings(normalizedStandings);
        setLastUpdated(new Date().toLocaleTimeString());
        setStatus(normalizedMatches.length > 0 || normalizedStandings.length > 0 ? 'public-api' : 'no-data');
      } catch (error) {
        console.error('WC26 API fetch failed:', error);
        setMatches([]);
        setStandings([]);
        setStatus('api-error');
      }
    };

    fetchLiveData();
    const interval = window.setInterval(fetchLiveData, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      if (nextMatch && !nextMatch.finished && nextMatch.sortTime !== Number.MAX_SAFE_INTEGER) {
        const diff = nextMatch.sortTime - Date.now();

        if (diff > 0) {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          setNextMatchTime(`${days}d ${hours}h AWAY`);
          return;
        }
      }

      const diff = WORLD_CUP_OPENER_UTC - Date.now();

      if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        setNextMatchTime(`${days}d ${hours}h AWAY`);
      } else if (matches.some((match) => !match.finished)) {
        setNextMatchTime('TOURNAMENT ACTIVE');
      } else if (matches.length > 0) {
        setNextMatchTime('RESULTS AVAILABLE');
      } else {
        setNextMatchTime(status === 'loading' ? 'SYNCING' : 'NO DATA');
      }
    };

    updateTime();
    const interval = window.setInterval(updateTime, 30000);
    return () => window.clearInterval(interval);
  }, [matches, nextMatch, status]);

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-cyan-500/30 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-emerald-400 rounded-full flex items-center justify-center">
            ⚽
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tighter">WC26 NEXUS</h1>
            <p className="text-xs text-cyan-400">2026 WORLD CUP • IMMERSIVE ORBIT</p>
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
          <StatusBadge status={status} lastUpdated={lastUpdated} />
        </div>
      </div>

      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 12], fov: 45 }}>
          <ambientLight intensity={0.3} />
          <pointLight position={[10, 10, 10]} />
          <Globe />
          {fixtureList.slice(0, 12).map((match, index) => (
            <MatchPin
              key={match.id}
              position={[Math.sin(index) * 4.5, Math.cos(index) * 1.5, Math.cos(index) * 4]}
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
                    <div className="uppercase tracking-[3px] text-xs text-cyan-400">NEXT / FEED</div>
                    <div className="text-4xl font-bold mt-1 group-hover:text-emerald-400 transition-colors">
                      {nextMatch ? `${nextMatch.home} vs ${nextMatch.away}` : 'NO MATCH DATA'}
                    </div>
                  </div>
                  <Trophy className="w-10 h-10 text-amber-400" />
                </div>
                <div className="text-6xl font-mono font-bold text-emerald-400 mb-2">{nextMatchTime}</div>
                <div className="text-sm opacity-75">
                  {nextMatch ? `${nextMatch.venue} • Group ${nextMatch.group} • Matchday ${nextMatch.matchday}` : 'Waiting for public API data'}
                </div>
              </div>

              <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
                <div className="text-6xl font-bold mb-1">48</div>
                <div className="text-xl opacity-75">TEAMS</div>
                <div className="h-1.5 bg-gradient-to-r from-cyan-400 to-emerald-400 rounded mt-6" />
              </div>

              <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-8 flex flex-col justify-between">
                <div>
                  <div className="text-6xl font-bold mb-1">{matches.length || 104}</div>
                  <div className="text-xl opacity-75">MATCHES LOADED</div>
                </div>
                <div className="text-emerald-400 text-sm mt-8">PUBLIC API FEED • NO FAKE FALLBACK SCORES</div>
              </div>
            </div>
          )}

          {activeTab === 'groups' && (
            <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-8 pointer-events-auto max-h-[72vh] overflow-auto">
              <h2 className="text-5xl font-bold mb-6">GROUP STAGE STANDINGS</h2>

              {standingsByGroup.length === 0 ? (
                <EmptyState title="No standings loaded" message="The public API did not return group table data." />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {standingsByGroup.map(([group, rows]) => (
                    <div key={group} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                      <h3 className="text-2xl font-bold text-cyan-400 mb-4">Group {group}</h3>
                      <div className="grid grid-cols-[1fr_repeat(7,2.5rem)] gap-2 text-sm">
                        <div className="opacity-70">Team</div>
                        {['MP', 'W', 'D', 'L', 'PTS', 'GF', 'GD'].map((header) => (
                          <div key={header} className="text-right opacity-70">
                            {header}
                          </div>
                        ))}

                        {rows.map((row) => (
                          <div key={`${group}-${row.teamId}`} className="contents">
                            <div className="font-medium truncate">{row.teamName}</div>
                            <div className="text-right">{row.mp}</div>
                            <div className="text-right">{row.w}</div>
                            <div className="text-right">{row.d}</div>
                            <div className="text-right">{row.l}</div>
                            <div className="text-right font-bold text-emerald-400">{row.pts}</div>
                            <div className="text-right">{row.gf}</div>
                            <div className="text-right">{row.gd}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'fixtures' && (
            <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-8 pointer-events-auto max-h-[72vh] overflow-auto">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-5xl font-bold">FIXTURES / RESULTS</h2>
                <div className="flex items-center gap-2 text-sm opacity-75">
                  <RefreshCw className="w-4 h-4" />
                  refreshes every 60s
                </div>
              </div>

              {fixtureList.length === 0 ? (
                <EmptyState title="No fixtures loaded" message="No fake scores are being shown. Check API availability or CORS." />
              ) : (
                <div className="space-y-4">
                  {fixtureList.map((match) => (
                    <div key={match.id} className="flex items-center justify-between bg-white/5 p-5 rounded-2xl">
                      <div className="flex-1 text-right pr-6">
                        <div className="font-semibold text-xl">{match.home}</div>
                      </div>
                      <div className="text-center px-6 min-w-36">
                        <div className="text-4xl font-mono font-bold text-emerald-400">{match.score}</div>
                        <div className="text-xs uppercase tracking-widest text-cyan-400">Group {match.group}</div>
                        <div className="text-xs opacity-60 mt-1">{match.time}</div>
                      </div>
                      <div className="flex-1 pl-6">
                        <div className="font-semibold text-xl">{match.away}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'bracket' && (
            <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center pointer-events-auto">
              <h2 className="text-5xl font-bold mb-4">KNOCKOUT BRACKET</h2>
              <p className="text-xl opacity-75">
                The current public feed includes group fixtures/results and standings. Knockout bracket data will appear here when the API exposes knockout matches.
              </p>
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
