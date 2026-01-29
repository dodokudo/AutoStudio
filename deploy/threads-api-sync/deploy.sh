#!/bin/bash
# Threads API Sync - Cloud Run Job デプロイスクリプト
# 使用方法: ./deploy.sh

set -e

PROJECT_ID="mark-454114"
REGION="asia-northeast1"
JOB_NAME="autostudio-threads-api-sync"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${JOB_NAME}"

echo "=== Building Docker image ==="
cd /Users/kudo/AutoStudio
gcloud builds submit --tag "${IMAGE_NAME}" --project="${PROJECT_ID}"

echo "=== Creating/Updating Cloud Run Job ==="
# ジョブが存在するかチェック
SECRETS="THREADS_TOKEN=THREADS_TOKEN:latest"
SECRETS="${SECRETS},THREADS_BUSINESS_ID=THREADS_BUSINESS_ID:latest"
SECRETS="${SECRETS},THREADS_USERNAME=THREADS_USERNAME:latest"
SECRETS="${SECRETS},GOOGLE_APPLICATION_CREDENTIALS_JSON=GOOGLE_SERVICE_ACCOUNT_JSON:latest"
SECRETS="${SECRETS},ALERT_EMAIL_ENABLED=ALERT_EMAIL_ENABLED:latest"
SECRETS="${SECRETS},ALERT_EMAIL_TO=ALERT_EMAIL_TO:latest"
SECRETS="${SECRETS},ALERT_EMAIL_FROM=ALERT_EMAIL_FROM:latest"
SECRETS="${SECRETS},ALERT_SMTP_HOST=ALERT_SMTP_HOST:latest"
SECRETS="${SECRETS},ALERT_SMTP_PORT=ALERT_SMTP_PORT:latest"
SECRETS="${SECRETS},ALERT_SMTP_SECURE=ALERT_SMTP_SECURE:latest"
SECRETS="${SECRETS},ALERT_SMTP_USER=ALERT_SMTP_USER:latest"
SECRETS="${SECRETS},ALERT_SMTP_PASS=ALERT_SMTP_PASS:latest"

if gcloud run jobs describe "${JOB_NAME}" --project="${PROJECT_ID}" --region="${REGION}" > /dev/null 2>&1; then
  echo "Updating existing job..."
  gcloud run jobs update "${JOB_NAME}" \
    --image="${IMAGE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --memory=1Gi \
    --task-timeout=600 \
    --max-retries=1 \
    --set-secrets="${SECRETS}"
else
  echo "Creating new job..."
  gcloud run jobs create "${JOB_NAME}" \
    --image="${IMAGE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --memory=1Gi \
    --task-timeout=600 \
    --max-retries=1 \
    --set-secrets="${SECRETS}"
fi

echo "=== Creating Cloud Scheduler jobs ==="

# 1. アカウントインサイト取得: 毎日0:30 (0時台に実行)
SCHEDULER_ACCOUNT="${JOB_NAME}-account-daily"
if gcloud scheduler jobs describe "${SCHEDULER_ACCOUNT}" --project="${PROJECT_ID}" --location="${REGION}" > /dev/null 2>&1; then
  echo "Updating scheduler: ${SCHEDULER_ACCOUNT}"
  gcloud scheduler jobs update http "${SCHEDULER_ACCOUNT}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="30 0 * * *" \
    --time-zone="Asia/Tokyo" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email="scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
    --headers="Content-Type=application/json" \
    --message-body='{"overrides":{"containerOverrides":[{"env":[{"name":"SYNC_MODE","value":"account"}]}]}}'
else
  echo "Creating scheduler: ${SCHEDULER_ACCOUNT}"
  gcloud scheduler jobs create http "${SCHEDULER_ACCOUNT}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="30 0 * * *" \
    --time-zone="Asia/Tokyo" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email="scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
    --headers="Content-Type=application/json" \
    --message-body='{"overrides":{"containerOverrides":[{"env":[{"name":"SYNC_MODE","value":"account"}]}]}}'
fi

# 2. 投稿データ取得: 毎時10分
SCHEDULER_POSTS="${JOB_NAME}-posts-hourly"
if gcloud scheduler jobs describe "${SCHEDULER_POSTS}" --project="${PROJECT_ID}" --location="${REGION}" > /dev/null 2>&1; then
  echo "Updating scheduler: ${SCHEDULER_POSTS}"
  gcloud scheduler jobs update http "${SCHEDULER_POSTS}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="10 * * * *" \
    --time-zone="Asia/Tokyo" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email="scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
    --headers="Content-Type=application/json" \
    --message-body='{"overrides":{"containerOverrides":[{"env":[{"name":"SYNC_MODE","value":"posts"}]}]}}'
else
  echo "Creating scheduler: ${SCHEDULER_POSTS}"
  gcloud scheduler jobs create http "${SCHEDULER_POSTS}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="10 * * * *" \
    --time-zone="Asia/Tokyo" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email="scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
    --headers="Content-Type=application/json" \
    --message-body='{"overrides":{"containerOverrides":[{"env":[{"name":"SYNC_MODE","value":"posts"}]}]}}'
fi

# 3. コメント欄データ取得: 毎時40分
SCHEDULER_COMMENTS="${JOB_NAME}-comments-hourly"
if gcloud scheduler jobs describe "${SCHEDULER_COMMENTS}" --project="${PROJECT_ID}" --location="${REGION}" > /dev/null 2>&1; then
  echo "Updating scheduler: ${SCHEDULER_COMMENTS}"
  gcloud scheduler jobs update http "${SCHEDULER_COMMENTS}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="40 * * * *" \
    --time-zone="Asia/Tokyo" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email="scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
    --headers="Content-Type=application/json" \
    --message-body='{"overrides":{"containerOverrides":[{"env":[{"name":"SYNC_MODE","value":"comments"}]}]}}'
else
  echo "Creating scheduler: ${SCHEDULER_COMMENTS}"
  gcloud scheduler jobs create http "${SCHEDULER_COMMENTS}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --schedule="40 * * * *" \
    --time-zone="Asia/Tokyo" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email="scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
    --headers="Content-Type=application/json" \
    --message-body='{"overrides":{"containerOverrides":[{"env":[{"name":"SYNC_MODE","value":"comments"}]}]}}'
fi

echo "=== Deploy complete ==="
echo ""
echo "Scheduler jobs created:"
echo "  - ${SCHEDULER_ACCOUNT}: 毎日 0:30 (アカウントインサイト)"
echo "  - ${SCHEDULER_POSTS}: 毎時 10分 (投稿データ)"
echo "  - ${SCHEDULER_COMMENTS}: 毎時 40分 (コメント欄データ)"
