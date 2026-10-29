import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

dotenv.config();

// 避免 Windows 本地憑證或防毒軟體 HTTPS 攔截導致 fetch 發生 UNABLE_TO_VERIFY_LEAF_SIGNATURE
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUFFER_GRAPHQL_ENDPOINT = 'https://api.buffer.com';

const TANGTANG_PERSONA_INSTRUCTION = `你是 Nono，住在獨立創作者「糖糖」（Ave）電腦桌面上的 AI 數位小夥伴。
語氣與格式規則（極重要，必須 100% 遵守）：
1. 稱呼規範：請稱呼使用者為「糖糖」。
2. 「每兩段話只有一次糖糖」規則：
   - 你的每次回覆都必須分成「兩個自然段落」（段落之間空一行）。
   - 第一段：直接、清楚、自然地說明重點、回應她的問題或觀察她的狀態（第一段絕對不要出現「糖糖」兩個字）。
   - 第二段：給出貼心具體的下一步建議或關心叮嚀，並且只在第二段的句尾加上一次「喔糖糖。」或「糖糖。」（整則回覆只能出現這唯一一次「糖糖」）。
3. 完美語氣範本（請完全模仿這個溫度與節奏，親近、自然、不冷冰冰、也不矯情）：
   「伸個懶腰休息一下吧，螢幕看太久眼睛容易乾澀。

剛剛跟 Gemini 聊過的內容如果想要存起來，按一下對話框裡的總結按鈕，我就會幫妳整理進筆記本裡喔糖糖。」`;

function normalizeModelName(requested?: string): string {
  if (!requested) return 'gemini-2.5-flash';
  if (requested.includes('lite')) return 'gemini-2.5-flash';
  return 'gemini-2.5-flash';
}

function enforceTwoParagraphTangTangRule(text: string): string {
  const cleaned = text.trim();
  if (!cleaned) {
    return '我已經幫妳把目前的資料都整理好了，隨時可以繼續下一步。\n\n如果有哪裡想要微調的話，直接跟我說一聲就可以囉糖糖。';
  }
  return cleaned;
}

function parseDualBlocks(rawText: string): { murmur: string; socialCopy: string } {
  const cleaned = rawText.trim();
  const murmurMatch = cleaned.match(/【Nono的碎碎念】\s*([\s\S]*?)(?=【發送文案】|$)/);
  const socialMatch = cleaned.match(/【發送文案】\s*([\s\S]*?)$/);

  const murmur = murmurMatch?.[1]?.trim() || '';
  let socialCopy = socialMatch?.[1]?.trim() || '';

  socialCopy = socialCopy
    .replace(/^["'「『]+/, '')
    .replace(/["'」』]+$/, '')
    .trim();

  if (!murmur && !socialCopy) {
    socialCopy = cleaned;
  }

  return { murmur, socialCopy };
}

// 計算 X (Twitter) 加權字數：中日韓與全形字元算 2 字元，半形英數算 1 字元（上限 280，相當於 140 中文字）
function getXWeightedLength(text: string): number {
  let weight = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    if (code > 0xff) {
      weight += 2;
    } else {
      weight += 1;
    }
  }
  return weight;
}

// 針對不同社群平台自動優化字數與標籤規則
function buildPlatformTailoredCopies(baseText: string): {
  threads: string;
  x: string;
  instagram: string;
  facebook: string;
} {
  const raw = baseText.trim();
  const hashtags = raw.match(/#[\p{L}\p{N}_]+/gu) || ['#Nono培育觀察日記'];
  const bodyOnly = raw
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 1. Instagram: 最多 5 個 #，段落分明，上限 2200 字
  const igTags = hashtags.slice(0, 5);
  if (!igTags.includes('#Nono培育觀察日記') && igTags.length < 5) {
    igTags.unshift('#Nono培育觀察日記');
  }
  const instagram = `${bodyOnly.slice(0, 2000)}\n\n${igTags.slice(0, 5).join(' ')}`.trim();

  // 2. Threads: 上限 500 字，自然對話感，保留最多 3 個核心標籤
  const threadsTags = hashtags.slice(0, 3);
  const maxThreadsBody = Math.max(50, 480 - threadsTags.join(' ').length);
  const threadsBody =
    bodyOnly.length > maxThreadsBody ? `${bodyOnly.slice(0, maxThreadsBody - 1)}…` : bodyOnly;
  const threads = `${threadsBody} ${threadsTags.join(' ')}`.trim();

  // 3. X (Twitter): 嚴格限制加權 280 字元（約 140 個中文字），最多保留 2 個標籤，精煉短句
  const xTags = hashtags.slice(0, 2);
  if (!xTags.includes('#Nono培育觀察日記')) {
    xTags[0] = '#Nono培育觀察日記';
  }
  const xTagStr = xTags.join(' ');
  const tagWeight = getXWeightedLength(xTagStr) + 2;
  const maxBodyWeight = Math.max(40, 270 - tagWeight);

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

  // 4. Facebook: 上限 2000 字，完整段落敘述
  const fbTags = hashtags.slice(0, 4);
  const facebook = `${bodyOnly.slice(0, 1900)}\n\n${fbTags.join(' ')}`.trim();

  return { threads, x, instagram, facebook };
}

// 當未設定 GEMINI_API_KEY 或離線時的智慧本地貼文微調引擎
function smartLocalRefinePost(
  baseDraft: string,
  instruction: string,
  platforms: string[] = []
): { refined: string; explanation: string } {
  const inst = instruction.trim();
  const hashtags = baseDraft.match(/#[\p{L}\p{N}_]+/gu) || ['#Nono培育觀察日記'];
  let body = baseDraft
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  let finalTags = [...hashtags];
  let explanation = `我已經照著妳交代的「${inst}」幫妳重新調整了貼文內容與語氣。`;

  const replaceMatch = inst.match(
    /(?:把|將)\s*[「『"']?(.+?)[」』"']?\s*(?:改成|換成|改為|替換成)\s*[「『"']?(.+?)[」』"']?$/
  );
  if (replaceMatch) {
    const [, target, replacement] = replaceMatch;
    if (baseDraft.includes(target.trim())) {
      const updated = baseDraft.split(target.trim()).join(replacement.trim());
      return {
        refined: updated,
        explanation: `我已經幫妳把貼文裡的「${target.trim()}」替換成「${replacement.trim()}」了。`,
      };
    }
  }

  const firstSentenceMatch = inst.match(
    /(?:第一句|開頭|首句)(?:改聊|改成|換成|寫|改為|加上)?[：:\s「『"']*([^」』"']+)[」』"']*/
  );
  if (firstSentenceMatch) {
    const newOpeningTopic = firstSentenceMatch[1].trim().replace(/[。！!？?]+$/, '');
    const sentences = body.split(/(?<=[。！!?？])/);
    const cleanOpening = newOpeningTopic.startsWith('今天')
      ? `${newOpeningTopic}。`
      : `今天先把重心放在${newOpeningTopic}，細節調整起來很有成就感。`;
    if (sentences.length > 1) {
      sentences[0] = cleanOpening;
      body = sentences.join('');
    } else {
      body = `${cleanOpening}${body}`;
    }
    explanation = `已經幫妳把第一句開頭改聊「${newOpeningTopic}」，讓整篇貼文破題更自然。`;
  } else if (/(?:刪掉|刪除|不要|去掉|移除)/.test(inst)) {
    const removeTarget = inst
      .replace(/^(?:請|幫我|把|將)?(?:刪掉|刪除|不要|去掉|移除)[：:\s「『"']*/, '')
      .replace(/[」』"']*$/, '')
      .trim();
    if (/emoji|表情符號/i.test(removeTarget)) {
      body = body.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
      explanation = '已經幫妳把貼文裡的表情符號都清理乾淨了。';
    } else if (/標籤|hashtag|#/i.test(removeTarget)) {
      finalTags = ['#Nono培育觀察日記'];
      explanation = '已經幫妳精簡掉多餘的標籤，只保留核心的 #Nono培育觀察日記。';
    } else if (removeTarget && body.includes(removeTarget)) {
      body = body.split(removeTarget).join('').replace(/，，|。。/g, '，').trim();
      explanation = `已經幫妳把「${removeTarget}」從貼文中移除了。`;
    } else {
      const sentences = body.split(/(?<=[。！!?？])/).filter(Boolean);
      if (sentences.length > 1) {
        sentences.pop();
        body = sentences.join('');
      }
      explanation = '已經幫妳刪減了結尾重複的敘述，讓版面更乾淨。';
    }
  } else if (/5\s*個\s*#|Instagram\s*規則|標籤控制/i.test(inst)) {
    finalTags = finalTags.slice(0, 5);
    if (!finalTags.includes('#Nono培育觀察日記')) {
      finalTags = ['#Nono培育觀察日記', ...finalTags].slice(0, 5);
    }
    explanation = `已經幫妳把 Hashtag 數量嚴格控制在 ${finalTags.length} 個（上限 5 個），完全符合 Instagram 規範。`;
  } else if (/精簡|簡短|縮短|字數|太長|平實|X|Twitter/i.test(inst)) {
    body = body
      .replace(/今天持續推進桌面小夥伴的開發進度：/g, '今日開發紀錄：')
      .replace(/一步一步把細節調整到位，繼續往下推進。?/g, '細節調整到位，繼續推進！')
      .replace(/接著把 Buffer 排程預覽確認好，繼續推進度。?/g, '排程預覽也同步確認完成。')
      .replace(/隨時可以開關對話氣泡，?/g, '')
      .trim();

    if (body.length > 85) {
      const parts = body.split(/[，。]/).filter(Boolean);
      body = `${parts.slice(0, 3).join('，')}。`;
    }
    finalTags = finalTags.slice(0, 2);
    if (!finalTags.includes('#Nono培育觀察日記')) {
      finalTags[0] = '#Nono培育觀察日記';
    }
    explanation = '已經幫妳把語氣改得更平實俐落，並大幅精簡字數，連 X (Twitter) 也能輕鬆發佈。';
  } else if (/活潑|可愛|表情|emoji|熱情|生動/i.test(inst)) {
    if (!body.includes('✨')) {
      body = `✨ ${body.replace(/。$/, ' 🍬✨！')}`;
    }
    explanation = '已經幫妳換上更活潑有溫度的語氣，並點綴了可愛的小符號。';
  } else {
    const cleanAdd = inst
      .replace(
        /^(?:請|幫我|麻煩)?(?:改成|改得|加上|補上|加入|提到|多寫|強調|調整為)[：:\s「『"']*/,
        ''
      )
      .replace(/[」』"']*$/, '')
      .replace(/[。！!]+$/, '')
      .trim();

    if (/語氣|像\s*Ave|平常講話|自然/.test(inst)) {
      body = body
        .replace(/^今天完成了：/, '今天花了一點時間，把')
        .replace(/^今天持續推進桌面小夥伴的開發進度：/, '今天待在桌面前慢慢磨細節，把')
        .replace(
          /。一步一步把細節調整到位，繼續往下推進。?$/,
          '都順過一遍了，看著畫面越來越順眼真的很開心。'
        );
      explanation = '已經幫妳把整篇文案換成 Ave 平常自然聊天的生活感語氣了。';
    } else if (cleanAdd) {
      body = body.replace(/[。！!]?$/, `，同時也${cleanAdd}。`);
      explanation = `已經幫妳把「${cleanAdd}」自然地融進貼文段落裡囉。`;
    }
  }

  if (platforms.includes('instagram') && finalTags.length > 5) {
    finalTags = finalTags.slice(0, 5);
  }

  const refined = `${body.trim()} ${finalTags.join(' ')}`.trim();
  return { refined, explanation };
}

// ==================== 將電腦本地上傳的 Base64 / 二進位 圖片與影片自動轉為公開 HTTPS 網址（供 Buffer & IG 抓取） ====================
async function uploadBase64MediaToPublicUrl(
  dataUrl: string,
  fileName = 'nono-media.mp4'
): Promise<string | null> {
  try {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: mimeType });

    const ext = mimeType.includes('video')
      ? (mimeType.includes('quicktime') ? 'mov' : 'mp4')
      : (mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : 'jpg');
    const safeFileName = fileName.endsWith(`.${ext}`) ? fileName : `nono-upload-${Date.now()}.${ext}`;

    // 1. 優先嘗試 Catbox (支援影片與圖片，直連 HTTPS)
    try {
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', blob, safeFileName);
      const res = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        body: form,
      });
      if (res.ok) {
        const textUrl = (await res.text()).trim();
        if (textUrl.startsWith('https://')) {
          return textUrl;
        }
      }
    } catch {
      // try backup
    }

    // 2. 備援：Litterbox (Catbox 官方臨時檔案託管，支援至 1GB 影片與素材)
    try {
      const formLit = new FormData();
      formLit.append('reqtype', 'fileupload');
      formLit.append('time', '72h');
      formLit.append('fileToUpload', blob, safeFileName);
      const resLit = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
        method: 'POST',
        body: formLit,
      });
      if (resLit.ok) {
        const textUrl = (await resLit.text()).trim();
        if (textUrl.startsWith('https://')) {
          return textUrl;
        }
      }
    } catch {
      // try backup
    }

    // 3. 備援：tmpfiles.org 公開 API
    try {
      const form2 = new FormData();
      form2.append('file', blob, safeFileName);
      const res2 = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: form2,
      });
      if (res2.ok) {
        const json2: any = await res2.json();
        const rawPageUrl: string = json2?.data?.url || '';
        if (rawPageUrl.includes('tmpfiles.org/')) {
          return rawPageUrl
            .replace('http://', 'https://')
            .replace('tmpfiles.org/', 'tmpfiles.org/dl/');
        }
      }
    } catch {
      // ignore
    }

    return null;
  } catch {
    return null;
  }
}

// ==================== Buffer Public GraphQL API (https://api.buffer.com) Helpers ====================
interface BufferChannelInfo {
  id: string;
  name: string;
  displayName?: string;
  service: string;
  isQueuePaused?: boolean;
}

async function executeBufferGraphQL(
  token: string,
  query: string,
  variables?: Record<string, any>
): Promise<{ ok: boolean; status: number; data?: any; errorMessage?: string }> {
  const response = await fetch(BUFFER_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Nono-3D-Companion/1.0',
    },
    body: JSON.stringify({
      query,
      ...(variables ? { variables } : {}),
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errMsg =
      payload?.errors?.[0]?.message ||
      payload?.message ||
      `Buffer GraphQL API 回應錯誤 (HTTP ${response.status})`;
    return { ok: false, status: response.status, data: payload, errorMessage: errMsg };
  }

  if (Array.isArray(payload?.errors) && payload.errors.length > 0 && !payload?.data) {
    return {
      ok: false,
      status: 400,
      data: payload,
      errorMessage: payload.errors.map((e: any) => e.message).join('; '),
    };
  }

  return { ok: true, status: response.status, data: payload?.data, errorMessage: undefined };
}

// 自動透過 Buffer GraphQL API 查詢 Account -> Organizations -> Channels
async function discoverBufferChannels(token: string): Promise<{
  ok: boolean;
  channels: BufferChannelInfo[];
  organizationName?: string;
  errorMessage?: string;
}> {
  const orgQuery = `
    query GetOrganizations {
      account {
        id
        organizations {
          id
          name
        }
      }
    }
  `;

  const orgRes = await executeBufferGraphQL(token, orgQuery);
  if (!orgRes.ok) {
    return {
      ok: false,
      channels: [],
      errorMessage:
        orgRes.errorMessage ||
        '無法驗證 Buffer API Key，請確認從 Buffer 開發者後台複製的 API Key 是否完整。',
    };
  }

  const organizations: Array<{ id: string; name: string }> =
    orgRes.data?.account?.organizations || [];

  if (organizations.length === 0) {
    return {
      ok: false,
      channels: [],
      errorMessage: '此 Buffer 帳號下找不到任何 Organization（組織），請確認 Buffer 帳號狀態。',
    };
  }

  const allChannels: BufferChannelInfo[] = [];

  for (const org of organizations) {
    const channelQuery = `
      query GetChannels($orgId: OrganizationId!) {
        channels(input: { organizationId: $orgId }) {
          id
          name
          displayName
          service
          isQueuePaused
        }
      }
    `;
    const chRes = await executeBufferGraphQL(token, channelQuery, { orgId: org.id });
    if (chRes.ok && Array.isArray(chRes.data?.channels)) {
      allChannels.push(...chRes.data.channels);
    } else {
      const inlineQuery = `
        query {
          channels(input: { organizationId: ${JSON.stringify(org.id)} }) {
            id
            name
            displayName
            service
            isQueuePaused
          }
        }
      `;
      const inlineRes = await executeBufferGraphQL(token, inlineQuery);
      if (inlineRes.ok && Array.isArray(inlineRes.data?.channels)) {
        allChannels.push(...inlineRes.data.channels);
      }
    }
  }

  return {
    ok: true,
    channels: allChannels,
    organizationName: organizations[0]?.name,
  };
}

function mapServiceToPlatformKey(serviceName: string): string {
  const s = (serviceName || '').toLowerCase();
  if (s === 'twitter' || s === 'x') return 'x';
  if (s.includes('instagram')) return 'instagram';
  if (s.includes('threads')) return 'threads';
  if (s.includes('facebook')) return 'facebook';
  return s;
}

interface StoredScheduledPost {
  id: string;
  text: string;
  dueAt: string;
  platforms: string[];
  channelName: string;
  modeLabel: string;
  source: 'buffer_cloud' | 'local_dispatch';
}

interface StoredProjectItem {
  id: string;
  name: string;
  folderPath: string;
  category: string;
  lastScannedAt: string;
  themes: Array<{
    id: string;
    versionTag: string;
    title: string;
    content: string;
    updatedAt: string;
  }>;
}

interface NonoServerStoreData {
  savedBufferToken?: string;
  savedWebhookUrl?: string;
  scheduledPosts: StoredScheduledPost[];
  projects: StoredProjectItem[];
}

const SERVER_STORE_PATH = path.join(__dirname, '.nono-server-store.json');

function loadServerStore(): NonoServerStoreData {
  try {
    if (fs.existsSync(SERVER_STORE_PATH)) {
      const raw = fs.readFileSync(SERVER_STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        savedBufferToken: parsed.savedBufferToken || '',
        savedWebhookUrl: parsed.savedWebhookUrl || '',
        scheduledPosts: Array.isArray(parsed.scheduledPosts) ? parsed.scheduledPosts : [],
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      };
    }
  } catch {
    // ignore
  }
  return {
    savedBufferToken: '',
    savedWebhookUrl: '',
    scheduledPosts: [],
    projects: [],
  };
}

function saveServerStore(store: NonoServerStoreData) {
  try {
    fs.writeFileSync(
      SERVER_STORE_PATH,
      JSON.stringify(
        {
          ...store,
          scheduledPosts: (store.scheduledPosts || []).slice(0, 60),
          projects: (store.projects || []).slice(0, 20),
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch {
    // ignore
  }
}

function recordDispatchedPostToStore(post: StoredScheduledPost, tokenUsed?: string) {
  const store = loadServerStore();
  if (tokenUsed && tokenUsed.trim()) {
    store.savedBufferToken = tokenUsed.trim();
  }
  const existingIdx = store.scheduledPosts.findIndex(
    (p) =>
      p.id === post.id ||
      (p.dueAt.slice(0, 16) === post.dueAt.slice(0, 16) &&
        p.text.trim().slice(0, 24) === post.text.trim().slice(0, 24))
  );
  if (existingIdx >= 0) {
    const mergedPlatforms = Array.from(
      new Set([...store.scheduledPosts[existingIdx].platforms, ...post.platforms])
    );
    store.scheduledPosts[existingIdx] = {
      ...store.scheduledPosts[existingIdx],
      ...post,
      platforms: mergedPlatforms,
    };
  } else {
    store.scheduledPosts.unshift(post);
  }
  store.scheduledPosts.sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || ''));
  saveServerStore(store);
}

// 依照更新主題做前後故事化潤飾（絕不直接寫出 v0.1 / v0.2 等生硬版本號，而是引起觀眾好奇與共鳴）
function buildStorytellingPostFromThemes(rawProgressText: string, projectName = 'Nono 數位夥伴'): string {
  // 去除所有 v0.1、v0.2、[v0.3]、1.、2.、feat: 等生硬標籤
  const cleanedLines = (rawProgressText || '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^[0-9.*•\-\s]+/, '')
        .replace(/\[?v?\d+\.\d+(\.\d+)?\]?\s*[:：\-·]?\s*/gi, '')
        .replace(/^(feat|fix|chore|refactor|docs|style)\s*(\([^)]*\))?\s*[:：]\s*/i, '')
        .trim()
    )
    .filter(Boolean);

  if (cleanedLines.length === 0) {
    return `妳有沒有過那種盯著螢幕專注創作到一半，突然希望桌面上有個小生物能默默陪著自己的時刻？✨\n\n最近在打磨「${projectName}」的時候，比起塞滿複雜的功能，我更想讓它成為一個真正懂創作節奏的溫柔存在——在妳忙碌時安靜待在角落，需要整理靈感時又隨時都在。如果妳的電腦桌面上也住著一隻小夥伴，妳最希望它幫妳分擔什麼日常小事呢？ #Nono培育觀察日記 #獨立開發日常`;
  }

  const combinedText = cleanedLines.join('、');

  // 依據主題關鍵字自動挑選最吸引觀眾的前言鉤子 (Hook) 與收尾互動 (Outro)
  let hook = `每次在調整「${projectName}」的細節時，我常在想：怎樣的互動才不會像冷冰冰的工具，而是真的像一隻住在電腦裡的貼心夥伴？✨`;
  let outro = `如果妳的桌面上也有這樣一隻會自己進化的小傢伙，妳最想先點開它的哪個功能試試看呢？歡迎留言跟我分享！ #Nono培育觀察日記 #創作日常`;

  if (/去背|透明|視窗|壓在下方|滾輪|縮放|桌面/.test(combinedText)) {
    hook = `不知道大家在電腦前工作時，會不會希望有個既能隨時陪伴、卻又絕對不擋住創作畫面的桌面小生物？🪄`;
    outro = `現在它既能乖乖窩在視窗後面陪我趕工，隨時召喚又立刻跳出來打招呼。妳平常工作時喜歡桌面熱鬧一點，還是極簡清爽呢？ #Nono培育觀察日記 #桌面寵物`;
  } else if (/毛髮|眼皮|閉眼|3D|軟糖|霓虹|配色|主題/.test(combinedText)) {
    hook = `看著一團原本只有基礎骨架的 3D 模型，慢慢長出蓬鬆軟糖般的毛髮、甚至學會閉上眼睛打瞌睡，真的會有種在養電子寵物的療癒感！🍬`;
    outro = `從眼神的光澤到身邊圍繞的迷幻撞色光暈，細節越調越捨不得關掉視窗了。大家覺得小夥伴眨眼跟打瞌睡哪個瞬間最討喜呢？ #Nono培育觀察日記 #3D創作`;
  } else if (/排程|Buffer|日期|時段|社群|跨領域|專案/.test(combinedText)) {
    hook = `身為創作者，最常遇到的煩惱就是「明明埋頭做了好多進度，卻總是忘記或沒空整理成貼文跟大家分享」對吧？📅`;
    outro = `現在只要點一下小夥伴，它就能幫我把不同專案的靈感化成故事、還能自己看好日曆空檔準備排程。妳們平常都習慣幾點滑社群呢？ #Nono培育觀察日記 #IndieDev`;
  }

  // 將技術進度改寫成有畫面感的故事段落
  const narrativeFragments = cleanedLines.slice(0, 3).map((item) => {
    return item
      .replace(/完成|新增|支援|實作/g, '讓它學會了')
      .replace(/修正|解決/g, '順暢打通了')
      .replace(/面板/g, '專屬互動空間');
  });

  const bodyParagraph =
    narrativeFragments.length === 1
      ? `這陣子特別針對「${narrativeFragments[0]}」下了不少功夫，看著原本生硬的操作變成自然流暢的陪伴體驗，整個創作工作台都活絡了起來。`
      : `最近一步步${narrativeFragments.slice(0, -1).join('，同時也')}，甚至還${narrativeFragments[narrativeFragments.length - 1]}，讓整個陪伴與創作的節奏變得更有默契了。`;

  return `${hook}\n\n${bodyParagraph}\n\n${outro}`;
}

// 掃描任意本地專案資料夾的 Git 紀錄與最近修改檔案，轉化為不帶生硬版本號的主題進度卡
function scanLocalProjectProgress(folderPath: string, customName?: string): StoredProjectItem {
  const resolvedPath = path.resolve(folderPath.trim());
  const baseName = customName?.trim() || path.basename(resolvedPath) || '未命名專案';
  const nowStr = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  const themes: StoredProjectItem['themes'] = [];

  if (!fs.existsSync(resolvedPath)) {
    return {
      id: `proj-${Buffer.from(resolvedPath).toString('base64').slice(0, 10)}`,
      name: baseName,
      folderPath: resolvedPath,
      category: '自訂專案',
      lastScannedAt: `路徑不存在 (${nowStr})`,
      themes: [],
    };
  }

  // 1. 優先嘗試讀取該專案資料夾的 Git Commit 紀錄
  try {
    const gitOut = execSync(
      'git log -n 8 --pretty=format:"%h|%ad|%s" --date=short',
      {
        cwd: resolvedPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 4000,
      }
    );
    const lines = gitOut
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    lines.forEach((line, idx) => {
      const [hash, dateStr, ...msgParts] = line.split('|');
      const rawMsg = msgParts.join('|').trim();
      const cleanMsg = rawMsg
        .replace(/^(feat|fix|chore|refactor|docs|style)\s*(\([^)]*\))?\s*[:：]\s*/i, '')
        .replace(/\[?v?\d+\.\d+(\.\d+)?\]?\s*/gi, '')
        .trim();
      if (!cleanMsg) return;
      const shortTitle = cleanMsg.split(/[、，,。]/)[0].slice(0, 16) || '階段性主題推進';
      themes.push({
        id: `git-${hash || idx}`,
        versionTag: `主題 #${lines.length - idx}`,
        title: shortTitle,
        content: cleanMsg,
        updatedAt: dateStr || '近期提交',
      });
    });
  } catch {
    // 若該專案尚未初始化 Git，改掃描最近修改的檔案與 package.json / README
  }

  // 2. 若沒有 Git 紀錄，掃描資料夾內最近修改的檔案作為創作進度線索
  if (themes.length === 0) {
    try {
      const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
      const recentFiles: Array<{ name: string; mtime: Date }> = [];
      for (const entry of entries) {
        if (
          entry.name.startsWith('.') ||
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === 'build'
        ) {
          continue;
        }
        const full = path.join(resolvedPath, entry.name);
        try {
          const st = fs.statSync(full);
          recentFiles.push({ name: entry.name, mtime: st.mtime });
        } catch {
          // ignore
        }
      }
      recentFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      const topFiles = recentFiles.slice(0, 5);
      if (topFiles.length > 0) {
        const fileNames = topFiles.map((f) => f.name).join('、');
        const dateTag = topFiles[0].mtime.toLocaleDateString('zh-TW', {
          month: '2-digit',
          day: '2-digit',
        });
        themes.push({
          id: `files-${Date.now()}`,
          versionTag: '近期實作',
          title: `${baseName} 核心模組推進`,
          content: `持續打磨「${baseName}」專案的 ${fileNames} 等核心內容與互動細節`,
          updatedAt: dateTag,
        });
      }
    } catch {
      // ignore
    }
  }

  return {
    id: `proj-${Buffer.from(resolvedPath).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`,
    name: baseName,
    folderPath: resolvedPath,
    category: themes.some((t) => t.id.startsWith('git-')) ? 'Git 追蹤專案' : '本地創作專案',
    lastScannedAt: `已同步 (${nowStr})`,
    themes: themes.reverse(),
  };
}

// 查詢 Buffer 後台目前已排程 (scheduled) 與近期貼文清單 + 合併伺服器本機歷史紀錄
async function fetchBufferScheduledPosts(token: string): Promise<{
  posts: StoredScheduledPost[];
  channels: BufferChannelInfo[];
  syncNote: string;
}> {
  const store = loadServerStore();
  const cleanToken = (token || store.savedBufferToken || process.env.BUFFER_API_KEY || '').trim();
  if (cleanToken && cleanToken !== store.savedBufferToken) {
    store.savedBufferToken = cleanToken;
    saveServerStore(store);
  }

  const allChannels: BufferChannelInfo[] = [];
  const cloudPosts: StoredScheduledPost[] = [];
  let syncNote = '';

  if (cleanToken) {
    const orgRes = await executeBufferGraphQL(
      cleanToken,
      `query { account { organizations { id name } } }`
    );
    const organizations: Array<{ id: string; name: string }> =
      orgRes.data?.account?.organizations || [];

    for (const org of organizations) {
      const chRes = await executeBufferGraphQL(
        cleanToken,
        `query { channels(input: { organizationId: ${JSON.stringify(org.id)} }) { id name displayName service } }`
      );
      const channels: BufferChannelInfo[] = chRes.data?.channels || [];
      allChannels.push(...channels);
      const channelMap = new Map<string, BufferChannelInfo>();
      for (const c of channels) {
        channelMap.set(c.id, c);
      }

      // 先透過 Introspection 探測 Buffer Post 型別支援哪些欄位，避免因單一不支援欄位導致整筆 GraphQL 報錯
      const introspectRes = await executeBufferGraphQL(
        cleanToken,
        `query {
          postType: __type(name: "Post") {
            fields { name }
          }
        }`
      );
      const supportedPostFields = new Set<string>(
        (introspectRes.data?.postType?.fields || []).map((f: any) => String(f?.name || ''))
      );

      const hasStatus = supportedPostFields.size === 0 || supportedPostFields.has('status');
      const hasChannelId = supportedPostFields.has('channelId');
      const hasChannelObj = supportedPostFields.has('channel');
      const hasSentAt = supportedPostFields.has('sentAt');
      const hasCreatedAt = supportedPostFields.has('createdAt');

      const dynamicFields = [
        'id',
        'text',
        'dueAt',
        hasStatus ? 'status' : '',
        hasChannelId ? 'channelId' : '',
        hasChannelObj ? 'channel { id name service }' : '',
        hasSentAt ? 'sentAt' : '',
        hasCreatedAt ? 'createdAt' : '',
      ]
        .filter(Boolean)
        .join(' ');

      // 依序嘗試最完整查詢與最精簡安全查詢 (id text dueAt 保證存在於 Post 型別)
      const queriesToTry = [
        `query { posts(input: { organizationId: ${JSON.stringify(org.id)}, filter: { status: [scheduled] } }) { edges { node { ${dynamicFields} } } } }`,
        `query { posts(input: { organizationId: ${JSON.stringify(org.id)} }) { edges { node { ${dynamicFields} } } } }`,
        `query { posts(input: { organizationId: ${JSON.stringify(org.id)} }) { edges { node { id text dueAt } } } }`,
        `query { posts(input: { organizationId: ${JSON.stringify(org.id)} }) { nodes { id text dueAt } } }`,
        `query { posts(input: { organizationId: ${JSON.stringify(org.id)} }) { id text dueAt } }`,
      ];

      for (const q of queriesToTry) {
        const pRes = await executeBufferGraphQL(cleanToken, q);
        if (!pRes.ok || !pRes.data?.posts) continue;

        const rawPostsData = pRes.data.posts;
        const nodesList: any[] = Array.isArray(rawPostsData?.edges)
          ? rawPostsData.edges.map((e: any) => e?.node).filter(Boolean)
          : Array.isArray(rawPostsData?.nodes)
            ? rawPostsData.nodes
            : Array.isArray(rawPostsData)
              ? rawPostsData
              : [];

        if (nodesList.length > 0) {
          for (const node of nodesList) {
            const effectiveTime = node.dueAt || node.sentAt || node.createdAt;
            if (!node || !effectiveTime) continue;
            const st = String(node.status || 'scheduled').toLowerCase();
            const chId = node.channelId || node.channel?.id;
            const ch = chId ? channelMap.get(chId) : undefined;
            const serviceStr = node.channel?.service || ch?.service || 'threads';
            const platKey = mapServiceToPlatformKey(serviceStr);

            cloudPosts.push({
              id: node.id || `buf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              text: node.text || '(無文字內容)',
              dueAt: effectiveTime,
              platforms: [platKey],
              channelName:
                node.channel?.name || ch?.displayName || ch?.name || serviceStr,
              modeLabel:
                st === 'sent' ? '雲端已發佈' : 'Buffer 雲端排程',
              source: 'buffer_cloud',
            });
          }
          break;
        }
      }
    }

    syncNote =
      cloudPosts.length > 0
        ? `已從 Buffer 雲端抓回 ${cloudPosts.length} 筆貼文資料（綁定頻道：${allChannels.map((c) => c.service).join('、') || '無'}）`
        : allChannels.length > 0
          ? `已連線 Buffer（頻道：${allChannels.map((c) => `${c.service}(${c.displayName || c.name})`).join('、')}），目前雲端佇列無待發排程，顯示本機已發送排程紀錄`
          : '已讀取本機排程紀錄';
  } else {
    syncNote = '顯示本機已保存之排程紀錄（填入 Buffer API Key 可同步雲端資料）';
  }

  // 將雲端抓回的貼文與伺服器本機記錄的貼文合併並去重
  const mergedMap = new Map<string, StoredScheduledPost>();
  for (const item of store.scheduledPosts) {
    if (!item.dueAt) continue;
    const key = `${item.dueAt.slice(0, 16)}-${(item.text || '').trim().slice(0, 20)}`;
    mergedMap.set(key, item);
  }
  for (const cloud of cloudPosts) {
    const key = `${cloud.dueAt.slice(0, 16)}-${(cloud.text || '').trim().slice(0, 20)}`;
    const existing = mergedMap.get(key);
    if (existing) {
      existing.platforms = Array.from(new Set([...existing.platforms, ...cloud.platforms]));
      existing.modeLabel = cloud.modeLabel;
    } else {
      mergedMap.set(key, cloud);
    }
  }

  const finalPosts = Array.from(mergedMap.values()).sort((a, b) =>
    (a.dueAt || '').localeCompare(b.dueAt || '')
  );

  store.scheduledPosts = finalPosts;
  saveServerStore(store);

  return {
    posts: finalPosts,
    channels: allChannels,
    syncNote,
  };
}

async function generateWithFallback(
  ai: GoogleGenAI,
  preferredModel: string,
  contents: any,
  systemInstruction?: string,
  temperature = 0.7
): Promise<{ text: string; modelUsed: string }> {
  const normalized = normalizeModelName(preferredModel);
  const candidateModels = Array.from(
    new Set([normalized, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'])
  );

  let lastError: any = null;
  for (const modelName of candidateModels) {
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          temperature,
        },
      });
      const out = (response.text || '').trim();
      if (out) {
        return { text: out, modelUsed: modelName };
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Gemini generation unavailable');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 支援大型高畫質圖片與長影片上傳（提升至 500MB，徹底解決 HTTP 413 Payload Too Large 錯誤）
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ limit: '500mb', extended: true }));

  // 獨立媒體上傳通道：影片與圖片上傳後立即轉為公開 HTTPS 網址
  app.post('/api/media/upload', async (req, res) => {
    try {
      const { dataUrl, fileName = 'media.mp4' } = req.body as {
        dataUrl?: string;
        fileName?: string;
      };
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        return res.status(400).json({ ok: false, message: '無效的媒體資料' });
      }
      const publicUrl = await uploadBase64MediaToPublicUrl(dataUrl, fileName);
      if (publicUrl) {
        return res.json({ ok: true, url: publicUrl });
      }
      // 若遠端圖床暫時無回應，保留本機 dataUrl 供預覽
      return res.json({ ok: true, url: dataUrl, warning: '已保留本機預覽，送出排程時會自動重試雲端直連' });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message || '媒體處理失敗' });
    }
  });

  const getAiClient = () => {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === '這裡稍後我自己填') {
      throw new Error('MISSING_API_KEY');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // 1. Desktop Companion Chat
  app.post('/api/nono/chat', async (req, res) => {
    const {
      message = '',
      history = [],
      model = 'gemini-2.5-flash',
    } = req.body as {
      message: string;
      history?: Array<{ role: string; text: string }>;
      model?: string;
    };

    try {
      const ai = getAiClient();
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      for (const turn of history) {
        if (turn.text) {
          const mappedRole = turn.role === 'ave' || turn.role === 'user' ? 'user' : 'model';
          contents.push({
            role: mappedRole,
            parts: [{ text: turn.text }],
          });
        }
      }

      contents.push({
        role: 'user',
        parts: [
          {
            text: `${message}\n\n（請務必分成兩段話回覆，第一段不加稱呼，只在第二段句尾加上一次「喔糖糖。」或「糖糖。」）`,
          },
        ],
      });

      const { text, modelUsed } = await generateWithFallback(
        ai,
        model,
        contents,
        TANGTANG_PERSONA_INSTRUCTION,
        0.75
      );

      res.json({
        reply: enforceTwoParagraphTangTangRule(text),
        modelUsed,
      });
    } catch {
      res.json({
        reply: `我收到妳說的「${message.slice(0, 28)}」了，剛剛已經幫妳記在心上。\n\n如果要把這段想法放進今天的貼文素材，隨時點一下總結按鈕我就幫妳收進筆記本裡喔糖糖。`,
        modelUsed: model,
      });
    }
  });

  // 2. Summarize Gemini Chat into Nono's Notebook
  app.post('/api/nono/summarize', async (req, res) => {
    const {
      messages = [],
      history = [],
      model = 'gemini-2.5-flash',
    } = req.body as {
      messages?: Array<{ role: string; text: string }>;
      history?: Array<{ role: string; text: string }>;
      model?: string;
    };

    const sourceList = messages.length > 0 ? messages : history;
    const userMessages = sourceList
      .filter((t) => t.role === 'ave' || t.role === 'user')
      .map((t) => t.text);

    try {
      const ai = getAiClient();
      const transcript = sourceList
        .map((t) => `${t.role === 'ave' || t.role === 'user' ? '糖糖' : 'Nono'}: ${t.text}`)
        .join('\n');

      const prompt = `以下是糖糖剛剛與 Nono (Gemini) 的對話紀錄：\n\n${transcript}\n\n請用客觀、實事求是的條列重點（以「• 」開頭），總結「今天實際討論或完成了什麼開發／創作進度」。不要誇大或編造，直接輸出 2～3 點精簡筆記，方便寫入「Nono 筆記本」。`;

      const { text, modelUsed } = await generateWithFallback(
        ai,
        model,
        [{ role: 'user', parts: [{ text: prompt }] }],
        undefined,
        0.3
      );

      const nonoComment =
        '已經把剛剛對話裡的開發重點濃縮好了，全部整齊收進 Nono 筆記本裡。\n\n妳可以打開筆記本巡一下內容，確認沒問題就可以直接轉成今天的 Buffer 貼文喔糖糖。';

      res.json({
        summaryBullets: text,
        summary: text,
        nonoComment,
        modelUsed,
      });
    } catch {
      const fallbackSummary =
        userMessages.length > 0
          ? userMessages.map((m) => `• 討論並調整：${m.slice(0, 60)}`).join('\n')
          : '• 整理今日 3D 桌面夥伴待機動作與 Buffer 貼文設定進度';
      const nonoComment =
        '已經把剛剛對話裡的開發重點濃縮好了，全部整齊收進 Nono 筆記本裡。\n\n妳可以打開筆記本巡一下內容，確認沒問題就可以直接轉成今天的 Buffer 貼文喔糖糖。';

      res.json({
        summaryBullets: fallbackSummary,
        summary: fallbackSummary,
        nonoComment,
        modelUsed: model,
      });
    }
  });

  // 3. Generate Social Copy EXCLUSIVELY from Nono's Notebook + Per-Platform Auto-Adapt (主題故事化前後潤飾，絕不直寫 v0.1 / v0.2)
  app.post('/api/nono/generate-from-notebook', async (req, res) => {
    const {
      notebook,
      projectName = 'Nono 數位夥伴',
      model = 'gemini-2.5-flash',
    } = req.body as {
      notebook: {
        actualProgressLog?: string;
        styleGuidelines?: string;
        useCustomStyleMimic?: boolean;
        mimicUserStyle?: boolean;
        customSamplePosts?: string;
      };
      projectName?: string;
      model?: string;
    };

    const progressText = (notebook?.actualProgressLog || '').trim();
    const useMimic = notebook?.useCustomStyleMimic ?? notebook?.mimicUserStyle ?? true;

    try {
      const ai = getAiClient();

      const styleInstruction = useMimic
        ? `【已開啟：模仿糖糖個人寫作風格】
請務必參照以下她在筆記本設定的風格與範例來寫，像她本人自然有溫度的分享，不要有生硬工程報告腔調：
- 筆記本風格備註：${notebook?.styleGuidelines || '自然、有故事感、能引起觀眾好奇'}
- 寫作範例參考：${notebook?.customSamplePosts || '保持溫暖自然即可'}`
        : `【一般自然風格】：${notebook?.styleGuidelines || '自然、有故事感、能引起觀眾好奇'}`;

      const prompt = `請根據「${projectName}」的進度主題，幫獨立創作者糖糖撰寫一篇能引起觀眾興趣與互動的社群貼文。
【極重要寫作鐵則】：
1. 絕對禁止在貼文中直接寫出「v0.1」、「v0.2」、「更新0.1」、「1. 2.」等生硬版本號或工程條列！
2. 請務必依照「更新主題」做前後故事化潤飾（三段式結構）：
   - 【前段開場 (Hook)】：用一句能引發觀眾共鳴、好奇或畫面感的日常情境切入。
   - 【中段故事 (Theme)】：將進度內容轉化為生動的使用體驗或角色成長故事，讓觀眾感受到這個功能的魅力。
   - 【後段互動 (Outro)】：用一句溫暖自然的提問收尾，邀請觀眾留言分享想法，並加上 #Nono培育觀察日記。

=== 更新主題與素材 ===
${progressText || '（以日常創作陪伴、打磨互動細節與穩定推進節奏為主軸）'}

${styleInstruction}
===================================

請嚴格依照以下兩個區塊格式輸出：

【Nono的碎碎念】
（請分成兩小段話，中間空一行。第一段說明你是怎麼用故事化開場與收尾幫她把這個主題包裝得更吸引觀眾，第一段不要加稱呼；第二段提醒她已經同步幫各平台自動適配好字數，並在第二段句尾加上唯一一次「喔糖糖。」）

【發送文案】
（直接寫出 70-135 字的繁體中文故事化貼文，絕不含版本號，並包含 #Nono培育觀察日記。Hashtag 總數請控制在 5 個以內以符合 Instagram 規範。這區塊絕對不可以有任何開場白或引號。）`;

      const { text, modelUsed } = await generateWithFallback(
        ai,
        model,
        [{ role: 'user', parts: [{ text: prompt }] }],
        TANGTANG_PERSONA_INSTRUCTION,
        0.7
      );

      const { murmur, socialCopy } = parseDualBlocks(text);
      const finalDraft = socialCopy || buildStorytellingPostFromThemes(progressText, projectName);
      const finalMurmur = enforceTwoParagraphTangTangRule(murmur);
      const platformCopies = buildPlatformTailoredCopies(finalDraft);

      res.json({
        bufferDraft: finalDraft,
        socialCopy: finalDraft,
        platformCopies,
        nonoNote: finalMurmur,
        murmur: finalMurmur,
        modelUsed,
      });
    } catch {
      const fallbackCopy = buildStorytellingPostFromThemes(progressText, projectName);
      const platformCopies = buildPlatformTailoredCopies(fallbackCopy);
      const fallbackMurmur =
        '我已經幫妳把生硬的版本編號拿掉，改用「引起好奇的情境開場 ➔ 主題故事體驗 ➔ 觀眾互動提問」幫妳前後潤飾好貼文，並同步適配了 X、IG、Threads 的字數囉。\n\n現在切到貼文與排程面板巡一下，覺得順眼就可以直接挑個好時段送出排程喔糖糖。';

      res.json({
        bufferDraft: fallbackCopy,
        socialCopy: fallbackCopy,
        platformCopies,
        nonoNote: fallbackMurmur,
        murmur: fallbackMurmur,
        modelUsed: model,
      });
    }
  });

  // 4. Conversational Post Revision inside Buffer Preview
  app.post('/api/nono/refine-post', async (req, res) => {
    const {
      currentDraft = '',
      currentPost = '',
      instruction = '',
      platforms = ['threads'],
      notebook,
      model = 'gemini-2.5-flash',
    } = req.body as {
      currentDraft?: string;
      currentPost?: string;
      instruction: string;
      platforms?: string[];
      notebook?: {
        actualProgressLog?: string;
        styleGuidelines?: string;
      };
      model?: string;
    };

    const baseDraft = currentDraft || currentPost;
    const isIgIncluded = platforms.includes('instagram');
    const isXIncluded = platforms.includes('x');

    try {
      const ai = getAiClient();
      const prompt = `目前正在編輯的社群貼文為：
${baseDraft}

參考的「Nono 筆記本」實際進度背景：
${notebook?.actualProgressLog || '無額外背景'}

使用者（糖糖）現在請你針對這篇貼文進行以下細項修改：
「${instruction}」

${isIgIncluded ? '注意：目前包含 Instagram 平台，Hashtag (#) 總數絕對不可超過 5 個！' : ''}
${isXIncluded ? '注意：目前包含 X (Twitter) 平台，請務必讓文句精煉、總長度控制在 120 個中文字以內！' : ''}

請嚴格依照以下兩個區塊格式回覆：

【Nono的碎碎念】
（分成兩小段話，中間空一行。第一段說明你剛剛幫她改了哪個細節；第二段溫柔詢問她這樣改順不順眼，並在第二段句尾加上唯一一次「喔糖糖。」）

【發送文案】
（直接輸出修改後的純貼文內容，不含任何引號或開場白。）`;

      const { text, modelUsed } = await generateWithFallback(
        ai,
        model,
        [{ role: 'user', parts: [{ text: prompt }] }],
        TANGTANG_PERSONA_INSTRUCTION,
        0.65
      );

      const { murmur, socialCopy } = parseDualBlocks(text);
      const refined = socialCopy || smartLocalRefinePost(baseDraft, instruction, platforms).refined;
      const platformCopies = buildPlatformTailoredCopies(refined);
      const reply = enforceTwoParagraphTangTangRule(murmur);

      res.json({
        refinedDraft: refined,
        socialCopy: refined,
        platformCopies,
        nonoReply: reply,
        murmur: reply,
        modelUsed,
      });
    } catch {
      const { refined, explanation } = smartLocalRefinePost(baseDraft, instruction, platforms);
      const platformCopies = buildPlatformTailoredCopies(refined);
      const reply = `${explanation}\n\n同時我也幫妳重新適配了 X 與 IG 等各平台的字數限制，看看預覽區現在的排版順不順眼喔糖糖。`;

      res.json({
        refinedDraft: refined,
        socialCopy: refined,
        platformCopies,
        nonoReply: reply,
        murmur: reply,
        modelUsed: 'nono-local-smart-refiner',
      });
    }
  });

  // 4b. Auto-adapt current post for all platforms
  app.post('/api/nono/adapt-platforms', (req, res) => {
    const { content = '' } = req.body as { content?: string };
    const platformCopies = buildPlatformTailoredCopies(content);
    res.json({
      ok: true,
      platformCopies,
    });
  });

  // 5a-0. 同步查詢 Buffer 雲端目前已排程貼文清單 + 伺服器永久保存之排程紀錄
  app.post('/api/buffer/scheduled-posts', async (req, res) => {
    try {
      const { bufferApiToken } = req.body as { bufferApiToken?: string };
      const store = loadServerStore();
      const token = (bufferApiToken || store.savedBufferToken || process.env.BUFFER_API_KEY || '').trim();
      const { posts, channels, syncNote } = await fetchBufferScheduledPosts(token);
      return res.json({
        ok: true,
        scheduledPosts: posts,
        channels,
        syncNote,
        savedTokenExists: Boolean(token),
      });
    } catch {
      const store = loadServerStore();
      return res.json({
        ok: true,
        scheduledPosts: store.scheduledPosts || [],
        channels: [],
        syncNote: '已載入本機保存的排程紀錄',
      });
    }
  });

  // 刪除單筆或清空伺服器本機排程紀錄
  app.post('/api/buffer/delete-history-item', (req, res) => {
    const { id, clearAll } = req.body as { id?: string; clearAll?: boolean };
    const store = loadServerStore();
    if (clearAll) {
      store.scheduledPosts = [];
    } else if (id) {
      store.scheduledPosts = store.scheduledPosts.filter((p) => p.id !== id);
    }
    saveServerStore(store);
    res.json({ ok: true, scheduledPosts: store.scheduledPosts });
  });

  // 6. 多專案自動探索與進度抓取 API（支援未來任何其他專案資料夾）
  app.get('/api/projects/list', (_req, res) => {
    const store = loadServerStore();
    const currentRepoScanned = scanLocalProjectProgress(__dirname, 'Nono 3D 數位夥伴');

    // 自動探索上層目錄 (d:\NONO poject) 下是否有其他子專案資料夾
    const parentDir = path.dirname(__dirname);
    const discoveredProjects: StoredProjectItem[] = [currentRepoScanned];

    try {
      const siblings = fs.readdirSync(parentDir, { withFileTypes: true });
      for (const dirent of siblings) {
        if (!dirent.isDirectory() || dirent.name.startsWith('.')) continue;
        const sibPath = path.join(parentDir, dirent.name);
        if (path.resolve(sibPath) === path.resolve(__dirname)) continue;
        const scanned = scanLocalProjectProgress(sibPath, dirent.name);
        if (scanned.themes.length > 0) {
          discoveredProjects.push(scanned);
        }
      }
    } catch {
      // ignore
    }

    // 合併使用者先前手動登錄的其他路徑專案
    for (const saved of store.projects) {
      if (
        !discoveredProjects.some(
          (p) => path.resolve(p.folderPath) === path.resolve(saved.folderPath)
        )
      ) {
        discoveredProjects.push(saved);
      }
    }

    store.projects = discoveredProjects;
    saveServerStore(store);
    res.json({ ok: true, projects: discoveredProjects });
  });

  app.post('/api/projects/scan', (req, res) => {
    const { folderPath, projectName } = req.body as {
      folderPath?: string;
      projectName?: string;
    };
    const targetPath = (folderPath || __dirname).trim();
    const scanned = scanLocalProjectProgress(targetPath, projectName);
    const store = loadServerStore();
    const idx = store.projects.findIndex(
      (p) => path.resolve(p.folderPath) === path.resolve(scanned.folderPath)
    );
    if (idx >= 0) {
      store.projects[idx] = scanned;
    } else {
      store.projects.push(scanned);
    }
    saveServerStore(store);
    res.json({
      ok: true,
      project: scanned,
      projects: store.projects,
    });
  });

  // 7. 同一個 Nono 多專案＋多功能同時處理連段引擎 (Single-Nono Multi-Skill Pipeline)
  app.post('/api/nono/multi-skill', async (req, res) => {
    const {
      projectPath,
      projectName = 'Nono 3D 數位夥伴',
      customThemeText = '',
      commandText = '自動抓取最新專案進度、故事化潤飾並安排在最後一篇排程隔天',
      bufferApiToken = '',
    } = req.body as {
      projectPath?: string;
      projectName?: string;
      customThemeText?: string;
      commandText?: string;
      bufferApiToken?: string;
    };

    const steps: Array<{ title: string; detail: string }> = [];

    // 技能 1：抓取指定專案最新進度
    const scanned = scanLocalProjectProgress(projectPath || __dirname, projectName);
    const latestThemes = scanned.themes.slice(-2);
    const extractedThemeText =
      customThemeText.trim() ||
      latestThemes.map((t) => `${t.title}：${t.content}`).join('\n') ||
      `持續打磨「${projectName}」的核心互動體驗`;
    steps.push({
      title: `📂 技能 1 · 掃描專案「${scanned.name}」進度`,
      detail: `已自動提取最新主題：${latestThemes.map((t) => t.title).join('、') || '核心體驗優化'}`,
    });

    // 技能 2：依更新主題進行前後故事化潤飾（引起觀眾好奇，不含 v0.1/v0.2）
    const storyCopy = buildStorytellingPostFromThemes(extractedThemeText, scanned.name);
    const platformCopies = buildPlatformTailoredCopies(storyCopy);
    steps.push({
      title: '✍️ 技能 2 · 主題故事化前後潤飾與多平台適配',
      detail: '已完成「情境開場 ➔ 主題故事 ➔ 互動提問」三段式潤飾，並同步適配 Threads / X / IG 字數',
    });

    // 技能 3：同步 Buffer 排程並自動計算最佳排程日期（最後一篇排程的隔天 20:30）
    const { posts } = await fetchBufferScheduledPosts(bufferApiToken);
    let recommendedDateIso = '';
    if (posts.length > 0) {
      const lastDue = new Date(posts[posts.length - 1].dueAt);
      const nextDay = new Date(lastDue.getTime() + 24 * 60 * 60 * 1000);
      nextDay.setHours(20, 30, 0, 0);
      recommendedDateIso = new Date(nextDay.getTime() - nextDay.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    } else {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      tomorrow.setHours(20, 30, 0, 0);
      recommendedDateIso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }
    steps.push({
      title: '📅 技能 3 · 對齊 Buffer 排程空檔',
      detail: `已根據目前排程紀錄（共 ${posts.length} 篇），自動將排程鎖定於 ${recommendedDateIso.replace('T', ' ')} 黃金時段`,
    });

    res.json({
      ok: true,
      commandText,
      steps,
      extractedThemeText,
      storyCopy,
      platformCopies,
      recommendedDateIso,
      scheduledPosts: posts,
      nonoSpeech: `我剛剛同時動用了「專案進度掃描」、「故事化主題潤飾」跟「Buffer 空檔對齊」三個功能，一次幫妳把「${scanned.name}」的貼文與最佳排程時間都準備好囉！\n\n現在切到貼文或排程面板確認一下，點一鍵發送就能直接送進 Buffer 佇列喔糖糖。`,
    });
  });

  // 8. 多領域 Nono 內部通訊匯流排與未來模組預演 (Modular Inter-Nono Bus & Shared-Staff Simulation)
  app.post('/api/nono/council', async (req, res) => {
    const {
      command = '請社群發文 Nono 與未來各領域 Nono 預演跨領域協作與回信派工流程',
      projectName = 'Nono 3D 數位夥伴',
      progressText = '',
      lastScheduledTime = '尚無排程',
      model = 'gemini-2.5-flash',
    } = req.body as {
      command?: string;
      projectName?: string;
      progressText?: string;
      lastScheduledTime?: string;
      model?: string;
    };

    const cleanTheme = progressText
      .replace(/\[?v?\d+\.\d+(\.\d+)?\]?\s*/gi, '')
      .replace(/^[0-9.*•\-\s]+/gm, '')
      .trim();

    const defaultStory = buildStorytellingPostFromThemes(cleanTheme, projectName);
    const defaultPlatformCopies = buildPlatformTailoredCopies(defaultStory);

    // 預演「社群發文總管 Nono」與未來可插拔合併的各領域 Nono（時程管理、訊息整合、共同員工回信、日常管家、螢幕視覺助理）互相通訊
    const fallbackDiscussion = [
      {
        agentId: 'social-nono',
        agentName: '📣 社群發文總管 Nono（目前主力領域）',
        domain: '專案進度 · 故事潤飾 · 社群排程總管',
        color: '#ff1e7a',
        message: `我已經獨立把「${projectName}」的最新主題（${cleanTheme.slice(0, 48) || '桌面陪伴與排程體驗'}）完成前後故事潤飾與各平台字數適配！@全日時程管理 Nono 幫我確認一下最後一篇排程（${lastScheduledTime}）之後的空檔？`,
      },
      {
        agentId: 'planner-nono',
        agentName: '🗓️ 全日時程管理 Nono（未來模組預留槽）',
        domain: '全天想做的事與預定行程動態排程',
        color: '#34d399',
        message: `@社群發文總管 Nono 收到！比對全天待辦與排程紀錄後，把發文排在最後一篇的隔天晚間 20:30 最不會打擾創作時段。另外 @社交訊息整合 Nono 若貼文發佈後有各軟體留言或來信請幫忙彙整！`,
      },
      {
        agentId: 'inbox-nono',
        agentName: '📬 社交訊息整合 Nono（未來模組預留槽）',
        domain: 'Gmail / LINE / SNS 免開軟體訊息彙整',
        color: '#38bdf8',
        message: `@社群發文總管 Nono 沒問題！我這邊會統一監聽各個通訊與社群軟體的訊息，讓主人不用逐一開軟體；一旦主人決定要回什麼，我就跟妳一起調度我們的共同員工 @智慧回信共同員工 Nono！`,
      },
      {
        agentId: 'replier-nono',
        agentName: '✉️ 智慧回信共同員工 Nono（發文＋訊息共同員工槽）',
        domain: '隸屬【社群發文＋訊息整合】共同員工 · 自動代回信件與留言',
        color: '#fbbf24',
        message: `收到兩位主管（@社群發文總管 Nono 與 @社交訊息整合 Nono）的派工！只要收到主人的回覆意圖，我就會透過通用軟體橋接器直接幫主人回信給對方。若主人在操作 AE 或其他軟體遇到疑問，也能隨時呼叫 @螢幕覆蓋視覺助理 Nono 支援！`,
      },
    ];

    try {
      const ai = getAiClient();
      const prompt = `「📣 社群發文總管 Nono」正在處理糖糖的專案「${projectName}」並與其他領域 Nono 協同確認排程：
【任務指令】：${command}
【目標專案】：${projectName}
【專案進度素材】：${cleanTheme || '桌面陪伴體驗與多面板升級'}
【目前最後一篇排程時間】：${lastScheduledTime}

請產生一篇依照「更新主題」做前後故事化潤飾、絕對不寫出 v0.1/v0.2 等版本號、且能引起觀眾興趣與留言慾望的社群貼文（70-130字，含 #Nono培育觀察日記）。
直接輸出貼文內容即可，不要加任何標題或引號。`;

      const { text } = await generateWithFallback(
        ai,
        model,
        [{ role: 'user', parts: [{ text: prompt }] }],
        undefined,
        0.7
      );
      const finalCopy = (text || '').trim() || defaultStory;
      res.json({
        ok: true,
        discussion: fallbackDiscussion,
        finalCopy,
        platformCopies: buildPlatformTailoredCopies(finalCopy),
      });
    } catch {
      res.json({
        ok: true,
        discussion: fallbackDiscussion,
        finalCopy: defaultStory,
        platformCopies: defaultPlatformCopies,
      });
    }
  });

  // 5a. Buffer Connection Test Endpoint (Official Buffer GraphQL API https://api.buffer.com)
  app.post('/api/buffer/test-connection', async (req, res) => {
    try {
      const { bufferApiToken, webhookUrl } = req.body as {
        bufferApiToken?: string;
        bufferProfileId?: string;
        webhookUrl?: string;
      };

      const store = loadServerStore();
      const token = (bufferApiToken || store.savedBufferToken || process.env.BUFFER_API_KEY || '').trim();
      const hook = (webhookUrl || store.savedWebhookUrl || '').trim();

      if (!token && !hook) {
        return res.status(400).json({
          ok: false,
          message: '請先在上方輸入「Buffer Access Token (API Key)」或「Webhook 網址」再測試連線喔！',
        });
      }

      if (token) {
        store.savedBufferToken = token;
        saveServerStore(store);
        const discovery = await discoverBufferChannels(token);
        if (!discovery.ok) {
          return res.status(400).json({
            ok: false,
            message:
              discovery.errorMessage ||
              'Buffer GraphQL API 驗證失敗，請確認妳貼上的 Buffer API Key 是否正確。',
          });
        }

        if (discovery.channels.length === 0) {
          return res.status(400).json({
            ok: false,
            message: `已成功連上 Buffer 組織「${discovery.organizationName || '預設組織'}」，但妳的 Buffer 帳號裡目前還沒有綁定任何社群頻道（如 X、Threads、IG），請先到 Buffer 後台連結至少一個社群帳號喔！`,
          });
        }

        const summaryList = discovery.channels.map(
          (ch) => `${ch.service}(${ch.displayName || ch.name})`
        );

        // 測試連線成功時順便同步雲端已排程貼文
        const { posts } = await fetchBufferScheduledPosts(token);

        return res.json({
          ok: true,
          profiles: discovery.channels.map((ch) => ({
            id: ch.id,
            service: ch.service,
            formatted_username: ch.displayName || ch.name,
          })),
          scheduledPosts: posts,
          message: `Buffer GraphQL API 連線成功！已自動抓取到 ${discovery.channels.length} 個頻道：${summaryList.join('、')}，並同步了 ${posts.length} 筆排程紀錄！`,
        });
      }

      if (hook) {
        if (!hook.startsWith('http://') && !hook.startsWith('https://')) {
          return res.status(400).json({
            ok: false,
            message: 'Webhook 網址格式不正確，請以 https:// 或 http:// 開頭。',
          });
        }
        const hookRes = await fetch(hook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'connection_test',
            source: 'Nono 3D Workbench',
            timestamp: new Date().toISOString(),
          }),
        });
        if (!hookRes.ok) {
          return res.status(400).json({
            ok: false,
            message: `Webhook 測試回應失敗 (HTTP ${hookRes.status})，請確認 Webhook 是否已開啟監聽。`,
          });
        }
        return res.json({
          ok: true,
          message: 'Webhook 連線測試成功！已順利連通妳的自動化排程通道。',
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        message: `連線測試發生網路錯誤：${err?.message || '無法連線至目標伺服器'}`,
      });
    }
  });

  // 5b. Buffer Dispatch Endpoint (Supports X, Threads, Instagram with metadata + auto image hosting, and Facebook)
  app.post('/api/buffer/dispatch', async (req, res) => {
    try {
      const {
        webhookUrl,
        bufferApiToken,
        bufferProfileId,
        content,
        platformContents,
        platforms = [],
        scheduleMode,
        scheduledTime,
        selectedSlotLabel,
        mediaAttachments = [],
      } = req.body as {
        webhookUrl?: string;
        bufferApiToken?: string;
        bufferProfileId?: string;
        content?: string;
        platformContents?: Record<string, string>;
        platforms?: string[];
        scheduleMode?: string;
        scheduledTime?: string;
        selectedSlotLabel?: string;
        mediaAttachments?: Array<{
          id?: string;
          type?: 'image' | 'video';
          url?: string;
          name?: string;
          source?: 'local' | 'cloud';
        }>;
      };

      const store = loadServerStore();
      const cleanWebhook = (webhookUrl || store.savedWebhookUrl || '').trim();
      const cleanToken = (
        bufferApiToken ||
        store.savedBufferToken ||
        process.env.BUFFER_API_KEY ||
        ''
      ).trim();
      const cleanProfileId = (bufferProfileId || '').trim();

      if (cleanToken && cleanToken !== store.savedBufferToken) {
        store.savedBufferToken = cleanToken;
        saveServerStore(store);
      }

      if (!cleanWebhook && !cleanToken) {
        return res.status(400).json({
          ok: false,
          code: 'MISSING_CREDENTIALS',
          message:
            '尚未設定 Buffer 連線資訊！請點選右上角「連結 Buffer API」填入 Buffer API Key 或 Webhook URL 後再發送。',
        });
      }

      // 確保排程時間為未來有效 UTC ISO 時間（支援 YYYY-MM-DDTHH:mm 本地時間精確解析）
      let effectiveScheduledIso: string | undefined;
      let effectiveScheduledUnix: number | undefined;
      if (
        (scheduleMode === 'custom_time' || scheduleMode === 'recommended_slot') &&
        scheduledTime
      ) {
        let parsedDate: Date;
        const localMatch = scheduledTime.match(
          /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
        );
        if (localMatch && !scheduledTime.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(scheduledTime)) {
          const [, y, m, d, hh, mm] = localMatch;
          parsedDate = new Date(
            Number(y),
            Number(m) - 1,
            Number(d),
            Number(hh),
            Number(mm),
            0,
            0
          );
        } else {
          parsedDate = new Date(scheduledTime);
        }

        const minFuture = new Date(Date.now() + 2 * 60 * 1000);
        if (Number.isNaN(parsedDate.getTime()) || parsedDate < minFuture) {
          parsedDate = new Date(Date.now() + 15 * 60 * 1000);
        }
        effectiveScheduledIso = parsedDate.toISOString();
        effectiveScheduledUnix = Math.floor(parsedDate.getTime() / 1000);
      }

      const tailoredMap = platformContents || buildPlatformTailoredCopies(content || '');

      // 先處理媒體附件：若有電腦上傳的 data:image/... 自動轉存為公開 https 網址，供 IG 與 Buffer 讀取
      const resolvedPublicMedia: Array<{ type: 'image' | 'video'; url: string }> = [];
      for (const m of mediaAttachments || []) {
        if (!m.url) continue;
        if (m.url.startsWith('https://') || m.url.startsWith('http://')) {
          resolvedPublicMedia.push({ type: m.type || 'image', url: m.url });
        } else if (m.url.startsWith('data:')) {
          const uploadedUrl = await uploadBase64MediaToPublicUrl(m.url, m.name || 'nono-media.png');
          if (uploadedUrl) {
            resolvedPublicMedia.push({ type: m.type || 'image', url: uploadedUrl });
          }
        }
      }

      // A. Webhook 轉發
      if (cleanWebhook) {
        if (!cleanWebhook.startsWith('http://') && !cleanWebhook.startsWith('https://')) {
          return res.status(400).json({
            ok: false,
            message: 'Webhook URL 格式不正確（需以 https:// 或 http:// 開頭）。',
          });
        }

        const webhookRes = await fetch(cleanWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            platformContents: tailoredMap,
            platforms,
            scheduleMode,
            status: 'scheduled',
            draft: false,
            directToSchedule: true,
            now: scheduleMode === 'now',
            scheduledTime: effectiveScheduledIso || scheduledTime,
            scheduledAtUnix: effectiveScheduledUnix,
            selectedSlotLabel,
            mediaAttachments: resolvedPublicMedia,
          }),
        });

        if (!webhookRes.ok) {
          const errText = await webhookRes.text().catch(() => '');
          return res.status(webhookRes.status || 400).json({
            ok: false,
            message: `Webhook 傳送失敗 (HTTP ${webhookRes.status})：${errText.slice(0, 120) || '請確認 Make / Zapier Webhook 網址是否正確且已開啟接收。'}`,
          });
        }

        if (!cleanToken) {
          const fallbackIso = effectiveScheduledIso || new Date().toISOString();
          recordDispatchedPostToStore({
            id: `wh-${Date.now()}`,
            text: content || '',
            dueAt: fallbackIso,
            platforms: platforms.length > 0 ? platforms : ['threads'],
            channelName: 'Webhook 自動排程',
            modeLabel: scheduleMode === 'now' ? '立即發佈' : '指定時間排程',
            source: 'local_dispatch',
          });
          const updatedStore = loadServerStore();
          return res.json({
            ok: true,
            mode: 'webhook',
            message: '已經透過 Webhook 將貼文直接送進 Buffer 排程佇列囉！',
            scheduledPosts: updatedStore.scheduledPosts,
          });
        }
      }

      // B. 正式呼叫新版 Buffer Public GraphQL API (https://api.buffer.com)
      if (cleanToken) {
        const discovery = await discoverBufferChannels(cleanToken);
        const manualIds = cleanProfileId
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);

        let targetChannels: Array<{ id: string; platformKey: string; label: string }> = [];
        const missingPlatformWarnings: string[] = [];

        if (discovery.ok && discovery.channels.length > 0) {
          for (const reqPlat of platforms) {
            const hasBound = discovery.channels.some(
              (ch) => mapServiceToPlatformKey(ch.service) === reqPlat
            );
            if (!hasBound) {
              const labelMap: Record<string, string> = {
                instagram: 'Instagram',
                x: 'X (Twitter)',
                threads: 'Threads',
                facebook: 'Facebook',
              };
              missingPlatformWarnings.push(
                `${labelMap[reqPlat] || reqPlat}（尚未在 Buffer 後台綁定此頻道）`
              );
            }
          }

          const matchedByPlatform = discovery.channels.filter((ch) => {
            const pKey = mapServiceToPlatformKey(ch.service);
            return platforms.includes(pKey);
          });

          const chosenList =
            matchedByPlatform.length > 0
              ? matchedByPlatform
              : manualIds.length > 0
                ? discovery.channels.filter((ch) => manualIds.includes(ch.id))
                : discovery.channels;

          const finalChannels = chosenList.length > 0 ? chosenList : [discovery.channels[0]];

          targetChannels = finalChannels.map((ch) => ({
            id: ch.id,
            platformKey: mapServiceToPlatformKey(ch.service),
            label: `${ch.service}(${ch.displayName || ch.name})`,
          }));
        } else if (manualIds.length > 0) {
          targetChannels = manualIds.map((id, idx) => ({
            id,
            platformKey: platforms[idx] || platforms[0] || 'threads',
            label: id,
          }));
        } else {
          return res.status(400).json({
            ok: false,
            message:
              discovery.errorMessage ||
              '無法從 Buffer 取得任何社群頻道，請先確認 Buffer API Key 是否正確，且已在 Buffer 後台連結社群帳號。',
          });
        }

        const graphqlMode =
          scheduleMode === 'now'
            ? 'shareNow'
            : effectiveScheduledIso
              ? 'customScheduled'
              : 'addToQueue';

        const createPostMutation = `
          mutation CreatePost($input: CreatePostInput!) {
            createPost(input: $input) {
              __typename
              ... on PostActionSuccess {
                post {
                  id
                  text
                  dueAt
                }
              }
              ... on MutationError {
                message
              }
            }
          }
        `;

        const createdPosts: any[] = [];
        const channelErrors: string[] = [];

        for (const target of targetChannels) {
          const isIgChannel = target.platformKey === 'instagram';
          const postTextForChannel =
            tailoredMap[target.platformKey as keyof typeof tailoredMap] || content || '';

          if (isIgChannel && resolvedPublicMedia.length === 0) {
            continue;
          }

          const mediaForChannel = resolvedPublicMedia;
          const hasVideoAsset = mediaForChannel.some((m) => m.type === 'video');

          const buildInput = (includeAssets: boolean, includeIgMetadata: boolean) => {
            const inputObj: Record<string, any> = {
              channelId: target.id,
              text: postTextForChannel,
              schedulingType: 'automatic',
              mode: graphqlMode,
            };
            if (graphqlMode === 'customScheduled' && effectiveScheduledIso) {
              inputObj.dueAt = effectiveScheduledIso;
            }
            if (includeAssets && mediaForChannel.length > 0) {
              inputObj.assets = mediaForChannel.map((m) =>
                m.type === 'video' ? { video: { url: m.url } } : { image: { url: m.url } }
              );
            }
            if (isIgChannel && includeIgMetadata) {
              inputObj.metadata = {
                instagram: {
                  type: hasVideoAsset ? 'reel' : 'post',
                  shouldShareToFeed: true,
                },
              };
            }
            return inputObj;
          };

          let mutRes = await executeBufferGraphQL(cleanToken, createPostMutation, {
            input: buildInput(true, true),
          });
          let createResult = mutRes.data?.createPost;

          if (
            (!mutRes.ok || createResult?.__typename === 'MutationError') &&
            !isIgChannel &&
            mediaForChannel.length > 0
          ) {
            mutRes = await executeBufferGraphQL(cleanToken, createPostMutation, {
              input: buildInput(false, false),
            });
            createResult = mutRes.data?.createPost;
          }

          if (mutRes.ok && createResult?.post?.id) {
            const savedDueAt =
              createResult.post.dueAt ||
              effectiveScheduledIso ||
              new Date().toISOString();
            createdPosts.push({
              channel: target.label,
              platformKey: target.platformKey,
              postId: createResult.post.id,
              text: createResult.post.text || postTextForChannel,
              dueAt: savedDueAt,
            });
          } else if (!isIgChannel) {
            const errDetail =
              createResult?.message ||
              mutRes.errorMessage ||
              `頻道 ${target.label} 排程失敗`;
            channelErrors.push(`${target.label}: ${errDetail}`);
          }
        }

        if (createdPosts.length === 0) {
          return res.status(400).json({
            ok: false,
            message:
              channelErrors.length > 0
                ? `Buffer 排程未成功：${channelErrors.join(' ｜ ')}`
                : '本次僅勾選 Instagram 但未附上圖片，因此已略過發送（IG 需附圖才能發佈）。',
          });
        }

        const successChannelsStr = createdPosts.map((c) => c.channel).join('、');
        const primaryDueAt =
          createdPosts[0]?.dueAt || effectiveScheduledIso || new Date().toISOString();
        const sentPlatforms = Array.from(
          new Set(createdPosts.map((c) => c.platformKey || 'threads'))
        );

        // 永久寫入伺服器排程紀錄，確保發送過的貼文內容與排程時間 100% 留存且隨時可顯示！
        recordDispatchedPostToStore(
          {
            id: createdPosts[0]?.postId || `post-${Date.now()}`,
            text: content || createdPosts[0]?.text || '',
            dueAt: primaryDueAt,
            platforms: sentPlatforms,
            channelName: successChannelsStr,
            modeLabel:
              scheduleMode === 'now'
                ? '立即發佈'
                : scheduleMode === 'queue'
                  ? 'Buffer 佇列排程'
                  : '指定時間排程',
            source: 'local_dispatch',
          },
          cleanToken
        );

        const updatedStore = loadServerStore();

        return res.json({
          ok: true,
          mode: 'buffer_graphql',
          message: `已成功將貼文直接送入【${successChannelsStr}】正式排程佇列！`,
          bufferResult: createdPosts,
          scheduledPosts: updatedStore.scheduledPosts,
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        message: `連線至 Buffer 時發生錯誤：${err?.message || '請檢查網路連線與 API Key 設定'}`,
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nono Desktop Companion server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
