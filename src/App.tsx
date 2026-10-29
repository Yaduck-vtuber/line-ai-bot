import React, { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  Calendar,
  Send,
  Sparkles,
  Upload,
  Check,
  X,
  EyeOff,
  Clock,
  Image as ImageIcon,
  Link2,
  ShieldAlert,
  KeyRound,
  AlertTriangle,
  Wand2,
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  Share2,
  RefreshCw,
  MessageSquareOff,
  MessageSquare,
  Zap,
  Trash2,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Move,
  Minus,
} from 'lucide-react';
import { NonoStage3D, PastelAuraStar, PanelThemePalette } from './components/NonoStage3D';
import {
  AIModelId,
  BufferPlatform,
  BufferPostConfig,
  MediaAttachment,
  NonoIdleAction,
  NonoNotebookData,
  RecommendedTimeSlot,
  UserBehaviorContext,
} from './types';

declare global {
  interface Window {
    nonoDesktop?: {
      isElectron?: boolean;
      moveBy: (dx: number, dy: number) => void;
      resizeBy: (dw: number, dh: number) => void;
      setWindowSize: (width: number, height: number) => void;
      minimize: () => void;
      sendBehind?: () => void;
      summonToFront?: () => void;
      getAlwaysOnTop?: () => Promise<boolean>;
      toggleAlwaysOnTop: () => Promise<boolean>;
      onAlwaysOnTopChanged?: (callback: (val: boolean) => void) => () => void;
      close: () => void;
    };
  }
}

interface ProgressVersionEntry {
  id: string;
  versionTag: string;
  title: string;
  content: string;
  updatedAt: string;
}

interface ProjectRecord {
  id: string;
  name: string;
  folderPath: string;
  category: string;
  lastScannedAt: string;
  themes: ProgressVersionEntry[];
}

interface NonoDomainAgent {
  id: 'social' | 'life' | 'planner' | 'inbox' | 'replier' | 'vision';
  name: string;
  badge: string;
  domain: string;
  desc: string;
  status: 'active' | 'shared_staff_slot' | 'reserved_slot';
  sharedManagers?: string[];
  connectedAppsHint: string;
  furPresetColor: string;
  themeId: string;
  defaultTab: ActiveWindowId;
}

interface CouncilChatTurn {
  agentId: string;
  agentName: string;
  domain: string;
  color: string;
  message: string;
}

const MAX_PROGRESS_VERSIONS = 20;
const PROGRESS_STORAGE_KEY = 'nono_progress_versions_v1';

const NONO_DOMAIN_AGENTS: NonoDomainAgent[] = [
  {
    id: 'social',
    name: '📣 社群發文總管 Nono',
    badge: 'ACTIVE · 目前主力領域',
    domain: '一手包辦社群發文的所有事項（多專案進度、故事潤飾、多平台排版、排程發佈）',
    desc: '目前已完整啟用！可自動抓各專案進度、做主題故事前後潤飾、同步 Buffer 資料並排程，也能與訊息 Nono 共同調度回信員工。',
    status: 'active',
    connectedAppsHint: 'Buffer / Threads / X / IG / FB / Git / 任意 Webhook 軟體',
    furPresetColor: '#ff1e7a',
    themeId: 'neon_berry_cyan',
    defaultTab: 'notebook',
  },
  {
    id: 'replier',
    name: '✉️ 智慧回信共同員工 Nono',
    badge: 'SHARED STAFF · 雙部門共同員工槽',
    domain: '隸屬【社群發文 Nono ＋ 社交訊息整合 Nono】共同員工 · 自動代回訊息與信件',
    desc: '未來模組預留槽：當妳在訊息整合或社群看到想回的訊息，只要告訴它回覆意圖，就會自動幫妳回信給對方。',
    status: 'shared_staff_slot',
    sharedManagers: ['📣 社群發文總管 Nono', '📬 社交訊息整合 Nono'],
    connectedAppsHint: 'Gmail / LINE / Discord / IG / Threads / 各通訊軟體 API',
    furPresetColor: '#fbbf24',
    themeId: 'neon_turquoise',
    defaultTab: 'council',
  },
  {
    id: 'inbox',
    name: '📬 社交訊息整合 Nono',
    badge: 'SLOT · 未來擴充預留',
    domain: '統整 Gmail、LINE、SNS 等所有社交軟體來訊（免逐一開軟體）',
    desc: '未來模組預留槽：幫妳把散落在各個軟體的重要訊息集中整理，並將妳想回的內容交給「智慧回信共同員工 Nono」發送。',
    status: 'reserved_slot',
    connectedAppsHint: 'Gmail / LINE / Messenger / X / Discord / 通用 IMAP 與 Webhook',
    furPresetColor: '#38bdf8',
    themeId: 'neon_turquoise',
    defaultTab: 'council',
  },
  {
    id: 'planner',
    name: '🗓️ 全日時程管理 Nono',
    badge: 'SLOT · 未來擴充預留',
    domain: '依照整天想做的事與預定行程，動態排定一整天的時間表',
    desc: '未來模組預留槽：根據妳每天想完成的創作、休息與預定行程，自動規劃最舒適的一日時間軸，並與社群排程時段互相同步。',
    status: 'reserved_slot',
    connectedAppsHint: 'Google Calendar / Notion / 本機行事曆 / 任意待辦軟體',
    furPresetColor: '#34d399',
    themeId: 'neon_lime',
    defaultTab: 'council',
  },
  {
    id: 'life',
    name: '🥗 日常生活管家 Nono',
    badge: 'SLOT · 未來擴充預留',
    domain: '飲食與熱量守門員、運動陪伴、語言學習等日常健康習慣',
    desc: '未來模組預留槽：負責每日飲食熱量估算與把關、運動計時陪伴、以及日常外語單字與對話練習。',
    status: 'reserved_slot',
    connectedAppsHint: '健康紀錄 / 語音練習 / 計時器 / 任意生活工具',
    furPresetColor: '#a3e635',
    themeId: 'neon_lime',
    defaultTab: 'council',
  },
  {
    id: 'vision',
    name: '👁️ 螢幕覆蓋視覺助理 Nono',
    badge: 'SLOT · Screen Overlay Vision AI',
    domain: '操作 AE、Blender 等任何軟體遇疑問時，從網路找資料並直接在螢幕指出點哪邊',
    desc: '未來模組預留槽（Screen Overlay Vision AI）：即時讀取當前操作的軟體畫面並聯網查解法，直接在透明覆蓋層標示該點擊的按鈕位置。',
    status: 'reserved_slot',
    connectedAppsHint: 'After Effects / Blender / Premiere / 桌面上任何開啟中的軟體視窗',
    furPresetColor: '#b845ff',
    themeId: 'neon_violet',
    defaultTab: 'council',
  },
];

// ==================== 專屬領域 Nono 高質感向量插畫圖卡（以圖片為核心，保持首頁乾淨視覺） ====================
interface NonoCardGraphicProps {
  domainId: 'social' | 'replier' | 'inbox' | 'planner' | 'life' | 'vision';
  color: string;
  accentSecondary?: string;
  compact?: boolean;
}

const NonoCardGraphic: React.FC<NonoCardGraphicProps> = ({ domainId, color, compact }) => {
  const gradId = `ng-${domainId}-${compact ? 'c' : 'f'}`;
  const auraId = `na-${domainId}-${compact ? 'c' : 'f'}`;

  const renderAccessory = () => {
    switch (domainId) {
      case 'social':
        return (
          <g transform="translate(136, 16)">
            {/* Sparkle star 1 */}
            <path d="M-40,8 Q-32,8 -32,0 Q-32,8 -24,8 Q-32,8 -32,16 Q-32,8 -40,8 Z" fill="#00f5d4" opacity="0.9" />
            {/* Sparkle star 2 */}
            <path d="M20,-10 Q26,-10 26,-16 Q26,-10 32,-10 Q26,-10 26,-4 Q26,-10 20,-10 Z" fill="#ffe600" opacity="0.9" />
            {/* Megaphone body */}
            <path d="M0,18 L18,8 L18,28 L0,18 Z" fill="#00f5d4" stroke="#ffffff" strokeWidth="1.2" />
            <path d="M-8,14 L0,14 L0,22 L-8,22 Z" fill="#ff1e7a" />
            <circle cx="18" cy="18" r="4" fill="#ffffff" />
            {/* Sound waves */}
            <path d="M24,12 A8,8 0 0,1 24,24" fill="none" stroke="#00f5d4" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M28,8 A14,14 0 0,1 28,28" fill="none" stroke="#ffe600" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        );
      case 'replier':
        return (
          <g transform="translate(132, 22)">
            {/* Envelope body */}
            <rect x="-14" y="0" width="28" height="18" rx="3" fill="#ffffff" stroke="#fbbf24" strokeWidth="1.5" />
            <path d="M-14,0 L0,10 L14,0" fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeLinejoin="round" />
            {/* Little wings */}
            <path d="M-14,6 C-24,2 -26,14 -14,14" fill="#fde68a" opacity="0.85" />
            <path d="M14,6 C24,2 26,14 14,14" fill="#fde68a" opacity="0.85" />
            <circle cx="0" cy="-6" r="2.5" fill="#fbbf24" />
          </g>
        );
      case 'inbox':
        return (
          <g transform="translate(132, 18)">
            {/* Back chat bubble */}
            <rect x="-18" y="-4" width="22" height="15" rx="5" fill="#0284c7" opacity="0.8" />
            {/* Front chat bubble */}
            <rect x="-6" y="6" width="24" height="16" rx="5" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.2" />
            {/* Dots inside bubble */}
            <circle cx="-1" cy="14" r="1.5" fill="#ffffff" />
            <circle cx="5" cy="14" r="1.5" fill="#ffffff" />
            <circle cx="11" cy="14" r="1.5" fill="#ffffff" />
          </g>
        );
      case 'planner':
        return (
          <g transform="translate(132, 20)">
            {/* Clock ring */}
            <circle cx="0" cy="8" r="14" fill="rgba(168,85,247,0.25)" stroke="#c084fc" strokeWidth="1.8" />
            {/* Clock hands */}
            <line x1="0" y1="8" x2="0" y2="0" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="0" y1="8" x2="6" y2="8" stroke="#f472b6" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="0" cy="8" r="2" fill="#ffffff" />
            {/* Orbit dots */}
            <circle cx="-16" cy="-2" r="1.5" fill="#e879f9" />
            <circle cx="16" cy="18" r="1.5" fill="#e879f9" />
          </g>
        );
      case 'life':
        return (
          <g transform="translate(132, 14)">
            {/* Sprout on head */}
            <path d="M-8,-2 C-8,-14 0,-14 0,-2" fill="#4ade80" />
            <path d="M0,-2 C0,-16 8,-12 4,-2" fill="#22c55e" />
            {/* Pulse Heart */}
            <path d="M12,12 C12,8 16,6 18,8 C20,6 24,8 24,12 C24,16 18,20 18,20 C18,20 12,16 12,12 Z" fill="#ef4444" />
          </g>
        );
      case 'vision':
        return (
          <g transform="translate(100, 54)">
            {/* AR Visor band across eyes */}
            <rect x="-34" y="-8" width="68" height="15" rx="7.5" fill="rgba(236,72,153,0.3)" stroke="#f43f5e" strokeWidth="1.5" />
            {/* HUD reticle and line */}
            <line x1="-28" y1="0" x2="-18" y2="0" stroke="#00f5d4" strokeWidth="1.5" />
            <line x1="18" y1="0" x2="28" y2="0" stroke="#00f5d4" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="4.5" fill="none" stroke="#00f5d4" strokeWidth="1.2" />
            <circle cx="0" cy="0" r="1.5" fill="#00f5d4" />
          </g>
        );
      default:
        return null;
    }
  };

  return (
    <svg viewBox="0 0 200 110" className="w-full h-full select-none" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id={auraId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="60%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={gradId} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="25%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </radialGradient>
        <filter id={`shadow-${gradId}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor={color} floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Ambient glowing backdrop */}
      <ellipse cx="100" cy="58" rx="85" ry="45" fill={`url(#${auraId})`} />

      {/* Ground soft shadow */}
      <ellipse cx="100" cy="96" rx="52" ry="7" fill="rgba(0,0,0,0.35)" />

      {/* Organic Nono 3D Jelly Mochi Body */}
      <g filter={`url(#shadow-${gradId})`}>
        <path
          d="M 64,88 C 46,88 44,58 54,42 C 64,26 84,20 100,20 C 116,20 136,26 146,42 C 156,58 154,88 136,88 C 122,88 114,86 100,86 C 86,86 78,88 64,88 Z"
          fill={`url(#${gradId})`}
        />
        {/* Top Gloss Highlight */}
        <ellipse cx="86" cy="34" rx="16" ry="7" fill="#ffffff" opacity="0.35" transform="rotate(-18 86 34)" />
      </g>

      {/* Facial Features (Adorable Nono Eyes & Cheeks) */}
      <g>
        {/* Left Eye */}
        <circle cx="84" cy="54" r="5.2" fill="#18181b" />
        <circle cx="82.5" cy="52" r="2" fill="#ffffff" />
        <circle cx="86" cy="56" r="1" fill="#ffffff" />

        {/* Right Eye */}
        <circle cx="116" cy="54" r="5.2" fill="#18181b" />
        <circle cx="114.5" cy="52" r="2" fill="#ffffff" />
        <circle cx="118" cy="56" r="1" fill="#ffffff" />

        {/* Rosy Cheeks */}
        <ellipse cx="74" cy="62" rx="4.5" ry="2.5" fill="#ff4d8d" opacity="0.55" />
        <ellipse cx="126" cy="62" rx="4.5" ry="2.5" fill="#ff4d8d" opacity="0.55" />

        {/* Cute Smile */}
        <path d="M 96,62 Q 100,66 104,62" fill="none" stroke="#27272a" strokeWidth="1.8" strokeLinecap="round" />
      </g>

      {/* Domain-specific accessory */}
      {renderAccessory()}
    </svg>
  );
};

// 依照更新主題做前後故事化潤飾（絕不直接寫出 v0.1 / v0.2 等生硬版本號，而是引起觀眾好奇與共鳴）
function buildClientStoryFromThemes(
  rawProgressText: string,
  projectName = 'Nono 3D 數位夥伴'
): string {
  const cleanedLines = (rawProgressText || '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^[0-9.*•\-\s]+/, '')
        .replace(/\[[^\]]*\]\s*/g, '')
        .replace(/v?\d+\.\d+(\.\d+)?\s*[:：\-·]?\s*/gi, '')
        .replace(/^(feat|fix|chore|refactor|docs|style)\s*(\([^)]*\))?\s*[:：]\s*/i, '')
        .trim()
    )
    .filter(Boolean);

  if (cleanedLines.length === 0) {
    return `妳有沒有過那種盯著螢幕專注創作到一半，突然希望桌面上有個小生物能默默陪著自己的時刻？✨\n\n最近在打磨「${projectName}」的時候，比起塞滿複雜的功能，我更想讓它成為一個真正懂創作節奏的溫柔存在——在妳忙碌時安靜待在角落，需要整理靈感時又隨時都在。如果妳的電腦桌面上也住著一隻小夥伴，妳最希望它幫妳分擔什麼日常小事呢？ #Nono培育觀察日記 #獨立開發日常`;
  }

  const combinedText = cleanedLines.join('、');
  let hook = `每次在打磨「${projectName}」的細節時，我常在想：怎樣的互動才不會像冷冰冰的工具，而是真的像一隻住在電腦裡的貼心夥伴？✨`;
  let outro = `如果妳的桌面上也有這樣一隻會自己進化的小傢伙，妳最想先點開它的哪個功能試試看呢？歡迎留言跟我分享！ #Nono培育觀察日記 #創作日常`;

  if (/去背|透明|視窗|壓在下方|滾輪|縮放|桌面/.test(combinedText)) {
    hook = `不知道大家在電腦前工作時，會不會希望有個既能隨時陪伴、卻又絕對不擋住創作畫面的桌面小生物？🪄`;
    outro = `現在它既能乖乖窩在視窗後面陪我趕工，隨時召喚又立刻跳出來打招呼。妳平常工作時喜歡桌面熱鬧一點，還是極簡清爽呢？ #Nono培育觀察日記 #桌面寵物`;
  } else if (/毛髮|眼皮|閉眼|3D|軟糖|霓虹|配色|主題/.test(combinedText)) {
    hook = `看著一團原本只有基礎骨架的 3D 模型，慢慢長出蓬鬆軟糖般的毛髮、甚至學會閉上眼睛打瞌睡，真的會有種在養電子寵物的療癒感！🍬`;
    outro = `從眼神的光澤到身邊圍繞的迷幻撞色光暈，細節越調越捨不得關掉視窗了。大家覺得小夥伴眨眼跟打瞌睡哪個瞬間最討喜呢？ #Nono培育觀察日記 #3D創作`;
  } else if (/排程|Buffer|日期|時段|社群|跨領域|專案|Grok/.test(combinedText)) {
    hook = `身為創作者，最常遇到的煩惱就是「明明埋頭做了好多進度，卻總是沒空整理成有趣的故事跟大家分享」對吧？📅`;
    outro = `現在只要點一下小夥伴，它就能幫我把不同專案的靈感化成故事、還能跟其他領域的 Nono 互相討論出最佳排程時段。妳們平常最喜歡在幾點滑社群呢？ #Nono培育觀察日記 #IndieDev`;
  }

  const narrativeFragments = cleanedLines.slice(0, 3).map((item) =>
    item
      .replace(/完成|新增|支援|實作/g, '讓它學會了')
      .replace(/修正|解決/g, '順暢打通了')
      .replace(/面板/g, '專屬互動空間')
  );

  const bodyParagraph =
    narrativeFragments.length === 1
      ? `這陣子特別圍繞著「${narrativeFragments[0]}」這個主題深入打磨，看著原本生硬的操作變成自然流暢的陪伴體驗，整個創作工作台都活絡了起來。`
      : `最近一步步${narrativeFragments.slice(0, -1).join('，同時也')}，甚至還${narrativeFragments[narrativeFragments.length - 1]}，讓整個陪伴與創作的節奏變得更有默契了。`;

  return `${hook}\n\n${bodyParagraph}\n\n${outro}`;
}

const DEFAULT_PROGRESS_VERSIONS: ProgressVersionEntry[] = [
  {
    id: 'ver-01',
    versionTag: '主題 01',
    title: '軟糖毛髮與眨眼打瞌睡的生命感',
    content: '賦予 Nono 蓬鬆軟糖般的 3D 毛髮光澤與立體眼皮，讓它在待機時會自然眨眼與閉眼打瞌睡',
    updatedAt: '角色生命力',
  },
  {
    id: 'ver-02',
    versionTag: '主題 02',
    title: '迷幻霓虹撞色與貼心關心氣泡',
    content: '打造高對比迷幻霓虹撞色視覺，讓小夥伴身邊的星星與關心對話框能隨心情同步換色',
    updatedAt: '視覺氛圍',
  },
  {
    id: 'ver-03',
    versionTag: '主題 03',
    title: '創作靈感自動轉化與跨平台排程',
    content: '將日常開發點滴自動潤飾成各平台適配的故事貼文，並直通 Buffer 雲端排程佇列',
    updatedAt: '社群自動化',
  },
  {
    id: 'ver-04',
    versionTag: '主題 04',
    title: '完全去背融入桌面與一鍵喚出默契',
    content: '讓 Nono 完全去背融入電腦桌面、可退到視窗後方安靜陪伴，隨時按 Alt+N 或滾輪縮放互動',
    updatedAt: '桌面陪伴體驗',
  },
  {
    id: 'ver-05',
    versionTag: '主題 05',
    title: '點選 Nono 喚出專屬面板與跨領域協作',
    content: '先點選 Nono 再展開對應領域面板，支援跨專案自動抓進度與多隻 Nono 互相討論完成任務',
    updatedAt: '最新主題',
  },
];

const INITIAL_NOTEBOOK: NonoNotebookData = {
  actualProgressLog: `讓 Nono 完全去背融入電腦桌面、可退到視窗後方安靜陪伴，隨時按 Alt+N 或滾輪縮放互動\n先點選 Nono 再展開對應領域面板，支援跨專案自動抓進度與多隻 Nono 互相討論完成任務`,
  styleGuidelines: `- 依照更新主題做前後故事化潤飾（引起觀眾好奇的開場 ➔ 主題體驗故事 ➔ 互動提問收尾）
- 絕對不要直接寫出 v0.1、v0.2 等生硬版本號或工程條列
- 結尾固定加上 #Nono培育觀察日記`,
  useCustomStyleMimic: true,
  customSamplePosts: buildClientStoryFromThemes(
    '讓 Nono 完全去背融入電腦桌面、可退到視窗後方安靜陪伴，隨時按 Alt+N 或滾輪縮放互動'
  ),
};

const PLATFORM_META: Record<
  BufferPlatform,
  {
    label: string;
    limit: number;
    cjkCharLimit?: number;
    badge: string;
    maxHashtags?: number;
    ruleDesc: string;
  }
> = {
  threads: {
    label: 'Threads',
    limit: 500,
    badge: '@',
    ruleDesc: '上限 500 字 · 適合自然對話感',
  },
  x: {
    label: 'X (Twitter)',
    limit: 280,
    cjkCharLimit: 140,
    badge: '𝕏',
    ruleDesc: '加權上限 280 字元（約 140 中文字）· 宜精簡短句',
  },
  instagram: {
    label: 'Instagram',
    limit: 2200,
    badge: 'IG',
    maxHashtags: 5,
    ruleDesc: '上限 2200 字 · 最多 5 個 # 標籤 · 需附圖',
  },
  facebook: {
    label: 'Facebook',
    limit: 2000,
    badge: 'FB',
    ruleDesc: '上限 2000 字 · 適合完整段落日誌',
  },
};

const SLOT_CANDIDATE_POOL = [
  { label: '晨間通勤早鳥時段', hh: 8, mm: 30, reason: '早晨滑手機高觸及率' },
  { label: '午休用餐流量時段', hh: 12, mm: 30, reason: '午間休息穩定曝光與轉發' },
  { label: '午後茶敘放鬆時段', hh: 15, mm: 45, reason: '下午工作空檔瀏覽高峰' },
  { label: '傍晚下班通勤時段', hh: 18, mm: 20, reason: '通勤尖峰即時曝光高' },
  { label: '晚間黃金互動時段', hh: 20, mm: 30, reason: '創作者社群下班後活躍度最高' },
  { label: '深夜創作者共鳴時段', hh: 22, mm: 15, reason: '獨立開發者與夜貓族高互動率' },
  { label: '睡前滑手機高峰', hh: 23, mm: 10, reason: '睡前長文閱讀與收藏率高' },
];

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

function toLocalIsoString(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function getTodayYmd(): string {
  return toLocalIsoString(new Date()).slice(0, 10);
}

function addDaysToYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + deltaDays, 12, 0, 0);
  return toLocalIsoString(dt).slice(0, 10);
}

function formatYmdWithWeekday(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  const wk = WEEKDAY_NAMES[dt.getDay()] || '';
  const today = getTodayYmd();
  const tomorrow = addDaysToYmd(today, 1);
  const dayAfter = addDaysToYmd(today, 2);
  const prefix =
    ymd === today ? '今天 ' : ymd === tomorrow ? '明天 ' : ymd === dayAfter ? '後天 ' : '';
  return `${prefix}${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}(${wk})`;
}

function generateDynamicRecommendedSlots(
  refreshBatch = 0,
  targetDateYmd?: string
): RecommendedTimeSlot[] {
  const now = new Date();
  const chosenYmd = targetDateYmd || getTodayYmd();
  const [y, m, d] = chosenYmd.split('-').map(Number);
  const dayLabel = formatYmdWithWeekday(chosenYmd);

  const slotsForChosenDate: RecommendedTimeSlot[] = [];

  for (const item of SLOT_CANDIDATE_POOL) {
    const candidate = new Date(y, (m || 1) - 1, d || 1, item.hh, item.mm, 0, 0);
    // 若選的是今天，只推薦未來至少 5 分鐘後的時段；若選的是未來日期，全天時段皆可推薦
    if (candidate.getTime() > now.getTime() + 5 * 60 * 1000) {
      const hhStr = String(item.hh).padStart(2, '0');
      const mmStr = String(item.mm).padStart(2, '0');
      const timeString = `${hhStr}:${mmStr}`;
      slotsForChosenDate.push({
        id: `slot-${chosenYmd}-${hhStr}${mmStr}`,
        label: `${dayLabel} · ${item.label}`,
        timeString,
        dayPrefix: dayLabel,
        scheduledIso: `${chosenYmd}T${timeString}`,
        reason: item.reason,
      });
    }
  }

  // 如果今天已經很晚（例如超過 23:10），自動補一個今天 20 分鐘後的即時推薦時段 + 深夜時段
  if (slotsForChosenDate.length === 0) {
    const soon = new Date(now.getTime() + 25 * 60 * 1000);
    const soonIso = toLocalIsoString(soon);
    const soonTime = soonIso.slice(11, 16);
    slotsForChosenDate.push({
      id: `slot-${chosenYmd}-${soonTime.replace(':', '')}`,
      label: `${dayLabel} · 近期最佳空檔`,
      timeString: soonTime,
      dayPrefix: dayLabel,
      scheduledIso: `${chosenYmd}T${soonTime}`,
      reason: '距離現在約 25 分鐘後的快速排程時段',
    });
    for (const item of [
      { label: '晚間黃金互動時段', hh: 20, mm: 30, reason: '創作者社群下班後活躍度最高' },
      { label: '深夜創作者共鳴時段', hh: 22, mm: 15, reason: '獨立開發者與夜貓族高互動率' },
    ]) {
      const hhStr = String(item.hh).padStart(2, '0');
      const mmStr = String(item.mm).padStart(2, '0');
      slotsForChosenDate.push({
        id: `slot-${chosenYmd}-alt-${hhStr}${mmStr}`,
        label: `${dayLabel} · ${item.label}`,
        timeString: `${hhStr}:${mmStr}`,
        dayPrefix: dayLabel,
        scheduledIso: `${chosenYmd}T${hhStr}:${mmStr}`,
        reason: item.reason,
      });
    }
  }

  if (slotsForChosenDate.length <= 3) {
    return slotsForChosenDate;
  }

  const rotated: RecommendedTimeSlot[] = [];
  const startIdx = (refreshBatch * 2) % slotsForChosenDate.length;
  for (let i = 0; i < 3; i++) {
    rotated.push(slotsForChosenDate[(startIdx + i) % slotsForChosenDate.length]);
  }
  return rotated;
}

function getXWeightedLength(text: string): number {
  let weight = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    weight += code > 0xff ? 2 : 1;
  }
  return weight;
}

function countHashtags(text: string): number {
  const matches = text.match(/#[\p{L}\p{N}_]+/gu);
  return matches ? matches.length : 0;
}

function buildClientPlatformCopies(baseText: string): Record<BufferPlatform, string> {
  const raw = baseText.trim();
  const hashtags = raw.match(/#[\p{L}\p{N}_]+/gu) || ['#Nono培育觀察日記'];
  const bodyOnly = raw
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const igTags = hashtags.slice(0, 5);
  if (!igTags.includes('#Nono培育觀察日記') && igTags.length < 5) {
    igTags.unshift('#Nono培育觀察日記');
  }
  const instagram = `${bodyOnly.slice(0, 2000)}\n\n${igTags.slice(0, 5).join(' ')}`.trim();

  const threadsTags = hashtags.slice(0, 3);
  const maxThreadsLen = Math.max(50, 480 - threadsTags.join(' ').length);
  const threadsBody =
    bodyOnly.length > maxThreadsLen ? `${bodyOnly.slice(0, maxThreadsLen - 1)}…` : bodyOnly;
  const threads = `${threadsBody} ${threadsTags.join(' ')}`.trim();

  const xTags = hashtags.slice(0, 2);
  if (!xTags.includes('#Nono培育觀察日記')) {
    xTags[0] = '#Nono培育觀察日記';
  }
  const xTagStr = xTags.join(' ');
  const tagWeight = getXWeightedLength(xTagStr) + 2;
  const maxBodyWeight = Math.max(40, 272 - tagWeight);

  let xBody = bodyOnly
    .replace(/一步一步把細節調整到位，繼續往下推進。?/g, '持續推進開發細節！')
    .replace(/接著把 Buffer 排程預覽確認好，繼續推進度。?/g, '排程預覽也同步就緒。')
    .trim();

  if (getXWeightedLength(xBody) > maxBodyWeight) {
    let acc = '';
    let w = 0;
    for (const ch of xBody) {
      const cw = (ch.codePointAt(0) || 0) > 0xff ? 2 : 1;
      if (w + cw > maxBodyWeight - 2) {
        acc += '…';
        break;
      }
      acc += ch;
      w += cw;
    }
    xBody = acc;
  }
  const x = `${xBody} ${xTagStr}`.trim();

  const fbTags = hashtags.slice(0, 4);
  const facebook = `${bodyOnly.slice(0, 1900)}\n\n${fbTags.join(' ')}`.trim();

  return { threads, x, instagram, facebook };
}

function normalizeCloudMediaUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return '';

  const gdriveMatch =
    url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (gdriveMatch?.[1]) {
    return `https://lh3.googleusercontent.com/d/${gdriveMatch[1]}`;
  }

  if (url.includes('dropbox.com') && url.includes('dl=0')) {
    return url.replace('dl=0', 'raw=1');
  }

  if (
    !url.startsWith('http://') &&
    !url.startsWith('https://') &&
    !url.startsWith('data:') &&
    !url.startsWith('blob:')
  ) {
    url = `https://${url}`;
  }
  return url;
}

const IDLE_ACTION_POOL: {
  action: NonoIdleAction;
  label: string;
  tag: string;
}[] = [
  { action: 'breathing', label: '乖乖呼吸待機中', tag: '柔和' },
  { action: 'curious_tilt', label: '歪頭好奇觀察中', tag: '柔和' },
  { action: 'thinking_look', label: '流暢轉頭思考中', tag: '柔和' },
  { action: 'peeking', label: '探頭偷看螢幕中', tag: '柔和' },
  { action: 'happy_bounce', label: '開心軟糖彈跳中', tag: '動態' },
  { action: 'excited_spin', label: '轉圈抖毛撒嬌中', tag: '動態' },
];

const PANEL_THEME_PRESETS: PanelThemePalette[] = [
  {
    id: 'neon_berry_cyan',
    name: '毒莓霓虹青',
    sub: '霓虹洋紅 × 翡翠青綠',
    bgBase: '#08050d',
    panelBg: 'rgba(14, 8, 22, 0.95)',
    panelCard: 'rgba(25, 13, 38, 0.82)',
    border: '#ff1e7a',
    accent: '#ff1e7a',
    accentSecondary: '#00e5c3',
    highlightTagBg: '#ccff00',
    highlightTagText: '#0b0f04',
    textMain: '#faf5ff',
    textMuted: '#d8b4fe',
    glowRgba: 'rgba(255, 30, 122, 0.34)',
  },
  {
    id: 'neon_turquoise',
    name: '薄荷電光青',
    sub: '電光青綠 × 莓果紅紫',
    bgBase: '#050b0e',
    panelBg: 'rgba(8, 17, 22, 0.95)',
    panelCard: 'rgba(13, 29, 36, 0.82)',
    border: '#00e5c3',
    accent: '#00e5c3',
    accentSecondary: '#ff1e7a',
    highlightTagBg: '#fde047',
    highlightTagText: '#171203',
    textMain: '#ecfeff',
    textMuted: '#99f6e4',
    glowRgba: 'rgba(0, 229, 195, 0.32)',
  },
  {
    id: 'neon_lime',
    name: '螢光萊姆蘇打',
    sub: '深曜石黑 × 螢光萊姆',
    bgBase: '#080b06',
    panelBg: 'rgba(13, 18, 10, 0.95)',
    panelCard: 'rgba(22, 30, 16, 0.82)',
    border: '#bef264',
    accent: '#a3e635',
    accentSecondary: '#ff1e7a',
    highlightTagBg: '#00e5c3',
    highlightTagText: '#041714',
    textMain: '#f7fee7',
    textMuted: '#d9f99d',
    glowRgba: 'rgba(163, 230, 53, 0.3)',
  },
  {
    id: 'neon_violet',
    name: '幻彩星夜紫',
    sub: '星夜靛紫 × 冰晶亮青',
    bgBase: '#070610',
    panelBg: 'rgba(13, 11, 25, 0.95)',
    panelCard: 'rgba(23, 18, 43, 0.82)',
    border: '#8b5cf6',
    accent: '#8b5cf6',
    accentSecondary: '#38bdf8',
    highlightTagBg: '#f472b6',
    highlightTagText: '#1f0614',
    textMain: '#f5f3ff',
    textMuted: '#c4b5fd',
    glowRgba: 'rgba(139, 92, 246, 0.34)',
  },
  {
    id: 'neon_crimson',
    name: '緋紅玫瑰糖',
    sub: '曜石深紅 × 玫瑰薄荷',
    bgBase: '#0d0508',
    panelBg: 'rgba(21, 9, 14, 0.95)',
    panelCard: 'rgba(36, 14, 22, 0.82)',
    border: '#fb2c66',
    accent: '#fb2c66',
    accentSecondary: '#2dd4bf',
    highlightTagBg: '#fde047',
    highlightTagText: '#1c1404',
    textMain: '#fff1f2',
    textMuted: '#fda4af',
    glowRgba: 'rgba(251, 44, 102, 0.34)',
  },
  {
    id: 'neon_amber',
    name: '焦糖琥珀奶霜',
    sub: '琥珀焦糖 × 薄荷冰青',
    bgBase: '#0c0805',
    panelBg: 'rgba(20, 14, 9, 0.95)',
    panelCard: 'rgba(34, 23, 14, 0.82)',
    border: '#fb923c',
    accent: '#f97316',
    accentSecondary: '#00e5c3',
    highlightTagBg: '#fef08a',
    highlightTagText: '#1c1204',
    textMain: '#fffbeb',
    textMuted: '#fed7aa',
    glowRgba: 'rgba(249, 115, 22, 0.32)',
  },
];

const FUR_COLOR_PRESETS = [
  {
    color: '#ff1e7a',
    basePreview: '#831843',
    tipPreview: '#00e5c3',
    name: '毒莓薄荷軟糖',
    sub: '霓虹洋紅 × 翡翠青綠',
    linkedThemeId: 'neon_berry_cyan',
  },
  {
    color: '#b845ff',
    basePreview: '#7c3aed',
    tipPreview: '#ffa6dc',
    name: '櫻花電光麻糬',
    sub: '莓果紫 × 櫻花粉',
    linkedThemeId: 'neon_violet',
  },
  {
    color: '#38bdf8',
    basePreview: '#2563eb',
    tipPreview: '#a5f3fc',
    name: '蘇打冰晶藍',
    sub: '波子汽水 × 薄荷冰',
    linkedThemeId: 'neon_turquoise',
  },
  {
    color: '#34d399',
    basePreview: '#10b981',
    tipPreview: '#dcfce7',
    name: '抹茶奶霜軟糖',
    sub: '宇治抹茶 × 香草奶泡',
    linkedThemeId: 'neon_lime',
  },
  {
    color: '#ff5ca8',
    basePreview: '#ec4899',
    tipPreview: '#ffd6eb',
    name: '草莓蜜桃軟糖',
    sub: '甜莓粉 × 蜜桃奶霜',
    linkedThemeId: 'neon_crimson',
  },
  {
    color: '#fb923c',
    basePreview: '#f97316',
    tipPreview: '#fef08a',
    name: '焦糖布丁軟糖',
    sub: '琥珀焦糖 × 卡士達黃',
    linkedThemeId: 'neon_amber',
  },
];

const BEHAVIOR_DIALOGUE_MAP: Record<UserBehaviorContext, string[]> = {
  clicked_nono: [
    'Ave 伸個懶腰休息一下吧，螢幕看太久眼睛容易乾澀。\n\n肩膀放輕鬆深呼吸一下，等妳準備好隨時可以把進度寫進筆記本裡喔糖糖。',
    'Ave 手腕轉一轉放鬆一下，剛剛看妳專注調細節調了好一陣子。\n\n不用急著趕進度，我會在桌面角落乖乖陪著妳一起把作品慢慢磨好喔糖糖。',
    'Ave 水杯如果空了記得去裝點溫水，保持舒服的節奏慢慢做就好。\n\n今天不管推進多少進度都很棒，寫進筆記本後按一下就能轉成各平台貼文喔糖糖。',
    'Ave 眼睛眨一眨看向遠方休息十秒鐘吧，長時間盯著畫面很耗精神的。\n\n等一下如果上傳完貼文素材或排好 Buffer 時段，我也會在這個對話框第一時間跟妳說喔糖糖。',
  ],
  dragged_nono: [
    '這個桌面角落的視野很不錯，放在這裡剛好不會擋到 Ave 看畫面。\n\n我就在這個新位置乖乖待命，想看關心對話或檢查排程時隨時點我一下喔糖糖。',
    '換個位置透透氣也很棒，毛毛抖一抖感覺更有精神了。\n\nAve 繼續忙手邊的創作，我會在這裡安靜陪著妳一起推進度喔糖糖。',
  ],
  woke_up: [
    '揉揉眼睛醒過來了，剛剛在桌面角落偷偷打了個小瞌睡。\n\n精神已經充飽電了，Ave 要把今天的進度寫進筆記本還是先看看排程都可以喔糖糖。',
  ],
  startled_from_deep_sleep: ['咿！...不小心睡著了，Ave 妳還在嗎？'],
  edited_notebook: [
    '看到 Ave 更新了筆記本裡的紀錄，每一筆累積下來的進度都很紮實。\n\n等一下如果想看看整理成貼文的樣子，直接按生成我就會照著筆記本幫妳寫好喔糖糖。',
  ],
  summarized_chat: [
    '已經把今天的開發重點整理進 Nono 筆記本裡了。\n\nAve 可以巡一下筆記本內容，確認沒問題就可以直接轉成今天的 Buffer 貼文喔糖糖。',
  ],
  generated_post: [
    'Ave！貼文已經嚴格照著 Nono 筆記本寫好，而且各平台（含 X 精簡版與 IG 標籤）也都自動適配好了。\n\n已經幫妳切換到 Buffer 排程分頁，確認時段後就能直接送進排程佇列喔糖糖。',
  ],
  refined_post: [
    'Ave 交代的貼文細節已經幫妳微調好了，各平台的字數與標籤規則也一起重新適配過。\n\n看看現在預覽卡片上的語氣順不順眼，確認沒問題就可以直接送進排程佇列囉糖糖。',
  ],
  spawned_friend: [
    'Ave 換上新的雙層毛色跟面板配色看起來超搭，整個工作台的氛圍都煥然一新了。\n\n挑一個今天看得最順眼的撞色主題，讓我繼續在桌面上陪妳創作喔糖糖。',
  ],
};

type ActiveWindowId = 'notebook' | 'composer' | 'buffer' | 'council' | 'appearance' | null;

const INITIAL_BASE_COPY = buildClientStoryFromThemes(
  '讓 Nono 完全去背融入電腦桌面、可退到視窗後方安靜陪伴，隨時按 Alt+N 或滾輪縮放互動\n先點選 Nono 再展開對應領域面板，支援跨專案自動抓進度與多隻 Nono 互相討論完成任務',
  'Nono 3D 數位夥伴'
);

export function App() {
  // Desktop Care Bubble & Responsive Workbench states
  const [isNonoAwake, setIsNonoAwake] = useState<boolean>(true);
  const [isBubbleOpen, setIsBubbleOpen] = useState<boolean>(true);
  // GrokBot 分層架構：Level 1 首頁領域指揮大廳 ('hub') ➔ Level 2 社群發文專屬工作台 ('workbench')
  const [viewLayer, setViewLayer] = useState<'hub' | 'workbench'>('hub');
  const [isAppearanceDrawerOpen, setIsAppearanceDrawerOpen] = useState<boolean>(false);
  const [isNonoHubOpen, setIsNonoHubOpen] = useState<boolean>(false);
  const [activeWindow, setActiveWindow] = useState<ActiveWindowId>('notebook');
  const [isCompactPanel, setIsCompactPanel] = useState<boolean>(false);
  // 面板自訂寬度（支援點擊「窄版單邊 / 展開雙欄」或直接拖拉面板右邊界自由縮放！）
  const [customPanelWidth, setCustomPanelWidth] = useState<number | null>(null);
  const [isMouseNearTop, setIsMouseNearTop] = useState<boolean>(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState<boolean>(false);
  const lastOpenWindowRef = useRef<ActiveWindowId>('notebook');

  // 多領域 Nono 生態系與未來模組擴充槽狀態（目前主力完善：📣 社群發文總管 Nono）
  const [activeNonoAgentId, setActiveNonoAgentId] = useState<NonoDomainAgent['id']>('social');
  const activeDomainNono =
    NONO_DOMAIN_AGENTS.find((a) => a.id === activeNonoAgentId) || NONO_DOMAIN_AGENTS[0];
  const [councilCommandInput, setCouncilCommandInput] = useState<string>('');
  const [isRunningCouncil, setIsRunningCouncil] = useState<boolean>(false);
  const [councilMessages, setCouncilMessages] = useState<CouncilChatTurn[]>([
    {
      agentId: 'social-nono',
      agentName: '📣 社群發文總管 Nono（目前主力領域 · 已啟用）',
      domain: '一手包辦：專案進度掃描 · 主題故事潤飾 · 各平台排版 · Buffer 排程',
      color: '#ff1e7a',
      message:
        '目前社群發文的所有流程（抓各專案進度、做前後故事潤飾、排版預覽與 Buffer 排程）都由我一位總管獨立完成！同時我也預留好通用訊息匯流排，等未來其他領域的 Nono 完善後就能直接插拔合併。',
    },
    {
      agentId: 'replier-nono',
      agentName: '✉️ 智慧回信共同員工 Nono（雙部門共同員工預留槽）',
      domain: '隸屬【📣 社群發文 Nono ＋ 📬 社交訊息整合 Nono】共同員工',
      color: '#fbbf24',
      message:
        '我是「社群發文 Nono」與「社交訊息整合 Nono」的共同員工預留槽！未來當訊息整合 Nono 幫妳把 Gmail、LINE、SNS 訊息整理好，只要妳決定想回什麼，兩位主管就會派我直接幫妳回信給對方！',
    },
  ]);
  const [multiSkillSteps, setMultiSkillSteps] = useState<
    Array<{ title: string; detail: string }>
  >([]);
  const [isRunningMultiSkill, setIsRunningMultiSkill] = useState<boolean>(false);

  // 多專案自動抓進度狀態
  const [projectsList, setProjectsList] = useState<ProjectRecord[]>([]);
  const [activeProjectName, setActiveProjectName] = useState<string>('Nono 3D 數位夥伴');
  const [customProjectPathInput, setCustomProjectPathInput] = useState<string>('');
  const [customProjectNameInput, setCustomProjectNameInput] = useState<string>('');
  const [isScanningProject, setIsScanningProject] = useState<boolean>(false);

  const [selectedModel] = useState<AIModelId>('gemini-3-flash-preview');

  // Nono 3D Idle Action
  const [idleAction, setIdleAction] = useState<NonoIdleAction>('breathing');
  const [actionLabel, setActionLabel] = useState<string>('乖乖呼吸待機中');

  // Nono Desktop Care Speech Bubble
  const [nonoSpeech, setNonoSpeech] = useState<string>(
    'Ave 伸個懶腰休息一下吧，螢幕看太久眼睛容易乾澀。\n\n隨時點我一下就能從旁邊的功能選單切換「專案進度」、「貼文潤飾」、「Buffer 排程」或「多 Nono 協作」面板喔糖糖。'
  );
  const [careBadgeText, setCareBadgeText] = useState<string>('CARE · 貼心陪伴中');

  // Nono 3D Appearance, Unified Panel Theme & Transparent Desktop Mode
  const [furColor, setFurColor] = useState<string>('#ff1e7a');
  const [panelThemeId, setPanelThemeId] = useState<string>('neon_berry_cyan');
  const [syncPanelWithFur, setSyncPanelWithFur] = useState<boolean>(true);
  const [isTransparentDesktop, setIsTransparentDesktop] = useState<boolean>(true);
  const [customModelUrl, setCustomModelUrl] = useState<string | null>(null);
  const [customModelName, setCustomModelName] = useState<string | null>(null);
  const [modelScale, setModelScale] = useState<number>(() => {
    const saved = Number(localStorage.getItem('nono_model_scale'));
    return Number.isFinite(saved) && saved >= 0.45 && saved <= 2.2 ? saved : 1.0;
  });

  const activePanelTheme =
    PANEL_THEME_PRESETS.find((t) => t.id === panelThemeId) || PANEL_THEME_PRESETS[0];

  // Nono Notebook + 極輕量近期版本進度庫（純文字 JSON、自動限制最多 20 筆、佔用 < 2KB）
  const [notebook, setNotebook] = useState<NonoNotebookData>(INITIAL_NOTEBOOK);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [progressVersions, setProgressVersions] = useState<ProgressVersionEntry[]>(() => {
    try {
      const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed.map((item: ProgressVersionEntry, idx: number) => ({
            ...item,
            versionTag: item.versionTag?.replace(/^v0\.(\d+)$/i, '主題 0$1') || `主題 0${idx + 1}`,
          }));
          const existingIds = new Set(cleaned.map((item: ProgressVersionEntry) => item.id));
          const merged = [
            ...DEFAULT_PROGRESS_VERSIONS.filter((d) => !existingIds.has(d.id)),
            ...cleaned,
          ].slice(-MAX_PROGRESS_VERSIONS);
          return merged;
        }
      }
    } catch {
      // ignore parse error
    }
    return DEFAULT_PROGRESS_VERSIONS;
  });
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>(['ver-04', 'ver-05']);
  const [newVersionTag, setNewVersionTag] = useState<string>('');
  const [newVersionTitle, setNewVersionTitle] = useState<string>('');
  const [progressNotice, setProgressNotice] = useState<string | null>(null);

  // Date-First Scheduling & Recommended Time Slots (選好日期後才浮現該日期的推薦時段！)
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<string>(() =>
    addDaysToYmd(getTodayYmd(), 1)
  );
  const [hasPickedScheduleDate, setHasPickedScheduleDate] = useState<boolean>(false);
  const [slotRefreshCount, setSlotRefreshCount] = useState<number>(0);
  const [recommendedSlots, setRecommendedSlots] = useState<RecommendedTimeSlot[]>(() =>
    generateDynamicRecommendedSlots(0, addDaysToYmd(getTodayYmd(), 1))
  );
  const [lastSlotRefreshedAt, setLastSlotRefreshedAt] = useState<string>(() =>
    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  );

  // Buffer Post Config
  const [bufferConfig, setBufferConfig] = useState<BufferPostConfig>(() => {
    const tomorrowYmd = addDaysToYmd(getTodayYmd(), 1);
    const initialSlots = generateDynamicRecommendedSlots(0, tomorrowYmd);
    const firstSlot = initialSlots[0];
    return {
      content: INITIAL_BASE_COPY,
      platformContents: buildClientPlatformCopies(INITIAL_BASE_COPY),
      usePerPlatformCopy: true,
      platforms: ['threads', 'x'],
      scheduleMode: 'recommended_slot',
      scheduledTime: firstSlot.scheduledIso,
      selectedSlotLabel: `${firstSlot.label} ${firstSlot.timeString}`,
      hashtags: ['#Nono培育觀察日記', '#IndieDev', '#3DDev'],
      mediaAttachments: [],
      status: 'ready_to_schedule',
    };
  });

  const [previewPlatform, setPreviewPlatform] = useState<BufferPlatform>('threads');
  const [editingScope, setEditingScope] = useState<'master' | BufferPlatform>('master');
  const [refineInput, setRefineInput] = useState('');
  const [isRefiningPost, setIsRefiningPost] = useState(false);
  const [lastRefinedNotice, setLastRefinedNotice] = useState<string | null>(null);

  // Buffer Real Connection & Persistent Scheduled Queue State (記錄發送完整內容、那天、最近幾天與最後一篇排程時間)
  const [queuedPosts, setQueuedPosts] = useState<
    {
      id: string;
      text: string;
      platforms: BufferPlatform[];
      time: string;
      scheduledIso: string;
      modeLabel: string;
    }[]
  >(() => {
    try {
      const saved = localStorage.getItem('nono_scheduled_posts_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [isSyncingSchedule, setIsSyncingSchedule] = useState<boolean>(false);
  const [scheduleSyncNote, setScheduleSyncNote] = useState<string>('');

  const [cloudMediaUrlInput, setCloudMediaUrlInput] = useState('');
  const [cloudMediaType] = useState<'image' | 'video'>('image');
  const [bufferApiToken, setBufferApiToken] = useState<string>(
    () => localStorage.getItem('nono_buffer_api_token') || ''
  );
  const [bufferProfileId, setBufferProfileId] = useState<string>(
    () => localStorage.getItem('nono_buffer_profile_id') || ''
  );
  const [bufferWebhookUrl, setBufferWebhookUrl] = useState<string>(
    () => localStorage.getItem('nono_buffer_webhook_url') || ''
  );
  const [showBufferConnectionModal, setShowBufferConnectionModal] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatusMsg, setConnectionStatusMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [freePlanWarning, setFreePlanWarning] = useState<string | null>(null);
  const [dispatchSuccessBanner, setDispatchSuccessBanner] = useState<string | null>(null);
  const [isDispatchingBuffer, setIsDispatchingBuffer] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  // 偵測滑鼠是否移到視窗頂部（<= 52px），用來觸發頂部無邊框控制列浮現，並同步置頂狀態
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setIsMouseNearTop(e.clientY <= 52);
    };
    window.addEventListener('mousemove', onMove);

    window.nonoDesktop?.getAlwaysOnTop?.().then((val) => {
      setIsAlwaysOnTop(Boolean(val));
    });
    const unsubscribe = window.nonoDesktop?.onAlwaysOnTopChanged?.((val) => {
      setIsAlwaysOnTop(Boolean(val));
    });

    return () => {
      window.removeEventListener('mousemove', onMove);
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('nono_buffer_api_token', bufferApiToken);
  }, [bufferApiToken]);

  useEffect(() => {
    localStorage.setItem('nono_buffer_profile_id', bufferProfileId);
  }, [bufferProfileId]);

  useEffect(() => {
    localStorage.setItem('nono_buffer_webhook_url', bufferWebhookUrl);
  }, [bufferWebhookUrl]);

  useEffect(() => {
    localStorage.setItem('nono_model_scale', String(modelScale));
  }, [modelScale]);

  useEffect(() => {
    try {
      const trimmed = progressVersions.slice(-MAX_PROGRESS_VERSIONS);
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // ignore quota error
    }
  }, [progressVersions]);

  useEffect(() => {
    try {
      localStorage.setItem('nono_scheduled_posts_v2', JSON.stringify(queuedPosts.slice(0, 40)));
    } catch {
      // ignore
    }
  }, [queuedPosts]);

  // 將後端回傳的排程陣列合併至前端 queuedPosts 狀態
  const mergeServerScheduledPosts = (rawList: any[]) => {
    if (!Array.isArray(rawList)) return;
    setQueuedPosts((prev) => {
      const map = new Map<string, (typeof prev)[number]>();
      for (const item of prev) {
        if (!item.scheduledIso) continue;
        map.set(`${item.scheduledIso.slice(0, 16)}-${(item.text || '').trim().slice(0, 20)}`, item);
      }
      for (const cloud of rawList) {
        const rawDue = cloud.dueAt || cloud.scheduledIso;
        if (!rawDue) continue;
        const parsedDate = new Date(rawDue);
        const localIso = Number.isNaN(parsedDate.getTime())
          ? String(rawDue).slice(0, 16)
          : toLocalIsoString(parsedDate);
        const textVal = cloud.text || '(已排程貼文)';
        const key = `${localIso.slice(0, 16)}-${textVal.trim().slice(0, 20)}`;

        const incomingPlats: BufferPlatform[] = Array.isArray(cloud.platforms)
          ? cloud.platforms.filter((p: string) =>
              ['threads', 'x', 'instagram', 'facebook'].includes(p)
            )
          : ['threads', 'x', 'instagram', 'facebook'].includes(cloud.platform)
            ? [cloud.platform as BufferPlatform]
            : ['threads'];

        const existing = map.get(key);
        const ymd = localIso.slice(0, 10);
        const hm = localIso.slice(11, 16);
        if (existing) {
          existing.platforms = Array.from(
            new Set([...existing.platforms, ...incomingPlats])
          ) as BufferPlatform[];
          if (cloud.text && cloud.text.length > existing.text.length) {
            existing.text = cloud.text;
          }
          if (cloud.modeLabel) {
            existing.modeLabel = cloud.modeLabel;
          }
        } else {
          map.set(key, {
            id: cloud.id || `cloud-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            text: textVal,
            platforms: incomingPlats.length > 0 ? incomingPlats : ['threads'],
            scheduledIso: localIso,
            time: `${formatYmdWithWeekday(ymd)} ${hm}`,
            modeLabel: cloud.modeLabel || 'Buffer 已排程',
          });
        }
      }
      return Array.from(map.values()).sort((a, b) =>
        (a.scheduledIso || '').localeCompare(b.scheduledIso || '')
      );
    });
  };

  // 同步 Buffer 雲端已排程貼文 + 伺服器永久保存的排程紀錄
  const handleSyncCloudScheduledPosts = async (silent = false) => {
    const token = bufferApiToken.trim();
    if (!silent) setIsSyncingSchedule(true);
    try {
      const res = await fetch('/api/buffer/scheduled-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bufferApiToken: token || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        if (Array.isArray(data.scheduledPosts)) {
          mergeServerScheduledPosts(data.scheduledPosts);
        }
        if (data.syncNote) {
          setScheduleSyncNote(data.syncNote);
        }
      }
    } catch {
      if (!silent) {
        setScheduleSyncNote('已載入本機保存的排程紀錄');
      }
    } finally {
      if (!silent) setIsSyncingSchedule(false);
    }
  };

  // 自動載入所有已探索專案（支援未來其他專案進度自動抓取）
  const handleLoadProjectsList = async () => {
    try {
      const res = await fetch('/api/projects/list');
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.projects)) {
        setProjectsList(data.projects);
      }
    } catch {
      // ignore
    }
  };

  const handleScanProjectFolder = async (targetPath?: string, targetName?: string) => {
    const folderToScan = (targetPath ?? customProjectPathInput).trim();
    const nameToUse = (targetName ?? customProjectNameInput).trim() || undefined;
    setIsScanningProject(true);
    setProgressNotice(null);
    try {
      const res = await fetch('/api/projects/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderPath: folderToScan || undefined,
          projectName: nameToUse,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.project) {
        const scanned: ProjectRecord = data.project;
        if (Array.isArray(data.projects)) {
          setProjectsList(data.projects);
        }
        setActiveProjectName(scanned.name);
        if (scanned.themes && scanned.themes.length > 0) {
          setProgressVersions((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const merged = [
              ...prev,
              ...scanned.themes.filter((t) => !existingIds.has(t.id)),
            ].slice(-MAX_PROGRESS_VERSIONS);
            return merged;
          });
          const latestTwo = scanned.themes.slice(-2);
          setSelectedVersionIds(latestTwo.map((t) => t.id));
          const themeLines = latestTwo.map((t) => t.content).join('\n');
          setNotebook((nb) => ({ ...nb, actualProgressLog: themeLines }));
          const story = buildClientStoryFromThemes(themeLines, scanned.name);
          setBufferConfig((prev) => ({
            ...prev,
            content: story,
            platformContents: buildClientPlatformCopies(story),
          }));
          setProgressNotice(
            `✓ 已成功從專案「${scanned.name}」自動抓出 ${scanned.themes.length} 項最新進度主題，並自動做好前後故事潤飾！`
          );
        } else {
          setProgressNotice(`⚠️ 掃描了「${scanned.folderPath}」，但尚未發現 Git 提交或近期變更檔案。`);
        }
        setCustomProjectPathInput('');
        setCustomProjectNameInput('');
      }
    } catch {
      setProgressNotice('⚠️ 掃描專案資料夾時發生連線錯誤。');
    } finally {
      setIsScanningProject(false);
    }
  };

  // 同一個 Nono 多專案＋多功能同時處理（抓進度 ➔ 主題故事潤飾 ➔ 自動對齊最後一篇排程隔天）
  const handleRunMultiSkillPipeline = async () => {
    if (isRunningMultiSkill) return;
    setIsRunningMultiSkill(true);
    setMultiSkillSteps([]);
    try {
      const res = await fetch('/api/nono/multi-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: activeProjectName,
          customThemeText: notebook.actualProgressLog,
          bufferApiToken: bufferApiToken.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setMultiSkillSteps(data.steps || []);
        if (data.storyCopy) {
          const adapted = data.platformCopies || buildClientPlatformCopies(data.storyCopy);
          setBufferConfig((prev) => ({
            ...prev,
            content: data.storyCopy,
            platformContents: adapted,
            usePerPlatformCopy: true,
            scheduleMode: 'custom_time',
            scheduledTime: data.recommendedDateIso || prev.scheduledTime,
            selectedSlotLabel: data.recommendedDateIso
              ? `${formatYmdWithWeekday(data.recommendedDateIso.slice(0, 10))} ${data.recommendedDateIso.slice(11, 16)}`
              : prev.selectedSlotLabel,
            status: 'ready_to_schedule',
          }));
        }
        if (data.recommendedDateIso) {
          setSelectedScheduleDate(data.recommendedDateIso.slice(0, 10));
          setHasPickedScheduleDate(true);
        }
        if (Array.isArray(data.scheduledPosts)) {
          mergeServerScheduledPosts(data.scheduledPosts);
        }
        setIsNonoAwake(true);
        setIsBubbleOpen(true);
        setIdleAction('excited_spin');
        setActionLabel('多功能連段完成！');
        setCareBadgeText('MULTI-SKILL · 單一 Nono 多功能同時處理完成');
        setNonoSpeech(
          data.nonoSpeech ||
            '我已經同時完成「專案進度抓取」、「主題前後故事潤飾」跟「Buffer 最佳排程日期計算」囉！\n\n現在切到排程面板確認一下就能直接發送喔糖糖。'
        );
      }
    } catch {
      // ignore
    } finally {
      setIsRunningMultiSkill(false);
    }
  };

  // 多隻不同領域 Nono 像 GrokBot 一樣互相溝通完成跨領域指令
  const handleRunGrokBotCouncil = async (customCmd?: string) => {
    if (isRunningCouncil) return;
    const cmdToUse =
      (customCmd ?? councilCommandInput).trim() ||
      `把「${activeProjectName}」的最新進度用能引起觀眾好奇的故事方式包裝，並協調出最棒的排程時段`;
    setIsRunningCouncil(true);
    if (!customCmd) setCouncilCommandInput('');
    try {
      const lastTimeStr =
        queuedPosts.length > 0
          ? queuedPosts[queuedPosts.length - 1].scheduledIso.replace('T', ' ')
          : '目前尚無排程';
      const res = await fetch('/api/nono/council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmdToUse,
          projectName: activeProjectName,
          progressText: notebook.actualProgressLog,
          lastScheduledTime: lastTimeStr,
          model: selectedModel,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        if (Array.isArray(data.discussion)) {
          setCouncilMessages(data.discussion);
        }
        if (data.finalCopy) {
          const adapted = data.platformCopies || buildClientPlatformCopies(data.finalCopy);
          setBufferConfig((prev) => ({
            ...prev,
            content: data.finalCopy,
            platformContents: adapted,
            usePerPlatformCopy: true,
            status: 'ready_to_schedule',
          }));
        }
        setIsNonoAwake(true);
        setIsBubbleOpen(true);
        setIdleAction('happy_bounce');
        setActionLabel('跨領域 Nono 協作完成');
        setCareBadgeText('GROKBOT COUNCIL · 四領域 Nono 討論完畢');
        setNonoSpeech(
          `研發、企劃、視覺跟排程四隻不同領域的 Nono 剛剛已經互相討論完畢，幫妳把「${activeProjectName}」的故事貼文與排程策略都定案囉！\n\n妳可以在協作室看他們的對話紀錄，或直接切到貼文與排程面板發佈喔糖糖。`
        );
      }
    } catch {
      // ignore
    } finally {
      setIsRunningCouncil(false);
    }
  };

  const handleSwitchDomainNono = (agent: NonoDomainAgent) => {
    setActiveNonoAgentId(agent.id);
    setFurColor(agent.furPresetColor);
    if (syncPanelWithFur) {
      setPanelThemeId(agent.themeId);
    }
    setIdleAction('happy_bounce');
    setActionLabel(`${agent.name} 值班中`);
    setCareBadgeText(agent.badge);
    setIsBubbleOpen(true);
    setNonoSpeech(
      `現在切換由「${agent.name}」為妳主控服務（${agent.domain}）！\n\n我也可以隨時同時處理多個專案功能，或呼叫其他領域的 Nono 一起討論完成跨領域任務喔糖糖。`
    );
  };

  useEffect(() => {
    handleSyncCloudScheduledPosts(true);
    handleLoadProjectsList();
  }, []);

  const progressStorageKb = (
    new Blob([JSON.stringify(progressVersions)]).size / 1024
  ).toFixed(1);

  // 點選或勾選更新主題：只整理成乾淨的主題清單，不自動改寫貼文（文案由「下一步：生成文案」產生）
  const handleToggleVersionSelection = (id: string) => {
    setProgressNotice(null);
    setSelectedVersionIds((prev) => {
      const exists = prev.includes(id);
      const nextIds = exists ? prev.filter((item) => item !== id) : [...prev, id];
      const selectedEntries = progressVersions.filter((v) => nextIds.includes(v.id));
      const cleanThemeLines = selectedEntries
        .map((v) =>
          v.content
            .replace(/\[?v?\d+\.\d+(\.\d+)?\]?\s*/gi, '')
            .replace(/^[0-9.*•\-\s]+/, '')
            .trim()
        )
        .filter(Boolean)
        .join('\n');
      setNotebook((nb) => ({ ...nb, actualProgressLog: cleanThemeLines }));
      setProgressNotice(`✓ 已選 ${selectedEntries.length} 個主題`);
      return nextIds;
    });
  };

  const handleApplySingleVersion = (entry: ProgressVersionEntry) => {
    setSelectedVersionIds([entry.id]);
    const cleanTheme = entry.content
      .replace(/\[?v?\d+\.\d+(\.\d+)?\]?\s*/gi, '')
      .replace(/^[0-9.*•\-\s]+/, '')
      .trim();
    setNotebook((nb) => ({
      ...nb,
      actualProgressLog: `${entry.title}：${cleanTheme}`,
    }));
    setProgressNotice(`✓ 已選主題「${entry.title}」`);
  };

  const handleUpdateVersionWithCurrentText = (id: string) => {
    const cleanText = notebook.actualProgressLog
      .replace(/^[0-9]+\.\s*(\[[^\]]+\]\s*)?/, '')
      .trim();
    if (!cleanText) {
      setProgressNotice('⚠️ 請先在下方進度框輸入內容，再點更新主題喔！');
      return;
    }
    const nowTag = new Date().toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
    setProgressVersions((prev) =>
      prev.map((v) =>
        v.id === id
          ? {
              ...v,
              content: cleanText,
              updatedAt: `更新於 ${nowTag}`,
            }
          : v
      )
    );
    const target = progressVersions.find((v) => v.id === id);
    setProgressNotice(`✓ 已將目前內容更新至主題「${target?.title || ''}」！`);
  };

  const handleSaveNewProgressVersion = () => {
    const rawContent = notebook.actualProgressLog.trim();
    if (!rawContent) {
      setProgressNotice('⚠️ 請先在下方進度框寫下這次的更新主題，再點儲存喔！');
      return;
    }
    const nextNum = progressVersions.length + 1;
    const tag = newVersionTag.trim() || `主題 0${nextNum}`;
    const cleanFirstLine = rawContent
      .split('\n')[0]
      .replace(/^[0-9]+\.\s*(\[[^\]]+\]\s*)?/, '')
      .replace(/\[?v?\d+\.\d+(\.\d+)?\]?\s*/gi, '')
      .trim();
    const title = newVersionTitle.trim() || cleanFirstLine.slice(0, 14) || '創作主題推進';
    const nowTag = new Date().toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });

    const newEntry: ProgressVersionEntry = {
      id: `ver-${Date.now()}`,
      versionTag: tag,
      title,
      content: rawContent,
      updatedAt: nowTag,
    };

    setProgressVersions((prev) => [...prev, newEntry].slice(-MAX_PROGRESS_VERSIONS));
    setSelectedVersionIds([newEntry.id]);
    setNewVersionTag('');
    setNewVersionTitle('');
    setProgressNotice(`✓ 已新增主題「${title}」`);
  };

  const handleDeleteProgressVersion = (id: string) => {
    setProgressVersions((prev) => prev.filter((v) => v.id !== id));
    setSelectedVersionIds((prev) => prev.filter((item) => item !== id));
  };

  // 自然待機動作銜接流轉
  useEffect(() => {
    if (
      idleAction === 'sleepy' ||
      idleAction === 'deep_sleep' ||
      idleAction === 'startled_wake'
    ) {
      return;
    }

    const gentleTimer = window.setInterval(() => {
      setIdleAction((curr) => {
        if (
          curr === 'sleepy' ||
          curr === 'deep_sleep' ||
          curr === 'startled_wake'
        ) {
          return curr;
        }
        if (curr !== 'breathing') {
          setActionLabel('乖乖呼吸待機中');
          return 'breathing';
        }
        const nextPool = IDLE_ACTION_POOL.filter((item) => item.action !== 'breathing');
        const picked =
          nextPool[Math.floor(Math.random() * nextPool.length)] || IDLE_ACTION_POOL[0];
        setActionLabel(picked.label);
        return picked.action;
      });
    }, 13000);

    return () => window.clearInterval(gentleTimer);
  }, [idleAction]);

  // ==================== 視窗拖曳、視窗縮放與面板寬度拖曳控制 ====================
  const handleStartWindowDrag = (e: React.PointerEvent) => {
    // 若點擊到的是按鈕則不觸發拖曳
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    let lastX = e.screenX;
    let lastY = e.screenY;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.screenX - lastX;
      const dy = moveEvent.screenY - lastY;
      lastX = moveEvent.screenX;
      lastY = moveEvent.screenY;
      if (window.nonoDesktop?.moveBy) {
        window.nonoDesktop.moveBy(dx, dy);
      } else {
        window.moveBy(dx, dy);
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleStartWindowResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    let lastX = e.screenX;
    let lastY = e.screenY;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dw = moveEvent.screenX - lastX;
      const dh = moveEvent.screenY - lastY;
      lastX = moveEvent.screenX;
      lastY = moveEvent.screenY;
      if (window.nonoDesktop?.resizeBy) {
        window.nonoDesktop.resizeBy(dw, dh);
      } else {
        window.resizeBy(dw, dh);
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleStartPanelWidthDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const baseW =
      customPanelWidth ?? (activeWindow === 'buffer' && !isCompactPanel ? 740 : 410);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextW = Math.max(
        340,
        Math.min(window.innerWidth - 32, baseW + (moveEvent.clientX - startX))
      );
      setCustomPanelWidth(nextW);
      setIsCompactPanel(nextW < 580);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleToggleCompactSingleColumn = () => {
    setIsCompactPanel((prev) => {
      const next = !prev;
      setCustomPanelWidth(next ? 390 : 740);
      return next;
    });
  };

  const handleCloseWindow = () => {
    if (window.nonoDesktop?.close) {
      window.nonoDesktop.close();
    } else {
      window.close();
    }
  };

  const handleMinimizeWindow = () => {
    if (window.nonoDesktop?.minimize) {
      window.nonoDesktop.minimize();
    } else {
      handleMinimizeAll();
    }
  };

  const handleToggleAlwaysOnTop = async () => {
    if (window.nonoDesktop?.toggleAlwaysOnTop) {
      const next = await window.nonoDesktop.toggleAlwaysOnTop();
      setIsAlwaysOnTop(Boolean(next));
    } else {
      setIsAlwaysOnTop((prev) => !prev);
    }
  };

  const handleSendBehind = () => {
    if (window.nonoDesktop?.sendBehind) {
      window.nonoDesktop.sendBehind();
      setIsAlwaysOnTop(false);
    } else {
      handleMinimizeWindow();
    }
  };

  const openSideWindow = (win: ActiveWindowId) => {
    setActiveWindow(win);
    if (win !== null) {
      lastOpenWindowRef.current = win;
    }
  };

  const updateSpeechForBehavior = (behavior: UserBehaviorContext, badge = 'CARE · 貼心陪伴中') => {
    const candidates = BEHAVIOR_DIALOGUE_MAP[behavior] || BEHAVIOR_DIALOGUE_MAP.clicked_nono;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    setNonoSpeech(picked);
    setCareBadgeText(badge);
    setIsBubbleOpen(true);
  };

  const handleEnterDeepSleep = () => {
    setIdleAction('deep_sleep');
    setActionLabel('深層熟睡中');
    setIsNonoAwake(true);
    setIsBubbleOpen(true);
    setNonoSpeech('...zzZ...');
    setCareBadgeText('SLEEP · 深層熟睡模式');
  };

  const handleAutoSleep = () => {
    if (idleAction !== 'sleepy' && idleAction !== 'deep_sleep') {
      setIdleAction('sleepy');
      setActionLabel('打瞌睡瞇眼中');
      setCareBadgeText('NAP · 打瞌睡瞇眼中');
    }
  };

  const handleSelectNono = () => {
    if (idleAction === 'deep_sleep') {
      setIdleAction('startled_wake');
      setActionLabel('驚醒恢復精神！');
      setIsNonoAwake(true);
      setIsBubbleOpen(true);
      setNonoSpeech('咿！...不小心睡著了，Ave 妳還在嗎？');
      setCareBadgeText('WAKE · 驚醒恢復精神！');
      if (lastOpenWindowRef.current && !activeWindow) {
        setActiveWindow(lastOpenWindowRef.current);
      }
      setTimeout(() => {
        setIdleAction((curr) => (curr === 'startled_wake' ? 'breathing' : curr));
        setActionLabel('乖乖呼吸待機中');
      }, 950);
      return;
    }

    const wasLightSleeping = idleAction === 'sleepy';
    const otherActions = IDLE_ACTION_POOL.filter((item) => item.action !== idleAction);
    const chosen =
      otherActions[Math.floor(Math.random() * otherActions.length)] || IDLE_ACTION_POOL[0];

    setIdleAction(chosen.action);
    setActionLabel(chosen.label);
    setIsBubbleOpen(true);
    setIsNonoAwake(true);
    if (!activeWindow) {
      setActiveWindow('notebook');
      setViewLayer('hub');
    }

    const pool = wasLightSleeping
      ? BEHAVIOR_DIALOGUE_MAP.woke_up
      : BEHAVIOR_DIALOGUE_MAP.clicked_nono.filter((line) => line !== nonoSpeech);
    const picked =
      pool[Math.floor(Math.random() * pool.length)] || BEHAVIOR_DIALOGUE_MAP.clicked_nono[0];
    setNonoSpeech(picked);
    setCareBadgeText(wasLightSleeping ? 'WAKE · 充飽電醒來囉' : 'HUB · 歡迎回到 Nono 領域指揮大廳');
  };

  const handleDragEndNono = () => {
    if (isNonoAwake && idleAction !== 'deep_sleep') {
      updateSpeechForBehavior('dragged_nono', 'MOVE · 換個舒服角落');
    }
  };

  const handleMinimizeAll = () => {
    if (activeWindow !== null) {
      lastOpenWindowRef.current = activeWindow;
    }
    setActiveWindow(null);
    setIsNonoAwake(false);
  };

  // 先選擇排程日期 ➔ 自動計算並浮現「該日期的推薦排程時段」
  const handlePickScheduleDate = (dateYmd: string) => {
    if (!dateYmd) return;
    setSelectedScheduleDate(dateYmd);
    setHasPickedScheduleDate(true);
    const freshSlots = generateDynamicRecommendedSlots(slotRefreshCount, dateYmd);
    setRecommendedSlots(freshSlots);
    const nowStr = new Date().toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setLastSlotRefreshedAt(nowStr);

    // 保留使用者原本選的時分（若為今天且已過期，則自動帶入該日期第一個推薦時段）
    const currentHm = bufferConfig.scheduledTime?.slice(11, 16) || '20:30';
    const candidateIso = `${dateYmd}T${currentHm}`;
    const candidateDate = new Date(`${dateYmd}T${currentHm}:00`);
    const isFutureEnough = candidateDate.getTime() > Date.now() + 5 * 60 * 1000;

    if (isFutureEnough && bufferConfig.scheduleMode === 'custom_time') {
      setBufferConfig((prev) => ({
        ...prev,
        scheduledTime: candidateIso,
        selectedSlotLabel: `${formatYmdWithWeekday(dateYmd)} ${currentHm}`,
        status: 'ready_to_schedule',
      }));
    } else if (freshSlots.length > 0) {
      const topSlot = freshSlots[0];
      setBufferConfig((prev) => ({
        ...prev,
        scheduleMode: 'recommended_slot',
        selectedSlotLabel: `${topSlot.label} ${topSlot.timeString}`,
        scheduledTime: topSlot.scheduledIso,
        status: 'ready_to_schedule',
      }));
    }
  };

  // 直接調整指定日期的幾點幾分（時 / 分）
  const handlePickTimeHourMinute = (nextHour: string, nextMinute: string) => {
    const ymd = selectedScheduleDate || bufferConfig.scheduledTime?.slice(0, 10) || getTodayYmd();
    const hh = nextHour.padStart(2, '0');
    const mm = nextMinute.padStart(2, '0');
    const nextIso = `${ymd}T${hh}:${mm}`;
    setSelectedScheduleDate(ymd);
    setHasPickedScheduleDate(true);
    setBufferConfig((prev) => ({
      ...prev,
      scheduleMode: 'custom_time',
      scheduledTime: nextIso,
      selectedSlotLabel: `${formatYmdWithWeekday(ymd)} ${hh}:${mm}`,
      status: 'ready_to_schedule',
    }));
  };

  const handleRefreshRecommendedSlots = () => {
    const nextBatch = slotRefreshCount + 1;
    setSlotRefreshCount(nextBatch);
    const targetYmd = selectedScheduleDate || getTodayYmd();
    setHasPickedScheduleDate(true);
    const freshSlots = generateDynamicRecommendedSlots(nextBatch, targetYmd);
    setRecommendedSlots(freshSlots);
    const nowStr = new Date().toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setLastSlotRefreshedAt(nowStr);

    if (freshSlots.length > 0) {
      const topSlot = freshSlots[0];
      setBufferConfig((prev) => ({
        ...prev,
        scheduleMode: 'recommended_slot',
        selectedSlotLabel: `${topSlot.label} ${topSlot.timeString}`,
        scheduledTime: topSlot.scheduledIso,
      }));
    }

    setIsNonoAwake(true);
    setIsBubbleOpen(true);
    setCareBadgeText('TIME · 推薦時段已刷新');
    setNonoSpeech(
      `Ave！我已經針對妳選的日期「${formatYmdWithWeekday(targetYmd)}」刷新了 3 個高互動推薦時段（${nowStr}）。\n\n妳可以直接點選推薦時段，或在下方自由調整幾點幾分喔糖糖。`
    );
  };

  const handleUpdateMasterContent = (nextText: string) => {
    setBufferConfig((prev) => ({
      ...prev,
      content: nextText,
      platformContents: buildClientPlatformCopies(nextText),
      status: 'ready_to_schedule',
    }));
  };

  const handleUpdatePlatformContent = (platform: BufferPlatform, nextText: string) => {
    setBufferConfig((prev) => ({
      ...prev,
      usePerPlatformCopy: true,
      platformContents: {
        ...prev.platformContents,
        [platform]: nextText,
      },
      status: 'ready_to_schedule',
    }));
  };

  const handleAutoAdaptAllPlatforms = () => {
    const adapted = buildClientPlatformCopies(bufferConfig.content);
    setBufferConfig((prev) => ({
      ...prev,
      usePerPlatformCopy: true,
      platformContents: adapted,
      status: 'ready_to_schedule',
    }));
    setLastRefinedNotice('✓ 已自動針對 X (≤140中文字)、IG (≤5個#)、Threads 與 FB 重新調整專屬文章！');
    setIsNonoAwake(true);
    setIsBubbleOpen(true);
    setCareBadgeText('ADAPT · 各平台字數已自動優化');
    setNonoSpeech(
      'Ave！我已經幫妳把這篇貼文自動拆成各平台最適合的長度了，X 已經濃縮在限制字數內、IG 標籤也控制在 5 個以內。\n\n妳可以點上方或右邊的平台按鈕切換查看不同 App 的專屬文章喔糖糖。'
    );
  };

  const handleGenerateFromNotebook = async () => {
    if (isGeneratingDraft) return;
    setIsGeneratingDraft(true);
    setFreePlanWarning(null);
    setDispatchSuccessBanner(null);

    try {
      const response = await fetch('/api/nono/generate-from-notebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebook,
          projectName: activeProjectName,
          model: selectedModel,
        }),
      });
      const data = await response.json();
      const draft =
        data.bufferDraft ||
        data.socialCopy ||
        buildClientStoryFromThemes(notebook.actualProgressLog, activeProjectName);

      if (draft) {
        const adapted = data.platformCopies || buildClientPlatformCopies(draft);
        setBufferConfig((prev) => ({
          ...prev,
          content: draft,
          platformContents: adapted,
          usePerPlatformCopy: true,
          status: 'ready_to_schedule',
        }));
        setIsNonoAwake(true);
        openSideWindow('composer');
      }
      setIsBubbleOpen(true);
      setCareBadgeText('STORY · 主題前後潤飾完成');
      setNonoSpeech(
        data.nonoNote ||
          data.murmur ||
          '我已經把更新主題用「引發好奇開場 ➔ 主題故事體驗 ➔ 互動提問收尾」前後潤飾好，並同步幫 X、IG、Threads 適配好字數囉。\n\n現在幫妳切到「貼文潤飾工坊」，確認順眼就可以按底部按鈕前往排程喔糖糖。'
      );
    } catch {
      const fallbackText = buildClientStoryFromThemes(
        notebook.actualProgressLog,
        activeProjectName
      );
      setBufferConfig((prev) => ({
        ...prev,
        content: fallbackText,
        platformContents: buildClientPlatformCopies(fallbackText),
        usePerPlatformCopy: true,
        status: 'ready_to_schedule',
      }));
      setIsNonoAwake(true);
      openSideWindow('composer');
      setIsBubbleOpen(true);
      setCareBadgeText('STORY · 主題故事潤飾完成');
      updateSpeechForBehavior('generated_post', 'STORY · 主題故事潤飾完成');
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleRefinePostWithNono = async (e?: React.FormEvent, quickInstruction?: string) => {
    if (e) e.preventDefault();
    const instruction = (quickInstruction ?? refineInput).trim();
    if (!instruction || isRefiningPost) return;

    setIsRefiningPost(true);
    setLastRefinedNotice(null);
    if (!quickInstruction) setRefineInput('');

    const currentBaseText =
      editingScope === 'master'
        ? bufferConfig.content
        : bufferConfig.platformContents[editingScope] || bufferConfig.content;

    try {
      const response = await fetch('/api/nono/refine-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentDraft: currentBaseText,
          instruction,
          platforms: bufferConfig.platforms,
          notebook,
          model: selectedModel,
        }),
      });
      const data = await response.json();
      const nextDraft = data.refinedDraft || data.socialCopy;
      if (nextDraft) {
        const nextPlatformCopies = data.platformCopies || buildClientPlatformCopies(nextDraft);
        setBufferConfig((prev) => ({
          ...prev,
          content: nextDraft,
          platformContents:
            editingScope === 'master'
              ? nextPlatformCopies
              : {
                  ...nextPlatformCopies,
                  [editingScope]: nextDraft,
                },
          status: 'ready_to_schedule',
        }));
        setLastRefinedNotice(`✓ 已依「${instruction}」完成微調並同步更新各平台預覽！`);
      }
      setIsNonoAwake(true);
      setIsBubbleOpen(true);
      setIdleAction('happy_bounce');
      setActionLabel('開心軟糖彈跳中');
      setCareBadgeText('REFINE · 貼文細項已微調');
      setNonoSpeech(
        data.nonoReply ||
          data.murmur ||
          'Ave 交代的貼文細節已經幫妳微調好了，字數跟標籤規則也一起重新適配過。\n\n看看預覽卡片上的語氣順不順眼，確認沒問題就可以直接送進排程佇列囉糖糖。'
      );
    } catch {
      const appended = `${currentBaseText.replace(/#[\p{L}\p{N}_]+/gu, '').trim()}（${instruction}） #Nono培育觀察日記`;
      const adapted = buildClientPlatformCopies(appended);
      setBufferConfig((prev) => ({
        ...prev,
        content: appended,
        platformContents: adapted,
        status: 'ready_to_schedule',
      }));
      setLastRefinedNotice(`✓ 已套用微調指令：「${instruction}」`);
    } finally {
      setIsRefiningPost(false);
    }
  };

  const handleSelectRecommendedSlot = (slot: RecommendedTimeSlot) => {
    setBufferConfig((prev) => ({
      ...prev,
      scheduleMode: 'recommended_slot',
      selectedSlotLabel: `${slot.label} ${slot.timeString}`,
      scheduledTime: slot.scheduledIso,
      status: 'ready_to_schedule',
    }));
  };

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setCustomModelUrl(objectUrl);
    setCustomModelName(file.name);
    setIsNonoAwake(true);
    setIsBubbleOpen(true);
    setCareBadgeText('3D MODEL · 自製模型已載入');
    setNonoSpeech(
      `Ave！已經順利載入妳自製的 3D 模型「${file.name}」，二階彈簧呼吸跟視線追蹤都自動掛上去了。\n\n如果模型本身有包骨骼動畫我也會自動播放，點點看測試動作流不流暢喔糖糖。`
    );
  };

  const handleLocalMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const firstFileName = files[0].name;

    Array.from(files).forEach((file: File) => {
      const isVideo = file.type.startsWith('video/');
      const localPreviewUrl = URL.createObjectURL(file);
      const mediaId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // 1. 立即以 ObjectURL 顯示在預覽卡片，不需要等傳輸！
      const item: MediaAttachment = {
        id: mediaId,
        type: isVideo ? 'video' : 'image',
        url: localPreviewUrl,
        name: file.name,
        source: 'local',
      };
      setBufferConfig((prev) => ({
        ...prev,
        mediaAttachments: [...prev.mediaAttachments, item],
        status: 'ready_to_schedule',
      }));

      // 2. 背景轉為公開 HTTPS 網址（支援大型影片與素材，避免送出時觸發 HTTP 413 Payload Too Large）
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === 'string') {
          try {
            const uploadRes = await fetch('/api/media/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dataUrl: reader.result, fileName: file.name }),
            });
            const uploadData = await uploadRes.json();
            if (uploadData?.ok && uploadData?.url?.startsWith('https://')) {
              setBufferConfig((prev) => ({
                ...prev,
                mediaAttachments: prev.mediaAttachments.map((m) =>
                  m.id === mediaId ? { ...m, url: uploadData.url } : m
                ),
              }));
            }
          } catch {
            // 保留本地預覽
          }
        }
      };
      reader.readAsDataURL(file);
    });

    setIsNonoAwake(true);
    setIsBubbleOpen(true);
    setIdleAction('happy_bounce');
    setActionLabel('開心軟糖彈跳中');
    setCareBadgeText('MEDIA · 素材已載入');
    setNonoSpeech(
      `Ave！剛剛選擇的「${firstFileName}」已經載入預覽囉。\n\n確認右邊的預覽版面跟時段沒問題，就可以按確認上傳排程喔糖糖。`
    );
    e.target.value = '';
  };

  const handleAddCloudMedia = () => {
    const trimmed = cloudMediaUrlInput.trim();
    if (!trimmed) return;

    const normalizedUrl = normalizeCloudMediaUrl(trimmed);
    const isVideoUrl =
      cloudMediaType === 'video' || /\.(mp4|webm|mov)(\?.*)?$/i.test(normalizedUrl);

    const newMedia: MediaAttachment = {
      id: `cloud-${Date.now()}`,
      type: isVideoUrl ? 'video' : 'image',
      url: normalizedUrl,
      name: trimmed.split('/').pop()?.slice(0, 32) || '雲端媒體素材',
      source: 'cloud',
    };

    setBufferConfig((prev) => ({
      ...prev,
      mediaAttachments: [...prev.mediaAttachments, newMedia],
      status: 'ready_to_schedule',
    }));
    setCloudMediaUrlInput('');
    setIsNonoAwake(true);
    setIsBubbleOpen(true);
    setIdleAction('happy_bounce');
    setActionLabel('開心軟糖彈跳中');
    setCareBadgeText('MEDIA · 雲端素材已載入！');
    setNonoSpeech(
      `Ave！雲端${isVideoUrl ? '影片' : '圖片'}素材已經成功載入並顯示在預覽卡片裡了。\n\n妳可以切換 IG、Threads、X 預覽看看圖片搭配起來的版面喔糖糖。`
    );
  };

  const removeMediaAttachment = (id: string) => {
    setBufferConfig((prev) => ({
      ...prev,
      mediaAttachments: prev.mediaAttachments.filter((m) => m.id !== id),
      status: 'ready_to_schedule',
    }));
  };

  const togglePlatform = (p: BufferPlatform) => {
    setFreePlanWarning(null);
    setBufferConfig((prev) => {
      const exists = prev.platforms.includes(p);
      if (exists) {
        const next = prev.platforms.filter((item) => item !== p);
        return { ...prev, platforms: next, status: 'ready_to_schedule' };
      } else {
        if (prev.platforms.length >= 3) {
          setFreePlanWarning(
            'Buffer 免費版 (Free Plan) 最多支援連結 3 個社群頻道！請先取消勾選一個頻道再切換。'
          );
          return prev;
        }
        setPreviewPlatform(p);
        return { ...prev, platforms: [...prev.platforms, p], status: 'ready_to_schedule' };
      }
    });
  };

  const toggleHashtagInPost = (tag: string) => {
    const currentText =
      editingScope === 'master'
        ? bufferConfig.content
        : bufferConfig.platformContents[editingScope] || bufferConfig.content;
    const hasTag = currentText.includes(tag);
    const nextContent = hasTag
      ? currentText.replace(tag, '').replace(/\s{2,}/g, ' ').trim()
      : `${currentText.trim()} ${tag}`;

    if (editingScope === 'master') {
      handleUpdateMasterContent(nextContent);
    } else {
      handleUpdatePlatformContent(editingScope, nextContent);
    }
  };

  const handleTestBufferConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatusMsg(null);
    setFreePlanWarning(null);

    try {
      const res = await fetch('/api/buffer/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bufferApiToken: bufferApiToken.trim() || undefined,
          bufferProfileId: bufferProfileId.trim() || undefined,
          webhookUrl: bufferWebhookUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const errMsg = data?.message || '連線測試失敗，請確認 Token 或 Webhook URL 是否正確。';
        setConnectionStatusMsg({ ok: false, text: errMsg });
        setIsNonoAwake(true);
        setIsBubbleOpen(true);
        setCareBadgeText('ERROR · Buffer 連線測試未通過');
        setNonoSpeech(
          `Ave，剛剛幫妳測試連線時發現還沒連通：「${errMsg}」\n\n請檢查一下 Access Token 或 Webhook 網址，修好後再按一次測試連線喔糖糖。`
        );
        return;
      }

      if (Array.isArray(data.profiles) && data.profiles.length > 0) {
        const autoIds = data.profiles.map((p: any) => p.id).join(',');
        setBufferProfileId(autoIds);
      }

      handleSyncCloudScheduledPosts(true);
      setConnectionStatusMsg({ ok: true, text: data.message || '連線測試成功！' });
      setIsNonoAwake(true);
      setIsBubbleOpen(true);
      setIdleAction('happy_bounce');
      setActionLabel('開心軟糖彈跳中');
      setCareBadgeText('CONNECTED · Buffer 連線成功！');
      setNonoSpeech(
        `太好了 Ave！${data.message}\n\n現在已經確定連線暢通，等一下按確認上傳排程就會真正直接送進 Buffer 排程佇列囉糖糖。`
      );
    } catch {
      setConnectionStatusMsg({
        ok: false,
        text: '無法連線至本地伺服器，請確認終端機 npm run dev 是否正在執行。',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleConfirmBuffer = async () => {
    setFreePlanWarning(null);
    setDispatchSuccessBanner(null);

    if (queuedPosts.length >= 10) {
      setFreePlanWarning('Buffer 免費版每個頻道排程上限為 10 篇貼文！請先清理佇列後再新增。');
      return;
    }

    if (!bufferApiToken.trim() && !bufferWebhookUrl.trim()) {
      setShowBufferConnectionModal(true);
      const missingMsg =
        '尚未連結 Buffer 帳號！請先在上方填入「Buffer API Key」或「Make / Zapier Webhook 網址」，才不會發生假性成功喔。';
      setFreePlanWarning(missingMsg);
      setIsNonoAwake(true);
      setIsBubbleOpen(true);
      setCareBadgeText('ALERT · 請先設定 Buffer 連線');
      setNonoSpeech(
        'Ave！妳還沒有填入 Buffer API Key 或 Webhook 網址，所以貼文還沒有真正傳出去喔。\n\n我已經幫妳把「Buffer 真實帳號連線設定」打開了，填好後再按一次就可以囉糖糖。'
      );
      return;
    }

    if (bufferConfig.mediaAttachments.some((m) => m.url.startsWith('blob:'))) {
      setFreePlanWarning(
        '影片或圖片還在上傳到雲端中（需要先轉成公開網址 Buffer 才讀得到），請等預覽卡上的素材上傳完成後再按一次。'
      );
      return;
    }

    setIsDispatchingBuffer(true);
    const platformNames = bufferConfig.platforms.map((p) => PLATFORM_META[p].label).join('、');

    const timeDisplay =
      bufferConfig.scheduleMode === 'now'
        ? '立即發送'
        : bufferConfig.scheduleMode === 'recommended_slot'
          ? bufferConfig.selectedSlotLabel || '推薦時段排程'
          : bufferConfig.scheduleMode === 'queue'
            ? '直接排入下一個空檔'
            : bufferConfig.scheduledTime.replace('T', ' ');

    const modeBadge =
      bufferConfig.scheduleMode === 'now'
        ? '立即發佈'
        : bufferConfig.scheduleMode === 'recommended_slot'
          ? '直通排程預約'
          : bufferConfig.scheduleMode === 'custom_time'
            ? '指定時間排程'
            : '直通佇列候位';

    const primaryOutgoingText = bufferConfig.usePerPlatformCopy
      ? bufferConfig.platformContents[bufferConfig.platforms[0] || previewPlatform] ||
        bufferConfig.content
      : bufferConfig.content;

    try {
      const response = await fetch('/api/buffer/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: primaryOutgoingText,
          platformContents: bufferConfig.usePerPlatformCopy
            ? bufferConfig.platformContents
            : buildClientPlatformCopies(bufferConfig.content),
          platforms: bufferConfig.platforms,
          scheduleMode: bufferConfig.scheduleMode,
          scheduledTime: bufferConfig.scheduledTime,
          selectedSlotLabel: bufferConfig.selectedSlotLabel,
          mediaAttachments: bufferConfig.mediaAttachments,
          bufferApiToken: bufferApiToken.trim() || undefined,
          bufferProfileId: bufferProfileId.trim() || undefined,
          webhookUrl: bufferWebhookUrl.trim() || undefined,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        const errorReason =
          data?.message || `發送至 Buffer 失敗 (HTTP ${response.status})，請檢查連線設定。`;
        setFreePlanWarning(errorReason);
        setShowBufferConnectionModal(true);
        setIsNonoAwake(true);
        setIsBubbleOpen(true);
        setCareBadgeText('ERROR · Buffer 傳送失敗（未扣額度）');
        setNonoSpeech(
          `Ave，這次傳送沒有成功：「${errorReason}」\n\n我有幫妳擋下來，沒有算進 10 篇排程防呆額度裡，請檢查一下設定後再試一次喔糖糖。`
        );
        return;
      }

      const serverDueAt = data?.bufferResult?.[0]?.dueAt;
      const recordedIso = serverDueAt
        ? toLocalIsoString(new Date(serverDueAt))
        : bufferConfig.scheduleMode === 'now'
          ? toLocalIsoString(new Date())
          : bufferConfig.scheduledTime || `${selectedScheduleDate}T20:30`;

      const recordedYmd = recordedIso.slice(0, 10);
      const recordedHm = recordedIso.slice(11, 16);
      const formattedTime =
        bufferConfig.scheduleMode === 'now'
          ? `立即發佈 (${recordedHm})`
          : `${formatYmdWithWeekday(recordedYmd)} ${recordedHm}`;

      if (Array.isArray(data?.scheduledPosts) && data.scheduledPosts.length > 0) {
        mergeServerScheduledPosts(data.scheduledPosts);
      } else {
        setQueuedPosts((prev) => [
          {
            id: `q-${Date.now()}`,
            text: bufferConfig.content || primaryOutgoingText,
            platforms: bufferConfig.platforms,
            time: formattedTime,
            scheduledIso: recordedIso,
            modeLabel: modeBadge,
          },
          ...prev,
        ]);
      }

      setBufferConfig((prev) => ({ ...prev, status: 'scheduled' }));
      setDispatchSuccessBanner(
        data.message || `已成功將貼文直接送進 Buffer 排程佇列（${timeDisplay}）！`
      );
      setIsNonoAwake(true);
      setIsBubbleOpen(true);
      setIdleAction('happy_bounce');
      setActionLabel('開心軟糖彈跳中');
      setCareBadgeText('POSTED · 真實上傳排程成功！');
      setNonoSpeech(
        `太棒了 Ave！${data.message || `這篇貼文已經排入 Buffer「${timeDisplay}」（${platformNames}）囉！`}\n\n今天的開發紀錄已經穩穩交給我顧著了，妳可以安心喝口水、放鬆休息一下喔糖糖。`
      );
    } catch (err: any) {
      const netErr = `網路或伺服器連線失敗（${err?.message || '無法連線'}），本次未記錄排程。`;
      setFreePlanWarning(netErr);
      setIsNonoAwake(true);
      setIsBubbleOpen(true);
      setCareBadgeText('ERROR · 連線中斷（未扣額度）');
      setNonoSpeech(
        `Ave，剛剛連線到伺服器時發生中斷，貼文還沒有送出去喔。\n\n防呆計數器沒有增加，請確認網路與終端機伺服器狀態後再試一下喔糖糖。`
      );
    } finally {
      setIsDispatchingBuffer(false);
    }
  };

  const activeEditorText =
    editingScope === 'master'
      ? bufferConfig.content
      : bufferConfig.platformContents[editingScope] || bufferConfig.content;

  const currentPreviewText = bufferConfig.usePerPlatformCopy
    ? bufferConfig.platformContents[previewPlatform] || bufferConfig.content
    : bufferConfig.content;

  const xTextToCheck = bufferConfig.usePerPlatformCopy
    ? bufferConfig.platformContents.x || bufferConfig.content
    : bufferConfig.content;
  const xWeightedLen = getXWeightedLength(xTextToCheck);
  const xApproxChineseLen = Math.ceil(xWeightedLen / 2);
  const isXOverLimit = bufferConfig.platforms.includes('x') && xWeightedLen > 280;

  const igTextToCheck = bufferConfig.usePerPlatformCopy
    ? bufferConfig.platformContents.instagram || bufferConfig.content
    : bufferConfig.content;
  const igHashtagCount = countHashtags(igTextToCheck);
  const isInstagramSelected = bufferConfig.platforms.includes('instagram');
  const igHashtagExceeded = isInstagramSelected && igHashtagCount > 5;

  const previewCharCount = currentPreviewText.length;
  const previewHashtagCount = countHashtags(currentPreviewText);

  // ==================== 排程進度統計（那天 / 最近幾天 / 最後一篇排程是何時） ====================
  const activeScheduledYmd =
    selectedScheduleDate || bufferConfig.scheduledTime?.slice(0, 10) || getTodayYmd();
  const activeScheduledHm = bufferConfig.scheduledTime?.slice(11, 16) || '20:30';
  const [activeHourStr, activeMinStr] = activeScheduledHm.split(':');

  const sortedScheduledPosts = [...queuedPosts].sort((a, b) =>
    (a.scheduledIso || '').localeCompare(b.scheduledIso || '')
  );
  // 最後一篇排程（時間最晚的一篇）
  const lastScheduledPost =
    sortedScheduledPosts.length > 0
      ? sortedScheduledPosts[sortedScheduledPosts.length - 1]
      : null;

  // 所選日期（那天）已排程的貼文
  const postsOnSelectedDate = sortedScheduledPosts.filter(
    (p) => (p.scheduledIso || '').slice(0, 10) === activeScheduledYmd
  );

  // 最近幾天／未來幾天的排程清單
  const todayYmd = getTodayYmd();
  const recentDaysScheduledPosts = sortedScheduledPosts.filter(
    (p) => (p.scheduledIso || '').slice(0, 10) >= addDaysToYmd(todayYmd, -2)
  );

  // 未來 7 天快速日期選擇器資料
  const upcoming7Days = Array.from({ length: 7 }, (_, idx) => {
    const ymd = addDaysToYmd(todayYmd, idx);
    const countOnDay = sortedScheduledPosts.filter(
      (p) => (p.scheduledIso || '').slice(0, 10) === ymd
    ).length;
    return {
      ymd,
      label: formatYmdWithWeekday(ymd),
      countOnDay,
    };
  });

  // 計算面板明確像素寬度（保證點「窄版單欄 / 展開雙欄」或拖拉面板右邊界時 100% 立即生效！）
  const targetPanelWidthPx =
    customPanelWidth ??
    (viewLayer === 'hub'
      ? (isCompactPanel ? 480 : 820)
      : isCompactPanel
        ? 390
        : activeWindow === 'buffer' || activeWindow === 'composer'
          ? 730
          : activeWindow === 'council'
            ? 520
            : 440);
  const isSingleColumnLayout = isCompactPanel || targetPanelWidthPx < 580;

  return (
    <div
      style={{
        backgroundColor: isTransparentDesktop ? 'transparent' : activePanelTheme.bgBase,
        color: activePanelTheme.textMain,
      }}
      className="relative w-screen h-screen overflow-hidden select-none font-sans transition-colors duration-300"
    >
      {/* 滑鼠移到視窗最上方（clientY <= 52px）才會浮現的無邊框視窗控制列（支援按住拖動視窗、切換視窗大小、縮小、關閉） */}
      <div
        onMouseEnter={() => setIsMouseNearTop(true)}
        className={`fixed top-1.5 right-3 z-50 transition-all duration-200 ${
          isMouseNearTop || !isNonoAwake
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        <div
          onPointerDown={handleStartWindowDrag}
          style={{
            backgroundColor: activePanelTheme.panelBg,
            borderColor: activePanelTheme.border,
            boxShadow: `0 6px 24px rgba(0,0,0,0.85), 0 0 18px ${activePanelTheme.glowRgba}`,
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 backdrop-blur-xl cursor-move"
          title="按住此膠囊任意處即可直接拖動整個桌面視窗"
        >
          <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-zinc-100 pr-1">
            <Move className="w-3.5 h-3.5" style={{ color: activePanelTheme.accentSecondary }} />
            <span>按住拖動視窗</span>
          </span>

          {/* 一鍵調整桌面視窗大小 */}
          <div className="flex items-center gap-1 border-l border-r border-white/15 px-1.5">
            {[
              { label: '小視窗', w: 540, h: 680 },
              { label: '標準', w: 1020, h: 760 },
              { label: '大視窗', w: 1280, h: 860 },
            ].map((sz) => (
              <button
                key={sz.label}
                type="button"
                onClick={() => window.nonoDesktop?.setWindowSize(sz.w, sz.h)}
                className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-[10px] text-zinc-200 cursor-pointer"
                title={`將桌面視窗調整為 ${sz.w}×${sz.h}`}
              >
                {sz.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleToggleAlwaysOnTop}
            style={{
              borderColor: isAlwaysOnTop ? activePanelTheme.highlightTagBg : 'rgba(255,255,255,0.2)',
              color: isAlwaysOnTop ? activePanelTheme.highlightTagBg : '#e4e4e7',
            }}
            className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 border text-[10px] font-mono cursor-pointer"
            title="切換「一般層級（可被其他視窗壓在下方）」或「釘選永遠置頂」。被壓在下方時可按 Alt+N 或點工作列/右下角圖示隨時叫出來！"
          >
            {isAlwaysOnTop ? '📌 釘選最上層' : '🔓 可被其他視窗壓住'}
          </button>

          <button
            type="button"
            onClick={() => setIsNonoAwake((prev) => !prev)}
            className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-[11px] text-zinc-200 cursor-pointer"
          >
            {isNonoAwake ? '只留Nono' : '展開面板'}
          </button>

          <button
            type="button"
            onClick={handleMinimizeWindow}
            className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-[10px] text-zinc-200 cursor-pointer flex items-center gap-0.5"
            title="縮小至下方工作列（隨時可按 Alt+N 或點工作列圖示叫出來）"
          >
            <Minus className="w-3 h-3" />
            <span>退下(Alt+N叫出)</span>
          </button>

          <button
            type="button"
            onClick={handleCloseWindow}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold cursor-pointer transition-colors"
            title="關閉 Nono 桌面視窗"
          >
            <X className="w-3.5 h-3.5" />
            <span>關閉</span>
          </button>
        </div>
      </div>

      {/* 右下角視窗自由縮放拖曳把手（滑鼠移到右下角時浮現，按住即可自由拉大拉小整個桌面視窗！） */}
      <div
        onPointerDown={handleStartWindowResize}
        style={{
          backgroundColor: activePanelTheme.panelBg,
          borderColor: activePanelTheme.border,
          color: activePanelTheme.accentSecondary,
        }}
        className="fixed bottom-2 right-2 z-50 px-2.5 py-1 rounded-lg border opacity-35 hover:opacity-100 transition-opacity cursor-nwse-resize text-[10px] font-mono font-bold flex items-center gap-1"
        title="按住右下角拖曳即可自由調整整個桌面視窗大小"
      >
        <span>↘ 拉動調整視窗大小</span>
      </div>

      {/* Optional Dark Ambient Wallpaper */}
      {!isTransparentDesktop && (
        <>
          <div
            className="fixed inset-0 pointer-events-none transition-all duration-500"
            style={{
              background: `radial-gradient(circle at 72% 54%, ${activePanelTheme.accent}28 0%, ${activePanelTheme.accentSecondary}22 32%, ${activePanelTheme.bgBase} 82%)`,
            }}
          />

          <div
            className="fixed inset-0 pointer-events-none opacity-25"
            style={{
              backgroundImage: `radial-gradient(${activePanelTheme.accent}55 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)`,
              backgroundSize: '22px 22px, 44px 44px, 44px 44px',
            }}
          />
        </>
      )}

      {/* Fullscreen Interactive 3D Desktop Pet Canvas */}
      <NonoStage3D
        furColor={furColor}
        customModelUrl={customModelUrl}
        modelScale={modelScale}
        onModelScaleChange={setModelScale}
        isThinking={isGeneratingDraft || isRefiningPost}
        isAwake={isNonoAwake}
        idleAction={idleAction}
        nonoSpeech={nonoSpeech}
        actionLabel={actionLabel}
        careBadgeText={careBadgeText}
        isBubbleOpen={isBubbleOpen}
        onToggleBubble={setIsBubbleOpen}
        panelTheme={activePanelTheme}
        onSelectNono={handleSelectNono}
        onAutoSleep={handleAutoSleep}
        onEnterDeepSleep={handleEnterDeepSleep}
        onDragEndNono={handleDragEndNono}
      />

      {/* ==================== GROKBOT 2-LAYER ARCHITECTURE ==================== */}
      {/* LEVEL 1: NONO 領域指揮大廳 (HOME DOMAIN HUB) 或 LEVEL 2: 專屬工作台 (WORKBENCH) */}
      {isNonoAwake && (
        <div
          style={{
            width: `min(calc(100vw - 1.5rem), ${viewLayer === 'hub' ? Math.max(targetPanelWidthPx, 840) : targetPanelWidthPx}px)`,
          }}
          className="fixed top-3 left-3 z-30 flex flex-col max-h-[calc(100vh-1.5rem)] transition-[width] duration-150"
        >
          <div
            style={{
              backgroundColor: activePanelTheme.panelBg,
              borderColor: activePanelTheme.border,
              boxShadow: `0 22px 64px rgba(4, 2, 10, 0.92), 0 0 36px ${activePanelTheme.glowRgba}`,
              ['--nono-accent' as string]: activePanelTheme.accent,
            }}
            className={`nono-readable ${viewLayer === 'workbench' ? 'nono-workbench' : ''} relative backdrop-blur-xl border-2 rounded-2xl flex flex-col max-h-full overflow-hidden transition-colors duration-300`}
          >
            {/* 面板右側邊緣自由拉寬／收窄拖曳條 */}
            <div
              onPointerDown={handleStartPanelWidthDrag}
              className="absolute top-0 right-0 bottom-0 w-2.5 z-40 cursor-ew-resize hover:bg-white/20 transition-colors"
              title="按住面板右邊緣左右拖拉，可自由收窄或拉寬面板"
            />

            {/* 頂部霓虹斜紋拖曳條 */}
            <div
              onPointerDown={handleStartWindowDrag}
              className="h-2 w-full shrink-0 opacity-95 cursor-move"
              style={{
                backgroundImage: `repeating-linear-gradient(-45deg, ${activePanelTheme.accent}, ${activePanelTheme.accent} 10px, ${activePanelTheme.accentSecondary} 10px, ${activePanelTheme.accentSecondary} 20px)`,
              }}
              title="按住頂部條紋可拖動整個桌面視窗"
            />

            {/* LEVEL 1: 首頁「Nono 領域指揮大廳」HEADER */}
            {viewLayer === 'hub' ? (
              <div
                onPointerDown={handleStartWindowDrag}
                style={{
                  borderColor: `${activePanelTheme.border}45`,
                  background: `linear-gradient(90deg, ${activePanelTheme.accent}24, ${activePanelTheme.accentSecondary}1c)`,
                }}
                className="px-3 py-2 border-b shrink-0 flex flex-wrap items-center justify-between gap-1.5 cursor-move"
                title="按住此標題列可直接拖動整個桌面視窗"
              >
                <div className="flex items-center gap-1.5">
                  <PastelAuraStar
                    size={20}
                    idSuffix="hub-star"
                    accentColor={activePanelTheme.accent}
                    secondaryColor={activePanelTheme.accentSecondary}
                    coreColor={activePanelTheme.highlightTagBg}
                    className="-my-1"
                  />
                  <span className="text-[11px] font-mono font-black tracking-wider flex items-center gap-1">
                    <span>✦ Nono 領域中心</span>
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsAppearanceDrawerOpen((prev) => !prev)}
                    style={{
                      borderColor: isAppearanceDrawerOpen
                        ? activePanelTheme.accentSecondary
                        : 'rgba(255,255,255,0.2)',
                      color: isAppearanceDrawerOpen
                        ? activePanelTheme.accentSecondary
                        : activePanelTheme.textMain,
                    }}
                    className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-black/45 hover:bg-white/10 border cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>🎨 外觀與主題</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleAlwaysOnTop}
                    style={{
                      borderColor: isAlwaysOnTop
                        ? activePanelTheme.highlightTagBg
                        : 'rgba(255,255,255,0.22)',
                      color: isAlwaysOnTop
                        ? activePanelTheme.highlightTagBg
                        : activePanelTheme.textMain,
                    }}
                    className="px-2 py-0.5 rounded-md bg-black/45 border text-[10px] font-mono cursor-pointer hover:bg-white/10"
                    title="切換置頂"
                  >
                    {isAlwaysOnTop ? '📌 置頂中' : '🔓 可被壓住'}
                  </button>

                  <button
                    type="button"
                    onClick={handleMinimizeAll}
                    className="flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white px-2 py-0.5 rounded-md bg-black/40 hover:bg-black/60 border border-white/15 transition-colors cursor-pointer"
                    title="收起大廳"
                  >
                    <EyeOff className="w-3 h-3" />
                    <span>收起</span>
                  </button>
                </div>
              </div>
            ) : (
              /* LEVEL 2: 「📣 社群發文總管 Nono」工作台 HEADER */
              <div
                onPointerDown={handleStartWindowDrag}
                style={{
                  borderColor: `${activePanelTheme.border}45`,
                  background: `linear-gradient(90deg, ${activePanelTheme.accent}24, ${activePanelTheme.accentSecondary}1c)`,
                }}
                className="px-3 py-2 border-b shrink-0 flex flex-wrap items-center justify-between gap-1.5 cursor-move"
                title="按住此標題列可直接拖動整個桌面視窗"
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setViewLayer('hub')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 border border-white/30 text-white text-[11px] font-bold cursor-pointer transition-all shadow-sm"
                    title="返回 Nono 領域指揮大廳首頁"
                  >
                    <span>← 🏠 領域首頁</span>
                  </button>
                  <PastelAuraStar
                    size={18}
                    idSuffix="wb-star"
                    accentColor={activePanelTheme.accent}
                    secondaryColor={activePanelTheme.accentSecondary}
                    coreColor={activePanelTheme.highlightTagBg}
                    className="-my-1"
                  />
                  <span className="text-[11px] font-mono font-black tracking-wider flex items-center gap-1">
                    <span>📣 社群發文總管 Nono</span>
                    <span className="text-[9px] font-normal text-zinc-400 hidden sm:inline">
                      ({activeProjectName})
                    </span>
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsAppearanceDrawerOpen((prev) => !prev)}
                    style={{
                      borderColor: isAppearanceDrawerOpen
                        ? activePanelTheme.accentSecondary
                        : 'rgba(255,255,255,0.2)',
                      color: isAppearanceDrawerOpen
                        ? activePanelTheme.accentSecondary
                        : activePanelTheme.textMain,
                    }}
                    className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-black/45 hover:bg-white/10 border cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>🎨 外觀</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleCompactSingleColumn}
                    style={{
                      borderColor: isSingleColumnLayout
                        ? activePanelTheme.highlightTagBg
                        : 'rgba(255,255,255,0.2)',
                      color: isSingleColumnLayout
                        ? activePanelTheme.highlightTagBg
                        : activePanelTheme.textMain,
                    }}
                    className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-black/45 hover:bg-white/10 border cursor-pointer"
                  >
                    {isSingleColumnLayout ? (
                      <>
                        <Maximize2 className="w-3 h-3" />
                        <span>展開雙欄</span>
                      </>
                    ) : (
                      <>
                        <Minimize2 className="w-3 h-3" />
                        <span>收窄單邊</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleMinimizeAll}
                    className="flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white px-2 py-0.5 rounded-md bg-black/40 hover:bg-black/60 border border-white/15 transition-colors cursor-pointer"
                  >
                    <EyeOff className="w-3 h-3" />
                    <span>收起面板</span>
                  </button>
                </div>
              </div>
            )}

            {/* LEVEL 2 工作台的極簡 3 步導航標籤列 */}
            {viewLayer === 'workbench' && (
              <div
                style={{
                  backgroundColor: activePanelTheme.panelCard,
                  borderColor: `${activePanelTheme.border}38`,
                }}
                className="px-2.5 py-1.5 border-b shrink-0 grid grid-cols-3 gap-1.5"
              >
                {[
                  { id: 'notebook' as const, label: '步驟 ① 挑選進度主題', icon: BookOpen },
                  { id: 'composer' as const, label: '步驟 ② 編輯文案與配圖', icon: Wand2 },
                  { id: 'buffer' as const, label: '步驟 ③ 選擇時間與排程', icon: Calendar },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeWindow === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveWindow(tab.id)}
                      style={
                        isActive
                          ? {
                              background: `linear-gradient(90deg, ${activePanelTheme.accent}, ${activePanelTheme.accentSecondary})`,
                              borderColor: '#ffffff88',
                              boxShadow: `0 0 14px ${activePanelTheme.glowRgba}`,
                              color: '#ffffff',
                            }
                          : {
                              backgroundColor: 'rgba(0,0,0,0.35)',
                              borderColor: 'rgba(255,255,255,0.14)',
                              color: activePanelTheme.textMain,
                            }
                      }
                      className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer truncate"
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* LEVEL 1: 領域首頁大廳 (當 viewLayer === 'hub') */}
            {viewLayer === 'hub' && (
              <div className="p-3.5 overflow-y-auto space-y-3.5 flex-1 min-h-0">
                {/* 頂部整合看板：將 Nono 角色、狀態與核心操作完全包在首頁版面內 */}
                <div
                  style={{
                    background: `linear-gradient(135deg, ${activePanelTheme.accent}20, ${activePanelTheme.accentSecondary}12)`,
                    borderColor: `${activePanelTheme.border}60`,
                    boxShadow: `0 8px 24px rgba(0,0,0,0.35)`,
                  }}
                  className="p-3 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12 shrink-0 rounded-2xl bg-black/50 border border-white/20 flex items-center justify-center overflow-hidden shadow-inner">
                      <NonoCardGraphic
                        domainId="social"
                        color={activePanelTheme.accent}
                        accentSecondary={activePanelTheme.accentSecondary}
                        compact
                      />
                      <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white tracking-wide">Nono 領域指揮大廳</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                          全領域已連線
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-300">
                        點選下方任意 Nono 圖卡即可進入專屬領域面板
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunMultiSkillPipeline}
                    disabled={isRunningMultiSkill}
                    style={{
                      background: `linear-gradient(90deg, ${activePanelTheme.accent}, ${activePanelTheme.accentSecondary})`,
                      boxShadow: `0 4px 18px ${activePanelTheme.glowRgba}`,
                    }}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer hover:brightness-110 active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2 shadow transition-all shrink-0"
                  >
                    <Zap className="w-4 h-4" />
                    <span>{isRunningMultiSkill ? '執行中...' : '⚡ 一鍵連段（抓進度+故事潤飾+排程）'}</span>
                  </button>
                </div>

                {/* 6 大領域 Nono 圖卡矩陣：圖片為主、乾淨極簡 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {NONO_DOMAIN_AGENTS.map((agent) => {
                    const isSocial = agent.id === 'social';
                    const isReplier = agent.id === 'replier';

                    return (
                      <div
                        key={agent.id}
                        style={{
                          backgroundColor: isSocial ? `${activePanelTheme.accent}14` : activePanelTheme.panelCard,
                          borderColor: isSocial ? activePanelTheme.accent : 'rgba(255,255,255,0.12)',
                          boxShadow: isSocial ? `0 0 20px ${activePanelTheme.accent}25` : 'none',
                        }}
                        className="group relative rounded-2xl border-2 p-3 flex flex-col justify-between transition-all duration-200 hover:border-white/40 hover:scale-[1.01]"
                      >
                        {/* 卡片上半部：大尺寸精美專屬 Nono 角色圖 */}
                        <div className="relative w-full h-28 rounded-xl overflow-hidden mb-2.5 bg-black/40 border border-white/10 flex items-center justify-center">
                          <NonoCardGraphic
                            domainId={agent.id}
                            color={agent.furPresetColor}
                            accentSecondary={activePanelTheme.accentSecondary}
                          />
                          {/* 右上角狀態膠囊 */}
                          <div className="absolute top-2 right-2">
                            {isSocial ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400 text-emerald-300 text-[10px] font-bold shadow-sm">
                                ● 已就緒
                              </span>
                            ) : isReplier ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/25 border border-amber-400 text-amber-300 text-[10px] font-bold shadow-sm">
                                ● 共同員工
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-zinc-400 text-[10px] font-mono">
                                ○ 預留擴充
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 卡片下半部：純粹俐落的標題與單行簡述 */}
                        <div className="space-y-1 mb-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                              {agent.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-300 font-medium line-clamp-1">
                            {isSocial
                              ? '專案進度轉故事 · 自動排程發佈'
                              : isReplier
                                ? '社群與信件跨部門自動代回'
                                : agent.id === 'inbox'
                                  ? 'Gmail · LINE · SNS 集中整理'
                                  : agent.id === 'planner'
                                    ? '一日時間表與社群排程智慧串聯'
                                    : agent.id === 'life'
                                      ? '飲食熱量把關 · 喝水健康陪伴'
                                      : 'AE 軟體操作螢幕即時視覺引導'}
                          </p>
                        </div>

                        {/* 操作按鈕 */}
                        {isSocial ? (
                          <button
                            type="button"
                            onClick={() => {
                              setViewLayer('workbench');
                              setActiveWindow('notebook');
                            }}
                            style={{
                              background: `linear-gradient(90deg, ${activePanelTheme.accent}, ${activePanelTheme.accentSecondary})`,
                              boxShadow: `0 4px 14px ${activePanelTheme.glowRgba}`,
                            }}
                            className="w-full py-2 px-3 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:brightness-110 active:scale-95 transition-all shadow"
                          >
                            <span>進入發文工作台 ▶</span>
                          </button>
                        ) : (
                          <div className="w-full py-1.5 px-3 rounded-xl bg-white/5 border border-white/10 text-center text-[10px] text-zinc-400 font-mono">
                            {isReplier ? '共同員工待命 · 發文與訊息共同調度' : '預留擴充槽 · 待單一領域完善後掛載'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 底部狀態列 */}
                <div
                  style={{
                    backgroundColor: activePanelTheme.panelCard,
                    borderColor: `${activePanelTheme.border}40`,
                  }}
                  className="p-2.5 rounded-xl border flex items-center justify-between text-[11px] text-zinc-300 font-mono"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>跨領域協作架構已連線 · 支援跨軟體與共同員工調度</span>
                  </span>
                </div>
              </div>
            )}

            {/* LEVEL 2 工作台的面板主體 (當 viewLayer === 'workbench') */}
            {viewLayer === 'workbench' && (
              <>

            {/* ==================== PANEL 1: 多專案進度抓取 & 更新主題庫 ==================== */}
            {activeWindow === 'notebook' && (
              <div className="p-3.5 overflow-y-auto space-y-3 flex-1 min-h-0">
                {/* 區塊 A：跨專案切換與未來新專案進度自動抓取器 */}
                <div
                  style={{
                    backgroundColor: activePanelTheme.panelCard,
                    borderColor: `${activePanelTheme.border}55`,
                  }}
                  className="p-3 rounded-xl border space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <span>📂 專案進度自動抓取</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleScanProjectFolder('', activeProjectName)}
                      disabled={isScanningProject}
                      style={{
                        borderColor: activePanelTheme.accentSecondary,
                        color: activePanelTheme.accentSecondary,
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/50 hover:bg-white/10 border text-[10px] font-mono cursor-pointer"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isScanningProject ? 'animate-spin' : ''}`} />
                      <span>{isScanningProject ? '掃描中...' : '抓最新進度'}</span>
                    </button>
                  </div>

                  {/* 已探索到的專案按鈕列 */}
                  {projectsList.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-zinc-400">切換專案：</span>
                      {projectsList.map((proj) => {
                        const isCurrProj = proj.name === activeProjectName;
                        return (
                          <button
                            key={proj.id}
                            type="button"
                            onClick={() =>
                              handleScanProjectFolder(proj.folderPath, proj.name)
                            }
                            style={
                              isCurrProj
                                ? {
                                    backgroundColor: `${activePanelTheme.accent}35`,
                                    borderColor: activePanelTheme.accent,
                                    color: '#fff',
                                  }
                                : undefined
                            }
                            className="px-2 py-0.5 rounded-md bg-black/45 hover:bg-white/10 border border-white/15 text-[10px] font-mono text-zinc-200 cursor-pointer"
                            title={`路徑：${proj.folderPath} (${proj.lastScannedAt})`}
                          >
                            {proj.name} ({proj.themes?.length || 0})
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 輸入未來任何新專案資料夾路徑，自動抓取進度 */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/10">
                    <input
                      type="text"
                      value={customProjectNameInput}
                      onChange={(e) => setCustomProjectNameInput(e.target.value)}
                      placeholder="新專案名稱 (如: Live2D新衣)"
                      className="w-32 bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white placeholder:text-zinc-500"
                    />
                    <input
                      type="text"
                      value={customProjectPathInput}
                      onChange={(e) => setCustomProjectPathInput(e.target.value)}
                      placeholder="貼上電腦上任何專案資料夾路徑 (如 D:\MyGameProject)，自動抓 Git 與修改檔案進度..."
                      className="flex-1 min-w-[160px] bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white placeholder:text-zinc-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleScanProjectFolder()}
                      disabled={isScanningProject || !customProjectPathInput.trim()}
                      style={{
                        backgroundColor: `${activePanelTheme.accentSecondary}28`,
                        borderColor: activePanelTheme.accentSecondary,
                        color: activePanelTheme.accentSecondary,
                      }}
                      className="px-2.5 py-1 rounded-lg border text-[11px] font-bold hover:brightness-110 disabled:opacity-40 cursor-pointer shrink-0"
                    >
                      🔍 抓此專案進度
                    </button>
                  </div>
                </div>

                {/* 區塊 B：更新主題庫（點選後自動依主題做前後故事潤飾，絕不直寫 v0.1 / v0.2） */}
                <div
                  style={{
                    backgroundColor: activePanelTheme.panelCard,
                    borderColor: `${activePanelTheme.border}55`,
                  }}
                  className="p-3 rounded-xl border space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <label className="text-xs font-semibold flex items-center gap-1.5">
                      <span>✨ 01. 點選更新主題</span>
                    </label>
                  </div>

                  {/* 近期各版本主題快速勾選 / 選用 / 更新清單 */}
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {progressVersions.map((ver) => {
                      const isChecked = selectedVersionIds.includes(ver.id);
                      return (
                        <div
                          key={ver.id}
                          style={{
                            borderColor: isChecked
                              ? activePanelTheme.accentSecondary
                              : 'rgba(255,255,255,0.12)',
                            backgroundColor: isChecked
                              ? `${activePanelTheme.accentSecondary}16`
                              : 'rgba(0,0,0,0.4)',
                          }}
                          className="p-2 rounded-lg border flex items-start justify-between gap-2 text-[11px] transition-colors"
                        >
                          <div
                            onClick={() => handleToggleVersionSelection(ver.id)}
                            className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer"
                            title="點擊勾選此主題，Nono 會自動根據主題做好前後故事化潤飾（不寫生硬版本號）"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="mt-0.5 accent-pink-500 cursor-pointer shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  style={{
                                    backgroundColor: activePanelTheme.highlightTagBg,
                                    color: activePanelTheme.highlightTagText,
                                  }}
                                  className="px-1.5 py-0.2 rounded text-[9px] font-mono font-black"
                                >
                                  {ver.versionTag}
                                </span>
                                <span className="font-bold text-white truncate">{ver.title}</span>
                                <span className="text-[9px] text-zinc-400 font-mono">
                                  ({ver.updatedAt})
                                </span>
                              </div>
                              <div className="text-[10px] text-zinc-300 line-clamp-1 mt-0.5">
                                {ver.content}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleApplySingleVersion(ver)}
                              className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-zinc-200 cursor-pointer"
                              title="單獨以此主題生成前後潤飾故事貼文"
                            >
                              單選潤飾
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateVersionWithCurrentText(ver.id)}
                              style={{ color: activePanelTheme.accentSecondary }}
                              className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] cursor-pointer"
                              title="用下方輸入框目前寫的文字更新此主題"
                            >
                              更新
                            </button>
                            {progressVersions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteProgressVersion(ver.id)}
                                className="p-0.5 rounded text-zinc-400 hover:text-rose-400 cursor-pointer"
                                title="刪除此筆主題紀錄"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 實際進度主題輸入框 */}
                  <textarea
                    rows={2}
                    value={notebook.actualProgressLog}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNotebook((prev) => ({ ...prev, actualProgressLog: val }));
                      const story = buildClientStoryFromThemes(val, activeProjectName);
                      setBufferConfig((cfg) => ({
                        ...cfg,
                        content: story,
                        platformContents: buildClientPlatformCopies(story),
                      }));
                    }}
                    style={{ borderColor: `${activePanelTheme.border}55` }}
                    placeholder="勾選上方主題或輸入這次的進度重點..."
                    className="w-full bg-black/50 border rounded-xl p-2.5 text-xs text-zinc-100 leading-relaxed focus:outline-none resize-none"
                  />

                  {/* 新增／儲存新主題 + 清空選填列 */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <input
                      type="text"
                      value={newVersionTag}
                      onChange={(e) => setNewVersionTag(e.target.value)}
                      placeholder={`分類標籤(如 主題0${progressVersions.length + 1})`}
                      className="w-28 bg-black/45 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white placeholder:text-zinc-500 font-mono"
                    />
                    <input
                      type="text"
                      value={newVersionTitle}
                      onChange={(e) => setNewVersionTitle(e.target.value)}
                      placeholder="更新主題標題 (例如：去背桌面與滾輪互動)"
                      className="flex-1 min-w-[120px] bg-black/45 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white placeholder:text-zinc-500"
                    />
                    <button
                      type="button"
                      onClick={handleSaveNewProgressVersion}
                      style={{
                        backgroundColor: `${activePanelTheme.accent}33`,
                        borderColor: activePanelTheme.accent,
                      }}
                      className="px-2.5 py-1 rounded-lg border text-[11px] font-bold text-white hover:brightness-110 cursor-pointer shrink-0"
                    >
                      ＋ 存為新主題
                    </button>
                    {notebook.actualProgressLog.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedVersionIds([]);
                          setNotebook((prev) => ({ ...prev, actualProgressLog: '' }));
                          const story = buildClientStoryFromThemes('', activeProjectName);
                          setBufferConfig((cfg) => ({
                            ...cfg,
                            content: story,
                            platformContents: buildClientPlatformCopies(story),
                          }));
                          setProgressNotice('✓ 已切換為日常陪伴故事模式（不特定聚焦工程進度）');
                        }}
                        className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] text-zinc-300 cursor-pointer shrink-0"
                      >
                        清空(改發日常陪伴)
                      </button>
                    )}
                  </div>

                  {progressNotice && (
                    <div className="text-[10px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 rounded-lg px-2.5 py-1">
                      {progressNotice}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-white/10">
                  <button
                    onClick={handleGenerateFromNotebook}
                    disabled={isGeneratingDraft}
                    style={{
                      background: `linear-gradient(90deg, ${activePanelTheme.accent}, ${activePanelTheme.accentSecondary})`,
                      boxShadow: `0 8px 25px ${activePanelTheme.glowRgba}`,
                    }}
                    className="py-2.5 px-3 rounded-xl text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer hover:brightness-110"
                  >
                    <Wand2 className="w-4 h-4" />
                    {isGeneratingDraft
                      ? '正在深度潤飾故事貼文...'
                      : '👉 下一步：前往「步驟 ② 編輯文案與配圖」▶'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveWindow('buffer')}
                    style={{
                      backgroundColor: `${activePanelTheme.accentSecondary}24`,
                      borderColor: activePanelTheme.accentSecondary,
                      color: activePanelTheme.accentSecondary,
                    }}
                    className="py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:bg-white/10"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>跳至「步驟 ③ 選擇時間與排程」▶</span>
                  </button>
                </div>
              </div>
            )}

            {/* ==================== TAB 2: COMPOSER (STORY POLISH & PLATFORM PREVIEW) ==================== */}
            {activeWindow === 'composer' && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div
                  style={{ borderColor: `${activePanelTheme.border}38` }}
                  className="px-3.5 py-2 border-b shrink-0 flex flex-wrap items-center justify-between gap-2 bg-black/25"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-white">
                      ② 編輯文案與配圖
                    </span>
                    <span className="text-[10px] text-zinc-400">左邊編輯，右邊即時預覽</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const rawSource =
                          notebook.actualProgressLog.trim() ||
                          bufferConfig.content ||
                          '角色細節與互動陪伴優化';
                        const story = buildClientStoryFromThemes(
                          rawSource,
                          activeProjectName || 'Nono'
                        );
                        handleUpdateMasterContent(story);
                        setLastRefinedNotice('✨ 已依主題重新進行前後故事潤飾（無生硬版號）');
                      }}
                      style={{
                        borderColor: activePanelTheme.accentSecondary,
                        color: activePanelTheme.accentSecondary,
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/45 hover:bg-white/10 border text-[11px] font-bold cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>重新前後潤飾故事</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveWindow('buffer')}
                      style={{
                        backgroundColor: `${activePanelTheme.accent}33`,
                        borderColor: activePanelTheme.accent,
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold text-white hover:brightness-110 cursor-pointer"
                    >
                      <Calendar className="w-3 h-3" />
                      <span>前往 3. Buffer 排程 ({sortedScheduledPosts.length})</span>
                    </button>
                  </div>
                </div>

                <div
                  className={`flex-1 min-h-0 overflow-y-auto p-3.5 grid gap-3.5 ${
                    isSingleColumnLayout ? 'grid-cols-1' : 'grid-cols-12'
                  }`}
                >
                  <div className={`${isSingleColumnLayout ? '' : 'col-span-7'} space-y-3`}>
                    {(isXOverLimit || igHashtagExceeded) && (
                      <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                          <span>
                            {isXOverLimit
                              ? `X 加權字數 ${xWeightedLen}/280（約 ${xApproxChineseLen}/140 中文字）超限！`
                              : `IG 目前有 ${igHashtagCount} 個 #（上限 5 個）！`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleAutoAdaptAllPlatforms}
                          className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          ⚡ 一鍵自動修正
                        </button>
                      </div>
                    )}

                    {/* 發佈頻道勾選 */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold">
                          發佈頻道勾選（免費版最多 3 個頻道）
                        </label>
                        <span
                          style={{ color: activePanelTheme.textMuted }}
                          className="text-[11px] font-mono"
                        >
                          已選 {bufferConfig.platforms.length}/3
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {(Object.keys(PLATFORM_META) as BufferPlatform[]).map((p) => {
                          const active = bufferConfig.platforms.includes(p);
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => togglePlatform(p)}
                              style={
                                active
                                  ? {
                                      backgroundColor: `${activePanelTheme.accent}33`,
                                      borderColor: activePanelTheme.accent,
                                      color: '#ffffff',
                                    }
                                  : {
                                      backgroundColor: 'rgba(0,0,0,0.35)',
                                      borderColor: 'rgba(255,255,255,0.12)',
                                    }
                              }
                              className="py-1.5 px-2.5 rounded-lg border text-xs font-medium flex items-center justify-between transition-all cursor-pointer"
                            >
                              <span>{PLATFORM_META[p].label}</span>
                              {active && (
                                <Check
                                  style={{ color: activePanelTheme.accentSecondary }}
                                  className="w-3 h-3"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 多平台智慧適配切換與編輯區 */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingScope('master')}
                            style={
                              editingScope === 'master'
                                ? {
                                    backgroundColor: activePanelTheme.accent,
                                    color: '#ffffff',
                                  }
                                : undefined
                            }
                            className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-black/40 border border-white/10 text-zinc-300 cursor-pointer"
                          >
                            統一主文案
                          </button>
                          {(['x', 'instagram', 'threads', 'facebook'] as BufferPlatform[]).map(
                            (p) => {
                              const pText = bufferConfig.platformContents[p] || '';
                              const pOk =
                                p === 'x'
                                  ? getXWeightedLength(pText) <= 280
                                  : p === 'instagram'
                                    ? countHashtags(pText) <= 5 && pText.length <= 2200
                                    : pText.length <= PLATFORM_META[p].limit;
                              return (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => {
                                    setEditingScope(p);
                                    setPreviewPlatform(p);
                                  }}
                                  style={
                                    editingScope === p
                                      ? {
                                          backgroundColor: activePanelTheme.accentSecondary,
                                          color: '#041714',
                                        }
                                      : undefined
                                  }
                                  className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-black/40 border border-white/10 text-zinc-300 cursor-pointer flex items-center gap-1"
                                >
                                  <span>{PLATFORM_META[p].badge}版</span>
                                  <span className={pOk ? 'text-emerald-400' : 'text-rose-400'}>
                                    {pOk ? '✓' : '!'}
                                  </span>
                                </button>
                              );
                            }
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={handleAutoAdaptAllPlatforms}
                          style={{
                            borderColor: activePanelTheme.accentSecondary,
                            color: activePanelTheme.accentSecondary,
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/50 hover:bg-white/10 border text-[10px] font-bold cursor-pointer"
                        >
                          <Zap className="w-3 h-3" />
                          <span>自動調整各 App 文章</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 px-0.5">
                        <span className="truncate">
                          {editingScope === 'master'
                            ? '編輯主文案（自動同步調整各平台版本）'
                            : `${PLATFORM_META[editingScope].label}：${PLATFORM_META[editingScope].ruleDesc}`}
                        </span>
                        <span
                          className={`shrink-0 ml-1 ${
                            (editingScope === 'x' && getXWeightedLength(activeEditorText) > 280) ||
                            (editingScope !== 'master' &&
                              activeEditorText.length > PLATFORM_META[editingScope].limit)
                              ? 'text-rose-400 font-bold'
                              : 'text-emerald-300'
                          }`}
                        >
                          {editingScope === 'x'
                            ? `加權 ${getXWeightedLength(activeEditorText)}/280 (~${Math.ceil(getXWeightedLength(activeEditorText) / 2)}/140中文字)`
                            : editingScope === 'master'
                              ? `X版 ~${Math.ceil(getXWeightedLength(bufferConfig.platformContents.x || '') / 2)}/140字`
                              : `${activeEditorText.length}/${PLATFORM_META[editingScope].limit}字`}
                        </span>
                      </div>

                      <textarea
                        rows={5}
                        value={activeEditorText}
                        onChange={(e) => {
                          if (editingScope === 'master') {
                            handleUpdateMasterContent(e.target.value);
                          } else {
                            handleUpdatePlatformContent(editingScope, e.target.value);
                          }
                        }}
                        style={{ borderColor: `${activePanelTheme.border}55` }}
                        className="w-full bg-black/50 border rounded-xl p-2.5 text-xs text-white leading-relaxed focus:outline-none resize-none"
                      />

                      <div className="flex flex-wrap items-center gap-1">
                        {[
                          '#Nono培育觀察日記',
                          '#IndieDev',
                          '#3DDev',
                          '#Blender3D',
                          '#開發日常',
                        ].map((tag) => {
                          const included = activeEditorText.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleHashtagInPost(tag)}
                              style={
                                included
                                  ? {
                                      backgroundColor: `${activePanelTheme.accent}33`,
                                      borderColor: activePanelTheme.accent,
                                      color: '#ffffff',
                                    }
                                  : undefined
                              }
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono border transition-colors cursor-pointer ${
                                included
                                  ? ''
                                  : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 請 Nono 微調貼文細項 */}
                    <div
                      style={{
                        backgroundColor: activePanelTheme.panelCard,
                        borderColor: `${activePanelTheme.border}44`,
                      }}
                      className="p-2.5 rounded-xl border space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                          <Wand2
                            style={{ color: activePanelTheme.accent }}
                            className="w-3.5 h-3.5"
                          />
                          請 {activeDomainNono.name} 微調貼文故事與語氣
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleRefinePostWithNono(
                                undefined,
                                '請用更有畫面感的故事開場與收尾提問改寫，不要出現任何版本號碼'
                              )
                            }
                            disabled={isRefiningPost}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-white/8 hover:bg-white/15 text-emerald-300 cursor-pointer"
                          >
                            故事懸念感
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleRefinePostWithNono(
                                undefined,
                                '幫我把語氣改得更平實自然一點，字數再精簡一些'
                              )
                            }
                            disabled={isRefiningPost}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-white/8 hover:bg-white/15 text-zinc-300 cursor-pointer"
                          >
                            一鍵平實精簡
                          </button>
                        </div>
                      </div>
                      <form
                        onSubmit={(e) => handleRefinePostWithNono(e)}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={refineInput}
                          onChange={(e) => setRefineInput(e.target.value)}
                          placeholder="輸入想改的細節，例如：第一句改聊毛髮光澤、把語氣改活潑..."
                          className="flex-1 bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={!refineInput.trim() || isRefiningPost}
                          style={{
                            background: `linear-gradient(90deg, ${activePanelTheme.accent}, ${activePanelTheme.accentSecondary})`,
                          }}
                          className="px-3 py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          {isRefiningPost ? '修改中' : '套用微調'}
                        </button>
                      </form>
                      {lastRefinedNotice && (
                        <div className="text-[10px] text-emerald-300 font-mono">
                          {lastRefinedNotice}
                        </div>
                      )}
                    </div>

                    {/* 圖片 / 影片素材 */}
                    <div
                      style={{
                        backgroundColor: activePanelTheme.panelCard,
                        borderColor: `${activePanelTheme.border}44`,
                      }}
                      className="p-3 rounded-xl border space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                          <ImageIcon
                            style={{ color: activePanelTheme.accent }}
                            className="w-3.5 h-3.5"
                          />
                          貼文配圖 / 影片
                        </span>
                        <input
                          ref={mediaInputRef}
                          type="file"
                          accept="image/*,video/*"
                          multiple
                          onChange={handleLocalMediaUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => mediaInputRef.current?.click()}
                          style={{
                            backgroundColor: `${activePanelTheme.accent}33`,
                            borderColor: activePanelTheme.accent,
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-white text-[11px] font-bold cursor-pointer hover:brightness-110 shrink-0"
                        >
                          <Upload className="w-3 h-3" />
                          上傳電腦圖片/影片
                        </button>
                      </div>

                      <div className="flex gap-1.5">
                        <div className="relative flex-1">
                          <Link2 className="w-3 h-3 text-zinc-500 absolute left-2.5 top-2" />
                          <input
                            type="text"
                            value={cloudMediaUrlInput}
                            onChange={(e) => setCloudMediaUrlInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && cloudMediaUrlInput.trim()) {
                                e.preventDefault();
                                handleAddCloudMedia();
                              }
                            }}
                            placeholder="或貼上外部圖片網址 (https://...)"
                            className="w-full bg-black/45 border border-white/15 rounded-lg pl-7 pr-2 py-1 text-xs text-white placeholder:text-zinc-500"
                          />
                        </div>
                        {cloudMediaUrlInput.trim() && (
                          <button
                            type="button"
                            onClick={handleAddCloudMedia}
                            style={{
                              backgroundColor: activePanelTheme.accentSecondary,
                              color: '#041714',
                            }}
                            className="px-3 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer hover:brightness-110"
                          >
                            載入網址
                          </button>
                        )}
                      </div>

                      {bufferConfig.mediaAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1.5 border-t border-white/10">
                          {bufferConfig.mediaAttachments.map((media) => (
                            <div
                              key={media.id}
                              className="relative flex items-center gap-2 bg-black/55 border border-white/15 rounded-lg p-1.5 pr-7 max-w-[220px]"
                            >
                              {media.type === 'video' ? (
                                <video
                                  src={media.url}
                                  className="w-9 h-9 rounded object-cover bg-black shrink-0"
                                />
                              ) : (
                                <img
                                  src={media.url}
                                  alt={media.name}
                                  className="w-9 h-9 rounded object-cover bg-black shrink-0"
                                />
                              )}
                              <div className="min-w-0">
                                <div className="text-[10px] font-semibold text-white truncate">
                                  {media.name}
                                </div>
                                <div className="text-[9px] text-emerald-300 font-mono">
                                  ✓ 已掛載至預覽
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeMediaAttachment(media.id)}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column inside Composer Tab: Live Platform Preview */}
                  <div
                    className={`${
                      isSingleColumnLayout ? '' : 'col-span-5'
                    } flex flex-col justify-between space-y-3`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">排版預覽</span>
                      </div>

                      <div
                        style={{
                          backgroundColor: activePanelTheme.bgBase,
                          borderColor: `${activePanelTheme.border}55`,
                        }}
                        className="p-3 rounded-xl border space-y-2.5 shadow-inner"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-white/10 text-[10px]">
                          <span
                            style={{ color: activePanelTheme.accent }}
                            className="font-mono font-bold"
                          >
                            {PLATFORM_META[previewPlatform].label} 預覽
                          </span>
                          <span
                            style={{ color: activePanelTheme.accentSecondary }}
                            className="font-mono flex items-center gap-1"
                          >
                            <Clock className="w-3 h-3" />
                            {bufferConfig.scheduleMode === 'recommended_slot'
                              ? bufferConfig.selectedSlotLabel
                              : bufferConfig.scheduleMode === 'now'
                                ? '立即發送'
                                : bufferConfig.scheduleMode === 'queue'
                                  ? '直通下個空檔'
                                  : bufferConfig.scheduledTime.replace('T', ' ')}
                          </span>
                        </div>

                        {bufferConfig.mediaAttachments.length > 0 ? (
                          <div
                            className={`relative rounded-lg overflow-hidden bg-black border border-white/10 ${
                              previewPlatform === 'instagram'
                                ? 'aspect-square max-h-48 mx-auto'
                                : 'aspect-[16/9]'
                            }`}
                          >
                            {bufferConfig.mediaAttachments[0].type === 'video' ? (
                              <video
                                src={bufferConfig.mediaAttachments[0].url}
                                controls
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src={bufferConfig.mediaAttachments[0].url}
                                alt="Post Media Preview"
                                className="w-full h-full object-cover"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                removeMediaAttachment(bufferConfig.mediaAttachments[0].id)
                              }
                              className="absolute top-2 right-2 p-1 rounded-full bg-black/75 text-zinc-300 hover:text-white cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          previewPlatform === 'instagram' && (
                            <div
                              style={{ borderColor: `${activePanelTheme.border}55` }}
                              className="rounded-lg border border-dashed bg-white/[0.02] flex flex-col items-center justify-center p-3 text-center"
                            >
                              <ImageIcon
                                style={{ color: activePanelTheme.accent }}
                                className="w-4 h-4 mb-1"
                              />
                              <span className="text-[10px] text-zinc-300">
                                IG 貼文需附圖（若未附圖會自動略過 IG，只發送其他平台）
                              </span>
                            </div>
                          )
                        )}

                        {previewPlatform === 'instagram' && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-white">ave.studio</span>
                              <span
                                className={`text-[10px] font-mono ${
                                  previewHashtagCount > 5
                                    ? 'text-rose-400 font-bold'
                                    : 'text-emerald-300'
                                }`}
                              >
                                #標籤 {previewHashtagCount}/5 · {previewCharCount}/2200字
                              </span>
                            </div>
                            <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                              <strong className="mr-1.5 text-white">ave.studio</strong>
                              {currentPreviewText}
                            </p>
                          </div>
                        )}

                        {previewPlatform === 'threads' && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-white">ave_dev</span>
                              <span
                                className={`text-[10px] font-mono ${
                                  previewCharCount > 500
                                    ? 'text-rose-400 font-bold'
                                    : 'text-emerald-300'
                                }`}
                              >
                                {previewCharCount}/500 字
                              </span>
                            </div>
                            <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                              {currentPreviewText}
                            </p>
                            <div className="flex items-center gap-4 pt-1 text-zinc-400">
                              <Heart className="w-3.5 h-3.5" />
                              <MessageCircle className="w-3.5 h-3.5" />
                              <Repeat2 className="w-3.5 h-3.5" />
                              <Share2 className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        )}

                        {previewPlatform === 'x' && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white">Ave · @ave_dev</span>
                              <span
                                className={`text-[10px] font-mono ${
                                  getXWeightedLength(currentPreviewText) > 280
                                    ? 'text-rose-400 font-bold'
                                    : 'text-emerald-300'
                                }`}
                              >
                                加權 {getXWeightedLength(currentPreviewText)}/280 (~
                                {Math.ceil(getXWeightedLength(currentPreviewText) / 2)}/140中文字)
                              </span>
                            </div>
                            <p className="text-xs text-zinc-100 leading-relaxed whitespace-pre-wrap">
                              {currentPreviewText}
                            </p>
                            <div className="flex items-center justify-between pt-1 text-zinc-500">
                              <MessageCircle className="w-3.5 h-3.5" />
                              <Repeat2 className="w-3.5 h-3.5" />
                              <Heart className="w-3.5 h-3.5" />
                              <Bookmark className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        )}

                        {previewPlatform === 'facebook' && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-white">Ave 創作日誌</span>
                              <span className="text-[10px] font-mono text-emerald-300">
                                {previewCharCount}/2000 字
                              </span>
                            </div>
                            <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                              {currentPreviewText}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setActiveWindow('buffer')}
                        style={{
                          background: `linear-gradient(90deg, ${activePanelTheme.accent}, ${activePanelTheme.accentSecondary})`,
                          boxShadow: `0 8px 25px ${activePanelTheme.glowRgba}`,
                        }}
                        className="w-full py-2.5 px-4 rounded-xl text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer hover:brightness-110"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>👉 下一步：前往「步驟 ③ 選擇時間與排程」▶</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveWindow('notebook')}
                        className="w-full py-2.5 px-3 rounded-xl bg-white/8 hover:bg-white/15 border border-white/15 text-zinc-200 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <BookOpen className="w-4 h-4" />
                        <span>← 上一步：返回「步驟 ① 挑選進度主題」</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== TAB 3: BUFFER SCHEDULE, CLOUD DATA SYNC & FULL HISTORY ==================== */}
            {activeWindow === 'buffer' && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div
                  style={{ borderColor: `${activePanelTheme.border}38` }}
                  className="px-3.5 py-2 border-b shrink-0 flex flex-wrap items-center justify-between gap-2 bg-black/25"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      style={{
                        backgroundColor: activePanelTheme.highlightTagBg,
                        color: activePanelTheme.highlightTagText,
                      }}
                      className="px-2 py-0.5 rounded-sm text-[10px] font-mono font-black"
                    >
                      雲端與本機永久排程紀錄 ({sortedScheduledPosts.length} 篇)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSyncCloudScheduledPosts(false)}
                      disabled={isSyncingSchedule}
                      style={{
                        borderColor: `${activePanelTheme.accentSecondary}88`,
                        color: activePanelTheme.accentSecondary,
                      }}
                      className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border text-[10px] font-mono font-bold cursor-pointer transition-all disabled:opacity-40"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncingSchedule ? 'animate-spin' : ''}`} />
                      <span>
                        {isSyncingSchedule ? '正在抓取 Buffer 資料...' : '🔄 抓取 Buffer 雲端資料與排程紀錄'}
                      </span>
                    </button>
                  </div>

                  <button
                    onClick={() => setShowBufferConnectionModal(!showBufferConnectionModal)}
                    style={{
                      borderColor:
                        bufferApiToken.trim() || bufferWebhookUrl.trim()
                          ? '#34d399'
                          : activePanelTheme.border,
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/15 border text-[11px] transition-colors cursor-pointer"
                  >
                    <KeyRound
                      style={{
                        color:
                          bufferApiToken.trim() || bufferWebhookUrl.trim()
                            ? '#34d399'
                            : activePanelTheme.accent,
                      }}
                      className="w-3 h-3"
                    />
                    <span>
                      {bufferApiToken.trim() || bufferWebhookUrl.trim()
                        ? '✓ Buffer API 設定'
                        : '⚠️ 點此連結 Buffer API'}
                    </span>
                  </button>
                </div>

                <div
                  className={`flex-1 min-h-0 overflow-y-auto p-3.5 grid gap-3.5 ${
                    isSingleColumnLayout ? 'grid-cols-1' : 'grid-cols-12'
                  }`}
                >
                  {/* Left Column: Schedule Picker & Direct Buffer Upload */}
                  <div className={`${isSingleColumnLayout ? '' : 'col-span-7'} space-y-3`}>
                    {showBufferConnectionModal && (
                      <div
                        style={{
                          backgroundColor: activePanelTheme.panelCard,
                          borderColor: activePanelTheme.border,
                        }}
                        className="p-3 rounded-xl border space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">
                            Buffer 官方 GraphQL API / Webhook 連線設定
                          </span>
                          <button
                            onClick={() => setShowBufferConnectionModal(false)}
                            className="text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                          >
                            收起
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="password"
                            value={bufferApiToken}
                            onChange={(e) => setBufferApiToken(e.target.value)}
                            placeholder="1. Buffer API Key (必填)"
                            className="bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            type="text"
                            value={bufferProfileId}
                            onChange={(e) => setBufferProfileId(e.target.value)}
                            placeholder="2. Channel ID (自動抓取，可留空)"
                            className="bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                        <input
                          type="text"
                          value={bufferWebhookUrl}
                          onChange={(e) => setBufferWebhookUrl(e.target.value)}
                          placeholder="或貼上 Make / Zapier Webhook URL (選填)"
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white"
                        />

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[10px] text-zinc-400">
                            自動記憶金鑰並同步 Buffer 雲端排程與歷史紀錄
                          </span>
                          <button
                            type="button"
                            onClick={handleTestBufferConnection}
                            disabled={isTestingConnection}
                            style={{
                              backgroundColor: `${activePanelTheme.accentSecondary}28`,
                              borderColor: activePanelTheme.accentSecondary,
                            }}
                            className="px-3 py-1 rounded-lg border text-xs font-bold text-white hover:brightness-110 shrink-0 cursor-pointer"
                          >
                            {isTestingConnection ? '測試中...' : '🔌 測試連線並抓資料'}
                          </button>
                        </div>

                        {connectionStatusMsg && (
                          <div
                            className={`p-2 rounded-lg text-[11px] border ${
                              connectionStatusMsg.ok
                                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                                : 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                            }`}
                          >
                            {connectionStatusMsg.text}
                          </div>
                        )}
                      </div>
                    )}

                    {scheduleSyncNote && (
                      <div className="p-2 rounded-xl bg-sky-500/15 border border-sky-400/35 text-sky-200 text-[11px] flex items-center justify-between gap-2">
                        <span>{scheduleSyncNote}</span>
                        <button
                          type="button"
                          onClick={() => setScheduleSyncNote('')}
                          className="text-sky-300 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {freePlanWarning && (
                      <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-400/40 text-rose-200 text-xs flex items-start gap-2">
                        <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                        <div className="flex-1">{freePlanWarning}</div>
                        <button
                          onClick={() => setFreePlanWarning(null)}
                          className="text-rose-300 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {dispatchSuccessBanner && (
                      <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                          <span>{dispatchSuccessBanner}</span>
                        </div>
                        <button
                          onClick={() => setDispatchSuccessBanner(null)}
                          className="text-emerald-300 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* 排程摘要：只顯示發送對象，完整文案與預覽統一在步驟 ② 查看 */}
                    <div
                      style={{
                        backgroundColor: activePanelTheme.panelCard,
                        borderColor: `${activePanelTheme.border}44`,
                      }}
                      className="p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="text-zinc-300">
                        將發送到：
                        <strong className="text-white">
                          {bufferConfig.platforms.map((p) => PLATFORM_META[p].label).join('、') ||
                            '未選取'}
                        </strong>
                        {`　附件 ${bufferConfig.mediaAttachments.length} 個`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveWindow('composer')}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-white cursor-pointer"
                      >
                        ← 回步驟 ② 修改文案
                      </button>
                    </div>

                    {/* Buffer 推薦時段與排程（先選日期 -> 顯示推薦時段與自由改時分 + 顯示那天/近期/最後一篇排程） */}
                    <div
                      style={{
                        backgroundColor: activePanelTheme.panelCard,
                        borderColor: `${activePanelTheme.border}44`,
                      }}
                      className="p-3 rounded-xl border space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <Calendar
                            style={{ color: activePanelTheme.accentSecondary }}
                            className="w-3.5 h-3.5"
                          />
                          <span>排程日期與時間設定</span>
                        </div>

                        <span
                          style={{
                            backgroundColor: activePanelTheme.highlightTagBg,
                            color: activePanelTheme.highlightTagText,
                          }}
                          className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-sm"
                        >
                          {bufferConfig.scheduleMode === 'now'
                            ? '⚡ 立即發送'
                            : bufferConfig.scheduleMode === 'queue'
                              ? '📥 直通下個空檔'
                              : `📅 ${activeScheduledYmd} ${activeScheduledHm}`}
                        </span>
                      </div>

                      {/* 排程現況看板：最後一篇排程 / 那天排程 / 最近幾天排程 */}
                      <div className="p-2.5 rounded-lg bg-black/45 border border-white/10 space-y-1.5 text-[11px]">
                        {/* 1. 最後一篇排程是何時 */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 border-b border-white/10">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-bold shrink-0">
                              最後一篇排程
                            </span>
                            {lastScheduledPost ? (
                              <span className="font-mono text-white font-semibold truncate">
                                {formatYmdWithWeekday(lastScheduledPost.scheduledIso.slice(0, 10))}{' '}
                                <span style={{ color: activePanelTheme.accentSecondary }}>
                                  {lastScheduledPost.scheduledIso.slice(11, 16)}
                                </span>
                                <span className="text-zinc-400 text-[10px] ml-1.5">
                                  ({lastScheduledPost.platforms.map((p) => PLATFORM_META[p]?.badge || p).join('/')} · {lastScheduledPost.text.slice(0, 22)}...)
                                </span>
                              </span>
                            ) : (
                              <span className="text-zinc-400 text-[10px]">
                                目前尚無已排程紀錄（點上方「抓取 Buffer 雲端資料」或發送後自動記錄）
                              </span>
                            )}
                          </div>

                          {lastScheduledPost && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextDay = addDaysToYmd(
                                  lastScheduledPost.scheduledIso.slice(0, 10),
                                  1
                                );
                                handlePickScheduleDate(nextDay);
                              }}
                              style={{
                                backgroundColor: `${activePanelTheme.accent}28`,
                                borderColor: activePanelTheme.accent,
                              }}
                              className="px-2 py-0.5 rounded border text-[10px] font-bold text-white hover:brightness-110 cursor-pointer shrink-0"
                            >
                              ➕ 排在最後一篇隔天 ({addDaysToYmd(lastScheduledPost.scheduledIso.slice(0, 10), 1).slice(5)})
                            </button>
                          )}
                        </div>

                        {/* 2. 所選那天 ({activeScheduledYmd}) 的排程 */}
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="text-[10px] text-zinc-300 font-semibold">
                            📌 所選日期（{formatYmdWithWeekday(activeScheduledYmd)}）排程：
                          </span>
                          {postsOnSelectedDate.length === 0 ? (
                            <span className="text-[10px] text-emerald-300 font-mono">
                              ✨ 這天尚無排程，全天時段皆空！
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {postsOnSelectedDate.map((p) => (
                                <span
                                  key={p.id}
                                  className="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-[10px] font-mono text-amber-200"
                                  title={p.text}
                                >
                                  {p.scheduledIso.slice(11, 16)} ({p.platforms.map((pl) => PLATFORM_META[pl]?.badge || pl).join('/')})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 3. 最近幾天已排程一覽 */}
                        {recentDaysScheduledPosts.length > 0 && (
                          <div className="pt-1 border-t border-white/5 flex flex-wrap items-center gap-1">
                            <span className="text-[10px] text-zinc-400 shrink-0">
                              🗓️ 最近幾天已排：
                            </span>
                            {recentDaysScheduledPosts.slice(0, 6).map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handlePickScheduleDate(p.scheduledIso.slice(0, 10))}
                                className="px-1.5 py-0.5 rounded bg-black/50 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-zinc-300 cursor-pointer"
                                title={`點擊查看 ${p.scheduledIso.slice(0, 10)}：${p.text}`}
                              >
                                {p.scheduledIso.slice(5, 10).replace('-', '/')} {p.scheduledIso.slice(11, 16)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 步驟 1：先選擇排程日期 */}
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="text-[11px] font-bold text-white flex items-center gap-1">
                            <span
                              style={{ backgroundColor: activePanelTheme.accent }}
                              className="w-4 h-4 rounded-full text-[10px] flex items-center justify-center text-white font-mono"
                            >
                              1
                            </span>
                            先選擇排程日期
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                handlePickScheduleDate(addDaysToYmd(activeScheduledYmd, -1))
                              }
                              className="px-2 py-0.5 rounded bg-black/45 hover:bg-white/15 border border-white/15 text-[10px] text-zinc-200 cursor-pointer"
                            >
                              ◀ 前一天
                            </button>
                            <input
                              type="date"
                              value={activeScheduledYmd}
                              onChange={(e) => {
                                if (e.target.value) {
                                  handlePickScheduleDate(e.target.value);
                                }
                              }}
                              className="bg-black/60 border border-white/20 rounded px-2 py-0.5 text-[11px] font-mono text-white cursor-pointer"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handlePickScheduleDate(addDaysToYmd(activeScheduledYmd, 1))
                              }
                              className="px-2 py-0.5 rounded bg-black/45 hover:bg-white/15 border border-white/15 text-[10px] text-zinc-200 cursor-pointer"
                            >
                              後一天 ▶
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
                          {upcoming7Days.map((day) => {
                            const isDaySelected =
                              hasPickedScheduleDate && activeScheduledYmd === day.ymd;
                            return (
                              <button
                                key={day.ymd}
                                type="button"
                                onClick={() => handlePickScheduleDate(day.ymd)}
                                style={
                                  isDaySelected
                                    ? {
                                        backgroundColor: `${activePanelTheme.accent}38`,
                                        borderColor: activePanelTheme.accent,
                                      }
                                    : {
                                        backgroundColor: 'rgba(0,0,0,0.38)',
                                        borderColor: 'rgba(255,255,255,0.12)',
                                      }
                                }
                                className="px-1.5 py-1.5 rounded-lg border text-center transition-all cursor-pointer hover:border-white/35 flex flex-col items-center justify-center"
                              >
                                <span className="text-[10px] font-bold text-white leading-tight">
                                  {day.label}
                                </span>
                                <span className="text-[9px] font-mono text-zinc-400">
                                  {day.ymd.slice(5).replace('-', '/')}
                                </span>
                                {day.countOnDay > 0 && (
                                  <span
                                    style={{ color: activePanelTheme.accentSecondary }}
                                    className="text-[9px] font-mono font-bold mt-0.5"
                                  >
                                    已排{day.countOnDay}篇
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 步驟 2：選好日期後，才顯示「該日期的推薦時間」與「自由調整幾點幾分」 */}
                      {!hasPickedScheduleDate ? (
                        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-dashed border-white/15 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-zinc-300">
                            👆 請先點選上方任一「排程日期」，系統就會針對該日期推薦最佳時段並開放微調幾點幾分！
                          </span>
                          <button
                            type="button"
                            onClick={() => handlePickScheduleDate(activeScheduledYmd)}
                            style={{
                              backgroundColor: `${activePanelTheme.accentSecondary}28`,
                              borderColor: activePanelTheme.accentSecondary,
                              color: activePanelTheme.accentSecondary,
                            }}
                            className="px-2.5 py-1 rounded-lg border text-[10px] font-bold shrink-0 cursor-pointer hover:brightness-110"
                          >
                            直接選今天 ({activeScheduledYmd.slice(5)})
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 pt-1.5 border-t border-white/10">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-white flex items-center gap-1">
                              <span
                                style={{ backgroundColor: activePanelTheme.accentSecondary, color: '#041714' }}
                                className="w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-mono font-bold"
                              >
                                2
                              </span>
                              <span>
                                {formatYmdWithWeekday(activeScheduledYmd)} 的推薦時間（點選套用，或下方自由改時分）
                              </span>
                            </span>

                            <button
                              type="button"
                              onClick={handleRefreshRecommendedSlots}
                              style={{
                                borderColor: `${activePanelTheme.accentSecondary}88`,
                                color: activePanelTheme.accentSecondary,
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/45 hover:bg-white/10 border text-[10px] font-mono cursor-pointer transition-all"
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                              <span>換一批推薦 ({lastSlotRefreshedAt})</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                            {recommendedSlots.map((slot) => {
                              const isSelected =
                                (bufferConfig.scheduleMode === 'recommended_slot' ||
                                  bufferConfig.scheduleMode === 'custom_time') &&
                                bufferConfig.scheduledTime === slot.scheduledIso;
                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  onClick={() => handleSelectRecommendedSlot(slot)}
                                  style={
                                    isSelected
                                      ? {
                                          backgroundColor: `${activePanelTheme.accentSecondary}28`,
                                          borderColor: activePanelTheme.accentSecondary,
                                        }
                                      : {
                                          backgroundColor: 'rgba(0,0,0,0.35)',
                                          borderColor: 'rgba(255,255,255,0.12)',
                                        }
                                  }
                                  className="p-2 rounded-lg border text-left transition-all cursor-pointer hover:border-white/30"
                                >
                                  <div className="flex items-center justify-between text-[11px] font-semibold">
                                    <span className="truncate">{slot.label}</span>
                                    <span
                                      style={{ color: activePanelTheme.accentSecondary }}
                                      className="font-mono shrink-0 ml-1 font-bold"
                                    >
                                      {slot.timeString}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-zinc-400 mt-0.5 truncate">
                                    {slot.reason}
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          <div className="p-2 rounded-lg bg-black/40 border border-white/10 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Clock
                                style={{ color: activePanelTheme.accent }}
                                className="w-3.5 h-3.5 shrink-0"
                              />
                              <span className="text-[11px] font-semibold text-zinc-200">
                                自訂時間：
                              </span>
                              <select
                                value={activeHourStr}
                                onChange={(e) =>
                                  handlePickTimeHourMinute(e.target.value, activeMinStr)
                                }
                                className="bg-black/75 border border-white/20 rounded px-1.5 py-0.5 text-xs font-mono text-white cursor-pointer"
                              >
                                {Array.from({ length: 24 }, (_, h) =>
                                  String(h).padStart(2, '0')
                                ).map((hh) => (
                                  <option key={hh} value={hh} className="bg-zinc-900 text-white">
                                    {hh} 點
                                  </option>
                                ))}
                              </select>
                              <span className="text-xs font-mono text-zinc-400">:</span>
                              <select
                                value={activeMinStr}
                                onChange={(e) =>
                                  handlePickTimeHourMinute(activeHourStr, e.target.value)
                                }
                                className="bg-black/75 border border-white/20 rounded px-1.5 py-0.5 text-xs font-mono text-white cursor-pointer"
                              >
                                {Array.from(
                                  new Set([
                                    '00',
                                    '05',
                                    '10',
                                    '15',
                                    '20',
                                    '25',
                                    '30',
                                    '35',
                                    '40',
                                    '45',
                                    '50',
                                    '55',
                                    activeMinStr,
                                  ])
                                )
                                  .sort()
                                  .map((mm) => (
                                    <option key={mm} value={mm} className="bg-zinc-900 text-white">
                                      {mm} 分
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div className="flex flex-wrap items-center gap-1">
                              {[
                                { hh: '12', mm: '30', tag: '12:30 午休' },
                                { hh: '18', mm: '30', tag: '18:30 下班' },
                                { hh: '20', mm: '30', tag: '20:30 晚間' },
                                { hh: '22', mm: '00', tag: '22:00 深夜' },
                              ].map((preset) => {
                                const isActiveTime =
                                  activeHourStr === preset.hh && activeMinStr === preset.mm;
                                return (
                                  <button
                                    key={preset.tag}
                                    type="button"
                                    onClick={() =>
                                      handlePickTimeHourMinute(preset.hh, preset.mm)
                                    }
                                    style={
                                      isActiveTime
                                        ? {
                                            backgroundColor: `${activePanelTheme.accent}44`,
                                            borderColor: activePanelTheme.accent,
                                            color: '#fff',
                                          }
                                        : undefined
                                    }
                                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-[10px] font-mono text-zinc-300 cursor-pointer"
                                  >
                                    {preset.tag}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/10">
                        {[
                          {
                            mode: 'custom_time' as const,
                            label: `📅 依選定時間排程 (${activeScheduledYmd.slice(5).replace('-', '/')} ${activeScheduledHm})`,
                          },
                          { mode: 'queue' as const, label: '📥 直接排入下個空檔' },
                          { mode: 'now' as const, label: '⚡ 立即發佈' },
                        ].map((m) => {
                          const isSelectedMode =
                            bufferConfig.scheduleMode === m.mode ||
                            (m.mode === 'custom_time' &&
                              bufferConfig.scheduleMode === 'recommended_slot');
                          return (
                            <button
                              key={m.mode}
                              type="button"
                              onClick={() => {
                                if (m.mode === 'custom_time') {
                                  setHasPickedScheduleDate(true);
                                }
                                setBufferConfig((prev) => ({
                                  ...prev,
                                  scheduleMode: m.mode,
                                  status: 'ready_to_schedule',
                                }));
                              }}
                              style={
                                isSelectedMode
                                  ? {
                                      backgroundColor: `${activePanelTheme.accent}33`,
                                      borderColor: activePanelTheme.accent,
                                      color: '#ffffff',
                                    }
                                  : undefined
                              }
                              className="px-2.5 py-1 rounded-lg text-[11px] border bg-black/30 border-white/10 text-zinc-300 cursor-pointer"
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleConfirmBuffer}
                      disabled={
                        bufferConfig.platforms.length === 0 ||
                        !bufferConfig.content.trim() ||
                        isDispatchingBuffer
                      }
                      style={{
                        background: `linear-gradient(90deg, ${activePanelTheme.accent}, ${activePanelTheme.accentSecondary})`,
                        boxShadow: `0 8px 25px ${activePanelTheme.glowRgba}`,
                      }}
                      className="w-full py-2.5 px-4 rounded-xl text-white font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer hover:brightness-110"
                    >
                      <Check className="w-4 h-4" />
                      {isDispatchingBuffer
                        ? '正在傳送至 Buffer 排程佇列並寫入完整紀錄...'
                        : '🚀 確認直接上傳 Buffer 排程（永久記錄發送內容）'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveWindow('composer')}
                      className="w-full py-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>← 返回「步驟 ② 編輯文案與配圖」微調</span>
                    </button>
                  </div>

                  {/* Right Column: Full Scheduled & Sent Posts History (Cloud + Local Persistent Store) */}
                  <div
                    className={`${
                      isSingleColumnLayout ? '' : 'col-span-5'
                    } flex flex-col justify-between space-y-3`}
                  >
                    <div
                      style={{
                        backgroundColor: activePanelTheme.panelCard,
                        borderColor: `${activePanelTheme.border}44`,
                      }}
                      className="p-3 rounded-xl border flex flex-col flex-1 min-h-0 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Sparkles
                              style={{ color: activePanelTheme.accentSecondary }}
                              className="w-3.5 h-3.5"
                            />
                            <span>📋 已排程與已發送完整內容紀錄 ({sortedScheduledPosts.length} 篇)</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            自動整合 Buffer 雲端排程與本機發送紀錄，完整保存您發過的每一篇貼文內容
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSyncCloudScheduledPosts(false)}
                          disabled={isSyncingSchedule}
                          style={{
                            backgroundColor: `${activePanelTheme.accentSecondary}24`,
                            borderColor: activePanelTheme.accentSecondary,
                            color: activePanelTheme.accentSecondary,
                          }}
                          className="px-2.5 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 cursor-pointer hover:brightness-110 shrink-0"
                        >
                          <RefreshCw className={`w-3 h-3 ${isSyncingSchedule ? 'animate-spin' : ''}`} />
                          <span>抓 Buffer 資料</span>
                        </button>
                      </div>

                      <div className="flex-1 max-h-[420px] overflow-y-auto space-y-2 pr-1">
                        {sortedScheduledPosts.length === 0 ? (
                          <div className="py-8 px-4 text-center space-y-2 rounded-xl bg-black/30 border border-dashed border-white/10">
                            <div className="text-xs text-zinc-300 font-semibold">
                              目前尚無已排程或已發送的貼文紀錄
                            </div>
                            <p className="text-[11px] text-zinc-400 leading-relaxed">
                              當您點擊左側「確認直接上傳 Buffer 排程」或上方「抓 Buffer 資料」後，所有排程時間與完整貼文內容都會永久顯示在這裡！
                            </p>
                          </div>
                        ) : (
                          sortedScheduledPosts.map((qp, idx) => {
                            const isLatest = idx === sortedScheduledPosts.length - 1;
                            return (
                              <div
                                key={qp.id}
                                onClick={() => handlePickScheduleDate(qp.scheduledIso.slice(0, 10))}
                                className="p-2.5 rounded-xl bg-black/45 hover:bg-black/65 border border-white/12 text-xs space-y-1.5 cursor-pointer transition-all"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {isLatest && (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-500/25 border border-amber-400/50 text-amber-300 text-[9px] font-bold shrink-0">
                                        最後一篇排程
                                      </span>
                                    )}
                                    <span
                                      style={{ color: activePanelTheme.accentSecondary }}
                                      className="font-mono font-bold text-[11px]"
                                    >
                                      📅 {qp.scheduledIso.slice(0, 16).replace('T', ' ')}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <span
                                      style={{
                                        backgroundColor: `${activePanelTheme.accent}33`,
                                        color: activePanelTheme.textMain,
                                      }}
                                      className="px-1.5 py-0.5 rounded-sm font-mono text-[9px]"
                                    >
                                      {qp.platforms.map((p) => PLATFORM_META[p]?.badge || p).join(' / ')}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUpdateMasterContent(qp.text);
                                        setActiveWindow('composer');
                                      }}
                                      className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[9px] text-zinc-200 cursor-pointer"
                                      title="將這篇已排程內容載入回編輯器"
                                    >
                                      載入編輯
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        setQueuedPosts((prev) =>
                                          prev.filter((item) => item.id !== qp.id)
                                        );
                                        try {
                                          await fetch('/api/buffer/delete-history-item', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ id: qp.id }),
                                          });
                                        } catch {
                                          // ignore
                                        }
                                      }}
                                      className="text-zinc-500 hover:text-rose-300 px-1 cursor-pointer"
                                      title="刪除此筆紀錄"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>

                                <div className="p-2 rounded-lg bg-black/50 border border-white/8 text-[11px] text-zinc-100 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                                  {qp.text || '（無文字內容）'}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== TAB 4: MODULAR NONO ECOSYSTEM SLOTS & UNIVERSAL APP BRIDGE ==================== */}
            {activeWindow === 'council' && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div
                  style={{ borderColor: `${activePanelTheme.border}38` }}
                  className="px-3.5 py-2 border-b shrink-0 flex flex-wrap items-center justify-between gap-2 bg-black/25"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      style={{
                        backgroundColor: activePanelTheme.highlightTagBg,
                        color: activePanelTheme.highlightTagText,
                      }}
                      className="px-2 py-0.5 rounded-sm text-[10px] font-mono font-black"
                    >
                      🔌 Nono 未來多領域插拔架構 & 通用各軟體橋接中心
                    </span>
                    <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 rounded-sm">
                      目前主力完善：📣 社群發文總管 Nono（其他領域預留插槽，未來完善後一鍵合併）
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunMultiSkillPipeline}
                    disabled={isRunningMultiSkill}
                    style={{
                      backgroundColor: `${activePanelTheme.accentSecondary}24`,
                      borderColor: activePanelTheme.accentSecondary,
                      color: activePanelTheme.accentSecondary,
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer hover:brightness-110 disabled:opacity-40"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>
                      {isRunningMultiSkill
                        ? '正在連段執行社群發文所有步驟...'
                        : '⚡ 讓「📣 社群發文總管 Nono」一次包辦：抓進度+潤飾+排程'}
                    </span>
                  </button>
                </div>

                <div
                  className={`flex-1 min-h-0 overflow-y-auto p-3.5 grid gap-3.5 ${
                    isSingleColumnLayout ? 'grid-cols-1' : 'grid-cols-12'
                  }`}
                >
                  {/* Left Column: 6 Modular Domain Nonos (1 Active Social Nono + 1 Shared Employee + 4 Reserved Slots) */}
                  <div className={`${isSingleColumnLayout ? '' : 'col-span-6'} space-y-3`}>
                    <div
                      style={{
                        backgroundColor: activePanelTheme.panelCard,
                        borderColor: `${activePanelTheme.border}44`,
                      }}
                      className="p-3 rounded-xl border space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">
                          1. Nono 多領域模組插槽（單一領域完善後即可直接掛載合併）
                        </span>
                        <span className="text-[10px] font-mono text-emerald-300">
                          模組化插拔架構
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 max-h-[360px] overflow-y-auto pr-1">
                        {NONO_DOMAIN_AGENTS.map((agent) => {
                          const isSelected = agent.id === activeNonoAgentId;
                          return (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => handleSwitchDomainNono(agent)}
                              style={
                                isSelected
                                  ? {
                                      backgroundColor: `${agent.furPresetColor}26`,
                                      borderColor: agent.furPresetColor,
                                    }
                                  : {
                                      backgroundColor: 'rgba(0,0,0,0.4)',
                                      borderColor: 'rgba(255,255,255,0.1)',
                                    }
                              }
                              className="p-2.5 rounded-xl border text-left transition-all cursor-pointer hover:border-white/30 space-y-1"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-1">
                                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                  <span>{agent.name}</span>
                                </span>
                                {agent.status === 'active' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[9px] font-bold">
                                    ✓ 目前主力領域（已完整啟用）
                                  </span>
                                ) : agent.status === 'shared_staff_slot' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[9px] font-bold">
                                    🤝 發文＋訊息共同員工預留槽
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-zinc-300 text-[9px] font-mono">
                                    🔌 未來模組預留槽（待合併）
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] font-semibold text-zinc-200">
                                {agent.domain}
                              </div>

                              {agent.sharedManagers && (
                                <div className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded px-2 py-0.5">
                                  👥 共同主管：{agent.sharedManagers.join(' ＋ ')}
                                </div>
                              )}

                              <p className="text-[10px] text-zinc-400 leading-snug">
                                {agent.desc}
                              </p>

                              <div className="text-[9px] font-mono text-sky-300/90 pt-0.5">
                                🔗 可橋接任意軟體：{agent.connectedAppsHint}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 同一個社群發文 Nono 同時執行所有社群發文功能流水線 */}
                    <div
                      style={{
                        backgroundColor: activePanelTheme.panelCard,
                        borderColor: `${activePanelTheme.border}44`,
                      }}
                      className="p-3 rounded-xl border space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Zap
                            style={{ color: activePanelTheme.accentSecondary }}
                            className="w-3.5 h-3.5"
                          />
                          「📣 社群發文總管 Nono」單機全功能連段處理
                        </span>
                        <button
                          type="button"
                          onClick={handleRunMultiSkillPipeline}
                          disabled={isRunningMultiSkill}
                          style={{
                            background: `linear-gradient(90deg, ${activePanelTheme.accent}, ${activePanelTheme.accentSecondary})`,
                          }}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-white cursor-pointer hover:brightness-110 disabled:opacity-40"
                        >
                          {isRunningMultiSkill ? '執行中...' : '⚡ 一鍵連段執行'}
                        </button>
                      </div>
                      <p className="text-[11px] text-zinc-300 leading-relaxed">
                        負責社群發文的這位 Nono 會自己同時動用多項技能：
                        <strong className="text-white">
                          「抓專案進度 ➔ 去除版本號轉化為故事貼文 ➔ 對齊最後一篇排程隔天」
                        </strong>
                        一次完成！
                      </p>

                      {multiSkillSteps.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-white/10">
                          {multiSkillSteps.map((st, idx) => (
                            <div
                              key={idx}
                              className="p-2 rounded-lg bg-black/45 border border-white/10 text-[11px] space-y-0.5"
                            >
                              <div className="font-bold text-emerald-300 font-mono">{st.title}</div>
                              <div className="text-zinc-300">{st.detail}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Inter-Nono Communication Bus & Universal Software Connector */}
                  <div
                    className={`${
                      isSingleColumnLayout ? '' : 'col-span-6'
                    } flex flex-col justify-between space-y-3`}
                  >
                    <div
                      style={{
                        backgroundColor: activePanelTheme.panelCard,
                        borderColor: `${activePanelTheme.border}44`,
                      }}
                      className="p-3 rounded-xl border flex flex-col flex-1 min-h-0 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Sparkles
                              style={{ color: activePanelTheme.accent }}
                              className="w-3.5 h-3.5"
                            />
                            <span>📡 多 Nono 內部通訊總線 & 共同員工派工預演室</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            預留標準化內部通訊協定（不綁定特定外部軟體），未來各領域 Nono 合併後可互相點名溝通或共同調度「智慧回信共同員工 Nono」
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRunGrokBotCouncil()}
                          disabled={isRunningCouncil}
                          style={{
                            background: `linear-gradient(90deg, ${activePanelTheme.accent}, ${activePanelTheme.accentSecondary})`,
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer hover:brightness-110 disabled:opacity-40 shrink-0"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>
                            {isRunningCouncil ? '多 Nono 正在通訊...' : '🚀 預演多 Nono 內部通訊與共同員工派工'}
                          </span>
                        </button>
                      </div>

                      {/* 跨領域指令輸入框 */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleRunGrokBotCouncil();
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={councilCommandInput}
                          onChange={(e) => setCouncilCommandInput(e.target.value)}
                          placeholder="測試跨 Nono 溝通指令（如：整理發文排程、或請訊息與發文 Nono 派共同員工回信）..."
                          className="flex-1 bg-black/55 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={isRunningCouncil}
                          style={{
                            backgroundColor: `${activePanelTheme.accentSecondary}28`,
                            borderColor: activePanelTheme.accentSecondary,
                            color: activePanelTheme.accentSecondary,
                          }}
                          className="px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer hover:brightness-110 shrink-0"
                        >
                          發送指令
                        </button>
                      </form>

                      {/* 多 Nono 對話紀錄區 */}
                      <div className="flex-1 max-h-[340px] overflow-y-auto space-y-2 pr-1">
                        {councilMessages.map((turn, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-black/50 border border-white/12 space-y-1"
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-white flex items-center gap-1.5">
                                <span style={{ color: turn.color || activePanelTheme.accent }}>
                                  {turn.agentName}
                                </span>
                                <span
                                  style={{ color: activePanelTheme.accentSecondary }}
                                  className="text-[10px] font-mono"
                                >
                                  [{turn.domain}]
                                </span>
                              </span>
                              <span className="text-[9px] font-mono text-zinc-500">
                                Bus #{idx + 1}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                              {turn.message}
                            </p>
                          </div>
                        ))}
                      </div>

                      {councilMessages.length > 0 && (
                        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-emerald-300 font-mono">
                            ✓ 目前先專注完善「📣 社群發文總管 Nono」，未來其他 Nono 模組隨時可無縫掛載！
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setActiveWindow('composer')}
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white cursor-pointer"
                            >
                              ✍️ 查看故事貼文
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveWindow('buffer')}
                              style={{
                                backgroundColor: `${activePanelTheme.accent}38`,
                                borderColor: activePanelTheme.accent,
                              }}
                              className="px-2.5 py-1 rounded-lg border text-[11px] font-bold text-white cursor-pointer"
                            >
                              📅 前往確認排程
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}


              </>
            )}

            {/* ==================== APPEARANCE & 3D CONTROLS DRAWER / PANEL ==================== */}
            {(isAppearanceDrawerOpen || activeWindow === 'appearance') && (
              <div className="p-3.5 space-y-3.5 overflow-y-auto flex-1 min-h-0 bg-black/60 backdrop-blur-xl">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-1.5">
                    <Sparkles
                      style={{ color: activePanelTheme.accent }}
                      className="w-4 h-4"
                    />
                    <span className="text-xs font-bold text-white">
                      🎨 Nono 3D 外觀、動作與主題微調
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAppearanceDrawerOpen(false);
                      if (activeWindow === 'appearance') setActiveWindow('notebook');
                    }}
                    className="text-[10px] font-mono text-zinc-300 hover:text-white px-2 py-0.5 rounded bg-white/10 cursor-pointer"
                  >
                    關閉設定 ✕
                  </button>
                </div>
                <div
                  style={{
                    backgroundColor: activePanelTheme.panelCard,
                    borderColor: `${activePanelTheme.border}55`,
                  }}
                  className="p-3 rounded-xl border space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <PastelAuraStar
                        size={20}
                        idSuffix="theme-sec-star"
                        accentColor={activePanelTheme.accent}
                        secondaryColor={activePanelTheme.accentSecondary}
                        coreColor={activePanelTheme.highlightTagBg}
                      />
                      <span className="text-xs font-bold">
                        01. 面板、對話框與對話星星整體配色主題
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSyncPanelWithFur((v) => !v)}
                      style={{
                        borderColor: syncPanelWithFur
                          ? activePanelTheme.highlightTagBg
                          : 'rgba(255,255,255,0.2)',
                        color: syncPanelWithFur
                          ? activePanelTheme.highlightTagBg
                          : activePanelTheme.textMuted,
                      }}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-black/45 border cursor-pointer"
                    >
                      {syncPanelWithFur ? '✓ 換毛色同步換面板' : '面板色獨立選擇'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {PANEL_THEME_PRESETS.map((theme) => {
                      const isSelected = theme.id === activePanelTheme.id;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => setPanelThemeId(theme.id)}
                          style={{
                            backgroundColor: theme.panelBg,
                            borderColor: isSelected ? theme.accent : 'rgba(255,255,255,0.14)',
                            boxShadow: isSelected ? `0 0 18px ${theme.glowRgba}` : undefined,
                          }}
                          className="p-2 rounded-xl border-2 text-left transition-all flex items-center gap-2.5 cursor-pointer hover:scale-[1.01]"
                        >
                          <div className="relative w-10 h-7 shrink-0 flex items-center">
                            <span
                              className="w-5 h-5 rounded-full border border-white/80"
                              style={{ backgroundColor: theme.accent }}
                            />
                            <span
                              className="w-5 h-5 rounded-full border border-white/80 -ml-2"
                              style={{ backgroundColor: theme.accentSecondary }}
                            />
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black -ml-1.5"
                              style={{ backgroundColor: theme.highlightTagBg }}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div
                              style={{ color: theme.textMain }}
                              className="text-xs font-bold truncate"
                            >
                              {theme.name}
                            </div>
                            <div
                              style={{ color: theme.textMuted }}
                              className="text-[10px] truncate"
                            >
                              {theme.sub}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold">
                      02. Nono 雙層漸層毛色選擇（內層髮根 × 外層髮梢光澤）
                    </label>
                    <span
                      style={{ color: activePanelTheme.accentSecondary }}
                      className="text-[10px] font-mono"
                    >
                      DUAL.FUR.SHADER
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {FUR_COLOR_PRESETS.map((preset) => {
                      const isSelected = furColor === preset.color;
                      return (
                        <button
                          key={preset.color}
                          type="button"
                          onClick={() => {
                            setFurColor(preset.color);
                            if (syncPanelWithFur && preset.linkedThemeId) {
                              setPanelThemeId(preset.linkedThemeId);
                            }
                            updateSpeechForBehavior('spawned_friend', `COLOR · ${preset.name}`);
                          }}
                          style={
                            isSelected
                              ? {
                                  backgroundColor: `${activePanelTheme.accent}26`,
                                  borderColor: activePanelTheme.accent,
                                  boxShadow: `0 0 16px ${activePanelTheme.glowRgba}`,
                                }
                              : {
                                  backgroundColor: 'rgba(0,0,0,0.4)',
                                  borderColor: 'rgba(255,255,255,0.12)',
                                }
                          }
                          className="p-2 rounded-xl border-2 text-left transition-all flex items-center gap-2.5 cursor-pointer hover:scale-[1.01]"
                        >
                          <div className="relative w-10 h-7 shrink-0 flex items-center">
                            <span
                              className="w-5 h-5 rounded-full border-2 border-white/75 shadow-md"
                              style={{ backgroundColor: preset.basePreview }}
                            />
                            <span
                              className="w-5 h-5 rounded-full border-2 border-white/90 shadow-md -ml-2 relative flex items-center justify-center"
                              style={{ backgroundColor: preset.tipPreview }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-white/90 absolute top-0.5 left-0.5" />
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate">
                              {preset.name}
                            </div>
                            <div
                              style={{ color: activePanelTheme.textMuted }}
                              className="text-[10px] truncate"
                            >
                              {preset.sub}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: activePanelTheme.panelCard,
                    borderColor: `${activePanelTheme.border}44`,
                  }}
                  className="p-3 rounded-xl border space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">03. 待機動作切換預覽</span>
                    <span
                      style={{ color: activePanelTheme.accentSecondary }}
                      className="text-[10px] font-mono"
                    >
                      目前：{actionLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {IDLE_ACTION_POOL.map((item) => (
                      <button
                        key={item.action}
                        type="button"
                        onClick={() => {
                          setIdleAction(item.action);
                          setActionLabel(item.label);
                        }}
                        style={
                          idleAction === item.action
                            ? {
                                backgroundColor: `${activePanelTheme.accent}38`,
                                borderColor: activePanelTheme.accent,
                                color: '#ffffff',
                              }
                            : undefined
                        }
                        className="px-2.5 py-1 rounded-lg text-[11px] border bg-black/40 border-white/10 text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>{item.label}</span>
                        <span
                          style={
                            item.tag === '動態'
                              ? {
                                  backgroundColor: `${activePanelTheme.accent}33`,
                                  color: activePanelTheme.textMain,
                                }
                              : {
                                  backgroundColor: `${activePanelTheme.accentSecondary}28`,
                                  color: activePanelTheme.accentSecondary,
                                }
                          }
                          className="text-[9px] px-1 rounded-sm font-mono"
                        >
                          {item.tag}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleEnterDeepSleep}
                      style={
                        idleAction === 'deep_sleep'
                          ? {
                              backgroundColor: `${activePanelTheme.accentSecondary}38`,
                              borderColor: activePanelTheme.accentSecondary,
                              color: '#ffffff',
                            }
                          : undefined
                      }
                      className="px-2.5 py-1 rounded-lg text-[11px] border bg-black/40 border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    >
                      深層熟睡模式
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: activePanelTheme.panelCard,
                    borderColor: `${activePanelTheme.border}44`,
                  }}
                  className="p-3 rounded-xl border space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">
                      04. 3D 模型大小縮放（滑鼠移到 Nono 上滾動滾輪即可直接放大縮小！）
                    </span>
                    <span
                      style={{ color: activePanelTheme.highlightTagBg }}
                      className="text-[11px] font-mono font-bold"
                    >
                      {Math.round(modelScale * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setModelScale((s) => Math.max(0.45, Math.round((s - 0.1) * 100) / 100))
                      }
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white cursor-pointer"
                    >
                      － 縮小
                    </button>
                    <input
                      type="range"
                      min={0.45}
                      max={2.2}
                      step={0.05}
                      value={modelScale}
                      onChange={(e) => setModelScale(Number(e.target.value))}
                      className="flex-1 accent-pink-500 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setModelScale((s) => Math.min(2.2, Math.round((s + 0.1) * 100) / 100))
                      }
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white cursor-pointer"
                    >
                      ＋ 放大
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelScale(1.0)}
                      className="px-2 py-1 rounded-lg bg-black/50 hover:bg-white/15 border border-white/15 text-[10px] font-mono text-zinc-300 cursor-pointer"
                    >
                      重置 100%
                    </button>
                  </div>
                </div>

                <div
                  style={{ borderColor: `${activePanelTheme.border}33` }}
                  className="pt-2 border-t space-y-2"
                >
                  <label className="block text-xs font-bold">
                    05. 替換為 Ave 自製的 3D 模型 (.glb / .gltf)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".glb,.gltf"
                    onChange={handleModelUpload}
                    className="hidden"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ borderColor: `${activePanelTheme.border}66` }}
                      className="flex-1 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 border text-xs text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Upload
                        style={{ color: activePanelTheme.accent }}
                        className="w-3.5 h-3.5"
                      />
                      {customModelName ? '更換 .GLB 模型' : '上傳 Ave 的 .GLB 模型'}
                    </button>
                    {customModelUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomModelUrl(null);
                          setCustomModelName(null);
                        }}
                        className="py-2 px-3 rounded-xl bg-rose-500/20 text-rose-300 text-xs hover:bg-rose-500/30 cursor-pointer"
                      >
                        切回預設軟糖
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
