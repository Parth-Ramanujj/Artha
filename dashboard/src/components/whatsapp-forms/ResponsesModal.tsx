import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Modal } from '../Modal';
import { whatsappFormApi } from '../../services/api';
import type { WhatsAppFormSubmission } from '../../types/whatsappForm';
import { answerText, phoneOf, submissionColumns, submissionsToCsv } from '../../utils/whatsappForm';

interface ResponsesModalProps {
  formId: string;
  formName: string;
  onClose: () => void;
}

/** The answers customers submitted to one form, newest first, with a CSV download. */
export function ResponsesModal({ formId, formName, onClose }: ResponsesModalProps) {
  const [rows, setRows] = useState<WhatsAppFormSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    whatsappFormApi
      .submissions(formId)
      .then(data => !cancelled && setRows(data))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [formId]);

  const columns = rows ? submissionColumns(rows) : [];

  const download = () => {
    if (!rows) return;
    // BOM so Excel reads Gujarati / Hindi answers as UTF-8.
    const blob = new Blob(['﻿', submissionsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${formName.replace(/[^\w-]+/g, '_') || 'form'}-responses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Responses: ${formName}`}
      className="wf-responses-modal"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={download} disabled={!rows?.length}>
            <Download size={14} /> Download CSV
          </button>
        </>
      }
    >
      {error && (
        <p className="wf-error" role="alert">
          {error}
        </p>
      )}
      {!rows && !error && <p className="wf-help">Loading responses…</p>}
      {rows?.length === 0 && (
        <p className="wf-help">No responses yet. They appear here as soon as a customer submits the form.</p>
      )}
      {rows && rows.length > 0 && (
        <div className="wf-table-wrap">
          <table className="wf-table">
            <caption className="wf-help">
              {rows.length} response{rows.length === 1 ? '' : 's'}
            </caption>
            <thead>
              <tr>
                <th scope="col">Submitted</th>
                <th scope="col">Phone</th>
                {columns.map(c => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{phoneOf(r.chatId)}</td>
                  {columns.map(c => (
                    <td key={c}>{answerText(r.answers[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
