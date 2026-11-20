/** A raw Meta / server error turned into words a shop owner understands, plus what to do about it. */
export interface Explained {
  title: string;
  fix: string;
}

const RULES: [RegExp, Explained][] = [
  [
    /aspect ratio/i,
    {
      title: "Instagram didn't accept the photo's shape",
      fix: 'Artha now resizes photos for Instagram automatically. Press Publish again.',
    },
  ],
  [
    /media fetch failed|could not be fetched|failed to download|only photo or video|image_url|video_url|media type/i,
    {
      title: "Instagram couldn't download the photo or video",
      fix: 'Use a public https link that opens without login (not Google Drive, WhatsApp or Instagram links), then publish again.',
    },
  ],
  [
    /still processing the video|could not process the video/i,
    {
      title: 'Instagram is still processing the video',
      fix: 'Wait 2-3 minutes and press Publish again. Use an MP4 video between 3 and 90 seconds.',
    },
  ],
  [
    /invalid oauth|error validating access token|session has expired|has expired|access token.*(invalid|expired)/i,
    {
      title: 'The Meta access token stopped working',
      fix: 'This happens after a Facebook password change or when access is removed. Connected Accounts → Edit → paste a new Page token (Setup Guide, Part 3).',
    },
  ],
  [
    /disabled access to instagram direct messages|access to messages/i,
    {
      title: 'Instagram blocks apps from sending DMs on this account',
      fix: 'Facebook Page → Settings → Linked accounts → Instagram → turn on "Allow access to Instagram messages in Inbox".',
    },
  ],
  [
    /7 days|outside (of )?(the )?allowed window|already (been )?replied|only one (private )?(reply|message)/i,
    {
      title: "Meta's reply window has closed",
      fix: 'A chat can be answered within 24 hours of the customer\'s last message, and a comment gets one DM within 7 days. Wait for the customer to write again, then reply.',
    },
  ],
  [
    /\(#(4|17|32|613)\)|rate limit|too many calls|request limit/i,
    {
      title: 'Meta is limiting how fast we can send',
      fix: 'Wait about an hour. New comments will be answered again automatically.',
    },
  ],
  [
    /\(#(10|200)\)|permission/i,
    {
      title: 'The access token is missing a permission',
      fix: 'Create the token again with every permission from the Setup Guide (Part 3), then Connected Accounts → Edit → paste it.',
    },
  ],
  [
    /no connected .* account/i,
    {
      title: 'No connected account for this platform',
      fix: 'Connect the account in Connected Accounts, then publish again.',
    },
  ],
  [
    /disconnected/i,
    {
      title: 'The account is disconnected',
      fix: 'Connected Accounts → Edit → paste a fresh token → Save, then press Test.',
    },
  ],
  [
    /does not allow liking comments/i,
    {
      title: "Instagram doesn't let apps like comments",
      fix: 'Nothing to fix. Auto-like works on Facebook Page comments only.',
    },
  ],
];

export function explainError(raw: string | null | undefined): Explained {
  const text = raw || '';
  for (const [pattern, explained] of RULES) if (pattern.test(text)) return explained;
  return {
    title: 'Meta returned an error',
    fix: 'Read the message below. If it happens again, check the Setup Guide or press Test on the account.',
  };
}

/** "2 min ago" style time, for activity rows. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 0) return `in ${formatSpan(-s)}`;
  if (s < 45) return 'just now';
  return `${formatSpan(s)} ago`;
}

function formatSpan(s: number): string {
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}
