import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Egg, Wheat, Activity, Pizza, Flame,
  LayoutDashboard, Clock, X, Minus, Settings, Trophy, Lock, Check,
  Fish, UtensilsCrossed, Dumbbell, Sandwich, CookingPot,
  Apple, Banana, Leaf,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type FoodKey =
  | "eggs" | "tunaChicken" | "beefStew" | "shake"
  | "rice" | "toast" | "pasta"
  | "apple" | "banana" | "broccoli"
  | "cheat";

type Counts   = Record<FoodKey, number>;
type Macros   = { protein: number; carbs: number; fats: number; vitamins: number };
type TimelineEntry = { time: string; label: string; items: string[] };
type DayData  = { counts: Counts; macros: Macros; timeline: TimelineEntry[] };
type TabId    = "log" | "dashboard" | "timing" | "rewards";

// Streak / gamification
type StreakGoal = 30 | 50 | 100 | 200;
type StreakState = {
  goal: StreakGoal;
  count: number;
  lastLoggedDate: string | null; // yyyy-mm-dd, real calendar date
  celebratedGoals: StreakGoal[]; // goals for which the unlock celebration was shown
  claimedGoals: StreakGoal[];    // goals for which the reward was actually claimed
};

// ─── Food item definition ─────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

type FoodItem = {
  key: FoodKey;
  label: string;
  sub: string;
  Icon: IconComponent;
  impact: Partial<Record<keyof Macros, number>>;
  timelineLabel: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const DAYS = [
  { d: "MON", n: 16, m: "FEB" },
  { d: "TUE", n: 17, m: "FEB" },
  { d: "WED", n: 18, m: "FEB" },
  { d: "THU", n: 19, m: "FEB" },
  { d: "FRI", n: 20, m: "FEB" },
];

const TARGETS: Partial<Record<FoodKey, number>> = { eggs: 4, rice: 2, shake: 1 };
const VITAMIN_KEYS: FoodKey[] = ["apple", "banana", "broccoli"];
const VITAMIN_THRESHOLD = 2;

// ── Gamification constants ─────────────────────────────────────────────────

const STREAK_COLOR = "#fbbf24"; // amber — distinct from neon cyan / vitamin green / cheat orange
const STREAK_STORAGE_KEY = "fuel-streak-state-v1";
const STREAK_GOAL_OPTIONS: StreakGoal[] = [30, 50, 100, 200];

const STREAK_REWARDS: Record<StreakGoal, { title: string; description: string; code?: string }> = {
  30: {
    title: "Discipline Badge",
    description: "30 dagen protocol volgehouden. Je discipline-badge is ontgrendeld.",
  },
  50: {
    title: "15% Fuel Discount",
    description: "50 dagen op rij. Gebruik deze code op je volgende fitnessvoeding-bestelling.",
    code: "STREAK50",
  },
  100: {
    title: "Protocol Handbook",
    description: "100 dagen streak. Exclusief e-book: Advanced Circadian Fueling is ontgrendeld.",
  },
  200: {
    title: "Elite Operator Trophy",
    description: "200 dagen. Gereserveerd voor de top van protocol-discipline.",
  },
};

const DEFAULT_STREAK_STATE: StreakState = {
  goal: 50,
  count: 14, // startwaarde, komt overeen met de eerder statische headerwaarde
  lastLoggedDate: null,
  celebratedGoals: [],
  claimedGoals: [],
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isYesterday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return d.toDateString() === y.toDateString();
}

function loadStreakState(): StreakState {
  if (typeof window === "undefined") return DEFAULT_STREAK_STATE;
  try {
    const raw = window.localStorage.getItem(STREAK_STORAGE_KEY);
    if (!raw) return DEFAULT_STREAK_STATE;
    return { ...DEFAULT_STREAK_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STREAK_STATE;
  }
}

function saveStreakState(state: StreakState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(state));
}

// Called on every log action. Only the FIRST log of a real calendar day
// extends the streak; a missed day resets it to 1.
function registerStreakLog(state: StreakState): StreakState {
  const today = todayISO();
  if (state.lastLoggedDate === today) return state;
  const continuing = state.lastLoggedDate ? isYesterday(state.lastLoggedDate) : false;
  const nextCount = continuing ? state.count + 1 : 1;
  return { ...state, count: nextCount, lastLoggedDate: today };
}

// Modal categories — order determines display order
const MODAL_CATEGORIES: Array<{
  id: string;
  label: string;
  color: string;
  items: FoodItem[];
}> = [
  {
    id: "protein",
    label: "PROTEIN FOCUS",
    color: "#00f2ff",
    items: [
      { key: "eggs",        label: "Eggs",           sub: "Bioavailable Protein", Icon: Egg,             impact: { protein: 20, fats: 10 },       timelineLabel: "Eggs logged (Protein)" },
      { key: "tunaChicken", label: "Tuna / Chicken",  sub: "Lean Protein",         Icon: Fish,            impact: { protein: 30, fats: 10 },       timelineLabel: "Tuna/Chicken logged (Protein)" },
      { key: "beefStew",    label: "Beef Stew",       sub: "Dense Protein",        Icon: UtensilsCrossed, impact: { protein: 30, fats: 10 },       timelineLabel: "Beef Stew logged (Protein)" },
      { key: "shake",       label: "Protein Shake",   sub: "Recovery",             Icon: Dumbbell,        impact: { protein: 25 },                 timelineLabel: "Protein Shake logged (Recovery)" },
    ],
  },
  {
    id: "carbs",
    label: "CARBS FOCUS",
    color: "#e2e8f0",
    items: [
      { key: "rice",  label: "Rice Bowl",     sub: "Complex Carbs",  Icon: Wheat,     impact: { carbs: 40 }, timelineLabel: "Rice Bowl logged (Carbs)" },
      { key: "toast", label: "Toast / Bread", sub: "Quick Energy",   Icon: Sandwich,  impact: { carbs: 40 }, timelineLabel: "Toast/Bread logged (Carbs)" },
      { key: "pasta", label: "Pasta / Oats",  sub: "Sustained Fuel", Icon: CookingPot,impact: { carbs: 40 }, timelineLabel: "Pasta/Oats logged (Carbs)" },
    ],
  },
  {
    id: "vitamins",
    label: "VITAMINS & FRUIT",
    color: "#10b981",
    items: [
      { key: "apple",   label: "Apple",            sub: "Micronutrients",  Icon: Apple,    impact: { carbs: 20, vitamins: 15 }, timelineLabel: "Apple logged (Vitamins Focus)" },
      { key: "banana",  label: "Banana",            sub: "Potassium+",     Icon: Banana,   impact: { carbs: 20, vitamins: 15 }, timelineLabel: "Banana logged (Vitamins Focus)" },
      { key: "broccoli",label: "Broccoli / Paprika",sub: "Micronutrients", Icon: Leaf,     impact: { vitamins: 10 },            timelineLabel: "Broccoli/Paprika logged (Vitamins Focus)" },
    ],
  },
  {
    id: "cheat",
    label: "SOUL FUEL",
    color: "#f97316",
    items: [
      { key: "cheat", label: "Take-out / Cheat", sub: "Soul Fuel · lowers discipline", Icon: Pizza, impact: { carbs: 40, fats: 25 }, timelineLabel: "Take-out logged (Soul Fuel)" },
    ],
  },
];

// Flat lookup map: key → FoodItem
const FOOD_MAP = new Map<FoodKey, FoodItem>(
  MODAL_CATEGORIES.flatMap((c) => c.items).map((item) => [item.key, item]),
);

// 4 items shown in the quick-adjust overview grid
const QUICK_ITEMS: Array<{ key: FoodKey; label: string; sub: string; Icon: IconComponent }> = [
  { key: "eggs",  label: "Eggs",          sub: "Bioavailable Protein", Icon: Egg },
  { key: "rice",  label: "Rice Bowl",     sub: "Complex Carbs",        Icon: Wheat },
  { key: "shake", label: "Protein Shake", sub: "Recovery",             Icon: Activity },
  { key: "cheat", label: "Take-out",      sub: "Soul Fuel",            Icon: Pizza },
];

// Blank day template
const EMPTY_COUNTS: Counts = {
  eggs: 0, tunaChicken: 0, beefStew: 0, shake: 0,
  rice: 0, toast: 0, pasta: 0,
  apple: 0, banana: 0, broccoli: 0,
  cheat: 0,
};

// Research data from process document (Feb 16–20, 2025)
// Macro values in grams, calculated from logged item impacts.
const INITIAL_DAYS: DayData[] = [
  // MON 16 FEB — protein:195g · carbs:240g · fats:70g · vitamins:0g
  {
    counts: { ...EMPTY_COUNTS, eggs: 4, tunaChicken: 2, beefStew: 1, shake: 1, rice: 2, toast: 4 },
    macros: { protein: 195, carbs: 240, fats: 70, vitamins: 0 },
    timeline: [
      { time: "08:00", label: "Morning Fuel",   items: ["4 Eieren", "Kaas", "2 Toosten"] },
      { time: "12:00", label: "Mid-day Intake", items: ["Kom rijst met tonijn"] },
      { time: "16:00", label: "Afternoon Fuel", items: ["Kom rijst met tonijn"] },
      { time: "19:00", label: "Evening Reload", items: ["Rundvlees stoofpot"] },
      { time: "21:00", label: "Night Protocol", items: ["2 Boterhammen pindakaas"] },
      { time: "22:00", label: "Recovery",       items: ["Proteïneshake"] },
    ],
  },
  // TUE 17 FEB — protein:50g · carbs:180g · fats:20g · vitamins:25g
  {
    counts: { ...EMPTY_COUNTS, eggs: 1, tunaChicken: 1, rice: 2, toast: 2, banana: 1, broccoli: 1 },
    macros: { protein: 50, carbs: 180, fats: 20, vitamins: 25 },
    timeline: [
      { time: "09:00", label: "Morning Fuel",   items: ["Rijst met ei en spek"] },
      { time: "12:00", label: "Mid-day Intake", items: ["Banaan", "2 Boterhammen pindakaas"] },
      { time: "14:00", label: "Afternoon Fuel", items: ["1 Kom rijst met kip en broccoli"] },
    ],
  },
  // WED 18 FEB — protein:90g · carbs:180g · fats:40g · vitamins:25g
  {
    counts: { ...EMPTY_COUNTS, eggs: 3, tunaChicken: 1, rice: 2, toast: 2, apple: 1, broccoli: 1 },
    macros: { protein: 90, carbs: 180, fats: 40, vitamins: 25 },
    timeline: [
      { time: "12:30", label: "Late Morning",   items: ["3 Eieren", "2 Toosten"] },
      { time: "16:00", label: "Afternoon Fuel", items: ["Appel"] },
      { time: "19:00", label: "Evening Reload", items: ["Rijst", "Zalm", "Broccoli"] },
    ],
  },
  // THU 19 FEB — protein:110g · carbs:200g · fats:50g · vitamins:30g
  {
    counts: { ...EMPTY_COUNTS, eggs: 4, tunaChicken: 1, rice: 1, toast: 2, pasta: 1, apple: 1, banana: 1 },
    macros: { protein: 110, carbs: 200, fats: 50, vitamins: 30 },
    timeline: [
      { time: "08:00", label: "Morning Fuel",   items: ["4 Eieren", "Spek", "2 Toosten"] },
      { time: "12:00", label: "Mid-day Intake", items: ["Kom rijst met tonijn"] },
      { time: "15:00", label: "Afternoon Fuel", items: ["Appel"] },
      { time: "18:30", label: "Evening Reload", items: ["Pasta spek en paprika"] },
      { time: "21:00", label: "Night Protocol", items: ["Yoghurt met havermout & banaan"] },
    ],
  },
  // FRI 20 FEB — blank slate for live demo
  {
    counts: { ...EMPTY_COUNTS },
    macros: { protein: 0, carbs: 0, fats: 0, vitamins: 0 },
    timeline: [],
  },
];

function getTimeLabel(hour: number): string {
  if (hour < 10) return "Morning Fuel";
  if (hour < 13) return "Late Morning";
  if (hour < 15) return "Mid-day Intake";
  if (hour < 18) return "Afternoon Fuel";
  if (hour < 21) return "Evening Reload";
  return "Night Protocol";
}

// ─── Reusable Primitives ──────────────────────────────────────────────────────

function NumberDisplay({ value, target }: { value: number; target: number }) {
  return (
    <span className="font-mono-tab">
      <span className="text-white font-display text-2xl">{value}</span>
      <span className="text-white/30 text-sm ml-1">/ {target}</span>
    </span>
  );
}

function ProgressBar({ value, target, color = "#00f2ff" }: { value: number; target: number; color?: string }) {
  const pct = Math.min(100, (value / target) * 100);
  return (
    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 12px ${color}99` }}
      />
    </div>
  );
}

// ─── Macro Donut Chart ────────────────────────────────────────────────────────

const MACRO_SEGMENTS = [
  { key: "protein"  as const, label: "PROTEIN",  color: "#00f2ff", glow: "drop-shadow(0 0 8px rgba(0,242,255,0.65))" },
  { key: "carbs"    as const, label: "CARBS",    color: "#e2e8f0", glow: undefined },
  { key: "fats"     as const, label: "FATS",     color: "#475569", glow: undefined },
  { key: "vitamins" as const, label: "VITAMINS", color: "#10b981", glow: "drop-shadow(0 0 6px rgba(16,185,129,0.65))" },
];
const GAP_PX = 5;

function MacroDonut({ macros }: { macros: Macros }) {
  const r = 78;
  const C = 2 * Math.PI * r;
  const total = macros.protein + macros.carbs + macros.fats + macros.vitamins;
  const hasData = total > 0;
  const denom = total || 1;

  let cumStart = 0;
  const segments = MACRO_SEGMENTS.map((seg) => {
    const pts = macros[seg.key];
    const fullArc = (pts / denom) * C;
    const arcLen = Math.max(0, fullArc - (pts > 0 ? GAP_PX : 0));
    const dashOffset = C - cumStart;
    cumStart += fullArc;
    return { ...seg, pts, pct: Math.round((pts / denom) * 100), arcLen, dashOffset };
  });

  const topSeg = hasData ? segments.reduce((a, b) => (a.pts > b.pts ? a : b)) : null;

  return (
    <>
      <div className="relative w-52 h-52 mx-auto">
        <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
          <circle cx="100" cy="100" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="14" fill="none" />
          {hasData && segments.map((seg) =>
            seg.arcLen > 0 ? (
              <circle
                key={seg.key}
                cx="100" cy="100" r={r}
                stroke={seg.color}
                strokeWidth="14"
                fill="none"
                strokeLinecap="butt"
                strokeDasharray={`${seg.arcLen} ${C - seg.arcLen}`}
                strokeDashoffset={seg.dashOffset}
                style={{
                  filter: seg.glow,
                  transition: "stroke-dasharray 600ms ease, stroke-dashoffset 600ms ease",
                }}
              />
            ) : null
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[10px] tracking-[0.3em] text-white/40">MACRO SPLIT</div>
          {hasData && topSeg ? (
            <>
              <div className="font-display text-4xl mt-1 font-mono-tab transition-all duration-500" style={{ color: topSeg.color }}>
                {topSeg.pct}%
              </div>
              <div className="text-[9px] tracking-[0.3em] mt-1 transition-all duration-500" style={{ color: topSeg.color }}>
                {topSeg.label}
              </div>
            </>
          ) : (
            <>
              <div className="font-display text-4xl text-white/20 mt-1 font-mono-tab">—</div>
              <div className="text-[9px] tracking-[0.3em] text-white/20 mt-1">NO DATA YET</div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-6 pt-6 border-t border-hairline">
        {segments.map((seg) => (
          <div key={seg.key}>
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: seg.color, boxShadow: seg.glow ? `0 0 6px ${seg.color}55` : undefined }}
              />
              <span className="text-[10px] tracking-[0.18em] text-white/50">{seg.label}</span>
            </div>
            <div className="font-display text-xl mt-1 font-mono-tab transition-all duration-500" style={{ color: hasData ? seg.color : "rgba(255,255,255,0.15)" }}>
              {hasData ? `${seg.pct}%` : "—"}
            </div>
            <div className="text-[9px] text-white/30 mt-0.5 font-mono-tab">
              {hasData ? `${macros[seg.key]}g` : ""}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Metric card ─────────────────────────────────────────────────────────────

function Metric({ label, value, sub, highlight }: { label: string; value: number; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 border ${highlight ? "border-neon/40 bg-neon/5" : "border-hairline bg-panel"}`}>
      <div className="text-[9px] tracking-[0.2em] text-white/40 uppercase">{label}</div>
      <div className="flex items-baseline gap-1 mt-2">
        <span className={`font-display text-2xl font-mono-tab ${highlight ? "text-neon" : "text-white"}`}>{value}</span>
        <span className="text-[10px] tracking-[0.2em] text-white/40">{sub}</span>
      </div>
    </div>
  );
}

// ─── Streak / Gamification UI ─────────────────────────────────────────────────

function StreakWidgetCard({
  streak,
  onOpenSettings,
}: {
  streak: StreakState;
  onOpenSettings: () => void;
}) {
  const pct = Math.min(100, Math.round((streak.count / streak.goal) * 100));
  return (
    <div className="rounded-3xl bg-panel border border-hairline p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="text-[10px] tracking-[0.3em] text-white/40">STREAK PROTOCOL</div>
        <button
          onClick={onOpenSettings}
          className="text-[10px] tracking-[0.25em] text-white/40 hover:text-white/70 transition-colors flex items-center gap-1"
        >
          <Settings className="w-3 h-3" />
          GOAL
        </button>
      </div>

      <div className="flex items-center gap-4 mb-5">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${STREAK_COLOR}18`, border: `1px solid ${STREAK_COLOR}40` }}
        >
          <Flame className="w-6 h-6" style={{ color: STREAK_COLOR }} />
        </div>
        <div>
          <div className="font-mono-tab">
            <span className="font-display text-3xl" style={{ color: STREAK_COLOR }}>{streak.count}</span>
            <span className="text-white/30 text-lg ml-1">/ {streak.goal}</span>
          </div>
          <div className="text-[10px] tracking-[0.25em] text-white/40 mt-1 uppercase">Dagen Streak</div>
        </div>
      </div>

      <ProgressBar value={streak.count} target={streak.goal} color={STREAK_COLOR} />
      <div className="flex justify-between text-[9px] tracking-[0.2em] text-white/30 mt-2 font-mono-tab">
        <span>0</span>
        <span style={{ color: STREAK_COLOR }}>{pct}%</span>
        <span>{streak.goal}</span>
      </div>
    </div>
  );
}

function StreakGoalPopover({
  visible,
  currentGoal,
  onSelect,
  onClose,
}: {
  visible: boolean;
  currentGoal: StreakGoal;
  onSelect: (goal: StreakGoal) => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <>
      <div className="absolute inset-0 z-40" onClick={onClose} />
      <div className="absolute right-6 top-16 z-50 w-56 rounded-2xl bg-panel-elevated border border-hairline p-4">
        <div className="text-[9px] tracking-[0.3em] text-white/40 mb-3">STREAK DOEL</div>
        <div className="grid grid-cols-2 gap-2">
          {STREAK_GOAL_OPTIONS.map((opt) => {
            const active = opt === currentGoal;
            return (
              <button
                key={opt}
                onClick={() => { onSelect(opt); onClose(); }}
                className="py-2.5 rounded-xl border font-mono-tab text-sm transition-colors bg-app hover:border-white/20"
                style={
                  active
                    ? { color: STREAK_COLOR, backgroundColor: `${STREAK_COLOR}14`, borderColor: `${STREAK_COLOR}80` }
                    : { color: "white", borderColor: "rgba(255,255,255,0.06)" }
                }
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function StreakRewardModal({
  goal,
  visible,
  onViewReward,
}: {
  goal: StreakGoal | null;
  visible: boolean;
  onViewReward: () => void;
}) {
  const reward = goal ? STREAK_REWARDS[goal] : null;
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-6"
      style={{
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(16px)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 300ms ease",
      }}
    >
      <div
        className="w-full max-w-xs bg-panel border rounded-3xl p-8 text-center"
        style={{
          borderColor: `${STREAK_COLOR}4d`,
          boxShadow: `0 0 80px ${STREAK_COLOR}1f, 0 0 160px ${STREAK_COLOR}0f`,
          transform: visible ? "scale(1)" : "scale(0.88)",
          transition: "transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-5"
          style={{ backgroundColor: `${STREAK_COLOR}18`, border: `1px solid ${STREAK_COLOR}40` }}
        >
          <Trophy className="w-6 h-6" style={{ color: STREAK_COLOR }} />
        </div>
        <div className="text-[9px] tracking-[0.45em] mb-3" style={{ color: STREAK_COLOR }}>
          STREAK DOEL BEHAALD
        </div>
        <div className="font-display text-2xl text-white mb-2 leading-tight">
          {goal} DAGEN<br />VOLGEHOUDEN
        </div>
        <div className="text-xs text-white/40 leading-relaxed mb-6">
          {reward?.title} is ontgrendeld. Ga naar Beloningen om hem te claimen.
        </div>
        <div
          className="w-12 h-px mx-auto mb-7"
          style={{ background: `linear-gradient(90deg, transparent, ${STREAK_COLOR}, transparent)` }}
        />
        <button
          onClick={onViewReward}
          className="w-full py-3.5 rounded-xl font-display text-sm tracking-[0.2em] hover:opacity-90 active:scale-95 transition-all"
          style={{ backgroundColor: STREAK_COLOR, color: "#1a1200" }}
        >
          BEKIJK BELONING
        </button>
      </div>
    </div>
  );
}

// ── Rewards page: locked / unlocked / claimed states ──────────────────────────

const CLAIM_COLOR = "#10b981"; // reuse the app's existing "success" green

function RewardCard({
  goal,
  streak,
  onClaim,
}: {
  goal: StreakGoal;
  streak: StreakState;
  onClaim: (goal: StreakGoal) => void;
}) {
  const reward = STREAK_REWARDS[goal];
  const claimed = streak.claimedGoals.includes(goal);
  const unlocked = streak.count >= goal;
  const locked = !unlocked;

  return (
    <div
      className={`rounded-3xl border p-5 transition-all duration-300 ${
        locked ? "border-hairline bg-panel opacity-50 grayscale pointer-events-none" : "bg-panel"
      }`}
      style={
        !locked && !claimed
          ? { borderColor: `${STREAK_COLOR}66`, boxShadow: `0 0 32px ${STREAK_COLOR}1a` }
          : !locked && claimed
          ? { borderColor: "rgba(255,255,255,0.08)" }
          : undefined
      }
    >
      <div className="flex items-start gap-4">
        <div
          className="relative w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: claimed ? `${CLAIM_COLOR}18` : locked ? "rgba(255,255,255,0.05)" : `${STREAK_COLOR}18`,
            border: `1px solid ${claimed ? `${CLAIM_COLOR}40` : locked ? "rgba(255,255,255,0.1)" : `${STREAK_COLOR}40`}`,
          }}
        >
          {!locked && !claimed && (
            <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: `0 0 0 3px ${STREAK_COLOR}30` }} />
          )}
          {locked ? (
            <Lock className="w-5 h-5 text-white/30" />
          ) : claimed ? (
            <Check className="w-5 h-5" style={{ color: CLAIM_COLOR }} />
          ) : (
            <Trophy className="w-5 h-5" style={{ color: STREAK_COLOR }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-display text-sm text-white">{reward.title}</div>
            <div className="text-[9px] tracking-[0.2em] text-white/30 font-mono-tab flex-shrink-0">{goal}D</div>
          </div>
          <div className="text-xs text-white/40 mt-1 leading-relaxed">{reward.description}</div>

          {locked && (
            <div className="text-[10px] text-white/30 mt-3">
              Behaal je {goal}-dagen streak om te ontgrendelen (huidige voortgang: {Math.min(streak.count, goal)}/{goal})
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => onClaim(goal)}
        disabled={locked || claimed}
        className="w-full mt-4 py-3 rounded-xl font-display text-xs tracking-[0.2em] transition-all disabled:cursor-not-allowed"
        style={
          claimed
            ? { backgroundColor: `${CLAIM_COLOR}1f`, color: CLAIM_COLOR, border: `1px solid ${CLAIM_COLOR}4d` }
            : locked
            ? { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.08)" }
            : { backgroundColor: STREAK_COLOR, color: "#1a1200" }
        }
      >
        {claimed ? (
          <span className="flex items-center justify-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> GECLAIMD
          </span>
        ) : locked ? (
          <span className="flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> VERGRENDELD
          </span>
        ) : (
          "CLAIM BELONING"
        )}
      </button>
    </div>
  );
}

function RewardsTab({
  streak,
  onClaim,
}: {
  streak: StreakState;
  onClaim: (goal: StreakGoal) => void;
}) {
  const unlockedCount = STREAK_GOAL_OPTIONS.filter((g) => streak.count >= g).length;
  return (
    <div className="px-6 space-y-6 animate-in fade-in duration-300">
      <div>
        <div className="text-[10px] tracking-[0.3em] text-white/40">GAMIFICATION</div>
        <div className="font-display text-2xl mt-1">Beloningen</div>
        <div className="text-xs text-white/40 mt-1">
          {unlockedCount} / {STREAK_GOAL_OPTIONS.length} ontgrendeld op basis van je streak.
        </div>
      </div>

      <div className="space-y-4">
        {STREAK_GOAL_OPTIONS.map((goal) => (
          <RewardCard key={goal} goal={goal} streak={streak} onClaim={onClaim} />
        ))}
      </div>
    </div>
  );
}

function ClaimConfirmationModal({
  goal,
  visible,
  onClose,
}: {
  goal: StreakGoal | null;
  visible: boolean;
  onClose: () => void;
}) {
  const reward = goal ? STREAK_REWARDS[goal] : null;
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-6"
      style={{
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(16px)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 300ms ease",
      }}
    >
      <div
        className="w-full max-w-xs bg-panel border rounded-3xl p-8 text-center"
        style={{
          borderColor: `${CLAIM_COLOR}4d`,
          boxShadow: `0 0 80px ${CLAIM_COLOR}1f, 0 0 160px ${CLAIM_COLOR}0f`,
          transform: visible ? "scale(1)" : "scale(0.88)",
          transition: "transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-5"
          style={{ backgroundColor: `${CLAIM_COLOR}18`, border: `1px solid ${CLAIM_COLOR}40` }}
        >
          <Check className="w-6 h-6" style={{ color: CLAIM_COLOR }} />
        </div>
        <div className="text-[9px] tracking-[0.45em] mb-3" style={{ color: CLAIM_COLOR }}>
          BELONING GECLAIMD
        </div>
        <div className="font-display text-2xl text-white mb-2 leading-tight">
          {reward?.title}
        </div>
        <div className="text-xs text-white/40 leading-relaxed mb-6">
          {reward?.description}
        </div>
        {reward?.code && (
          <div className="rounded-xl bg-app border border-hairline p-3 mb-6">
            <div className="text-[9px] tracking-[0.25em] text-white/40 mb-1">JOUW CODE</div>
            <div className="font-mono-tab text-sm" style={{ color: CLAIM_COLOR }}>{reward.code}</div>
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-xl font-display text-sm tracking-[0.2em] hover:opacity-90 active:scale-95 transition-all"
          style={{ backgroundColor: CLAIM_COLOR, color: "#04241a" }}
        >
          SLUITEN
        </button>
      </div>
    </div>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────

function TabButton({ id, label, active, onClick, Icon }: {
  id: TabId; label: string; active: boolean; onClick: (id: TabId) => void; Icon: typeof Plus;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all ${active ? "bg-neon/10" : ""}`}
    >
      <Icon className={`w-4 h-4 ${active ? "text-neon" : "text-white/50"}`} />
      <span className={`text-[10px] tracking-[0.2em] ${active ? "text-neon" : "text-white/50"}`}>
        {label.toUpperCase()}
      </span>
    </button>
  );
}

// ─── Log Modal (multi-category bottom sheet) ──────────────────────────────────

function LogModal({ visible, onClose, onLog, dayData }: {
  visible: boolean;
  onClose: () => void;
  onLog: (key: FoodKey) => void;
  dayData: DayData;
}) {
  return (
    <>
      <div
        onClick={onClose}
        className="absolute inset-0 z-40"
        style={{
          background: "rgba(0,0,0,0.82)",
          backdropFilter: "blur(6px)",
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          transition: "opacity 250ms ease",
        }}
      />

      <div
        className="absolute bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-panel-elevated border-t border-x border-hairline"
        style={{
          opacity: visible ? 1 : 0,
          transform: `translateY(${visible ? "0px" : "28px"})`,
          pointerEvents: visible ? "auto" : "none",
          transition: "opacity 260ms ease, transform 280ms cubic-bezier(0.32, 0.72, 0, 1)",
          paddingBottom: "24px",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-6 pt-3 pb-3 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="text-[10px] tracking-[0.35em] text-neon">LOG FUEL SOURCE</div>
            <div className="font-display text-xl mt-1">Select Item</div>
            <div className="text-xs text-white/40 mt-0.5">Adds +1 · timestamps your protocol</div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-hairline flex items-center justify-center hover:border-white/20 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 pb-2 space-y-5">
          {MODAL_CATEGORIES.map((cat) => (
            <div key={cat.id}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: cat.color }} />
                <span className="text-[9px] tracking-[0.35em] text-white/40">{cat.label}</span>
              </div>

              <div className={`grid gap-2 ${cat.items.length === 1 ? "grid-cols-1" : cat.items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {cat.items.map(({ key, label, sub, Icon }) => (
                  <button
                    key={key}
                    onClick={() => onLog(key)}
                    className={`rounded-2xl bg-app border p-3.5 text-left active:scale-95 transition-all group ${
                      cat.id === "cheat"
                        ? "border-orange-500/20 hover:border-orange-500/50 col-span-full"
                        : "border-hairline hover:border-neon/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{
                          backgroundColor: `${cat.color}18`,
                          border: `1px solid ${cat.color}30`,
                        }}
                      >
                        <Icon className="w-4 h-4" style={{ color: cat.color }} />
                      </div>
                      <span className="font-display text-xl font-mono-tab" style={{ color: "rgba(255,255,255,0.18)" }}>
                        {dayData.counts[key]}
                      </span>
                    </div>
                    <div className="font-display text-xs text-white leading-tight">{label}</div>
                    <div className="text-[9px] tracking-[0.12em] mt-0.5 uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>{sub}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="text-center text-[10px] tracking-[0.25em] text-white/15 pt-1 pb-1">
            TIMESTAMP LOGGED AUTOMATICALLY
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Goal Achieved Overlay (daily nutrition target — unrelated to streaks) ────

function GoalOverlay({ item, onClose }: { item: string | null; onClose: () => void }) {
  const visible = item !== null;
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-6"
      style={{
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(16px)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 300ms ease",
      }}
    >
      <div
        className="w-full max-w-xs bg-panel border border-neon/30 rounded-3xl p-8 text-center"
        style={{
          boxShadow: "0 0 80px rgba(0,242,255,0.12), 0 0 160px rgba(0,242,255,0.06)",
          transform: visible ? "scale(1)" : "scale(0.88)",
          transition: "transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <div className="text-5xl mb-5">🎯</div>
        <div className="text-[9px] tracking-[0.45em] text-neon mb-3">PROTOCOL GOAL ACHIEVED</div>
        <div className="font-display text-2xl text-white mb-2 leading-tight">
          {item?.toUpperCase()} TARGET<br />SECURED
        </div>
        <div className="text-xs text-white/40 leading-relaxed mb-7">
          Foundations baseline secured for today. Discipline maintained.
        </div>
        <div className="w-12 h-px mx-auto mb-7" style={{ background: "linear-gradient(90deg, transparent, #00f2ff, transparent)" }} />
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-xl bg-neon text-black font-display text-sm tracking-[0.2em] hover:opacity-90 active:scale-95 transition-all"
        >
          ACKNOWLEDGE
        </button>
      </div>
    </div>
  );
}

// ─── Overview Grid (quick-adjust, 4 main items) ───────────────────────────────

function OverviewGrid({ dayData, onAdjust }: {
  dayData: DayData;
  onAdjust: (key: FoodKey, delta: 1 | -1) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] tracking-[0.3em] text-white/40">TODAY'S PROTOCOL</div>
        <div className="text-[10px] tracking-[0.3em] text-white/25">QUICK ADJUST</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {QUICK_ITEMS.map(({ key, label, sub, Icon }) => {
          const count = dayData.counts[key];
          const target = TARGETS[key];
          const atTarget = target !== undefined && count >= target;
          return (
            <div
              key={key}
              className={`rounded-2xl border p-4 transition-colors ${atTarget ? "border-neon/30 bg-neon/5" : "border-hairline bg-panel"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <Icon className={`w-4 h-4 ${atTarget ? "text-neon" : "text-neon/70"}`} />
                <span className={`font-display text-2xl font-mono-tab ${atTarget ? "text-neon" : "text-white"}`}>{count}</span>
              </div>
              <div className="font-display text-sm mb-0.5">{label}</div>
              <div className="text-[10px] tracking-[0.15em] text-white/40 mb-3 uppercase">{sub}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => onAdjust(key, -1)}
                  disabled={count === 0}
                  className="flex-1 h-7 rounded-lg bg-white/5 border border-hairline flex items-center justify-center hover:bg-white/10 active:scale-95 disabled:opacity-30 transition-all"
                >
                  <Minus className="w-3 h-3 text-white/60" />
                </button>
                <button
                  onClick={() => onAdjust(key, 1)}
                  className="flex-1 h-7 rounded-lg bg-neon/10 border border-neon/20 flex items-center justify-center hover:bg-neon/20 active:scale-95 transition-all"
                >
                  <Plus className="w-3 h-3 text-neon" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Log Tab ──────────────────────────────────────────────────────────────────

function LogTab({ activeDay, setActiveDay, dayData, onOpenModal, onAdjust }: {
  activeDay: number;
  setActiveDay: (n: number) => void;
  dayData: DayData;
  onOpenModal: () => void;
  onAdjust: (key: FoodKey, delta: 1 | -1) => void;
}) {
  const totalLogged = Object.values(dayData.counts).reduce((s, v) => s + v, 0);
  return (
    <div className="px-6 space-y-8 animate-in fade-in duration-300">
      <div>
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-white/40">FEBRUARY 2025</div>
            <div className="font-display text-xl mt-1">This Week</div>
          </div>
          <div className="text-[10px] tracking-[0.3em] text-neon">WEEK 08</div>
        </div>
        <div className="flex gap-2 overflow-x-auto -mx-6 px-6 scrollbar-none">
          {DAYS.map((d, i) => {
            const active = i === activeDay;
            const hasData = Object.values(INITIAL_DAYS[i].counts).some((v) => v > 0);
            return (
              <button
                key={d.n}
                onClick={() => setActiveDay(i)}
                className={`flex-shrink-0 w-16 py-3 rounded-2xl border transition-all ${active ? "border-neon bg-neon/10 shadow-neon" : "border-hairline bg-panel"}`}
              >
                <div className={`text-[9px] tracking-[0.2em] ${active ? "text-neon" : "text-white/40"}`}>{d.d}</div>
                <div className={`font-display text-2xl mt-1 font-mono-tab ${active ? "text-white" : "text-white/70"}`}>{d.n}</div>
                {!active && hasData && (
                  <div className="w-1 h-1 rounded-full bg-neon/60 mx-auto mt-1.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={onOpenModal}
        className="w-full rounded-3xl bg-panel border border-hairline p-6 text-left group hover:border-neon/40 transition-all"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-white/40">PRIMARY ACTION</div>
            <div className="font-display text-xl mt-2">LOG NUTRITIONAL FUEL</div>
            <div className="text-xs text-white/40 mt-1">
              {totalLogged === 0 ? "No entries yet · tap to start" : `${totalLogged} items logged today`}
            </div>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-neon flex items-center justify-center shadow-neon group-hover:scale-105 transition-transform">
            <Plus className="w-7 h-7 text-black" strokeWidth={2.5} />
          </div>
        </div>
      </button>

      <OverviewGrid dayData={dayData} onAdjust={onAdjust} />
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({
  dayData,
  discipline,
  streak,
  onOpenStreakSettings,
}: {
  dayData: DayData;
  discipline: number;
  streak: StreakState;
  onOpenStreakSettings: () => void;
}) {
  const { counts, macros } = dayData;
  const totalItems = Object.values(counts).reduce((s, v) => s + v, 0);

  return (
    <div className="px-6 space-y-8 animate-in fade-in duration-300">
      <div>
        <div className="text-[10px] tracking-[0.3em] text-white/40">COMPLIANCE OVERVIEW</div>
        <div className="font-display text-2xl mt-1">Today's Protocol</div>
      </div>

      <StreakWidgetCard streak={streak} onOpenSettings={onOpenStreakSettings} />

      <div className="grid grid-cols-3 gap-3">
        <Metric label="Logged" value={totalItems} sub="ITEMS" />
        <Metric label="Discipline" value={discipline} sub="%" highlight />
        <Metric label="Window" value={13} sub="HRS" />
      </div>

      <div className="rounded-3xl bg-panel border border-hairline p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="text-[10px] tracking-[0.3em] text-white/40">MACRO ANALYSIS</div>
          <div className="text-[10px] tracking-[0.3em] text-neon">LIVE</div>
        </div>
        <MacroDonut macros={macros} />
      </div>

      <div className="rounded-3xl bg-panel border border-hairline p-6 space-y-5">
        <div className="text-[10px] tracking-[0.3em] text-white/40">DAILY TARGETS</div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Egg className="w-4 h-4 text-neon" />
              <span className="text-sm">Eggs</span>
            </div>
            <NumberDisplay value={counts.eggs} target={TARGETS.eggs!} />
          </div>
          <ProgressBar value={counts.eggs} target={TARGETS.eggs!} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Wheat className="w-4 h-4 text-neon" />
              <span className="text-sm">Rice Bowls</span>
            </div>
            <NumberDisplay value={counts.rice} target={TARGETS.rice!} />
          </div>
          <ProgressBar value={counts.rice} target={TARGETS.rice!} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-neon" />
              <span className="text-sm">Protein Shakes</span>
            </div>
            <NumberDisplay value={counts.shake} target={TARGETS.shake!} />
          </div>
          <ProgressBar value={counts.shake} target={TARGETS.shake!} />
        </div>
      </div>
    </div>
  );
}

// ─── Timing Tab ───────────────────────────────────────────────────────────────

function TimingTab({ timeline }: { timeline: TimelineEntry[] }) {
  const [activeNode, setActiveNode] = useState<number | null>(null);

  if (timeline.length === 0) {
    return (
      <div className="px-6 space-y-8 animate-in fade-in duration-300">
        <div>
          <div className="text-[10px] tracking-[0.3em] text-neon">TEMPORAL MASTERY</div>
          <div className="font-display text-2xl mt-2">Circadian Intake Patterns</div>
          <div className="text-xs text-white/40 mt-1">24-hour cycle · focused window 08:00 → 21:00</div>
        </div>
        <div className="rounded-3xl bg-panel border border-hairline p-10 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-full border border-hairline flex items-center justify-center mb-5">
            <Clock className="w-6 h-6 text-white/20" />
          </div>
          <div className="text-[10px] tracking-[0.35em] text-white/30 mb-2">NO ENTRIES YET</div>
          <div className="font-display text-sm text-white/40 leading-relaxed">
            Log your first fuel item to<br />build today's timeline.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 space-y-8 animate-in fade-in duration-300">
      <div>
        <div className="text-[10px] tracking-[0.3em] text-neon">TEMPORAL MASTERY</div>
        <div className="font-display text-2xl mt-2">Circadian Intake Patterns</div>
        <div className="text-xs text-white/40 mt-1">24-hour cycle · focused window 08:00 → 21:00</div>
      </div>
      <div className="rounded-3xl bg-panel border border-hairline p-6">
        <div className="relative pl-10">
          <div
            className="absolute left-3 top-2 bottom-2 w-px"
            style={{
              backgroundImage: "linear-gradient(to bottom, rgba(255,255,255,0.15) 50%, transparent 50%)",
              backgroundSize: "1px 8px",
            }}
          />
          <div className="space-y-6">
            {timeline.map((node, i) => {
              const active = i === activeNode;
              return (
                <button key={`${node.time}-${i}`} onClick={() => setActiveNode(active ? null : i)} className="block w-full text-left group">
                  <div className="relative">
                    <div className={`absolute -left-[30px] top-1.5 w-3 h-3 rounded-full transition-all ${active ? "bg-neon glow-dot scale-125" : "bg-white/20"}`} />
                    {active && <div className="absolute -left-[34px] top-[2px] w-5 h-5 rounded-full border border-neon/40 animate-ping" />}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={`font-display text-lg font-mono-tab ${active ? "text-neon" : "text-white"}`}>{node.time}</div>
                        <div className="text-[10px] tracking-[0.25em] text-white/40 uppercase mt-0.5">{node.label}</div>
                      </div>
                    </div>
                    {active && (
                      <div className="mt-3 rounded-xl bg-app border border-hairline p-3 space-y-1">
                        {node.items.map((it, j) => (
                          <div key={j} className="flex items-center gap-2 text-xs text-white/70">
                            <div className="w-1 h-1 rounded-full bg-neon" />
                            {it}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-neon/40 bg-neon/5 px-5 py-4 flex items-center justify-between">
        <div>
          <div className="text-[9px] tracking-[0.3em] text-neon">PROTOCOL STATUS</div>
          <div className="font-display text-sm mt-1">CONSISTENT 13-HOUR</div>
          <div className="text-[10px] tracking-[0.25em] text-white/60 mt-0.5">NUTRITIONAL WINDOW</div>
        </div>
        <div className="w-10 h-10 rounded-full border border-neon flex items-center justify-center shadow-neon">
          <Clock className="w-5 h-5 text-neon" />
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function FuelApp() {
  const [tab, setTab] = useState<TabId>("log");
  const [activeDay, setActiveDay] = useState(0);
  const [allDays, setAllDays] = useState<DayData[]>(INITIAL_DAYS);
  const [showModal, setShowModal] = useState(false);
  const [goalItem, setGoalItem] = useState<string | null>(null);

  // Streak / gamification state
  const [streak, setStreak] = useState<StreakState>(DEFAULT_STREAK_STATE);
  const [streakHydrated, setStreakHydrated] = useState(false);
  const [showStreakSettings, setShowStreakSettings] = useState(false);
  const [showStreakReward, setShowStreakReward] = useState(false);
  const [rewardGoal, setRewardGoal] = useState<StreakGoal | null>(null);
  const [claimedPopupGoal, setClaimedPopupGoal] = useState<StreakGoal | null>(null);

  const dayData = allDays[activeDay];

  const discipline = useMemo(() => {
    const { cheat, ...home } = dayData.counts;
    const homeTotal = Object.values(home).reduce((s, v) => s + v, 0);
    const all = homeTotal + cheat || 1;
    return Math.round((homeTotal / all) * 100);
  }, [dayData.counts]);

  // Hydrate streak state from localStorage on mount (client-only)
  useEffect(() => {
    setStreak(loadStreakState());
    setStreakHydrated(true);
  }, []);

  // Persist on every change, once hydrated
  useEffect(() => {
    if (!streakHydrated) return;
    saveStreakState(streak);
  }, [streak, streakHydrated]);

  // Detect goal reached → show the unlock-celebration modal once per goal
  useEffect(() => {
    if (!streakHydrated) return;
    if (streak.count >= streak.goal && !streak.celebratedGoals.includes(streak.goal)) {
      setRewardGoal(streak.goal);
      setShowStreakReward(true);
    }
  }, [streak, streakHydrated]);

  // "Bekijk beloning" in the celebration modal → dismiss it and jump to the Rewards tab
  const viewRewardFromCelebration = () => {
    setShowStreakReward(false);
    setStreak((prev) =>
      prev.celebratedGoals.includes(prev.goal)
        ? prev
        : { ...prev, celebratedGoals: [...prev.celebratedGoals, prev.goal] }
    );
    setTab("rewards");
  };

  const changeStreakGoal = (goal: StreakGoal) => {
    setStreak((prev) => ({ ...prev, goal }));
  };

  // Explicit claim from the Rewards page — only valid once unlocked
  const claimReward = (goal: StreakGoal) => {
    if (streak.count < goal || streak.claimedGoals.includes(goal)) return;
    setStreak((prev) => ({ ...prev, claimedGoals: [...prev.claimedGoals, goal] }));
    setClaimedPopupGoal(goal);
  };

  const logItem = (key: FoodKey) => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const food = FOOD_MAP.get(key)!;
    const timeLabel = getTimeLabel(now.getHours());
    const prevCount = dayData.counts[key];
    const target = TARGETS[key];

    const prevVitaminItems = VITAMIN_KEYS.reduce((s, k) => s + dayData.counts[k], 0);
    const willHitVitamin = VITAMIN_KEYS.includes(key) && prevVitaminItems + 1 === VITAMIN_THRESHOLD;

    setAllDays((days) => {
      const updated = [...days];
      const d = { ...updated[activeDay] };
      d.counts = { ...d.counts, [key]: d.counts[key] + 1 };
      d.macros = {
        protein:  d.macros.protein  + (food.impact.protein  ?? 0),
        carbs:    d.macros.carbs    + (food.impact.carbs    ?? 0),
        fats:     d.macros.fats     + (food.impact.fats     ?? 0),
        vitamins: d.macros.vitamins + (food.impact.vitamins ?? 0),
      };
      d.timeline = [
        ...d.timeline,
        { time: timeStr, label: timeLabel, items: [food.timelineLabel] },
      ].sort((a, b) => a.time.localeCompare(b.time));
      updated[activeDay] = d;
      return updated;
    });

    // Any logged item extends today's streak (once per real calendar day)
    setStreak((prev) => registerStreakLog(prev));

    setShowModal(false);

    if (target !== undefined && prevCount + 1 === target) {
      setTimeout(() => setGoalItem(food.label), 420);
    }

    if (willHitVitamin) {
      setTimeout(() => {
        toast.success("Circadian micronutrient target reached! 🍏", {
          description: "Vitamin protocol complete for today.",
          style: {
            background: "#0a0d12",
            border: "1px solid rgba(16,185,129,0.5)",
            color: "#10b981",
          },
        });
      }, 350);
    }

    toast.success(`${food.label} logged to protocol`, {
      description: `${timeStr} · ${DAYS[activeDay].d} ${DAYS[activeDay].n} FEB`,
      style: {
        background: "#0a0d12",
        border: "1px solid rgba(0,242,255,0.35)",
        color: "#00f2ff",
      },
    });
  };

  const adjustItem = (key: FoodKey, delta: 1 | -1) => {
    setAllDays((days) => {
      const updated = [...days];
      const d = { ...updated[activeDay] };
      d.counts = { ...d.counts, [key]: Math.max(0, d.counts[key] + delta) };
      updated[activeDay] = d;
      return updated;
    });
  };

  return (
    <div className="min-h-screen w-full bg-app flex justify-center">
      <div className="relative w-full max-w-md h-screen bg-app overflow-hidden flex flex-col">

        <header className="flex-shrink-0 px-6 pt-10 pb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full border border-neon flex items-center justify-center shadow-neon">
              <Flame className="w-4 h-4 text-neon" />
            </div>
            <div>
              <div className="font-display text-base tracking-tight leading-none">THE FUEL</div>
              <div className="text-[9px] tracking-[0.3em] text-white/40 mt-1">PROTOCOL v1.0</div>
            </div>
          </div>
          <button
            onClick={() => setShowStreakSettings((v) => !v)}
            className="text-right flex items-center gap-2 group"
          >
            <div>
              <div className="text-[9px] tracking-[0.3em] text-white/40 flex items-center gap-1 justify-end">
                STREAK
                <Settings className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
              </div>
              <div className="font-display text-sm font-mono-tab" style={{ color: STREAK_COLOR }}>
                {streak.count} DAYS
              </div>
            </div>
            <Flame className="w-4 h-4" style={{ color: STREAK_COLOR }} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto pb-24 scrollbar-none">
          {tab === "log" && (
            <LogTab
              activeDay={activeDay}
              setActiveDay={setActiveDay}
              dayData={dayData}
              onOpenModal={() => setShowModal(true)}
              onAdjust={adjustItem}
            />
          )}
          {tab === "dashboard" && (
            <DashboardTab
              dayData={dayData}
              discipline={discipline}
              streak={streak}
              onOpenStreakSettings={() => setShowStreakSettings(true)}
            />
          )}
          {tab === "timing" && <TimingTab key={activeDay} timeline={dayData.timeline} />}
          {tab === "rewards" && <RewardsTab streak={streak} onClaim={claimReward} />}
        </div>

        <nav className="absolute bottom-0 left-0 right-0 z-50 bg-[#05070a]/90 backdrop-blur-md border-t border-[#1e293b] px-4 pb-5 pt-3">
          <div className="bg-panel-elevated/90 backdrop-blur border border-hairline rounded-2xl flex items-center justify-around p-2">
            <TabButton id="log" label="Log Fuel" active={tab === "log"} onClick={setTab} Icon={Plus} />
            <TabButton id="dashboard" label="Dashboard" active={tab === "dashboard"} onClick={setTab} Icon={LayoutDashboard} />
            <TabButton id="timing" label="Timeline" active={tab === "timing"} onClick={setTab} Icon={Clock} />
            <TabButton id="rewards" label="Rewards" active={tab === "rewards"} onClick={setTab} Icon={Trophy} />
          </div>
        </nav>

        <LogModal
          visible={showModal}
          onClose={() => setShowModal(false)}
          onLog={logItem}
          dayData={dayData}
        />
        <GoalOverlay item={goalItem} onClose={() => setGoalItem(null)} />

        <StreakGoalPopover
          visible={showStreakSettings}
          currentGoal={streak.goal}
          onSelect={changeStreakGoal}
          onClose={() => setShowStreakSettings(false)}
        />
        <StreakRewardModal
          goal={rewardGoal}
          visible={showStreakReward}
          onViewReward={viewRewardFromCelebration}
        />
        <ClaimConfirmationModal
          goal={claimedPopupGoal}
          visible={claimedPopupGoal !== null}
          onClose={() => setClaimedPopupGoal(null)}
        />
      </div>
    </div>
  );
}