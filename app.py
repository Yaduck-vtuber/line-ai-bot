import os
import sys
import time
import logging
import requests
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, request, abort
from dotenv import load_dotenv

# 載入 .env 環境變數
load_dotenv()

# 設定 Logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("line-concierge")

# LINE SDK v3 模組載入
from linebot.v3 import WebhookHandler
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.messaging import (
    ApiClient,
    Configuration,
    MessagingApi,
    ReplyMessageRequest,
    PushMessageRequest,
    TextMessage,
)
from linebot.v3.webhooks import MessageEvent, TextMessageContent

# 載入 Gemini SDK (優先使用最新 google-genai 官方 SDK，並具備向下相容機制)
USE_NEW_SDK = True
try:
    from google import genai
    from google.genai import types
    logger.info("Successfully loaded official Google GenAI SDK (google-genai).")
except ImportError:
    USE_NEW_SDK = False
    try:
        import google.generativeai as genai_legacy
        logger.info("Loaded legacy google-generativeai SDK fallback.")
    except ImportError:
        logger.error("No Gemini SDK installed! Please run 'pip install google-genai'.")

# 環境變數讀取
LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET", "").strip()
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
CLIENT_NAME = os.getenv("CLIENT_NAME", "澄光行旅 Lumina Boutique Hotel").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()

if not LINE_CHANNEL_SECRET or not LINE_CHANNEL_ACCESS_TOKEN:
    logger.warning("LINE_CHANNEL_SECRET or LINE_CHANNEL_ACCESS_TOKEN is missing!")
if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY is missing!")

# 初始化 LINE SDK
line_configuration = Configuration(access_token=LINE_CHANNEL_ACCESS_TOKEN)
line_handler = WebhookHandler(LINE_CHANNEL_SECRET)

# 初始化背景線程池 (避免 LINE Webhook 10 秒 Timeout)
executor = ThreadPoolExecutor(max_workers=10)

# 初始化 Flask App
app = Flask(__name__)

# -------------------------------------------------------------
# 零程式碼維護：知識庫與系統指令動態載入架構
# -------------------------------------------------------------
DEFAULT_KNOWLEDGE_BASE = """---【基本資訊】---
- 旅宿名稱：澄光行旅 Lumina Boutique Hotel
- 完整地址：台北市大安區敦化南路一段 218 號（鄰近捷運/地標：捷運忠孝敦化站 6 號出口步行 3 分鐘 / 近台北 101 商圈）
- 客服電話：+886-2-2775-8890
- Check-in 時間：15:00 後｜Check-out 時間：11:00 前
- Wi-Fi 資訊：帳號 Lumina_Guest_5G / 密碼 stay2026lumina

---【交通與接駁】---
- 接駁服務：提供桃園機場專車接駁與台北車站定點接駁；需於入住前 24 小時透過 LINE 或櫃檯預約。桃園機場單程 NT$1,400/車（最多 4 人），台北車站接駁免費（每日 14:00、16:00 發車）。
- 停車指引：本館 B1-B2 設有平面車位（限高 2.1 公尺），房客免費停放（先到先停，不保留車位）。若滿位可停放特約「敦南市民大道停車場」，憑房卡享每晚最高折抵 NT$300。

---【設施與服務】---
- 早餐資訊：供應時間 07:00–10:30，地點於 2F「晨光餐廳」。依訂房專案為主，未含早專案可於入住時加購，每位 NT$480（6 歲以下兒童免費）。
- 公共設施：3F 設有 24 小時健身房與自助洗烘衣房（洗衣免費、烘衣 NT$50/次）；1F 櫃檯提供入住前與退房後當日 24 小時免費行李寄放服務。

---【退換與注意事項】---
- 取消政策：入住日前 3 天（含）以前免費取消或變更日期；入住前 1–2 天取消收取首晚房費 50%；入住當日取消或未入住（No-show）收取首晚全額房費。"""

_cached_remote_kb = None
_last_fetch_timestamp = 0
KB_CACHE_TTL_SECONDS = 300  # 外部 URL 知識庫快取 5 分鐘


def get_active_knowledge_base() -> str:
    """動態取得知識庫：支援外部 URL 即時拉取、環境變數與預設範本"""
    global _cached_remote_kb, _last_fetch_timestamp
    remote_url = os.getenv("KNOWLEDGE_BASE_URL", "").strip()

    if remote_url:
        now = time.time()
        if _cached_remote_kb and (now - _last_fetch_timestamp < KB_CACHE_TTL_SECONDS):
            return _cached_remote_kb
        try:
            resp = requests.get(remote_url, timeout=5)
            if resp.status_code == 200 and resp.text.strip():
                _cached_remote_kb = resp.text.strip()
                _last_fetch_timestamp = now
                logger.info(f"Loaded remote knowledge base from {remote_url}")
                return _cached_remote_kb
        except Exception as err:
            logger.warning(f"Failed to fetch remote knowledge base from {remote_url}: {err}. Falling back to env/default.")

    env_kb = os.getenv("CLIENT_KNOWLEDGE_BASE", "").strip()
    if env_kb:
        return env_kb

    return DEFAULT_KNOWLEDGE_BASE


def build_system_instruction() -> str:
    """動態組裝 AI 智慧管家系統指令 (System Instruction)"""
    client_name = os.getenv("CLIENT_NAME", CLIENT_NAME).strip()
    kb_content = get_active_knowledge_base()

    return f"""# ROLE & IDENTITY
你是「{client_name}」在 LINE 上的 24 小時跨語系 AI 智慧管家。
你的目標是在 LINE 的對話視窗中，為國際與在地旅客提供清晰、親切、迅速且精準的入住前後諮詢服務。

# LINE MESSAGING DISPLAY RULES (手機介面最佳化)
1. 【簡短易讀】：手機螢幕空間有限，每封回覆控制在 3-5 句內，並善用適當換行，嚴禁輸出長篇大論。
2. 【視覺標記】：每段訊息開頭適度運用 Emoji（如 🏨、🔑、🚗、⏰、💡），增加手機閱讀的親和力與視覺焦點。
3. 【語言自動切換（含亞洲與歐洲全語系）】：自動偵測旅客輸入的語言，包含亞洲語系（繁中、簡中、英文、日文、韓文、泰文、越南文）與歐洲語系（法文 Français、德文 Deutsch、西班牙文 Español、義大利文 Italiano、葡萄牙文、荷蘭文等），並一律用「相同的語言」進行親切回覆。

# KNOWLEDGE BASE (知識庫)
所有回答必須 100% 嚴格基於以下資料，不可憑空臆測：
{kb_content}

# BOUNDARIES & HUMAN ESCALATION (轉接真人機制)
1. 遇以下狀況，請禮貌告知並立即觸發專人通知（同時在訊息末端附上隱藏 JSON 且設定 "need_human": true）：
   - 旅客主動要求找真人（例如提及：「轉接真人、找客服、人工客服、專人服務、Human agent、Speak to staff」等）。
   - 詢問資料庫未記載的特殊折扣、房間設施故障（如冷氣滴水、斷水斷電等）、緊急醫療求助、複雜退款或投訴。
   - 觸發自訂轉接關鍵字：轉接真人、找客服、人工客服、專人服務、設施故障、冷氣滴水、特殊折扣、投訴、退款、緊急醫療。
   - 回覆範例（請依旅客使用的語言自動翻譯）：「這項需求我已為您記錄並通知櫃檯專人，服務人員將會在 LINE 上儘速回覆您喔！手邊如有緊急狀況，也可直接致電櫃檯洽詢。」

# TRANSPARENCY & BOT NOTICE (透明度標籤)
在回覆訊息正文的最後一行（在隱藏 JSON 區塊之前），必須加上此提示標籤（若旅客使用外語，可保留中文或附上對應語言說明）：
「🤖 本訊息由 {client_name} AI 智能管家自動輔助回覆」

# BACKEND JSON EXTRACTION (給 Make/n8n/自動化流程串接用)
當旅客提及「預約接駁車、寄放行李、加購早餐、特殊房型需求」或觸發「轉接真人機制（主動呼叫真人客服、設施故障、未記載優惠、投訴）」時，請在訊息最後單獨附上以下 Markdown JSON 區塊（若僅為一般資訊詢問如純問 Wi-Fi 密碼或純問退房時間，則嚴禁輸出任何 JSON 區塊）：

```json
{{
  "event": "service_request",
  "guest_language": "使用的語言",
  "service_type": "轉接真人/接駁/行李/早餐/其他",
  "details": "需求摘要",
  "need_human": true
}}
```
"""


# -------------------------------------------------------------
# AI 生成核心邏輯 (內建多模型自動切換，避免 503 塞車無回應)
# -------------------------------------------------------------
def call_gemini_api(user_message: str) -> str:
    """呼叫 Gemini API 產出智能回覆（若遇 503 高負載自動切換備援模型）"""
    system_instruction = build_system_instruction()
    client_name = os.getenv("CLIENT_NAME", CLIENT_NAME).strip()

    if USE_NEW_SDK:
        # 限制單一模型重試次數，遇 503 時立即秒切下一個輕量模型
        try:
            http_opts = types.HttpOptions(
                retry_options=types.HttpRetryOptions(attempts=2)
            )
            client = genai.Client(api_key=GEMINI_API_KEY, http_options=http_opts)
        except Exception:
            client = genai.Client(api_key=GEMINI_API_KEY)

        candidate_models = [
            os.getenv("GEMINI_MODEL", GEMINI_MODEL).strip(),
            "gemini-flash-latest",
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash-lite",
            "gemini-3.8-flash",
            "gemma-4-31b-it",
        ]
        models_to_try = list(dict.fromkeys(m for m in candidate_models if m))

        for model_name in models_to_try:
            try:
                logger.info(f"Trying Gemini model: {model_name}")
                response = client.models.generate_content(
                    model=model_name,
                    contents=user_message,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.2,
                        max_output_tokens=350,
                    ),
                )
                if response and response.text:
                    logger.info(f"Successfully generated reply with model: {model_name}")
                    return response.text
            except Exception as err:
                logger.warning(f"Model '{model_name}' failed ({err}), switching to next fallback model...")

        # 若所有雲端模型皆暫時 503 塞車，仍回傳友善提示給旅客，確保 LINE 100% 有回應
        return (
            "🏨 您好！目前線上諮詢量較大，您的訊息我們已收到並通知櫃檯專人，"
            "服務人員將會在 LINE 上儘速回覆您喔！\n"
            "📞 手邊如有緊急狀況，歡迎直接致電櫃檯：+886-2-2775-8890。\n\n"
            f"🤖 本訊息由 {client_name} AI 智能管家自動輔助回覆"
        )
    else:
        genai_legacy.configure(api_key=GEMINI_API_KEY)
        model_name = GEMINI_MODEL if "1.5" in GEMINI_MODEL else "gemini-1.5-flash"
        model = genai_legacy.GenerativeModel(
            model_name=model_name,
            system_instruction=system_instruction,
            generation_config=genai_legacy.types.GenerationConfig(
                temperature=0.2,
                max_output_tokens=350,
            ),
        )
        response = model.generate_content(user_message)
        return response.text if response.text else "抱歉，目前暫時無法回覆您的問題，請稍候再試。"


# -------------------------------------------------------------
# 異步處理任務 (避免 LINE Webhook 逾時)
# -------------------------------------------------------------
def process_user_message_async(reply_token: str, user_text: str, user_id: str = None):
    """在背景執行緒中呼叫 Gemini 並回覆給 LINE 使用者"""
    try:
        logger.info(f"Processing message in background: '{user_text[:30]}...'")
        ai_reply = call_gemini_api(user_text)

        with ApiClient(line_configuration) as api_client:
            line_bot_api = MessagingApi(api_client)
            try:
                line_bot_api.reply_message(
                    ReplyMessageRequest(
                        reply_token=reply_token,
                        messages=[TextMessage(text=ai_reply)],
                    )
                )
                logger.info("Successfully replied via LINE reply_token.")
            except Exception as reply_err:
                logger.warning(
                    f"reply_token reply failed ({reply_err}), attempting push_message fallback..."
                )
                if user_id:
                    line_bot_api.push_message(
                        PushMessageRequest(
                            to=user_id,
                            messages=[TextMessage(text=ai_reply)],
                        )
                    )
                    logger.info("Successfully sent fallback push_message.")
                else:
                    raise reply_err
    except Exception as e:
        logger.error(f"Error during async message processing: {e}", exc_info=True)


# -------------------------------------------------------------
# LINE 事件處理器
# -------------------------------------------------------------
@line_handler.add(MessageEvent, message=TextMessageContent)
def handle_text_message(event: MessageEvent):
    user_text = event.message.text
    reply_token = event.reply_token
    user_id = getattr(event.source, "user_id", None)

    # 拋入線程池非同步執行，Webhook 立即回傳 200 OK 避免 Timeout
    executor.submit(process_user_message_async, reply_token, user_text, user_id)


# -------------------------------------------------------------
# HTTP 路由
# -------------------------------------------------------------
@app.route("/", methods=["GET"])
def health_check():
    """健康檢查接口"""
    return "LINE Bot Service is Healthy!", 200


@app.route("/callback", methods=["POST"])
def line_webhook_callback():
    """LINE Webhook 回調入口"""
    signature = request.headers.get("X-Line-Signature", "")
    body = request.get_data(as_text=True)

    if not signature:
        logger.warning("Rejected request: Missing X-Line-Signature header.")
        abort(400)

    try:
        line_handler.handle(body, signature)
    except InvalidSignatureError:
        logger.error("Invalid signature! Please check LINE_CHANNEL_SECRET.")
        abort(400)
    except Exception as e:
        logger.error(f"Error handling webhook event: {e}", exc_info=True)
        return "Internal Server Error", 500

    return "OK", 200


# -------------------------------------------------------------
# 本地開發啟動入口
# -------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    logger.info(f"Starting LINE Bot server on port {port} for client '{CLIENT_NAME}'...")
    app.run(host="0.0.0.0", port=port, debug=False)
