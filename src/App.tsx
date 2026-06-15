import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, Stars, Environment } from '@react-three/drei';
import { Activity, Newspaper, Play, RefreshCw, Shield, Trophy, WifiOff } from 'lucide-react';
import * as THREE from 'three';

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
  homeCode: string;
  awayCode: string;
  score: string;
  time: string;
  group: string;
  matchday: string;
  venue: string;
  finished: boolean;
  sortTime: number;
  goals: number;
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

interface NewsItem {
  title: string;
  source?: string;
  url?: string;
  published?: string;
}

interface MatchIqTeam {
  id: number;
  name: string;
  code: string;
  flag?: string;
  group?: string;
  rating?: number;
}

interface MatchIqMatch {
  id: number;
  stage: string;
  group?: string | null;
  kickoff_utc: string;
  kickoff_ist?: string;
  venue: string;
  city: string;
  status: string;
  minute?: number | null;
  home?: MatchIqTeam | null;
  away?: MatchIqTeam | null;
  home_score?: number | null;
  away_score?: number | null;
}

interface MatchIqDetails {
  match_id: number;
  available: boolean;
  source: string;
  stats?: Array<{ label: string; home: string; away: string }>;
  referee?: string | null;
  note?: string | null;
  home_lineup?: { coach?: string | null } | null;
  away_lineup?: { coach?: string | null } | null;
}

const WORLD_CUP_OPENER_UTC = Date.UTC(2026, 5, 11, 19, 0, 0);
const API_BASE = import.meta.env.VITE_WC26_API_URL || 'https://worldcup26.ir';
const MATCHIQ_BASE = import.meta.env.VITE_MATCHIQ_API_URL || 'https://matchiq-api-1sye.onrender.com';

const glass: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(16, 24, 40, 0.72), rgba(5, 24, 28, 0.62))',
  border: '1px solid rgba(103, 232, 249, 0.28)',
  boxShadow: '0 0 42px rgba(34, 211, 238, 0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
  backdropFilter: 'blur(18px)',
};

function useIsCompactLayout() {
  const [isCompact, setIsCompact] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 980;
  });

  useEffect(() => {
    const update = () => setIsCompact(window.innerWidth < 980);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return isCompact;
}

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

function shortCode(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

function normalizeMatch(raw: RawGame, index: number): Match {
  const finished = isFinished(raw.finished);
  const homeScore = toNumber(raw.home_score);
  const awayScore = toNumber(raw.away_score);
  const home = String(raw.home_team_name_en || raw.home || raw.team1 || 'TBD');
  const away = String(raw.away_team_name_en || raw.away || raw.team2 || 'TBD');

  return {
    id: toNumber(raw.id, index + 1),
    home,
    away,
    homeCode: shortCode(home),
    awayCode: shortCode(away),
    score: finished ? `${homeScore}-${awayScore}` : 'VS',
    time: finished ? 'FT' : formatMatchTime(raw.local_date || raw.time_elapsed),
    group: String(raw.group || '-'),
    matchday: String(raw.matchday || '-'),
    venue: raw.stadium_id ? `Stadium ${raw.stadium_id}` : 'Venue TBD',
    finished,
    sortTime: parseLocalDate(raw.local_date),
    goals: homeScore + awayScore,
  };
}

function normalizeMatchIqMatch(raw: MatchIqMatch, index: number): Match {
  const home = raw.home?.name || 'TBD';
  const away = raw.away?.name || 'TBD';
  const homeScore = toNumber(raw.home_score);
  const awayScore = toNumber(raw.away_score);
  const status = String(raw.status || '').toUpperCase();
  const finished = status === 'FT' || status === 'FINISHED';
  const live = status === 'LIVE' || status === 'IN_PLAY';
  const kickoff = new Date(raw.kickoff_utc).getTime();

  return {
    id: toNumber(raw.id, index + 1),
    home,
    away,
    homeCode: raw.home?.code || shortCode(home),
    awayCode: raw.away?.code || shortCode(away),
    score: finished || live ? `${homeScore}-${awayScore}` : 'VS',
    time: live && raw.minute ? `${raw.minute}'` : finished ? 'FT' : (raw.kickoff_ist || new Date(raw.kickoff_utc).toLocaleString()),
    group: String(raw.group || raw.home?.group || '-'),
    matchday: raw.stage || 'Match',
    venue: raw.venue ? `${raw.venue}, ${raw.city}` : raw.city || 'Venue TBD',
    finished,
    sortTime: Number.isFinite(kickoff) ? kickoff : Number.MAX_SAFE_INTEGER,
    goals: homeScore + awayScore,
  };
}

function normalizeMatchIqStandings(data: unknown): GroupStanding[] {
  if (!Array.isArray(data)) return [];

  return data.flatMap((group: any) => {
    const groupName = String(group.group || '-');
    const rows = Array.isArray(group.rows) ? group.rows : [];

    return rows.map((row: any) => ({
      group: groupName,
      teamId: String(row.team?.id || row.team?.code || row.team?.name || '-'),
      teamName: String(row.team?.name || 'Team'),
      mp: toNumber(row.played),
      w: toNumber(row.won),
      d: toNumber(row.drawn),
      l: toNumber(row.lost),
      pts: toNumber(row.points),
      gf: toNumber(row.goals_for),
      ga: toNumber(row.goals_against),
      gd: toNumber(row.goal_diff),
    }));
  });
}

function buildTeamNameMap(games: RawGame[]): Map<string, string> {
  const teamNames = new Map<string, string>();

  games.forEach((game) => {
    if (game.home_team_id && game.home_team_name_en) teamNames.set(String(game.home_team_id), game.home_team_name_en);
    if (game.away_team_id && game.away_team_name_en) teamNames.set(String(game.away_team_id), game.away_team_name_en);
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
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.08;
  });

  return (
    <group>
      <mesh ref={ref}>
        <sphereGeometry args={[3.55, 96, 96]} />
        <meshStandardMaterial color="#062c88" emissive="#061f55" metalness={0.72} roughness={0.18} />
      </mesh>
      <mesh scale={1.08}>
        <sphereGeometry args={[3.55, 96, 96]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.075} side={THREE.BackSide} />
      </mesh>
      <mesh scale={1.22}>
        <sphereGeometry args={[3.55, 96, 96]} />
        <meshBasicMaterial color="#14b8a6" transparent opacity={0.035} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

function MatchPin({ position, live, intensity }: { position: [number, number, number]; live: boolean; intensity: number }) {
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const pulse = 1 + Math.sin(clock.elapsedTime * (live ? 4.8 : 2.4)) * (live ? 0.32 : 0.12);
    if (group.current) group.current.scale.setScalar(pulse);
    if (glow.current) glow.current.scale.setScalar(1.6 + pulse * 0.55 + intensity * 0.09);
  });

  return (
    <group ref={group} position={position}>
      <mesh>
        <sphereGeometry args={[0.14 + intensity * 0.012, 24, 24]} />
        <meshStandardMaterial color={live ? '#34d399' : '#67e8f9'} emissive={live ? '#22c55e' : '#22d3ee'} emissiveIntensity={1.8} />
      </mesh>
      <mesh ref={glow}>
        <sphereGeometry args={[0.28, 24, 24]} />
        <meshBasicMaterial color={live ? '#34d399' : '#22d3ee'} transparent opacity={0.18} />
      </mesh>
      <pointLight color={live ? '#34d399' : '#22d3ee'} intensity={live ? 3 : 1.4} distance={3.4} />
    </group>
  );
}

function EnergyArc({ index, active }: { index: number; active: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const pulse = useRef<THREE.Mesh>(null);

  const curve = useMemo(() => {
    const a = (index / 8) * Math.PI * 2;
    const b = a + 1.15 + (index % 3) * 0.24;
    const start = new THREE.Vector3(Math.cos(a) * 4.0, Math.sin(index) * 1.4, Math.sin(a) * 2.5);
    const middle = new THREE.Vector3(Math.cos((a + b) / 2) * 5.3, 1.5 + (index % 2) * 0.45, Math.sin((a + b) / 2) * 4.1);
    const end = new THREE.Vector3(Math.cos(b) * 4.0, Math.cos(index) * 1.4, Math.sin(b) * 2.5);
    return new THREE.QuadraticBezierCurve3(start, middle, end);
  }, [index]);

  const points = useMemo(() => curve.getPoints(80), [curve]);

  useFrame(({ clock }) => {
    if (groupRef.current) groupRef.current.rotation.y += 0.0009 * (index % 2 === 0 ? 1 : -1);
    if (pulse.current) {
      const t = (clock.elapsedTime * (active ? 0.34 : 0.18) + index * 0.13) % 1;
      pulse.current.position.copy(curve.getPointAt(t));
    }
  });

  return (
    <group ref={groupRef}>
      <line>
        <bufferGeometry attach="geometry" setFromPoints={points} />
        <lineBasicMaterial attach="material" color={active ? '#67e8f9' : '#38bdf8'} transparent opacity={active ? 0.72 : 0.34} />
      </line>
      <mesh ref={pulse}>
        <sphereGeometry args={[active ? 0.075 : 0.045, 16, 16]} />
        <meshBasicMaterial color="#e0ffff" transparent opacity={active ? 0.95 : 0.55} />
      </mesh>
    </group>
  );
}

function HologramCard({ match, index }: { match: Match; index: number }) {
  const cardPositions: [number, number, number][] = [
    [-3.55, 2.45, 0.35],
    [3.55, 2.15, 0.35],
    [-3.85, -2.2, 0.35],
    [3.85, -1.85, 0.35],
    [0, 3.25, 0.35],
  ];
  const position = cardPositions[index % cardPositions.length];

  return (
    <Html position={position} center distanceFactor={8}>
      <div
        style={{
          minWidth: 160,
          padding: '10px 12px',
          borderRadius: 14,
          background: 'rgba(3, 12, 22, 0.72)',
          border: '1px solid rgba(103,232,249,0.48)',
          boxShadow: '0 0 28px rgba(34,211,238,0.22)',
          color: 'white',
          fontFamily: 'Inter, system-ui, sans-serif',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontSize: 12, color: '#67e8f9', letterSpacing: 1.3 }}>GROUP {match.group}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 800, fontSize: 14 }}>
          <span>{match.homeCode}</span>
          <span style={{ color: '#34d399', fontSize: 18 }}>{match.score}</span>
          <span>{match.awayCode}</span>
        </div>
        <div style={{ fontSize: 11, opacity: 0.72 }}>{match.time}</div>
      </div>
    </Html>
  );
}

function GlobeScene({ matches, activity, compact = false }: { matches: Match[]; activity: number; compact?: boolean }) {
  const visible = matches.slice(0, compact ? 6 : 10);
  const active = visible.some((match) => !match.finished);

  return (
    <Canvas camera={{ position: [0, 0, 12], fov: 42 }}>
      <ambientLight intensity={0.58} />
      <pointLight position={[8, 9, 10]} intensity={1.6} />
      <pointLight position={[-8, -4, 6]} intensity={0.65} color="#22d3ee" />
      <group scale={compact ? 0.82 : 1}>
        <Globe />
      </group>
      {Array.from({ length: 8 }).map((_, index) => (
        <EnergyArc key={index} index={index} active={activity > 1 || active} />
      ))}
      {visible.map((match, index) => {
        const angle = (index / Math.max(visible.length, 1)) * Math.PI * 2;
        return (
          <MatchPin
            key={match.id}
            position={[Math.cos(angle) * 3.95, Math.sin(index * 1.7) * 1.45, Math.sin(angle) * 2.9]}
            live={!match.finished}
            intensity={match.goals}
          />
        );
      })}
      {!compact && visible.slice(0, 5).map((match, index) => (
        <HologramCard key={`h-${match.id}`} match={match} index={index} />
      ))}
      <Stars radius={320} depth={80} count={900 + Math.round(activity * 140)} factor={4.6 + activity * 0.25} saturation={0} fade speed={0.45 + activity * 0.08} />
      <OrbitControls enablePan={false} enableZoom autoRotate autoRotateSpeed={0.26 + activity * 0.02} />
      <Environment preset="night" />
    </Canvas>
  );
}

function StatusBadge({ status, lastUpdated }: { status: DataStatus; lastUpdated: string }) {
  const label = status === 'loading' ? 'SYNCING' : status === 'public-api' ? 'PUBLIC API' : status === 'api-error' ? 'API ERROR' : 'NO DATA';
  const icon = status === 'api-error' ? <WifiOff size={15} /> : <Play size={15} />;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 999, border: '1px solid rgba(52,211,153,.45)', background: 'rgba(16,185,129,.12)', color: '#d1fae5', fontSize: 12 }}>
      {icon}
      <span>{label}</span>
      {lastUpdated && <span style={{ opacity: 0.65 }}>• {lastUpdated}</span>}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ ...glass, borderRadius: 16, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.4, marginTop: 5 }}>{label}</div>
    </div>
  );
}

function MatchRow({ match }: { match: Match }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(148,163,184,.16)' }}>
      <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{match.home}</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#34d399', fontWeight: 900, fontSize: 18 }}>{match.score}</div>
        <div style={{ color: '#67e8f9', fontSize: 10, textTransform: 'uppercase' }}>G{match.group} • {match.time}</div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{match.away}</div>
    </div>
  );
}

function StandingTable({ group, rows }: { group: string; rows: GroupStanding[] }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(148,163,184,.16)' }}>
      <div style={{ color: '#67e8f9', fontWeight: 800, marginBottom: 8 }}>Group {group}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 26px 26px 26px 32px', gap: 5, color: '#94a3b8', fontSize: 11, fontWeight: 800 }}>
        <span>Team</span><span>MP</span><span>W</span><span>GD</span><span>PTS</span>
      </div>
      {rows.map((row) => (
        <div key={`${group}-${row.teamId}`} style={{ display: 'grid', gridTemplateColumns: '1fr 26px 26px 26px 32px', gap: 5, alignItems: 'center', fontSize: 12, paddingTop: 6 }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.teamName}</span>
          <span>{row.mp}</span>
          <span>{row.w}</span>
          <span>{row.gd}</span>
          <span style={{ color: '#34d399', fontWeight: 800 }}>{row.pts}</span>
        </div>
      ))}
    </div>
  );
}

export default function WC26Nexus() {
  const [nextMatchTime, setNextMatchTime] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [standings, setStandings] = useState<GroupStanding[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [matchIqToday, setMatchIqToday] = useState<Match[]>([]);
  const [matchIqDetails, setMatchIqDetails] = useState<MatchIqDetails | null>(null);
  const [status, setStatus] = useState<DataStatus>('loading');
  const [lastUpdated, setLastUpdated] = useState('');
  const isCompact = useIsCompactLayout();

  const fixtureList = useMemo(() => [...matches].sort((a, b) => a.sortTime - b.sortTime).slice(0, 12), [matches]);
  const completedMatches = useMemo(() => matches.filter((match) => match.finished).length, [matches]);
  const totalGoals = useMemo(() => matches.reduce((sum, match) => sum + match.goals, 0), [matches]);
  const activeMatches = useMemo(() => matches.filter((match) => !match.finished && match.sortTime <= Date.now()).length, [matches]);
  const activity = Math.min(6, activeMatches * 2 + totalGoals / 12 + fixtureList.length / 8);

  const nextMatch = useMemo(() => {
    const now = Date.now();
    const upcoming = matches.filter((match) => !match.finished && match.sortTime >= now).sort((a, b) => a.sortTime - b.sortTime);
    return upcoming[0] || matches.find((match) => !match.finished) || matches[0];
  }, [matches]);

  const intelMatch = matchIqToday[0] || fixtureList[0] || nextMatch;
  const intelStats = matchIqDetails?.stats?.slice(0, 3) || [];

  const standingsByGroup = useMemo(() => {
    const grouped = new Map<string, GroupStanding[]>();
    standings.forEach((standing) => {
      if (!grouped.has(standing.group)) grouped.set(standing.group, []);
      grouped.get(standing.group)?.push(standing);
    });
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, rows]) => [group, rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.teamName.localeCompare(b.teamName))] as const);
  }, [standings]);

  useEffect(() => {
    const fetchLiveData = async () => {
      setStatus('loading');

      try {
        const [gamesResponse, groupsResponse] = await Promise.all([
          fetch(`${API_BASE}/get/games`, { cache: 'no-store' }),
          fetch(`${API_BASE}/get/groups`, { cache: 'no-store' }),
        ]);
        if (!gamesResponse.ok || !groupsResponse.ok) throw new Error(`WC26 API request failed: games ${gamesResponse.status}, groups ${groupsResponse.status}`);

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
      } catch (wc26Error) {
        console.warn('WC26 API unavailable; trying MatchIQ fallback:', wc26Error);

        try {
          const [matchesResponse, standingsResponse] = await Promise.all([
            fetch(`${MATCHIQ_BASE}/api/matches`, { cache: 'no-store' }),
            fetch(`${MATCHIQ_BASE}/api/standings`, { cache: 'no-store' }),
          ]);
          if (!matchesResponse.ok || !standingsResponse.ok) throw new Error(`MatchIQ fallback failed: matches ${matchesResponse.status}, standings ${standingsResponse.status}`);

          const matchIqMatches = (await matchesResponse.json()) as MatchIqMatch[];
          const matchIqStandings = await standingsResponse.json();
          const normalizedMatches = Array.isArray(matchIqMatches) ? matchIqMatches.map(normalizeMatchIqMatch) : [];
          const normalizedStandings = normalizeMatchIqStandings(matchIqStandings);

          setMatches(normalizedMatches);
          setStandings(normalizedStandings);
          setLastUpdated(new Date().toLocaleTimeString());
          setStatus(normalizedMatches.length > 0 || normalizedStandings.length > 0 ? 'public-api' : 'no-data');
        } catch (matchIqError) {
          console.error('All WC26 data feeds failed:', matchIqError);
          setMatches([]);
          setStandings([]);
          setStatus('api-error');
        }
      }
    };

    const fetchNews = async () => {
      try {
        const [newsResponse, todayResponse] = await Promise.all([
          fetch(`${MATCHIQ_BASE}/api/news`, { cache: 'no-store' }),
          fetch(`${MATCHIQ_BASE}/api/matches/today`, { cache: 'no-store' }),
        ]);

        if (newsResponse.ok) {
          const newsJson = await newsResponse.json();
          const headlines = Array.isArray(newsJson?.news) ? newsJson.news : [];
          const discussions = Array.isArray(newsJson?.discussions) ? newsJson.discussions : [];
          setNews([...headlines, ...discussions].slice(0, 10));
        }

        if (todayResponse.ok) {
          const todayJson = (await todayResponse.json()) as MatchIqMatch[];
          const normalizedToday = Array.isArray(todayJson) ? todayJson.map(normalizeMatchIqMatch) : [];
          setMatchIqToday(normalizedToday);

          const detailsTarget = todayJson.find((match) => match.status === 'FT') || todayJson[0];
          if (detailsTarget?.id) {
            const detailsResponse = await fetch(`${MATCHIQ_BASE}/api/matches/${detailsTarget.id}/details`, { cache: 'no-store' });
            if (detailsResponse.ok) setMatchIqDetails(await detailsResponse.json());
          }
        }
      } catch (error) {
        console.warn('MatchIQ intelligence unavailable:', error);
      }
    };

    fetchLiveData();
    fetchNews();
    const interval = window.setInterval(() => {
      fetchLiveData();
      fetchNews();
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      if (nextMatch && !nextMatch.finished && nextMatch.sortTime !== Number.MAX_SAFE_INTEGER) {
        const diff = nextMatch.sortTime - Date.now();
        if (diff > 0) {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          setNextMatchTime(`${days}d ${hours}h`);
          return;
        }
      }

      const diff = WORLD_CUP_OPENER_UTC - Date.now();
      if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        setNextMatchTime(`${days}d ${hours}h`);
      } else if (matches.some((match) => !match.finished)) {
        setNextMatchTime('ACTIVE');
      } else if (matches.length > 0) {
        setNextMatchTime('RESULTS');
      } else {
        setNextMatchTime(status === 'loading' ? 'SYNCING' : 'NO DATA');
      }
    };

    updateTime();
    const interval = window.setInterval(updateTime, 30000);
    return () => window.clearInterval(interval);
  }, [matches, nextMatch, status]);

  return (
    <div style={{ minHeight: '100vh', maxHeight: isCompact ? 'none' : '100vh', overflow: isCompact ? 'auto' : 'hidden', background: '#020617', color: '#f8fafc', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 42%, rgba(14,165,233,.20), transparent 38%), radial-gradient(circle at 85% 20%, rgba(16,185,129,.10), transparent 28%), linear-gradient(135deg, #020617 0%, #07111f 55%, #021716 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(103,232,249,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,.045) 1px, transparent 1px)', backgroundSize: '42px 42px', opacity: 0.72 }} />

      <div style={{ position: 'relative', zIndex: 2, minHeight: '100vh', height: isCompact ? 'auto' : '100vh', display: 'grid', gridTemplateRows: isCompact ? 'auto auto auto' : '72px 1fr 64px', padding: isCompact ? 10 : 18, gap: isCompact ? 10 : 14 }}>
        <header style={{ ...glass, borderRadius: 18, display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '300px 1fr 300px', alignItems: 'center', padding: isCompact ? '14px' : '0 18px', gap: isCompact ? 12 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #22d3ee, #34d399)', boxShadow: '0 0 26px rgba(34,211,238,.45)' }}>⚽</div>
            <div>
              <div style={{ fontSize: isCompact ? 21 : 26, fontWeight: 900, letterSpacing: -1 }}>WC26 NEXUS</div>
              <div style={{ fontSize: 11, color: '#67e8f9', letterSpacing: 1.6, textTransform: 'uppercase' }}>World Cup command center</div>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <StatusBadge status={status} lastUpdated={lastUpdated} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: isCompact ? 'center' : 'flex-end' }}>
            <MetricCard label="Matches" value={matches.length || 104} />
            <MetricCard label="Goals" value={totalGoals} />
          </div>
        </header>

        <main style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '320px minmax(520px, 1fr) 400px', gridTemplateRows: isCompact ? 'auto auto auto' : undefined, gap: isCompact ? 10 : 14, minHeight: 0 }}>
          <aside style={{ ...glass, borderRadius: 22, padding: isCompact ? 12 : 16, minHeight: 0, maxHeight: isCompact ? 'none' : undefined, display: 'grid', gridTemplateRows: isCompact ? 'auto auto auto' : 'auto auto 1fr', gap: 14 }}>
            <section style={{ borderBottom: '1px solid rgba(148,163,184,.16)', paddingBottom: 14 }}>
              <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase' }}>Next Signal</div>
              <div style={{ marginTop: 10, fontSize: 20, fontWeight: 850 }}>{nextMatch ? `${nextMatch.home} vs ${nextMatch.away}` : 'No match data'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, color: '#34d399', fontWeight: 900, fontSize: 26 }}>
                <Trophy size={22} />
                {nextMatchTime}
              </div>
              <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>
                {nextMatch ? `${nextMatch.venue} • Group ${nextMatch.group} • Matchday ${nextMatch.matchday}` : 'Waiting for public feed'}
              </div>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MetricCard label="Finished" value={completedMatches} />
              <MetricCard label="Signal" value={activity.toFixed(1)} />
            </section>

            <section style={{ minHeight: 0, overflow: 'auto', maxHeight: isCompact ? 320 : undefined, paddingRight: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#67e8f9', fontSize: 12, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 8 }}>
                <Activity size={14} /> Live / Upcoming Feed
              </div>
              {fixtureList.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>No fixtures loaded.</div>
              ) : (
                fixtureList.slice(0, 8).map((match) => <MatchRow key={match.id} match={match} />)
              )}
            </section>
          </aside>

          <section style={{ ...glass, borderRadius: 26, minHeight: 0, height: isCompact ? 340 : 'auto', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 18, left: 20, zIndex: 3 }}>
              <div style={{ color: '#67e8f9', fontSize: 12, letterSpacing: 1.8, textTransform: 'uppercase', fontWeight: 900 }}>Live Orbital Feed</div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>real-time match orbit • venue pulses • score signals</div>
            </div>
            <div style={{ position: 'absolute', top: 18, right: 20, zIndex: 3, color: '#94a3b8', fontSize: 12, textAlign: 'right' }}>
              <RefreshCw size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} /> refreshes every 60s
            </div>
            {!isCompact && intelMatch && (
              <div style={{ ...glass, position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 4, borderRadius: 16, padding: '10px 16px', minWidth: 280, textAlign: 'center' }}>
                <div style={{ color: '#67e8f9', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 900 }}>Live Match Tracker</div>
                <div style={{ fontWeight: 900, marginTop: 4 }}>{intelMatch.homeCode} <span style={{ color: '#34d399' }}>{intelMatch.score}</span> {intelMatch.awayCode}</div>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>{intelMatch.venue} • {intelMatch.time}</div>
              </div>
            )}
            <GlobeScene matches={fixtureList} activity={activity} compact={isCompact} />
          </section>

          <aside style={{ ...glass, borderRadius: 22, padding: isCompact ? 12 : 16, minHeight: 0, display: 'grid', gridTemplateRows: isCompact ? 'auto auto auto' : 'auto 1fr auto', gap: 14 }}>
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#67e8f9', fontSize: 12, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase' }}>
                <Shield size={14} /> Group Standings
              </div>
            </section>

            <section style={{ minHeight: 0, overflow: 'auto', maxHeight: isCompact ? 420 : undefined, paddingRight: 4 }}>
              {standingsByGroup.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>No standings loaded.</div>
              ) : (
                standingsByGroup.map(([group, rows]) => <StandingTable key={group} group={group} rows={rows} />)
              )}
            </section>

            <section style={{ ...glass, borderRadius: 16, padding: 12 }}>
              <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase' }}>Tournament Intel</div>
              <div style={{ color: '#f8fafc', fontSize: 13, fontWeight: 800, marginTop: 9 }}>
                {intelMatch ? `${intelMatch.home} vs ${intelMatch.away}` : 'MatchIQ feed standing by'}
              </div>
              {matchIqDetails?.referee && <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Referee: {matchIqDetails.referee}</div>}
              {matchIqDetails?.home_lineup?.coach && <div style={{ color: '#94a3b8', fontSize: 12 }}>Home coach: {matchIqDetails.home_lineup.coach}</div>}
              {matchIqDetails?.away_lineup?.coach && <div style={{ color: '#94a3b8', fontSize: 12 }}>Away coach: {matchIqDetails.away_lineup.coach}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 6, columnGap: 12, color: '#cbd5e1', fontSize: 12, marginTop: 10 }}>
                <span>MatchIQ news</span><strong style={{ color: news.length ? '#34d399' : '#94a3b8' }}>{news.length ? 'Online' : 'Standby'}</strong>
                <span>Squad / coach data</span><strong style={{ color: matchIqDetails ? '#34d399' : '#94a3b8' }}>{matchIqDetails ? 'Loaded' : 'Ready'}</strong>
                <span>Basic match stats</span><strong style={{ color: intelStats.length ? '#34d399' : '#94a3b8' }}>{intelStats.length ? 'Loaded' : 'Ready'}</strong>
                <span>Live timeline feed</span><strong style={{ color: '#fbbf24' }}>Pending</strong>
              </div>
              {intelStats.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(148,163,184,.16)', marginTop: 10, paddingTop: 8 }}>
                  {intelStats.map((stat) => (
                    <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 12, marginTop: 4 }}>
                      <span>{stat.label}</span>
                      <strong>{stat.home} - {stat.away}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </main>

        <footer style={{ ...glass, borderRadius: 18, display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '180px 1fr', alignItems: 'center', overflow: 'hidden', gap: isCompact ? 8 : 0, padding: isCompact ? '10px 0' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16, color: '#67e8f9', fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>
            <Newspaper size={15} /> Tournament Buzz
          </div>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', color: '#cbd5e1', fontSize: 13 }}>
            {(news.length ? news : matchIqToday.length ? matchIqToday.map((match) => ({ title: `${match.home} ${match.score} ${match.away}`, source: 'Today' })) : [{ title: 'MatchIQ news feed standing by', source: 'WC26 Nexus' }])
              .map((item) => `${item.source ? item.source + ': ' : ''}${item.title}`)
              .join('   •   ')}
          </div>
        </footer>
      </div>
    </div>
  );
}
