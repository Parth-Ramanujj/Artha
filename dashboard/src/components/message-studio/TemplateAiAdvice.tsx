import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { messageStudioApi } from '../../services/api';
import type { TemplateAdvice } from '../../types/messageStudio';
import type { MetaTemplateDraft } from '../../utils/metaTemplate';

const LABEL = { MARKETING: 'Marketing', UTILITY: 'Utility' } as const;

/**
 * "Check with AI": asks the server's AI (Groq) which category Meta will give the draft, what may get
 * it rejected, and offers a rewrite — plus a Utility version when one is honestly possible.
 */
export function TemplateAiAdvice({
  draft,
  onApply,
}: {
  draft: MetaTemplateDraft;
  onApply: (patch: Partial<MetaTemplateDraft>) => void;
}) {
  const [explainIn, setExplainIn] = useState<'en' | 'gu'>('gu');
  const check = useMutation({
    mutationFn: () =>
      messageStudioApi.templateAdvice({
        category: draft.category,
        language: draft.language,
        body: draft.body,
        explainIn,
        ...(draft.headerType === 'TEXT' && draft.headerText.trim() ? { headerText: draft.headerText.trim() } : {}),
        ...(draft.footer.trim() ? { footer: draft.footer.trim() } : {}),
        ...(draft.buttons.length
          ? { buttons: draft.buttons.map(b => (b.type === 'COPY_CODE' ? 'Copy offer code' : b.text || b.type)) }
          : {}),
      }),
  });
  const advice: TemplateAdvice | undefined = check.data;

  return (
    <section className="mt-card mt-ai" aria-labelledby="mt-ai-title">
      <div className="mt-toolbar">
        <h3 id="mt-ai-title" className="mt-card-title">
          <Sparkles size={15} aria-hidden="true" /> AI suggestion
        </h3>
        <select
          className="ms-input mt-ai-lang"
          aria-label="Explain in"
          value={explainIn}
          onChange={e => setExplainIn(e.target.value as 'en' | 'gu')}
        >
          <option value="gu">Gujarati</option>
          <option value="en">English</option>
        </select>
      </div>
      <p className="mt-help">
        Finds out if Meta will treat this as Marketing or Utility, what may get it rejected, and suggests a better text.
      </p>
      <button
        className="btn btn-secondary"
        disabled={!draft.body.trim() || check.isPending}
        onClick={() => check.mutate()}
      >
        <Sparkles size={15} /> {check.isPending ? 'Checking…' : advice ? 'Check again' : 'Check with AI'}
      </button>
      {check.isError && <p className="ms-field-error">{check.error.message}</p>}

      {advice && (
        <div className="mt-ai-result">
          <div className="mt-ai-verdict">
            <span className={`ms-chip ${advice.category === draft.category ? 'ms-chip-success' : ''}`}>
              {LABEL[advice.category]}
            </span>
            <span>{advice.reason}</span>
          </div>
          {advice.category !== draft.category && (
            <button className="mt-chip" onClick={() => onApply({ category: advice.category })}>
              Switch category to {LABEL[advice.category]}
            </button>
          )}

          {advice.risks.length > 0 && (
            <div>
              <span className="ms-label">⚠️ May get rejected because</span>
              <ul className="mt-ai-list">
                {advice.risks.map(r => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <span className="ms-label">✍️ Suggested text ({LABEL[advice.category]})</span>
            <pre className="mt-ai-text">{advice.improvedBody}</pre>
            <button
              className="mt-chip"
              onClick={() => onApply({ body: advice.improvedBody, category: advice.category })}
            >
              Use this text
            </button>
          </div>

          <div>
            <span className="ms-label">🧾 As Utility</span>
            {advice.utilityBody ? (
              <>
                <pre className="mt-ai-text">{advice.utilityBody}</pre>
                <button className="mt-chip" onClick={() => onApply({ body: advice.utilityBody!, category: 'UTILITY' })}>
                  Use as Utility
                </button>
              </>
            ) : null}
            {advice.utilityNote && <p className="mt-help">{advice.utilityNote}</p>}
          </div>

          {advice.tips.length > 0 && (
            <div>
              <span className="ms-label">💡 Tips</span>
              <ul className="mt-ai-list">
                {advice.tips.map(t => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-help">AI suggestions can be wrong — Meta makes the final decision.</p>
        </div>
      )}
    </section>
  );
}
