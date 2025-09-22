import { google, sheets_v4 } from 'googleapis';

const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

export interface SheetsClientOptions {
  spreadsheetId: string;
}

export class SheetsClient {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor(options: SheetsClientOptions) {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: SHEETS_SCOPES,
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = options.spreadsheetId;
  }

  async getSheetValues(a1Notation: string) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: a1Notation,
    });

    return response.data.values ?? [];
  }
}
