import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, Stars, Environment } from '@react-three/drei';
import { Trophy, MapPin, Play, WifiOff, RefreshCw } from 'lucide-react';
import * as THREE from 'three';

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
  stadiumId: string;
  finished: boolean;
  totalGoals: number;
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
    stadiumId: raw.stadium_id ? String(raw.stadium_id) : 'unknown',
    finished,
    totalGoals: homeScore + awayScore,
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
    <group scale={1.72}>
      <mesh>
        <sphereGeometry args={[3.35, 128, 128]} />
        <meshStandardMaterial color="#071a35" emissive="#1e3a8a" metalness={0.9} roughness={0.16} />
      </mesh>
      <mesh scale={1.045}>
        <sphereGeometry args={[3.35, 128, 128]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.2} blending={THREE.AdditiveBlending} side={THREE.BackSide} />
      </mesh>
      <mesh scale={1.14}>
        <sphereGeometry args={[3.35, 128, 128]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.085} blending={THREE.AdditiveBlending} side={THREE.BackSide} />
      </mesh>
      <mesh scale={1.25}>
        <sphereGeometry args={[3.35, 96, 96]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.04} blending={THREE.AdditiveBlending} side={THREE.BackSide} />
      </mesh>
      <group rotation={[Math.PI / 2.25, 0.25, 0.18]}>
        <mesh>
          <torusGeometry args={[3.9, 0.015, 8, 160]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.32} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh rotation={[0.6, 0.05, 0.4]}>
          <torusGeometry args={[4.45, 0.012, 8, 160]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.18} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </group>
  );
}

function getVenuePosition(match: Match, index: number): [number, number, number] {
  const seed = toNumber(match.stadiumId, index + 1);
  const angle = seed * 1.618;
  const height = ((seed % 7) - 3) * 0.42;
  return [Math.sin(angle) * 6.75, height * 1.15, Math.cos(angle) * 6.75];
}

function isMatchLive(match: Match): boolean {
  const now = Date.now();
  return !match.finished && match.sortTime !== Number.MAX_SAFE_INTEGER && match.sortTime <= now;
}

function MatchPin({ position, match }: { position: [number, number, number]; match: Match }) {
  const groupRef = useRef<THREE.Group>(null);
  const live = isMatchLive(match);
  const goalGlow = Math.min(match.totalGoals, 6) * 0.12;

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const pulse = live ? 1 + Math.sin(clock.elapsedTime * 5) * 0.44 : 1 + Math.sin(clock.elapsedTime * 1.5) * 0.12;
    groupRef.current.scale.setScalar(pulse + goalGlow);
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <sphereGeometry args={[0.22]} />
        <meshStandardMaterial color={live ? '#22c55e' : match.finished ? '#38bdf8' : '#06b6d4'} emissive={live ? '#22c55e' : '#06b6d4'} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.56 + goalGlow]} />
        <meshBasicMaterial color={live ? '#22c55e' : '#0891b2'} transparent opacity={live ? 0.38 : 0.18} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight color={live ? '#22c55e' : '#06b6d4'} intensity={live ? 9 : 3.2 + match.totalGoals * 0.45} distance={live ? 7 : 4.5} />
    </group>
  );
}

function EnergyArc({ start, end, intensity }: { start: [number, number, number]; end: [number, number, number]; intensity: number }) {
  const pulseRef = useRef<THREE.Mesh>(null);
  const curve = useMemo(() => {
    const startPoint = new THREE.Vector3(...start);
    const endPoint = new THREE.Vector3(...end);
    const midPoint = startPoint.clone().add(endPoint).multiplyScalar(0.5).normalize().multiplyScalar(7.4 + intensity * 0.28);
    return new THREE.CatmullRomCurve3([startPoint, midPoint, endPoint]);
  }, [start, end, intensity]);

  useFrame(({ clock }) => {
    if (!pulseRef.current) return;
    const t = (clock.elapsedTime * (0.12 + intensity * 0.015)) % 1;
    pulseRef.current.position.copy(curve.getPointAt(t));
  });

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 96, 0.045 + intensity * 0.006, 10, false]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.52 + intensity * 0.035} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh>
        <tubeGeometry args={[curve, 96, 0.012 + intensity * 0.002, 8, false]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.38} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.18 + intensity * 0.014]} />
        <meshBasicMaterial color="#a7f3d0" transparent opacity={1} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function HologramCard({ match, position }: { match: Match; position: [number, number, number] }) {
  const live = isMatchLive(match);

  return (
    <Html position={position} center distanceFactor={5.1} transform occlude={false}>
      <div className="min-w-72 rounded-3xl border border-cyan-200/80 bg-black/80 px-7 py-5 text-center text-white shadow-[0_0_75px_rgba(34,211,238,0.62)] backdrop-blur-xl transition-all duration-500">
        <div className="mb-2 text-xs uppercase tracking-[0.36em] text-cyan-200">{live ? 'Live signal' : match.finished ? 'Final' : 'Orbital feed'}</div>
        <div className="text-lg font-semibold leading-tight">{match.home}</div>
        <div className="font-mono text-5xl font-bold text-emerald-300 transition-all duration-500 drop-shadow-[0_0_18px_rgba(110,231,183,0.9)]">{match.score}</div>
        <div className="text-lg font-semibold leading-tight">{match.away}</div>
        <div className="mt-3 text-xs uppercase tracking-widest text-white/60">Group {match.group} • {match.time}</div>
      </div>
    </Html>
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

  const globeMatches = useMemo(() => fixtureList.slice(0, 16), [fixtureList]);

  const liveOrFeaturedMatches = useMemo(() => {
    const live = fixtureList.filter(isMatchLive);
    return (live.length > 0 ? live : fixtureList.filter((match) => !match.finished)).slice(0, 4);
  }, [fixtureList]);

  const venuePositions = useMemo(() => {
    return globeMatches.map((match, index) => ({ match, position: getVenuePosition(match, index) }));
  }, [globeMatches]);

  const activityScore = useMemo(() => {
    const liveCount = fixtureList.filter(isMatchLive).length;
    const goals = fixtureList.reduce((sum, match) => sum + match.totalGoals, 0);
    return Math.min(10, liveCount * 3 + goals * 0.15);
  }, [fixtureList]);

  const starCount = Math.round(1300 + activityScore * 120);
  const starSpeed = 0.5 + activityScore * 0.1;

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

  const featuredGroups = standingsByGroup.slice(0, 3);
  const leftFeed = fixtureList.slice(0, 6);
  const rightStandings = featuredGroups;
  const totalGoals = fixtureList.reduce((sum, match) => sum + match.totalGoals, 0);
  const completedMatches = fixtureList.filter((match) => match.finished).length;

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <style>{`
        .nexus-glass {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(125, 211, 252, 0.24);
          background:
            radial-gradient(circle at 15% 0%, rgba(125, 211, 252, 0.24), transparent 30%),
            radial-gradient(circle at 85% 10%, rgba(16, 185, 129, 0.18), transparent 32%),
            linear-gradient(135deg, rgba(255,255,255,0.13), rgba(255,255,255,0.035) 42%, rgba(0,0,0,0.58));
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.18),
            inset 0 -1px 0 rgba(255,255,255,0.04),
            0 22px 70px rgba(0,0,0,0.45),
            0 0 50px rgba(34,211,238,0.12);
          backdrop-filter: blur(22px) saturate(150%);
          -webkit-backdrop-filter: blur(22px) saturate(150%);
        }
        .nexus-glass::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(115deg, rgba(255,255,255,0.24), transparent 22%, transparent 72%, rgba(255,255,255,0.08)),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 22px);
          mix-blend-mode: screen;
          opacity: 0.45;
        }
        .nexus-glass > * { position: relative; z-index: 1; }
        .nexus-pill {
          border: 1px solid rgba(125,211,252,0.22);
          background: rgba(0,0,0,0.42);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 0 24px rgba(34,211,238,0.1);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .nexus-scanline {
          background: linear-gradient(90deg, transparent, rgba(34,211,238,0.92), rgba(16,185,129,0.78), transparent);
          animation: nexus-scan 4.8s ease-in-out infinite;
        }
        @keyframes nexus-scan {
          0%, 100% { transform: translateX(-55%); opacity: 0.25; }
          50% { transform: translateX(55%); opacity: 0.75; }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(8,47,73,0.28),transparent_42%),radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.13),transparent_30%),radial-gradient(circle_at_80%_75%,rgba(16,185,129,0.12),transparent_32%)]" />

      <div className="absolute inset-0 z-10">
        <Canvas camera={{ position: [0, 0, 12.2], fov: 34 }}>
          <ambientLight intensity={0.58 + activityScore * 0.045} />
          <pointLight position={[10, 10, 10]} intensity={2.6 + activityScore * 0.18} />
          <Globe />
          {venuePositions.map(({ match, position }) => (
            <MatchPin key={match.id} position={position} match={match} />
          ))}
          {venuePositions.slice(0, 9).map(({ position }, index, list) => {
            const next = list[(index + 1) % list.length];
            if (!next || list.length < 2) return null;
            return <EnergyArc key={`arc-${index}`} start={position} end={next.position} intensity={activityScore} />;
          })}
          {liveOrFeaturedMatches.slice(0, 4).map((match, index) => (
            <HologramCard
              key={`holo-${match.id}`}
              match={match}
              position={[index % 2 === 0 ? -8.3 : 8.3, 2.75 - Math.floor(index / 2) * 3.35, -0.75]}
            />
          ))}
          <Stars key={starCount} radius={300} depth={70} count={starCount + 900} factor={9 + activityScore * 0.42} saturation={0} fade speed={starSpeed} />
          <OrbitControls enablePan={false} enableZoom autoRotate autoRotateSpeed={0.38 + activityScore * 0.035} />
          <Environment preset="night" />
        </Canvas>
      </div>

      <header className="fixed left-4 right-4 top-4 z-40 flex flex-wrap items-center justify-between gap-3 rounded-3xl nexus-glass px-5 py-3 md:left-6 md:right-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-emerald-300 text-xl shadow-[0_0_30px_rgba(34,211,238,0.38)]">
            ⚽
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-[-0.06em] md:text-3xl">WC26 NEXUS</h1>
            <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-200/80">World Cup command center</p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-2 text-xs">
          {(['overview', 'groups', 'fixtures', 'bracket'] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 uppercase tracking-[0.22em] transition-all ${
                activeTab === tab ? 'bg-white text-black shadow-[0_0_22px_rgba(255,255,255,0.28)]' : 'nexus-pill text-white/75 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        <StatusBadge status={status} lastUpdated={lastUpdated} />
      </header>

      {activeTab === 'overview' && (
        <main className="pointer-events-none fixed inset-0 z-30 grid grid-cols-1 gap-4 px-4 pb-24 pt-28 md:px-6 lg:grid-cols-[330px_minmax(520px,1fr)_330px] lg:gap-6">
          <section className="pointer-events-auto flex flex-col gap-4 lg:pt-12">
            <div onClick={() => setActiveTab('fixtures')} className="nexus-glass cursor-pointer rounded-3xl p-5 transition hover:border-emerald-300/70">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.34em] text-cyan-200">Next signal</div>
                  <div className="mt-2 text-2xl font-black leading-tight text-white">
                    {nextMatch ? `${nextMatch.home} vs ${nextMatch.away}` : 'No match data'}
                  </div>
                </div>
                <Trophy className="h-8 w-8 shrink-0 text-amber-300" />
              </div>
              <div className="font-mono text-5xl font-black text-emerald-300 drop-shadow-[0_0_18px_rgba(110,231,183,0.6)]">{nextMatchTime}</div>
              <div className="mt-3 text-sm text-white/62">
                {nextMatch ? `${nextMatch.venue} • Group ${nextMatch.group} • Matchday ${nextMatch.matchday}` : 'Waiting for public API data'}
              </div>
            </div>

            <div className="nexus-glass rounded-3xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.34em] text-cyan-200">Live / upcoming feed</div>
                <RefreshCw className="h-4 w-4 text-white/45" />
              </div>
              <div className="space-y-3">
                {leftFeed.map((match) => (
                  <button
                    key={`feed-${match.id}`}
                    onClick={() => setActiveTab('fixtures')}
                    className="w-full rounded-2xl border border-white/8 bg-white/[0.045] px-4 py-3 text-left transition hover:border-cyan-200/45 hover:bg-white/[0.08]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">{match.home} vs {match.away}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/45">Group {match.group} • {match.time}</div>
                      </div>
                      <div className="font-mono text-xl font-black text-emerald-300">{match.score}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="pointer-events-none relative hidden items-end justify-center lg:flex">
            <div className="absolute bottom-24 h-px w-[76%] overflow-hidden rounded-full bg-cyan-300/10">
              <div className="nexus-scanline h-full w-full" />
            </div>
            <div className="mb-5 rounded-full nexus-pill px-6 py-3 text-center text-[10px] uppercase tracking-[0.36em] text-cyan-100/72">
              Orbital visualization layer • pins • arcs • holograms
            </div>
          </section>

          <section className="pointer-events-auto flex flex-col gap-4 lg:pt-12">
            <div className="grid grid-cols-3 gap-3">
              <div className="nexus-glass rounded-3xl p-4 text-center">
                <div className="text-3xl font-black">48</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/50">Teams</div>
              </div>
              <div className="nexus-glass rounded-3xl p-4 text-center">
                <div className="text-3xl font-black">{completedMatches}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/50">Finals</div>
              </div>
              <div className="nexus-glass rounded-3xl p-4 text-center">
                <div className="text-3xl font-black">{totalGoals}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/50">Goals</div>
              </div>
            </div>

            <div className="nexus-glass rounded-3xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.34em] text-cyan-200">Tournament signal</div>
                  <div className="mt-1 text-sm text-white/52">Drives starfield and arc intensity</div>
                </div>
                <div className="font-mono text-3xl font-black text-emerald-300">{activityScore.toFixed(1)}</div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-200 to-emerald-300" style={{ width: `${Math.min(100, activityScore * 10)}%` }} />
              </div>
            </div>

            <div className="nexus-glass rounded-3xl p-5">
              <div className="mb-4 text-[10px] uppercase tracking-[0.34em] text-cyan-200">Group leaders</div>
              <div className="space-y-3">
                {rightStandings.map(([group, rows]) => {
                  const leader = rows[0];
                  return (
                    <button
                      key={`leader-${group}`}
                      onClick={() => setActiveTab('groups')}
                      className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-white/[0.045] px-4 py-3 text-left transition hover:border-cyan-200/45"
                    >
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.24em] text-white/45">Group {group}</div>
                        <div className="text-sm font-bold">{leader?.teamName || 'Pending'}</div>
                      </div>
                      <div className="font-mono text-xl font-black text-emerald-300">{leader?.pts ?? 0}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </main>
      )}

      {activeTab !== 'overview' && (
        <main className="fixed inset-x-4 bottom-24 top-28 z-30 pointer-events-auto md:inset-x-6">
          {activeTab === 'groups' && (
            <div className="nexus-glass h-full overflow-auto rounded-3xl p-6 md:p-8">
              <h2 className="mb-6 text-3xl font-black md:text-5xl">GROUP STAGE STANDINGS</h2>
              {standingsByGroup.length === 0 ? (
                <EmptyState title="No standings loaded" message="The public API did not return group table data." />
              ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
                  {standingsByGroup.map(([group, rows]) => (
                    <div key={group} className="rounded-3xl border border-white/10 bg-black/32 p-5">
                      <h3 className="mb-4 text-2xl font-black text-cyan-200">Group {group}</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full table-auto border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-white/10 text-white/56">
                              <th className="py-2 pr-3 text-left font-medium">Team</th>
                              {['MP', 'W', 'D', 'L', 'PTS', 'GF', 'GD'].map((header) => (
                                <th key={header} className="px-2 py-2 text-right font-medium">{header}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr key={`${group}-${row.teamId}`} className="border-b border-white/5 last:border-b-0">
                                <td className="whitespace-nowrap py-2 pr-3 text-left font-medium">{row.teamName}</td>
                                <td className="px-2 py-2 text-right">{row.mp}</td>
                                <td className="px-2 py-2 text-right">{row.w}</td>
                                <td className="px-2 py-2 text-right">{row.d}</td>
                                <td className="px-2 py-2 text-right">{row.l}</td>
                                <td className="px-2 py-2 text-right font-black text-emerald-300">{row.pts}</td>
                                <td className="px-2 py-2 text-right">{row.gf}</td>
                                <td className="px-2 py-2 text-right">{row.gd}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'fixtures' && (
            <div className="nexus-glass h-full overflow-auto rounded-3xl p-6 md:p-8">
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-3xl font-black md:text-5xl">FIXTURES / RESULTS</h2>
                <div className="nexus-pill flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white/70">
                  <RefreshCw className="h-4 w-4" /> refreshes every 60s
                </div>
              </div>
              {fixtureList.length === 0 ? (
                <EmptyState title="No fixtures loaded" message="No fake scores are being shown. Check API availability or CORS." />
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {fixtureList.map((match) => (
                    <div key={match.id} className="rounded-3xl border border-white/10 bg-black/32 p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1 text-right">
                          <div className="truncate text-xl font-bold">{match.home}</div>
                        </div>
                        <div className="min-w-32 text-center">
                          <div className="font-mono text-4xl font-black text-emerald-300">{match.score}</div>
                          <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200">Group {match.group}</div>
                          <div className="mt-1 text-xs text-white/52">{match.time}</div>
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <div className="truncate text-xl font-bold">{match.away}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'bracket' && (
            <div className="nexus-glass flex h-full items-center justify-center rounded-3xl p-8 text-center">
              <div className="max-w-2xl">
                <h2 className="mb-4 text-5xl font-black">KNOCKOUT BRACKET</h2>
                <p className="text-xl text-white/72">
                  The current public feed includes group fixtures/results and standings. Knockout bracket data will appear here when the API exposes knockout matches.
                </p>
              </div>
            </div>
          )}
        </main>
      )}

      <footer className="fixed bottom-4 left-4 right-4 z-40 flex flex-wrap items-center justify-center gap-3 rounded-3xl nexus-glass px-5 py-3 text-xs md:gap-8 md:text-sm">
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> 16 Venues • 3 Countries</div>
        <div>48 TEAMS • 12 GROUPS</div>
        <div>🇲🇽 🇺🇸 🇨🇦 HOSTS</div>
        <div className="hidden text-emerald-300 md:block">Glass command layout • 0.8.3 prep</div>
      </footer>
    </div>
  );
}

export default WC26Nexus;
