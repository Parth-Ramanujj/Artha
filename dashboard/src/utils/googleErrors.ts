/**
 * Turns a raw Google or server error into a short title and the one thing the user should do next.
 * The raw message is kept as the detail, so nothing is hidden when it helps.
 */
export interface FriendlyError {
  title: string;
  action: string;
}

export function friendlyGoogleError(raw: string): FriendlyError {
  const m = raw.toLowerCase();

  if (m.includes('has not been used') || m.includes('is disabled')) {
    return {
      title: 'Google API is turned off for this project',
      action:
        'Enable the Google Sheets API and Google Drive API in Google Cloud Console, wait a few minutes, then try again.',
    };
  }
  if (m.includes('reconnect with google')) {
    return {
      title: 'This connection needs one more permission',
      action: 'Click "Reconnect with Google" on this connection and approve the access.',
    };
  }
  if (m.includes('not signed in') || m.includes('not connected yet')) {
    return {
      title: 'This connection is not signed in',
      action: 'Click "Continue with Google" on the Integrations page first.',
    };
  }
  if (m.includes('requested entity was not found') || m.includes('spreadsheet not found')) {
    return {
      title: 'Spreadsheet not found',
      action: 'Pick it from the list. If it is missing there, the connected Google account cannot open it.',
    };
  }
  if (m.includes('permission') || m.includes('forbidden') || m.includes('insufficient')) {
    return {
      title: 'The connected account cannot open this sheet',
      action: 'Share the sheet with the connected Google account (Share → add its email), then try again.',
    };
  }
  if (m.includes('no column called')) {
    return { title: 'Column not found in this tab', action: raw };
  }
  if (m.includes('no tab named')) {
    return { title: 'Tab not found', action: raw };
  }
  if (m.includes('valid spreadsheet id')) {
    return {
      title: 'Spreadsheet ID looks wrong',
      action: 'Pick the spreadsheet from the list instead of typing its ID.',
    };
  }
  return { title: 'Something went wrong', action: raw };
}

/** The token name a column gets in workflow text: "Order No." → "order_no". Same rule as the server. */
export function columnToken(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** A pasted link or a bare ID both work: "docs.google.com/spreadsheets/d/<ID>/edit" → "<ID>". */
export function extractSheetId(input: string): string {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([\w-]{10,})/);
  return fromUrl ? fromUrl[1] : trimmed;
}
