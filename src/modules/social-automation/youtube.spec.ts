import type { SocialAccount } from './entities/social-automation.entity';
import type { GoogleWorkspaceService } from '../integrations/google/google-workspace.service';
import type { IntegrationService } from '../integrations/integration.service';
import { SocialYoutubeService, toIncomingComments } from './services/social-youtube.service';

const thread = (over: Record<string, unknown> = {}, replies = 0) => ({
  snippet: {
    videoId: 'vid1',
    totalReplyCount: replies,
    topLevelComment: {
      id: 'c1',
      snippet: {
        textDisplay: 'Price?',
        authorDisplayName: 'Asha',
        authorChannelId: { value: 'UCasha' },
        publishedAt: '2026-11-21T10:00:00Z',
        ...over,
      },
    },
  },
});

describe('YouTube comments', () => {
  const since = new Date('2026-11-21T09:00:00Z');

  it('maps a new unanswered comment', () => {
    expect(toIncomingComments([thread()], 'UCbiz', since)).toEqual([
      {
        platform: 'youtube',
        targetAccountId: 'UCbiz',
        commentId: 'c1',
        commentText: 'Price?',
        postId: 'vid1',
        fromUserId: 'UCasha',
        fromUserName: 'Asha',
      },
    ]);
  });

  it('skips comments from before the channel was connected, answered threads and empty text', () => {
    const items = [
      thread({ publishedAt: '2026-11-20T10:00:00Z' }),
      thread({}, 2),
      thread({ textDisplay: '  ' }),
      { snippet: {} },
    ];
    expect(toIncomingComments(items, 'UCbiz', since)).toEqual([]);
  });
});

describe('YouTube polling', () => {
  const at = (id: string, publishedAt: string) => ({
    snippet: {
      videoId: 'v',
      totalReplyCount: 0,
      topLevelComment: { id, snippet: { textDisplay: id, publishedAt } },
    },
  });
  const account = {
    id: 'a1',
    businessId: 'b',
    pageId: 'int1',
    accountId: 'UCbiz',
    accountName: 'Biz',
    createdAt: new Date('2026-11-21T00:00:00Z'),
  } as unknown as SocialAccount;
  const now = Date.parse('2026-11-21T12:00:00Z');

  function service(pages: Array<{ items: unknown[]; nextPageToken: string }>) {
    const youtubeComments = jest.fn();
    pages.forEach(p => youtubeComments.mockResolvedValueOnce(p));
    const svc = new SocialYoutubeService(
      { youtubeComments } as unknown as GoogleWorkspaceService,
      { findOne: () => Promise.resolve({ type: 'google_youtube' }) } as unknown as IntegrationService,
    );
    return { svc, youtubeComments };
  }

  it('reads a second page while the first is still all newer than the last poll', async () => {
    const { svc, youtubeComments } = service([
      { items: [at('n1', '2026-11-21T11:59:00Z'), at('n2', '2026-11-21T11:30:00Z')], nextPageToken: 'p2' },
      { items: [at('n3', '2026-11-21T11:10:00Z'), at('old', '2026-11-21T09:00:00Z')], nextPageToken: 'p3' },
    ]);
    const found = await svc.newComments(account, now);
    expect(found.map(c => c.commentId)).toEqual(['n1', 'n2', 'n3']);
    expect(youtubeComments).toHaveBeenCalledTimes(2); // stopped at the page holding an old comment
    expect((youtubeComments.mock.calls[1] as unknown[])[2]).toBe('p2');
  });

  it('only looks back to the previous poll next time', async () => {
    const { svc } = service([
      { items: [at('n1', '2026-11-21T11:59:00Z')], nextPageToken: '' },
      { items: [at('n2', '2026-11-21T12:03:00Z'), at('n1', '2026-11-21T11:58:00Z')], nextPageToken: 'x' },
    ]);
    await svc.newComments(account, now);
    const second = await svc.newComments(account, now + 5 * 60_000);
    expect(second.map(c => c.commentId)).toEqual(['n2']);
  });
});
