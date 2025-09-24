export class CookieExpiredError extends Error {
  constructor(message = 'ログインセッションが失効しました') {
    super(message);
    this.name = 'CookieExpiredError';
  }
}

export class MissingStorageStateError extends Error {
  constructor(message = 'ストレージステートが取得できませんでした') {
    super(message);
    this.name = 'MissingStorageStateError';
  }
}

export class DownloadFailedError extends Error {
  constructor(message = 'CSVダウンロードに失敗しました', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DownloadFailedError';
  }
}

export class ProcessingFailedError extends Error {
  constructor(message = 'CSV整形に失敗しました', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProcessingFailedError';
  }
}

export class BigQueryLoadError extends Error {
  constructor(message = 'BigQueryロードに失敗しました', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BigQueryLoadError';
  }
}
