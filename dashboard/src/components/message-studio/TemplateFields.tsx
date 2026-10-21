import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { messageStudioApi } from '../../services/api';
import type { ReadinessIssue, StudioContent } from '../../types/messageStudio';
import { issuesFor } from '../../utils/messageStudio';
import { FieldIssues, TextField } from './fields';

interface TemplateFieldsProps {
  content: StudioContent;
  onChange: (patch: Partial<StudioContent>) => void;
  issues: ReadinessIssue[];
  sessionId: string;
  cloudApi: boolean;
}

/** Choose an approved template and fill in its {{1}}, {{2}} … values. */
export function TemplateFields({ content, onChange, issues, sessionId, cloudApi }: TemplateFieldsProps) {
  const query = useQuery({
    queryKey: ['message-studio', 'templates', sessionId],
    queryFn: () => messageStudioApi.templates(sessionId),
    enabled: Boolean(sessionId) && cloudApi,
  });
  const refresh = async () => {
    await messageStudioApi.templates(sessionId, true);
    await query.refetch();
  };
  const t = content.template ?? { name: '', language: 'en_US', variables: [] };
  const templates = query.data?.templates ?? [];
  const selected = templates.find(x => x.name === t.name && x.language === t.language);

  if (!cloudApi) {
    return (
      <div className="ms-callout ms-callout-info">
        Approved templates can only be sent from a WhatsApp Cloud API number. Pick a Cloud API number above, or use a
        Text Message instead.
      </div>
    );
  }

  const pick = (key: string) => {
    const next = templates.find(x => `${x.name}|${x.language}` === key);
    if (!next) return onChange({ template: { name: '', language: 'en_US', variables: [] } });
    onChange({
      template: {
        name: next.name,
        language: next.language,
        variables: Array.from({ length: next.bodyVariableCount }, (_, i) => t.variables[i] ?? ''),
        ...(t.headerMediaUrl ? { headerMediaUrl: t.headerMediaUrl } : {}),
        ...(next.isCarousel
          ? {
              cards: (next.carouselCards ?? []).map((_, i) => ({
                headerMediaUrl: t.cards?.[i]?.headerMediaUrl ?? '',
                variables: Array.from(
                  { length: next.carouselCards?.[i]?.bodyVariableCount ?? 0 },
                  (_, v) => t.cards?.[i]?.variables[v] ?? '',
                ),
              })),
            }
          : {}),
      },
    });
  };

  const setCard = (i: number, patch: { headerMediaUrl?: string; variables?: string[] }) => {
    const cards = (t.cards ?? []).map((c, n) => (n === i ? { ...c, ...patch } : c));
    onChange({ template: { ...t, cards } });
  };

  return (
    <div className="ms-stack">
      <div className="ms-field">
        <div className="ms-label-row">
          <label htmlFor="ms-template" className="ms-label">
            Approved template *
          </label>
          <button type="button" className="btn-link" onClick={() => void refresh()} disabled={query.isFetching}>
            <RefreshCw size={12} aria-hidden="true" /> Refresh
          </button>
        </div>
        {query.isLoading ? (
          <span className="ms-hint">Loading templates from Meta…</span>
        ) : query.data?.templates === null ? (
          <div className="ms-callout ms-callout-warning">{query.data.reason ?? 'Templates could not be loaded.'}</div>
        ) : (
          <select
            id="ms-template"
            className="ms-select"
            value={t.name ? `${t.name}|${t.language}` : ''}
            onChange={e => pick(e.target.value)}
          >
            <option value="">Choose a template…</option>
            {templates.map(x => (
              <option
                key={`${x.name}|${x.language}`}
                value={`${x.name}|${x.language}`}
                disabled={x.status !== 'APPROVED'}
              >
                {x.name} ({x.language}){' '}
                {x.status !== 'APPROVED' ? `— ${x.status.toLowerCase()}` : `· ${x.category.toLowerCase()}`}
              </option>
            ))}
          </select>
        )}
        <FieldIssues
          issues={issuesFor(issues, 'template').filter(i => i.field === 'template' || i.field === 'template.name')}
        />
      </div>

      {selected && (
        <>
          <div className="ms-template-body">
            <span className="ms-label">Template text</span>
            <p>{selected.bodyText}</p>
          </div>
          {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selected.headerFormat) && (
            <TextField
              label={`Header ${selected.headerFormat.toLowerCase()} link (https)`}
              required
              type="url"
              value={t.headerMediaUrl ?? ''}
              onChange={v => onChange({ template: { ...t, headerMediaUrl: v } })}
              issues={issuesFor(issues, 'template.headerMediaUrl')}
            />
          )}
          {selected.isCarousel &&
            (selected.carouselCards ?? []).map((card, ci) => (
              <fieldset key={ci} className="ms-list-section">
                <legend className="ms-section-title">Card {ci + 1}</legend>
                {card.headerFormat !== 'NONE' && (
                  <TextField
                    label={`Card ${ci + 1} ${card.headerFormat.toLowerCase()} link (https)`}
                    required
                    type="url"
                    value={t.cards?.[ci]?.headerMediaUrl ?? ''}
                    onChange={v => setCard(ci, { headerMediaUrl: v })}
                    issues={issuesFor(issues, `template.cards.${ci}.headerMediaUrl`)}
                  />
                )}
                {Array.from({ length: card.bodyVariableCount }, (_, v) => (
                  <TextField
                    key={v}
                    label={`Card ${ci + 1} value for {{${v + 1}}}`}
                    required
                    value={t.cards?.[ci]?.variables[v] ?? ''}
                    onChange={val =>
                      setCard(ci, { variables: (t.cards?.[ci]?.variables ?? []).map((x, n) => (n === v ? val : x)) })
                    }
                    issues={issuesFor(issues, `template.cards.${ci}.variables.${v}`)}
                  />
                ))}
              </fieldset>
            ))}
          {!selected.isCarousel &&
            t.variables.map((v, i) => (
              <TextField
                key={i}
                label={`Value for {{${i + 1}}}`}
                required
                value={v}
                placeholder={i === 0 ? 'e.g. {{trigger.contactName}}' : ''}
                onChange={val =>
                  onChange({ template: { ...t, variables: t.variables.map((x, n) => (n === i ? val : x)) } })
                }
                issues={issuesFor(issues, `template.variables.${i}`)}
              />
            ))}
          {selected.buttons.length > 0 && (
            <span className="ms-hint">
              Buttons ({selected.buttons.map(b => b.text).join(', ')}) come from the approved template.
            </span>
          )}
        </>
      )}
    </div>
  );
}
