# Threads Drive importer

Run job: `autostudio-threads-drive-import`, project `mark-454114`, region `asia-northeast1`.

Build only a reviewed Git commit. Stage the Dockerfile, worker package files, required libraries and the import script from that commit; never upload `.env`, credentials, output, or the full dirty working tree.

```sh
gcloud builds submit STAGED_SOURCE --project=mark-454114 --config=deploy/threads-drive-import/cloudbuild.yaml --substitutions=_REVISION=COMMIT_SHA
gcloud run jobs deploy autostudio-threads-drive-import --project=mark-454114 --region=asia-northeast1 --image=gcr.io/mark-454114/autostudio-threads-drive-import:COMMIT_SHA --service-account=autostudio@mark-454114.iam.gserviceaccount.com --set-secrets=GOOGLE_SERVICE_ACCOUNT_JSON=GOOGLE_SERVICE_ACCOUNT_JSON:latest --set-env-vars=BQ_PROJECT_ID=mark-454114 --command=./node_modules/.bin/tsx --args=src/scripts/importThreadsInsightsFromDrive.ts,--write --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=900s --memory=512Mi --cpu=1
gcloud run jobs execute autostudio-threads-drive-import --project=mark-454114 --region=asia-northeast1 --wait
```

The existing secret belongs to the same service account granted reader access to the dedicated Drive folder. The job never calls Threads, writes Drive, or sends messages.

Scheduler: `15 * * * *`, `Asia/Tokyo`, using the existing `scheduler-invoker@mark-454114.iam.gserviceaccount.com` to POST to the Cloud Run Jobs `:run` endpoint.

`threads_drive_import_files` records completed file ID/version, row count and import report. Unchanged versions are skipped. A new version is validated again, including classification-only replacements. `threads_drive_import_lock` prevents overlapping writers; a 30-minute lease outlives the job's 15-minute timeout. Normal completion or errors release the lease. A killed task's lease expires naturally.

Explicit own replies under a verified existing root are registered in `threads_drive_replies`, retaining the CSV provenance and null timestamps. Their unknown sequence is excluded from transition rates and repost drafts. Canonical posts/comments remain unchanged.

Matched rows are imported even when other rows are unresolved. Full pending IDs/reasons are retained in `threads_drive_import_files.report_json`; partial versions are retried on every run until resolved. Logs include the first 20 pending IDs and `--report PATH` optionally writes the full report. A file read/validation/write failure does not stop later files; after processing them the execution reports failure. Do not invent unknown ownership, parent links or observation values.

Use `--reprocess` to validate and replay an unchanged file deliberately; normal scheduled runs skip it.
