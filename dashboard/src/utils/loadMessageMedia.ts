import { createMediaCache } from './messageMediaCache';
import { sessionApi } from '../services/api';

/** App-wide on-demand attachment loader: (sessionId, messageId) → object URL, cached. */
export const loadMessageMedia = createMediaCache(sessionApi.getMessageMediaBlob);
