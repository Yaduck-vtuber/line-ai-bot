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

const INITIAL_NOTEBOOK: NonoNotebookData = {
  actualProgressLog: `1. 完成 Nono 3D Mochi-Puff 毛髮模擬、3D 立體上下眼皮與閉眼毛髮覆蓋
2. 完成高對比迷幻霓虹撞色主題，支援整個工作台面板、對話框與對話星星同步換色
3. 串接 Buffer 推薦排程時段與各平台自動字數適配（含 X 字數濃縮與 IG 5 個 # 限制）`,
  styleGuidelines: `- 語氣自然平實，像獨立創作者 Ave 的真實開發紀錄
- 不要過度誇張或太像行銷廣告，也不要太科技風
- 結尾固定加上 #Nono培育觀察日記
- 字數控制在 50 到 100 字之間`,
  useCustomStyleMimic: true,
  customSamplePosts: `今天把桌面軟糖 Nono 的 3D 眼皮跟閉眼毛髮覆蓋調好了，面板跟身邊的對話框也換成喜歡的撞色風格，隨時可以開關對話氣泡。接著把 Buffer 排程預覽確認好，繼續推進度。 #Nono培育觀察日記 #IndieDev`,
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
  { label: '晚間黃金互動時段', hh: 20, mm: 30, reason: '創作者社群下班後活躍度最高' },
  { label: '深夜創作者共鳴時段', hh: 22, mm: 15, reason: '獨立開發者與夜貓族高互動率' },
  { label: '晨間通勤早鳥時段', hh: 8, mm: 30, reason: '早晨滑手機高觸及率' },
  { label: '午休用餐流量時段', hh: 12, mm: 30, reason: '午間休息穩定曝光與轉發' },
  { label: '午後茶敘放鬆時段', hh: 15, mm: 45, reason: '下午工作空檔瀏覽高峰' },
  { label: '傍晚下班通勤時段', hh: 18, mm: 20, reason: '通勤尖峰即時曝光高' },
  { label: '睡前滑手機高峰', hh: 23, mm: 10, reason: '睡前長文閱讀與收藏率高' },
];

function toLocalIsoString(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// 根據當下真實時間動態計算未來推薦排程時段，支援一鍵刷新切換不同推薦組合
function generateDynamicRecommendedSlots(refreshBatch = 0): RecommendedTimeSlot[] {
  const now = new Date();
  const futureSlots: RecommendedTimeSlot[] = [];

  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    for (const item of SLOT_CANDIDATE_POOL) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + dayOffset);
      candidate.setHours(item.hh, item.mm, 0, 0);

      if (candidate.getTime() > now.getTime() + 10 * 60 * 1000) {
        const dayPrefix = dayOffset === 0 ? '今日' : dayOffset === 1 ? '明日' : '後天';
        const hhStr = String(item.hh).padStart(2, '0');
        const mmStr = String(item.mm).padStart(2, '0');
        const timeString = `${hhStr}:${mmStr}`;
        futureSlots.push({
          id: `slot-${dayOffset}-${hhStr}${mmStr}`,
          label: `${dayPrefix} · ${item.label}`,
          timeString,
          dayPrefix,
          scheduledIso: toLocalIsoString(candidate),
          reason: item.reason,
        });
      }
    }
  }

  const startIdx = (refreshBatch * 2) % Math.max(1, futureSlots.length - 2);
  const picked = futureSlots.slice(startIdx, startIdx + 3);
  if (picked.length < 3) {
    return futureSlots.slice(0, 3);
  }
  return picked;
}

// 計算 X (Twitter) 官方加權字數：中文字／全形符號算 2 字元，半形英數算 1 字元（上限 280）
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

function trimHashtagsToMax(text: string, maxCount: number): string {
  let seen = 0;
  return text
    .replace(/#[\p{L}\p{N}_]+/gu, (match) => {
      seen += 1;
      return seen <= maxCount ? match : '';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// 前端即時各平台字數與規則自動適配引擎（確保 X 不超字數、IG 不超過 5 個 #）
function buildClientPlatformCopies(baseText: string): Record<BufferPlatform, string> {
  const raw = baseText.trim();
  const hashtags = raw.match(/#[\p{L}\p{N}_]+/gu) || ['#Nono培育觀察日記'];
  const bodyOnly = raw
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Instagram: 最多 5 個 #，段落清楚
  const igTags = hashtags.slice(0, 5);
  if (!igTags.includes('#Nono培育觀察日記') && igTags.length < 5) {
    igTags.unshift('#Nono培育觀察日記');
  }
  const instagram = `${bodyOnly.slice(0, 2000)}\n\n${igTags.slice(0, 5).join(' ')}`.trim();

  // Threads: 500 字內自然語氣
  const threadsTags = hashtags.slice(0, 3);
  const maxThreadsLen = Math.max(50, 480 - threadsTags.join(' ').length);
  const threadsBody =
    bodyOnly.length > maxThreadsLen ? `${bodyOnly.slice(0, maxThreadsLen - 1)}…` : bodyOnly;
  const threads = `${threadsBody} ${threadsTags.join(' ')}`.trim();

  // X (Twitter): 嚴格限制加權 280 字元（約 140 中文字），精簡語句＋最多 2 個標籤
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

  // Facebook: 2000 字內完整段落
  const fbTags = hashtags.slice(0, 4);
  const facebook = `${bodyOnly.slice(0, 1900)}\n\n${fbTags.join(' ')}`.trim();

  return { threads, x, instagram, facebook };
}

// 自動轉換 Google Drive 分享連結或補齊網址協定
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

type ActiveWindowId = 'notebook' | 'buffer' | 'appearance' | null;

const INITIAL_BASE_COPY =
  '今天把桌面軟糖 Nono 的 3D 眼皮跟閉眼毛髮覆蓋調好了，面板跟身邊的對話框也換成喜歡的撞色風格，隨時可以開關對話氣泡。接著把 Buffer 排程預覽確認好，繼續推進度。 #Nono培育觀察日記 #IndieDev #3DDev';

export function App() {
  // Desktop Care Bubble & Responsive Workbench states
  const [isNonoAwake, setIsNonoAwake] = useState<boolean>(true);
  const [isBubbleOpen, setIsBubbleOpen] = useState<boolean>(true);
  const [activeWindow, setActiveWindow] = useState<ActiveWindowId>('notebook');
  const [isCompactPanel, setIsCompactPanel] = useState<boolean>(false);
  const lastOpenWindowRef = useRef<ActiveWindowId>('notebook');

  const [selectedModel] = useState<AIModelId>('gemini-3-flash-preview');

  // Nono 3D Idle Action
  const [idleAction, setIdleAction] = useState<NonoIdleAction>('breathing');
  const [actionLabel, setActionLabel] = useState<string>('乖乖呼吸待機中');

  // Nono Desktop Care Speech Bubble
  const [nonoSpeech, setNonoSpeech] = useState<string>(
    'Ave 伸個懶腰休息一下吧，螢幕看太久眼睛容易乾澀。\n\n肩膀放輕鬆深呼吸一下，等妳準備好隨時可以把進度寫進筆記本裡喔糖糖。'
  );
  const [careBadgeText, setCareBadgeText] = useState<string>('CARE · 貼心陪伴中');

  // Nono 3D Appearance, Unified Panel Theme & Transparent Desktop Mode
  const [furColor, setFurColor] = useState<string>('#ff1e7a');
  const [panelThemeId, setPanelThemeId] = useState<string>('neon_berry_cyan');
  const [syncPanelWithFur, setSyncPanelWithFur] = useState<boolean>(true);
  const [isTransparentDesktop, setIsTransparentDesktop] = useState<boolean>(false);
  const [customModelUrl, setCustomModelUrl] = useState<string | null>(null);
  const [customModelName, setCustomModelName] = useState<string | null>(null);

  const activePanelTheme =
    PANEL_THEME_PRESETS.find((t) => t.id === panelThemeId) || PANEL_THEME_PRESETS[0];

  // Nono Notebook
  const [notebook, setNotebook] = useState<NonoNotebookData>(INITIAL_NOTEBOOK);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  // Recommended Time Slots (Dynamic & Refreshable!)
  const [slotRefreshCount, setSlotRefreshCount] = useState<number>(0);
  const [recommendedSlots, setRecommendedSlots] = useState<RecommendedTimeSlot[]>(() =>
    generateDynamicRecommendedSlots(0)
  );
  const [lastSlotRefreshedAt, setLastSlotRefreshedAt] = useState<string>(() =>
    new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  );

  // Buffer Post Config
  const [bufferConfig, setBufferConfig] = useState<BufferPostConfig>(() => {
    const initialSlots = generateDynamicRecommendedSlots(0);
    const firstSlot = initialSlots[0];
    return {
      content: INITIAL_BASE_COPY,
      platformContents: buildClientPlatformCopies(INITIAL_BASE_COPY),
      usePerPlatformCopy: true,
      platforms: ['threads', 'x', 'instagram'],
      scheduleMode: 'recommended_slot',
      scheduledTime: firstSlot.scheduledIso,
      selectedSlotLabel: `${firstSlot.label} ${firstSlot.timeString}`,
      hashtags: ['#Nono培育觀察日記', '#IndieDev', '#3DDev'],
      mediaAttachments: [],
      status: 'ready_to_schedule',
    };
  });

  const [previewPlatform, setPreviewPlatform] = useState<BufferPlatform>('instagram');
  const [editingScope, setEditingScope] = useState<'master' | BufferPlatform>('master');
  const [refineInput, setRefineInput] = useState('');
  const [isRefiningPost, setIsRefiningPost] = useState(false);
  const [lastRefinedNotice, setLastRefinedNotice] = useState<string | null>(null);

  // Buffer Real Connection & Queue State
  const [queuedPosts, setQueuedPosts] = useState<
    { id: string; text: string; platforms: BufferPlatform[]; time: string; modeLabel: string }[]
  >([]);

  const [cloudMediaUrlInput, setCloudMediaUrlInput] = useState('');
  const [cloudMediaType, setCloudMediaType] = useState<'image' | 'video'>('image');
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

  useEffect(() => {
    localStorage.setItem('nono_buffer_api_token', bufferApiToken);
  }, [bufferApiToken]);

  useEffect(() => {
    localStorage.setItem('nono_buffer_profile_id', bufferProfileId);
  }, [bufferProfileId]);

  useEffect(() => {
    localStorage.setItem('nono_buffer_webhook_url', bufferWebhookUrl);
  }, [bufferWebhookUrl]);

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

    if (!isNonoAwake) {
      setIsNonoAwake(true);
      if (lastOpenWindowRef.current) {
        setActiveWindow(lastOpenWindowRef.current);
      }
    }

    const pool = wasLightSleeping
      ? BEHAVIOR_DIALOGUE_MAP.woke_up
      : BEHAVIOR_DIALOGUE_MAP.clicked_nono.filter((line) => line !== nonoSpeech);
    const picked =
      pool[Math.floor(Math.random() * pool.length)] || BEHAVIOR_DIALOGUE_MAP.clicked_nono[0];
    setNonoSpeech(picked);
    setCareBadgeText(wasLightSleeping ? 'WAKE · 充飽電醒來囉' : 'CARE · 給 Ave 的關心');
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

  // 一鍵刷新推薦時段
  const handleRefreshRecommendedSlots = () => {
    const nextBatch = slotRefreshCount + 1;
    setSlotRefreshCount(nextBatch);
    const freshSlots = generateDynamicRecommendedSlots(nextBatch);
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
      `Ave！我已經根據現在最新時間（${nowStr}）幫妳重新刷新了 3 個未來高互動推薦時段。\n\n點選喜歡的時段後按確認上傳，就會直接排進 Buffer 正式佇列囉糖糖。`
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
          model: selectedModel,
        }),
      });
      const data = await response.json();
      const draft = data.bufferDraft || data.socialCopy;

      if (draft) {
        const adapted = data.platformCopies || buildClientPlatformCopies(draft);
        setBufferConfig((prev) => ({
          ...prev,
          content: draft,
          platformContents: adapted,
          usePerPlatformCopy: true,
          status: 'ready_to_schedule',
        }));
        openSideWindow('buffer');
      }
      setIsNonoAwake(true);
      setIsBubbleOpen(true);
      setCareBadgeText('READY · 筆記本貼文與各平台適配完成');
      setNonoSpeech(
        data.nonoNote ||
          data.murmur ||
          'Ave！我已經嚴格照著筆記本裡的進度幫妳寫好貼文，並自動幫 X、IG、Threads 適配好字數了。\n\n現在已經切到 Buffer 排程分頁，確認時段後按上傳就會直接進排程佇列喔糖糖。'
      );
    } catch {
      const firstLine =
        notebook.actualProgressLog.split('\n').filter(Boolean)[0] || '推進今日開發進度';
      const fallbackText = `今天完成了：${firstLine.replace(/^[0-9.•\-]+\s*/, '')}。一步一步把細節調整到位，繼續往下推進。 #Nono培育觀察日記 #IndieDev`;
      setBufferConfig((prev) => ({
        ...prev,
        content: fallbackText,
        platformContents: buildClientPlatformCopies(fallbackText),
        usePerPlatformCopy: true,
        status: 'ready_to_schedule',
      }));
      openSideWindow('buffer');
      setIsNonoAwake(true);
      setIsBubbleOpen(true);
      setCareBadgeText('READY · 筆記本貼文完成');
      updateSpeechForBehavior('generated_post', 'READY · 筆記本貼文完成');
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

  // 將電腦上傳的圖片轉為 Base64 DataURL，讓後端能自動上傳至公開圖床給 Instagram / Buffer 使用！
  const handleLocalMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const firstFileName = files[0].name;

    Array.from(files).forEach((file: File) => {
      const isVideo = file.type.startsWith('video/');
      const reader = new FileReader();
      reader.onload = () => {
        const resultUrl =
          typeof reader.result === 'string' ? reader.result : URL.createObjectURL(file);
        const item: MediaAttachment = {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: isVideo ? 'video' : 'image',
          url: resultUrl,
          name: file.name,
          source: 'local',
        };
        setBufferConfig((prev) => ({
          ...prev,
          mediaAttachments: [...prev.mediaAttachments, item],
          status: 'ready_to_schedule',
        }));
      };
      reader.readAsDataURL(file);
    });

    setIsNonoAwake(true);
    setIsBubbleOpen(true);
    setIdleAction('happy_bounce');
    setActionLabel('開心軟糖彈跳中');
    setCareBadgeText('MEDIA · 素材已載入（支援 IG 直發）');
    setNonoSpeech(
      `Ave！剛剛選擇的「${firstFileName}」已經載入預覽囉，發送時我也會自動幫它產生公開網址讓 Instagram 順利排程。\n\n確認右邊的預覽版面跟時段沒問題，就可以按確認上傳排程喔糖糖。`
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

      setQueuedPosts((prev) => [
        {
          id: `q-${Date.now()}`,
          text: primaryOutgoingText,
          platforms: bufferConfig.platforms,
          time: timeDisplay,
          modeLabel: modeBadge,
        },
        ...prev,
      ]);

      setBufferConfig((prev) => ({ ...prev, status: 'scheduled' }));
      setDispatchSuccessBanner(
        data.message || `已成功將貼文直接送進 Buffer 排程佇列（${timeDisplay}）！`
      );
      if (Array.isArray(data.partialWarnings) && data.partialWarnings.length > 0) {
        setFreePlanWarning(`部分頻道提醒：${data.partialWarnings.join(' ｜ ')}`);
      }
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

  return (
    <div
      style={{
        backgroundColor: isTransparentDesktop ? 'transparent' : activePanelTheme.bgBase,
        color: activePanelTheme.textMain,
      }}
      className="relative w-screen h-screen overflow-hidden select-none font-sans transition-colors duration-300"
    >
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

      {/* ==================== RESPONSIVE WORKBENCH DOCK ==================== */}
      {isNonoAwake && (
        <div
          className={`fixed top-2.5 left-2.5 right-2.5 sm:right-auto sm:left-4 z-30 flex flex-col max-h-[calc(100vh-1.25rem)] transition-all duration-200 ${
            activeWindow === 'buffer' && !isCompactPanel
              ? 'sm:w-[min(94vw,760px)] lg:w-[min(58vw,780px)]'
              : 'sm:w-[min(90vw,440px)]'
          }`}
        >
          <div
            style={{
              backgroundColor: activePanelTheme.panelBg,
              borderColor: activePanelTheme.border,
              boxShadow: `0 22px 64px rgba(4, 2, 10, 0.92), 0 0 36px ${activePanelTheme.glowRgba}`,
            }}
            className="backdrop-blur-xl border-2 rounded-2xl flex flex-col max-h-full overflow-hidden transition-colors duration-300"
          >
            {/* Diagonal Neon Hazard Stripe Top Bar */}
            <div
              className="h-1.5 w-full shrink-0 opacity-95"
              style={{
                backgroundImage: `repeating-linear-gradient(-45deg, ${activePanelTheme.accent}, ${activePanelTheme.accent} 10px, ${activePanelTheme.accentSecondary} 10px, ${activePanelTheme.accentSecondary} 20px)`,
              }}
            />

            {/* STREAMLINED WORKBENCH HEADER (Removed duplicate buttons!) */}
            <div
              style={{
                borderColor: `${activePanelTheme.border}45`,
                background: `linear-gradient(90deg, ${activePanelTheme.accent}24, ${activePanelTheme.accentSecondary}1c)`,
              }}
              className="px-3 py-2 border-b shrink-0 flex flex-wrap items-center justify-between gap-1.5"
            >
              <div className="flex items-center gap-2">
                <PastelAuraStar
                  size={22}
                  idSuffix="header-star"
                  accentColor={activePanelTheme.accent}
                  secondaryColor={activePanelTheme.accentSecondary}
                  coreColor={activePanelTheme.highlightTagBg}
                  className="-my-1"
                />
                <span className="text-[11px] font-mono font-black tracking-wider">
                  NONO WORKBENCH
                </span>
                <button
                  type="button"
                  onClick={() => setIsTransparentDesktop((prev) => !prev)}
                  style={{
                    borderColor: isTransparentDesktop
                      ? activePanelTheme.accentSecondary
                      : 'rgba(255,255,255,0.22)',
                    color: isTransparentDesktop
                      ? activePanelTheme.accentSecondary
                      : activePanelTheme.textMuted,
                  }}
                  className="px-2 py-0.5 rounded-md bg-black/40 border text-[10px] font-mono cursor-pointer hover:brightness-110"
                  title="切換透明背景與深色底圖"
                >
                  {isTransparentDesktop ? '✦ 透明底' : '深色底'}
                </button>
              </div>

              <div className="flex items-center gap-1">
                {activeWindow === 'buffer' && (
                  <button
                    type="button"
                    onClick={() => setIsCompactPanel((prev) => !prev)}
                    className="hidden sm:flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white px-2 py-0.5 rounded-md bg-black/40 border border-white/15 cursor-pointer"
                    title="切換單欄窄版或雙欄寬版面板"
                  >
                    {isCompactPanel ? (
                      <>
                        <Maximize2 className="w-3 h-3" />
                        <span>展開雙欄</span>
                      </>
                    ) : (
                      <>
                        <Minimize2 className="w-3 h-3" />
                        <span>窄版單欄</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsBubbleOpen((prev) => !prev)}
                  style={{
                    borderColor: isBubbleOpen
                      ? activePanelTheme.accentSecondary
                      : 'rgba(255,255,255,0.2)',
                    color: isBubbleOpen
                      ? activePanelTheme.accentSecondary
                      : activePanelTheme.textMuted,
                  }}
                  className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-black/40 hover:bg-white/10 border transition-colors cursor-pointer"
                >
                  {isBubbleOpen ? (
                    <>
                      <MessageSquareOff className="w-3 h-3" />
                      <span>隱藏氣泡</span>
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-3 h-3" />
                      <span>顯示氣泡</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleMinimizeAll}
                  className="flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white px-2 py-0.5 rounded-md bg-black/40 hover:bg-black/60 border border-white/15 transition-colors cursor-pointer"
                  title="收起工作台（點一下 3D Nono 即可再次喚醒）"
                >
                  <EyeOff className="w-3 h-3" />
                  <span>收起面板</span>
                </button>
              </div>
            </div>

            {/* Unified Tab Switcher */}
            <div
              style={{
                backgroundColor: activePanelTheme.panelCard,
                borderColor: `${activePanelTheme.border}38`,
              }}
              className="px-3 py-2 border-b shrink-0 grid grid-cols-3 gap-1.5"
            >
              {[
                { id: 'notebook' as const, label: '1. Nono 筆記本', icon: BookOpen },
                { id: 'buffer' as const, label: '2. Buffer 排程發佈', icon: Calendar },
                { id: 'appearance' as const, label: '3. 外觀與待機動作', icon: Sparkles },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeWindow === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => openSideWindow(isActive ? null : tab.id)}
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
                    className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold border transition-all cursor-pointer truncate"
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* ==================== TAB 1: NONO NOTEBOOK ==================== */}
            {activeWindow === 'notebook' && (
              <div className="p-3.5 overflow-y-auto space-y-3 flex-1 min-h-0">
                <div
                  style={{
                    backgroundColor: activePanelTheme.panelCard,
                    borderColor: `${activePanelTheme.border}55`,
                  }}
                  className="p-2.5 rounded-xl border text-[11px] leading-relaxed flex items-start gap-2"
                >
                  <PastelAuraStar
                    size={20}
                    idSuffix="nb-star"
                    accentColor={activePanelTheme.accent}
                    secondaryColor={activePanelTheme.accentSecondary}
                    coreColor={activePanelTheme.highlightTagBg}
                    className="shrink-0 mt-0.5"
                  />
                  <div>
                    <strong>嚴格邊界保護 ＋ 各平台自動適配</strong>：Nono 產生社群文案時，
                    <strong>只會讀取這本筆記本裡的 3 個區塊</strong>
                    ，並自動為 X (Twitter)、IG、Threads 量身調整字數與標籤！
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 flex items-center justify-between">
                    <span>01. Ave 實際完成的進度紀錄</span>
                    <span
                      style={{ color: activePanelTheme.accentSecondary }}
                      className="text-[10px] font-mono"
                    >
                      PROGRESS.LOG
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    value={notebook.actualProgressLog}
                    onChange={(e) => {
                      setNotebook((prev) => ({ ...prev, actualProgressLog: e.target.value }));
                    }}
                    style={{ borderColor: `${activePanelTheme.border}55` }}
                    placeholder="寫下今天 Ave 實際做完的事..."
                    className="w-full bg-black/50 border rounded-xl p-2.5 text-xs text-zinc-100 leading-relaxed focus:outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 flex items-center justify-between">
                    <span>02. 筆記本指定的文案細節與風格規則</span>
                    <span
                      style={{ color: activePanelTheme.accentSecondary }}
                      className="text-[10px] font-mono"
                    >
                      STYLE.RULES
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    value={notebook.styleGuidelines}
                    onChange={(e) =>
                      setNotebook((prev) => ({ ...prev, styleGuidelines: e.target.value }))
                    }
                    style={{ borderColor: `${activePanelTheme.border}55` }}
                    placeholder="例如：平實自然、不要太科技感、結尾加 #Nono培育觀察日記..."
                    className="w-full bg-black/50 border rounded-xl p-2.5 text-xs text-zinc-100 leading-relaxed focus:outline-none resize-none"
                  />
                </div>

                <div
                  style={{
                    backgroundColor: activePanelTheme.panelCard,
                    borderColor: `${activePanelTheme.border}44`,
                  }}
                  className="p-3 rounded-xl border space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold">03. 自訂模仿 Ave 寫作風格</div>
                      <div
                        style={{ color: activePanelTheme.textMuted }}
                        className="text-[11px]"
                      >
                        開啟後，Nono 會嚴格模仿下方範例貼文的斷句與語氣
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setNotebook((prev) => ({
                          ...prev,
                          useCustomStyleMimic: !prev.useCustomStyleMimic,
                        }))
                      }
                      style={{
                        background: notebook.useCustomStyleMimic
                          ? `linear-gradient(90deg, ${activePanelTheme.accent}, ${activePanelTheme.accentSecondary})`
                          : '#3f3f46',
                      }}
                      className="w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer shrink-0"
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          notebook.useCustomStyleMimic ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {notebook.useCustomStyleMimic && (
                    <textarea
                      rows={2}
                      value={notebook.customSamplePosts}
                      onChange={(e) =>
                        setNotebook((prev) => ({ ...prev, customSamplePosts: e.target.value }))
                      }
                      placeholder="貼上 1~2 篇 Ave 過去寫過、最喜歡的貼文範例..."
                      className="w-full bg-black/50 border border-white/15 rounded-lg p-2 text-xs text-zinc-200 leading-relaxed focus:outline-none resize-none"
                    />
                  )}
                </div>

                <button
                  onClick={handleGenerateFromNotebook}
                  disabled={isGeneratingDraft}
                  style={{
                    background: `linear-gradient(90deg, ${activePanelTheme.accent}, ${activePanelTheme.accentSecondary})`,
                    boxShadow: `0 8px 25px ${activePanelTheme.glowRgba}`,
                  }}
                  className="w-full py-2.5 px-4 rounded-xl text-white text-xs font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer hover:brightness-110"
                >
                  <Sparkles className="w-4 h-4" />
                  {isGeneratingDraft
                    ? '正在依筆記本生成各平台專屬貼文...'
                    : '依筆記本生成各平台貼文（自動適配 X / IG 字數並前往排程）'}
                </button>
              </div>
            )}

            {/* ==================== TAB 2: BUFFER PREVIEW & DIRECT SCHEDULE ==================== */}
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
                      Free Plan 防呆 ({queuedPosts.length}/10 篇已排程)
                    </span>
                    <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 rounded-sm">
                      ⚡ 直通排程佇列
                    </span>
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
                    isCompactPanel ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'
                  }`}
                >
                  <div className={`${isCompactPanel ? '' : 'lg:col-span-7'} space-y-3`}>
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
                            支援 X、Threads、IG（含自動圖片網址轉換與 IG Metadata）
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
                            {isTestingConnection ? '測試中...' : '🔌 測試連線'}
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
                        rows={3}
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

                    {/* 請 Nono 微調貼文細項（移除重複無用按鈕，只保留直覺輸入與自然精簡） */}
                    <div
                      style={{
                        backgroundColor: activePanelTheme.panelCard,
                        borderColor: `${activePanelTheme.border}44`,
                      }}
                      className="p-2.5 rounded-xl border space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                          <Wand2
                            style={{ color: activePanelTheme.accent }}
                            className="w-3.5 h-3.5"
                          />
                          請 Nono 微調貼文內容與語氣
                        </span>
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

                    {/* Buffer 推薦時段與排程 */}
                    <div
                      style={{
                        backgroundColor: activePanelTheme.panelCard,
                        borderColor: `${activePanelTheme.border}44`,
                      }}
                      className="p-3 rounded-xl border space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold">
                            <Clock
                              style={{ color: activePanelTheme.accentSecondary }}
                              className="w-3.5 h-3.5"
                            />
                            推薦排程時段
                          </div>
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
                            <span>刷新時間 ({lastSlotRefreshedAt})</span>
                          </button>
                        </div>

                        <span
                          style={{
                            backgroundColor: activePanelTheme.highlightTagBg,
                            color: activePanelTheme.highlightTagText,
                          }}
                          className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-sm"
                        >
                          {bufferConfig.scheduleMode === 'recommended_slot'
                            ? bufferConfig.selectedSlotLabel
                            : bufferConfig.scheduleMode === 'now'
                              ? '立即發送'
                              : bufferConfig.scheduleMode === 'queue'
                                ? '直通下個空檔'
                                : bufferConfig.scheduledTime.replace('T', ' ')}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                        {recommendedSlots.map((slot) => {
                          const isSelected =
                            bufferConfig.scheduleMode === 'recommended_slot' &&
                            bufferConfig.selectedSlotLabel === `${slot.label} ${slot.timeString}`;
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
                                  className="font-mono shrink-0 ml-1"
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

                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/10">
                        {[
                          { mode: 'queue' as const, label: '直接排入下個空檔' },
                          { mode: 'custom_time' as const, label: '自訂排程時間' },
                          { mode: 'now' as const, label: '立即發佈' },
                        ].map((m) => (
                          <button
                            key={m.mode}
                            type="button"
                            onClick={() =>
                              setBufferConfig((prev) => ({
                                ...prev,
                                scheduleMode: m.mode,
                                status: 'ready_to_schedule',
                              }))
                            }
                            style={
                              bufferConfig.scheduleMode === m.mode
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
                        ))}

                        {bufferConfig.scheduleMode === 'custom_time' && (
                          <input
                            type="datetime-local"
                            value={bufferConfig.scheduledTime}
                            onChange={(e) =>
                              setBufferConfig((prev) => ({
                                ...prev,
                                scheduledTime: e.target.value,
                                status: 'ready_to_schedule',
                              }))
                            }
                            className="bg-black/45 border border-white/15 rounded-lg px-2 py-1 text-[11px] font-mono text-white"
                          />
                        )}
                      </div>
                    </div>

                    {/* 圖片 / 影片素材（簡化整合，支援電腦圖片自動轉公開網址直發 IG） */}
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
                          貼文配圖 / 影片（IG 自動轉公開網址直發）
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
                                  ✓ 支援 IG / 全平台發送
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

                  {/* Right Column inside Buffer Tab: Live Platform Preview */}
                  <div
                    className={`${
                      isCompactPanel ? '' : 'lg:col-span-5'
                    } flex flex-col justify-between space-y-3`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">各平台排版即時預覽</span>
                        <div className="flex items-center gap-1 bg-black/45 p-0.5 rounded-lg border border-white/15">
                          {(['instagram', 'x', 'threads', 'facebook'] as BufferPlatform[]).map(
                            (p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setPreviewPlatform(p)}
                                style={
                                  previewPlatform === p
                                    ? {
                                        background: `linear-gradient(90deg, ${activePanelTheme.accent}, ${activePanelTheme.accentSecondary})`,
                                        color: '#ffffff',
                                      }
                                    : undefined
                                }
                                className="px-2 py-1 rounded-md text-[10px] font-bold transition-colors text-zinc-400 hover:text-zinc-200 cursor-pointer"
                              >
                                {PLATFORM_META[p].badge}
                              </button>
                            )
                          )}
                        </div>
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
                              previewPlatform === 'instagram' ? 'aspect-square max-h-48 mx-auto' : 'aspect-[16/9]'
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
                                IG 必須附圖（若未上傳圖片，發送時會自動補上預設創作封面圖）
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
                                  previewHashtagCount > 5 ? 'text-rose-400 font-bold' : 'text-emerald-300'
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
                                  previewCharCount > 500 ? 'text-rose-400 font-bold' : 'text-emerald-300'
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

                      {/* 真實已成功排程佇列 */}
                      <div
                        style={{
                          backgroundColor: activePanelTheme.panelCard,
                          borderColor: `${activePanelTheme.border}38`,
                        }}
                        className="p-2.5 rounded-xl border space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>已成功送出之排程佇列 ({queuedPosts.length}/10)</span>
                          {queuedPosts.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setQueuedPosts([])}
                              className="text-[10px] text-rose-300 hover:text-rose-200 flex items-center gap-0.5 cursor-pointer"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              清空紀錄
                            </button>
                          ) : (
                            <span
                              style={{ color: activePanelTheme.accentSecondary }}
                              className="font-mono"
                            >
                              僅在真實發送成功後記錄
                            </span>
                          )}
                        </div>
                        <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                          {queuedPosts.length === 0 ? (
                            <div className="py-1.5 text-center text-[10px] text-zinc-500">
                              目前尚無已送出的排程紀錄
                            </div>
                          ) : (
                            queuedPosts.map((qp) => (
                              <div
                                key={qp.id}
                                className="p-2 rounded-lg bg-black/35 border border-white/5 text-[10px] space-y-0.5"
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    style={{ color: activePanelTheme.accentSecondary }}
                                    className="font-mono"
                                  >
                                    {qp.time}
                                  </span>
                                  <span
                                    style={{
                                      backgroundColor: `${activePanelTheme.accent}33`,
                                      color: activePanelTheme.textMain,
                                    }}
                                    className="px-1.5 py-0.5 rounded-sm"
                                  >
                                    {qp.modeLabel}
                                  </span>
                                </div>
                                <p className="text-zinc-300 truncate">{qp.text}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
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
                          ? '正在傳送至 Buffer 排程佇列...'
                          : '確認直接上傳 Buffer 排程'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== TAB 3: APPEARANCE & IDLE ACTIONS ==================== */}
            {activeWindow === 'appearance' && (
              <div className="p-3.5 space-y-3.5 overflow-y-auto flex-1 min-h-0">
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
                  style={{ borderColor: `${activePanelTheme.border}33` }}
                  className="pt-2 border-t space-y-2"
                >
                  <label className="block text-xs font-bold">
                    04. 替換為 Ave 自製的 3D 模型 (.glb / .gltf)
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
