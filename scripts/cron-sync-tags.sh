#!/bin/bash
# sync-tags cron wrapper
# タグメトリクス → KPI実績値の自動反映
# launchctlから毎時15分に実行される

set -euo pipefail

cd /Users/kudo/AutoStudio

LOG_DIR="/Users/kudo/AutoStudio/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/sync-tags.log"

# ログローテーション（1MB超えたら切り捨て）
if [ -f "$LOG_FILE" ] && [ "$(stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)" -gt 1048576 ]; then
  tail -200 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

echo "=== $(date '+%Y-%m-%d %H:%M:%S') sync-tags start ===" >> "$LOG_FILE"

/opt/homebrew/bin/npx tsx src/scripts/syncTagsToKpi.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

echo "=== $(date '+%Y-%m-%d %H:%M:%S') sync-tags end (exit: $EXIT_CODE) ===" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit $EXIT_CODE
