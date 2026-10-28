import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
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

// ==================== 將電腦本地上傳的 Base64 圖片自動轉為公開 HTTPS 網址（供 Buffer & IG 抓取） ====================
async function uploadBase64MediaToPublicUrl(
  dataUrl: string,
  fileName = 'nono-post.png'
): Promise<string | null> {
  try {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: mimeType });

    // 1. 優先嘗試 Catbox 匿名公開圖床 (永久直連 HTTPS，支援 IG / Buffer 直接抓取)
    try {
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', blob, fileName);
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
      // ignore and try backup host
    }

    // 2. 備援：tmpfiles.org 公開 API
    try {
      const form2 = new FormData();
      form2.append('file', blob, fileName);
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

// 查詢 Buffer 後台目前已排程 (scheduled) 的貼文清單，讓前端能顯示「那天/最近幾天/最後一篇排程是何時」
async function fetchBufferScheduledPosts(token: string): Promise<
  Array<{
    id: string;
    text: string;
    dueAt: string;
    platform: string;
    channelName: string;
  }>
> {
  const orgRes = await executeBufferGraphQL(
    token,
    `query { account { organizations { id name } } }`
  );
  const organizations: Array<{ id: string; name: string }> =
    orgRes.data?.account?.organizations || [];
  if (organizations.length === 0) return [];

  const results: Array<{
    id: string;
    text: string;
    dueAt: string;
    platform: string;
    channelName: string;
  }> = [];

  for (const org of organizations) {
    const chRes = await executeBufferGraphQL(
      token,
      `query { channels(input: { organizationId: ${JSON.stringify(org.id)} }) { id name displayName service } }`
    );
    const channels: BufferChannelInfo[] = chRes.data?.channels || [];
    const channelMap = new Map<string, BufferChannelInfo>();
    for (const c of channels) {
      channelMap.set(c.id, c);
    }

    // 嘗試查詢該組織下 status: [scheduled] 或 status: scheduled 的貼文
    const queriesToTry = [
      `query { posts(input: { organizationId: ${JSON.stringify(org.id)}, filter: { status: [scheduled] } }) { edges { node { id text status dueAt channelId } } } }`,
      `query { posts(input: { organizationId: ${JSON.stringify(org.id)}, filter: { status: scheduled } }) { edges { node { id text status dueAt channelId } } } }`,
      `query { posts(input: { organizationId: ${JSON.stringify(org.id)} }) { edges { node { id text status dueAt channelId } } } }`,
    ];

    for (const q of queriesToTry) {
      const pRes = await executeBufferGraphQL(token, q);
      const edges = pRes.data?.posts?.edges;
      if (pRes.ok && Array.isArray(edges)) {
        for (const edge of edges) {
          const node = edge?.node;
          if (!node || !node.dueAt) continue;
          const st = String(node.status || '').toLowerCase();
          if (st && st !== 'scheduled' && st !== 'buffer') continue;
          const ch = channelMap.get(node.channelId);
          results.push({
            id: node.id,
            text: node.text || '',
            dueAt: node.dueAt,
            platform: ch ? mapServiceToPlatformKey(ch.service) : 'threads',
            channelName: ch ? ch.displayName || ch.name : 'Buffer 頻道',
          });
        }
        break;
      }
    }
  }

  return results;
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

  app.use(express.json({ limit: '25mb' }));

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

  // 3. Generate Social Copy EXCLUSIVELY from Nono's Notebook + Per-Platform Auto-Adapt
  app.post('/api/nono/generate-from-notebook', async (req, res) => {
    const {
      notebook,
      model = 'gemini-2.5-flash',
    } = req.body as {
      notebook: {
        actualProgressLog?: string;
        styleGuidelines?: string;
        useCustomStyleMimic?: boolean;
        mimicUserStyle?: boolean;
        customSamplePosts?: string;
      };
      model?: string;
    };

    const progressText = (notebook?.actualProgressLog || '').trim();
    const useMimic = notebook?.useCustomStyleMimic ?? notebook?.mimicUserStyle ?? true;

    try {
      const ai = getAiClient();

      const styleInstruction = useMimic
        ? `【已開啟：模仿糖糖個人寫作風格】
請務必參照以下她在筆記本設定的風格與範例來寫，像她本人自然平實的分享，不要有行銷小編腔調：
- 筆記本風格備註：${notebook?.styleGuidelines || '自然、平實、不浮誇'}
- 寫作範例參考：${notebook?.customSamplePosts || '保持平實自然即可'}`
        : `【一般自然風格】：${notebook?.styleGuidelines || '自然、平實、不浮誇'}`;

      const prompt = `請根據「Nono 筆記本」幫獨立創作者糖糖整理今天的社群貼文。
注意：只能使用這份筆記本裡的資訊，絕對不要引用任何筆記本以外的內容。

=== Nono 筆記本（唯一資料來源） ===
【今日實際進度（選填）】：
${progressText || '（今日未特別填寫具體工程進度，請以日常創作陪伴、整理靈感與穩定推進節奏為主軸）'}

${styleInstruction}
===================================

請嚴格依照以下兩個區塊格式輸出：

【Nono的碎碎念】
（請分成兩小段話，中間空一行。第一段說明你是怎麼照著筆記本幫她整理這篇貼文的，第一段不要加稱呼；第二段提醒她已經同步幫各平台自動適配好字數，並在第二段句尾加上唯一一次「喔糖糖。」）

【發送文案】
（直接寫出 50-100 字的繁體中文純貼文，忠實呈現筆記本裡的實際進度，並包含 #Nono培育觀察日記。Hashtag 總數請控制在 5 個以內以符合 Instagram 規範。這區塊絕對不可以有任何開場白或引號。）`;

      const { text, modelUsed } = await generateWithFallback(
        ai,
        model,
        [{ role: 'user', parts: [{ text: prompt }] }],
        TANGTANG_PERSONA_INSTRUCTION,
        0.6
      );

      const { murmur, socialCopy } = parseDualBlocks(text);
      const finalDraft = socialCopy || text;
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
      const cleanLines = progressText
        .split('\n')
        .map((l) => l.replace(/^[0-9.*•\-\s]+/, '').trim())
        .filter(Boolean)
        .join('，');
      const fallbackCopy = cleanLines
        ? `今天持續推進桌面小夥伴的開發進度：${cleanLines.slice(0, 78)}。一步一步把細節調整到位，繼續往下推進。 #Nono培育觀察日記 #IndieDev`
        : `今天在桌面前跟軟糖 Nono 一起整理日常創作節奏，把接下來的靈感與排程順過一遍，一步一步穩定往前推進。 #Nono培育觀察日記 #IndieDev`;
      const platformCopies = buildPlatformTailoredCopies(fallbackCopy);
      const fallbackMurmur =
        '貼文已經嚴格照著 Nono 筆記本的紀錄寫好了，而且我也同步幫 X、IG、Threads 自動適配好專屬字數與標籤囉。\n\n現在幫妳切到 Buffer 排程視窗，確認時段沒問題就能直接送進排程佇列喔糖糖。';

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

  // 5a-0. 同步查詢 Buffer 雲端目前已排程貼文清單
  app.post('/api/buffer/scheduled-posts', async (req, res) => {
    try {
      const { bufferApiToken } = req.body as { bufferApiToken?: string };
      const token = (bufferApiToken || process.env.BUFFER_API_KEY || '').trim();
      if (!token) {
        return res.json({ ok: true, scheduledPosts: [] });
      }
      const scheduledPosts = await fetchBufferScheduledPosts(token);
      return res.json({ ok: true, scheduledPosts });
    } catch {
      return res.json({ ok: true, scheduledPosts: [] });
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

      const token = (bufferApiToken || process.env.BUFFER_API_KEY || '').trim();
      const hook = (webhookUrl || '').trim();

      if (!token && !hook) {
        return res.status(400).json({
          ok: false,
          message: '請先在上方輸入「Buffer Access Token (API Key)」或「Webhook 網址」再測試連線喔！',
        });
      }

      if (token) {
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

        return res.json({
          ok: true,
          profiles: discovery.channels.map((ch) => ({
            id: ch.id,
            service: ch.service,
            formatted_username: ch.displayName || ch.name,
          })),
          message: `Buffer GraphQL API 連線成功！已自動抓取到 ${discovery.channels.length} 個頻道：${summaryList.join('、')}（Channel ID 已自動填入！）`,
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

      const cleanWebhook = (webhookUrl || '').trim();
      const cleanToken = (bufferApiToken || process.env.BUFFER_API_KEY || '').trim();
      const cleanProfileId = (bufferProfileId || '').trim();

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
          return res.json({
            ok: true,
            mode: 'webhook',
            message: '已經透過 Webhook 將貼文直接送進 Buffer 排程佇列囉！',
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
          // 檢查使用者勾選的平台中，有哪些在 Buffer 帳號內有對應綁定頻道
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

          // 若是 Instagram 但沒有附圖，直接略過 IG 不發送（不影響 Threads / X 發送）
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

          // 若一般平台（非 IG）因圖片網址問題報錯，自動退回純文字排程重試
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
            createdPosts.push({
              channel: target.label,
              postId: createResult.post.id,
              dueAt: createResult.post.dueAt,
            });
          } else if (!isIgChannel) {
            // 若是 IG 失敗則靜默略過，不影響其他平台成功狀態
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

        return res.json({
          ok: true,
          mode: 'buffer_graphql',
          message: `已成功將貼文直接送入【${successChannelsStr}】正式排程佇列！`,
          bufferResult: createdPosts,
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
