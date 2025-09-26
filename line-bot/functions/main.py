import json
import os
import logging
from datetime import datetime, timedelta
from google.cloud import bigquery, secretmanager
import functions_framework
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError, LineBotApiError
from linebot.models import MessageEvent, TextMessage, TextSendMessage
import openai

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 環境変数
PROJECT_ID = os.environ.get('GCP_PROJECT', 'mark-454114')
DATASET = 'autostudio_line'
SECRET_NAME_LINE_CHANNEL_ACCESS_TOKEN = 'line-channel-access-token'
SECRET_NAME_LINE_CHANNEL_SECRET = 'line-channel-secret'
SECRET_NAME_OPENAI_API_KEY = 'openai-api-key'

# BigQuery クライアント
bq_client = bigquery.Client(project=PROJECT_ID)

# Secret Manager クライアント
secret_client = secretmanager.SecretManagerServiceClient()

def get_secret(secret_name):
    """Secret Managerからシークレットを取得"""
    try:
        name = f"projects/{PROJECT_ID}/secrets/{secret_name}/versions/latest"
        response = secret_client.access_secret_version(request={"name": name})
        return response.payload.data.decode("UTF-8")
    except Exception as e:
        logger.error(f"Failed to get secret {secret_name}: {e}")
        return None

# LINE Bot設定
CHANNEL_ACCESS_TOKEN = get_secret(SECRET_NAME_LINE_CHANNEL_ACCESS_TOKEN)
CHANNEL_SECRET = get_secret(SECRET_NAME_LINE_CHANNEL_SECRET)
OPENAI_API_KEY = get_secret(SECRET_NAME_OPENAI_API_KEY)

if CHANNEL_ACCESS_TOKEN and CHANNEL_SECRET:
    line_bot_api = LineBotApi(CHANNEL_ACCESS_TOKEN)
    handler = WebhookHandler(CHANNEL_SECRET)
else:
    logger.error("LINE credentials not found in Secret Manager")
    line_bot_api = None
    handler = None

if OPENAI_API_KEY:
    openai.api_key = OPENAI_API_KEY
else:
    logger.error("OpenAI API key not found in Secret Manager")

def log_to_bigquery(user_id, message_text, response_text, response_time_ms, error=None):
    """BigQueryにログを記録"""
    try:
        table_id = f"{PROJECT_ID}.{DATASET}.line_bot_logs"

        rows_to_insert = [{
            "user_id": user_id,
            "timestamp": datetime.utcnow().isoformat(),
            "message_text": message_text,
            "response_text": response_text,
            "response_time_ms": response_time_ms,
            "error_message": error,
            "created_at": datetime.utcnow().isoformat()
        }]

        errors = bq_client.insert_rows_json(table_id, rows_to_insert)
        if errors:
            logger.error(f"BigQuery insert errors: {errors}")
        else:
            logger.info("Successfully logged to BigQuery")

    except Exception as e:
        logger.error(f"Failed to log to BigQuery: {e}")

def generate_ai_response(user_message):
    """OpenAI APIを使用してAI応答を生成"""
    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {
                    "role": "system",
                    "content": "あなたは親しみやすいAIアシスタントです。日本語で丁寧に、でも親近感のある口調で返答してください。"
                },
                {"role": "user", "content": user_message}
            ],
            max_tokens=500,
            temperature=0.7
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"OpenAI API error: {e}")
        return "申し訳ございません。現在、AIサービスに接続できません。後ほどお試しください。"

def handle_text_message(event):
    """テキストメッセージの処理"""
    start_time = datetime.utcnow()
    user_id = event.source.user_id
    user_message = event.message.text

    logger.info(f"Received message from {user_id}: {user_message}")

    try:
        # AI応答を生成
        ai_response = generate_ai_response(user_message)

        # 応答時間を計算
        response_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        # LINEで返信
        line_bot_api.reply_message(
            event.reply_token,
            TextSendMessage(text=ai_response)
        )

        # BigQueryにログ記録
        log_to_bigquery(
            user_id=user_id,
            message_text=user_message,
            response_text=ai_response,
            response_time_ms=int(response_time)
        )

        logger.info(f"Successfully replied to {user_id}")

    except LineBotApiError as e:
        logger.error(f"LINE Bot API error: {e}")
        log_to_bigquery(
            user_id=user_id,
            message_text=user_message,
            response_text="",
            response_time_ms=0,
            error=str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        log_to_bigquery(
            user_id=user_id,
            message_text=user_message,
            response_text="",
            response_time_ms=0,
            error=str(e)
        )

# handlerが存在する場合のみイベントハンドラーを追加
if handler:
    handler.add(MessageEvent, message=TextMessage)(handle_text_message)

@functions_framework.http
def line_webhook(request):
    """LINE Webhook のメインエントリーポイント"""
    if not line_bot_api or not handler:
        return 'LINE Bot not configured', 500

    # リクエストの署名を検証
    signature = request.headers.get('X-Line-Signature', '')
    body = request.get_data(as_text=True)

    logger.info(f"Request body: {body}")

    try:
        handler.handle(body, signature)
        return 'OK', 200
    except InvalidSignatureError:
        logger.error("Invalid signature")
        return 'Bad Request', 400
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return 'Internal Server Error', 500

@functions_framework.http
def health_check(request):
    """ヘルスチェック用のエンドポイント"""
    return json.dumps({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "project_id": PROJECT_ID
    }), 200