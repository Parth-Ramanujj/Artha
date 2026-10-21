import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ReadinessIssue, StudioContent, StudioListRow, StudioListSection } from '../../types/messageStudio';
import { LIMITS, issuesFor, moveItem, uniqueSlug } from '../../utils/messageStudio';
import { FieldIssues, TextField } from './fields';

type List = NonNullable<StudioContent['list']>;

interface ListBuilderProps {
  list: List;
  onChange: (list: List) => void;
  issues: ReadinessIssue[];
}

const allRowIds = (list: List) => list.sections.flatMap(s => s.rows.map(r => r.id));

/** Centre panel for list messages: the menu button, sections and rows (10 rows in all). */
export function ListBuilder({ list, onChange, issues }: ListBuilderProps) {
  const rowCount = list.sections.reduce((n, s) => n + s.rows.length, 0);
  const setSection = (si: number, section: StudioListSection) =>
    onChange({ ...list, sections: list.sections.map((s, n) => (n === si ? section : s)) });

  const updateRow = (si: number, ri: number, patch: Partial<StudioListRow>) => {
    const section = list.sections[si];
    const row = section.rows[ri];
    const taken = allRowIds(list).filter(id => id !== row.id);
    const next = { ...row, ...patch };
    if (patch.title !== undefined && row.id === uniqueSlug(row.title, taken)) next.id = uniqueSlug(patch.title, taken);
    setSection(si, { ...section, rows: section.rows.map((r, n) => (n === ri ? next : r)) });
  };
  const addRow = (si: number) => {
    const title = `Option ${rowCount + 1}`;
    const section = list.sections[si];
    setSection(si, { ...section, rows: [...section.rows, { id: uniqueSlug(title, allRowIds(list)), title }] });
  };

  return (
    <section className="ms-builder" aria-labelledby="ms-list-heading">
      <div className="ms-builder-head">
        <h3 id="ms-list-heading" className="ms-section-title">
          List menu
        </h3>
        <span className="ms-counter">
          {rowCount} / {LIMITS.listRows} options
        </span>
      </div>
      <TextField
        label="Menu button label"
        required
        max={LIMITS.listButtonLabel}
        value={list.buttonLabel}
        onChange={buttonLabel => onChange({ ...list, buttonLabel })}
        issues={issuesFor(issues, 'list.buttonLabel')}
      />
      <FieldIssues issues={issuesFor(issues, 'list').filter(i => i.field === 'list')} />

      {list.sections.map((section, si) => (
        <div key={si} className="ms-list-section">
          <div className="ms-item-head">
            <TextField
              label={list.sections.length > 1 ? `Section ${si + 1} title *` : 'Section title (optional)'}
              max={LIMITS.sectionTitle}
              value={section.title}
              onChange={title => setSection(si, { ...section, title })}
              issues={issuesFor(issues, `list.sections.${si}.title`)}
            />
            {list.sections.length > 1 && (
              <button
                type="button"
                className="ms-icon-btn ms-danger"
                aria-label={`Remove section ${si + 1}`}
                onClick={() => onChange({ ...list, sections: list.sections.filter((_, n) => n !== si) })}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <ol className="ms-item-list">
            {section.rows.map((row, ri) => (
              <li key={ri} className="ms-item">
                <div className="ms-item-head">
                  <span className="ms-item-num" aria-hidden="true">
                    {ri + 1}
                  </span>
                  <div className="ms-grow">
                    <TextField
                      label="Option title"
                      required
                      max={LIMITS.rowTitle}
                      value={row.title}
                      onChange={title => updateRow(si, ri, { title })}
                    />
                  </div>
                  <div className="ms-item-tools">
                    <button
                      type="button"
                      className="ms-icon-btn"
                      aria-label={`Move option ${ri + 1} up`}
                      disabled={ri === 0}
                      onClick={() => setSection(si, { ...section, rows: moveItem(section.rows, ri, ri - 1) })}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="ms-icon-btn"
                      aria-label={`Move option ${ri + 1} down`}
                      disabled={ri === section.rows.length - 1}
                      onClick={() => setSection(si, { ...section, rows: moveItem(section.rows, ri, ri + 1) })}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="ms-icon-btn ms-danger"
                      aria-label={`Remove option ${ri + 1}`}
                      onClick={() => setSection(si, { ...section, rows: section.rows.filter((_, n) => n !== ri) })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <TextField
                  label="Description (optional)"
                  max={LIMITS.rowDescription}
                  value={row.description ?? ''}
                  onChange={description => updateRow(si, ri, { description })}
                  hint={
                    <>
                      Reply id: <code>{row.id}</code>
                    </>
                  }
                />
                <FieldIssues issues={issuesFor(issues, `list.sections.${si}.rows.${ri}`)} />
              </li>
            ))}
          </ol>
          {rowCount < LIMITS.listRows && (
            <button type="button" className="btn btn-secondary ms-add" onClick={() => addRow(si)}>
              <Plus size={14} /> Add option
            </button>
          )}
        </div>
      ))}

      {rowCount < LIMITS.listRows && (
        <button
          type="button"
          className="btn-link"
          onClick={() => {
            const title = `Option ${rowCount + 1}`;
            onChange({
              ...list,
              sections: [...list.sections, { title: '', rows: [{ id: uniqueSlug(title, allRowIds(list)), title }] }],
            });
          }}
        >
          <Plus size={12} /> Add a section
        </button>
      )}
    </section>
  );
}
