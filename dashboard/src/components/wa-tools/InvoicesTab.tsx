import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Send } from 'lucide-react';
import { useToast } from '../Toast';
import { waToolsApi, type InvoiceRow, type NewInvoice } from '../../services/api';
import { InvoiceForm } from './InvoiceForm';

const inr = (rupees: number) =>
  `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const when = (d: string) => new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' });

async function download(inv: InvoiceRow) {
  const url = URL.createObjectURL(await waToolsApi.invoicePdf(inv.id));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${inv.number}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** GST invoices / receipts sent to customers on WhatsApp as a PDF. */
export function InvoicesTab({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['wa-tools', 'invoices'], queryFn: () => waToolsApi.invoices() });
  const done = (inv: InvoiceRow) => {
    void qc.invalidateQueries({ queryKey: ['wa-tools', 'invoices'] });
    if (inv.sendError) toast.error(`${inv.number} saved, not sent`, inv.sendError);
    else toast.success(inv.number, inv.sentAt ? 'Sent on WhatsApp as a PDF.' : 'Saved.');
  };
  const fail = (e: Error) => toast.error('Not done', e.message);
  const create = useMutation({
    mutationFn: (b: NewInvoice) => waToolsApi.createInvoice(b),
    onSuccess: done,
    onError: fail,
  });
  const resend = useMutation({
    mutationFn: (id: string) => waToolsApi.sendInvoice(id),
    onSuccess: done,
    onError: fail,
  });

  if (q.isLoading) return <p className="wt-muted">Loading…</p>;
  if (q.isError) return <p className="wt-error">{(q.error as Error).message}</p>;

  return (
    <section className="wt-stack" aria-label="Invoices">
      <InvoiceForm
        key={q.data?.seller?.sellerName ?? 'new'}
        sessionId={sessionId}
        seller={q.data?.seller ?? null}
        busy={create.isPending}
        onSubmit={b => create.mutate(b)}
      />

      {!q.data?.invoices.length ? (
        <p className="wt-muted">No invoices yet.</p>
      ) : (
        <div className="wt-table-wrap">
          <table className="wt-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>WhatsApp</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {q.data.invoices.map(inv => (
                <tr key={inv.id}>
                  <td>
                    {inv.number}
                    <div className="wt-muted">{when(inv.createdAt)}</div>
                  </td>
                  <td>
                    {inv.customerName}
                    <div className="wt-muted">+{inv.phone}</div>
                  </td>
                  <td>{inr(inv.totalPaise / 100)}</td>
                  <td>
                    <span className={`wt-badge ${inv.status === 'paid' ? 'is-good' : ''}`}>
                      {inv.status === 'paid' ? 'Paid' : 'Due'}
                    </span>
                  </td>
                  <td>
                    {inv.sendError ? (
                      <span className="wt-error">{inv.sendError}</span>
                    ) : inv.sentAt ? (
                      <span className="wt-muted">Sent {when(inv.sentAt)}</span>
                    ) : (
                      <span className="wt-muted">Not sent</span>
                    )}
                  </td>
                  <td className="wt-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={() => void download(inv).catch(fail)}
                      aria-label={`Download ${inv.number}`}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => resend.mutate(inv.id)}
                      disabled={resend.isPending}
                      aria-label={`Send ${inv.number} on WhatsApp`}
                    >
                      <Send size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
