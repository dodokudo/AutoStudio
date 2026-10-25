# Threads Drive importer

Run job: `autostudio-threads-drive-import`, project `mark-454114`, region `asia-northeast1`.

Build only a reviewed Git commit. Stage the Dockerfile, worker package files, six required libraries and the import script from that commit; never upload `.env`, credentials, output, or the full dirty working tree.

```sh
gcloud builds submit STAGED_SOURCE --project=mark-454114 --config=deploy/threads-drive-import/cloudbuild.yaml --substitutions=_REVISION=COMMIT_SHA
gcloud run jobs deploy autostudio-threads-drive-import --project=mark-454114 --region=asia-northeast1 --image=gcr.io/mark-454114/autostudio-threads-drive-import:COMMIT_SHA --service-account=autostudio@mark-454114.iam.gserviceaccount.com --set-secrets=GOOGLE_SERVICE_ACCOUNT_JSON=GOOGLE_SERVICE_ACCOUNT_JSON:latest --set-env-vars=BQ_PROJECT_ID=mark-454114 --command=./node_modules/.bin/tsx --args=src/scripts/importThreadsInsightsFromDrive.ts,--write --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=900s --memory=512Mi --cpu=1
gcloud run jobs execute autostudio-threads-drive-import --project=mark-454114 --region=asia-northeast1 --wait
```

The existing secret belongs to the same service account granted reader access to the dedicated Drive folder. The job never calls Threads, writes Drive, or sends messages.

Intended scheduler: `15 * * * *`, `Asia/Tokyo`, using the existing `scheduler-invoker@mark-454114.iam.gserviceaccount.com` to POST to the Cloud Run Jobs `:run` endpoint.

`threads_drive_import_files` records completed file ID/version, row count and import report. Unchanged versions are skipped. A new version is validated again, including classification-only replacements. `threads_drive_import_lock` prevents overlapping writers; a 30-minute lease outlives the job's 15-minute timeout. Normal completion or errors release the lease. A killed task's lease expires naturally.

Unknown posts or conflicting classifications stop that file with a failed execution; they are not marked imported. Logs include the first 20 pending IDs, and the CLI `--report PATH` stores the full list. Resolve the catalog/source discrepancy and rerun. Do not bypass ownership checks or invent missing observations.

Use `--reprocess` to validate and replay an unchanged file deliberately; normal scheduled runs skip it.
