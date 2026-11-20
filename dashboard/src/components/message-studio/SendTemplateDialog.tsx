import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { messageStudioApi } from '../../services/api';
import type { StudioTemplate } from '../../types/messageStudio';
import { templatePrice } from '../../utils/templatePricing';
import { CampaignTemplatePicker, type CampaignMetaTemplate } from '../CampaignTemplatePicker';
import { DeliveryTracker } from './DeliveryTracker';

/** Sends one approved template to one phone now, with the cost shown before sending. */
export function SendTemplateDialog({
  sessionId,
  template,
  onClose,
}: {
  sessionId: string;
  template: StudioTemplate;
  onClose: () => void;
}) {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [filled, setFilled] = useState<CampaignMetaTemplate | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const phoneOk = /^\+?\d{10,15}$/.test(phone.replace(/[\s-]/g, ''));
  const price = templatePrice(template.category);

  const send = useMutation({
    mutationFn: () =>
      messageStudioApi.sendTemplate({
        sessionId,
        phone,
        ...(name.trim() ? { contactName: name.trim() } : {}),
        metaTemplate: filled!,
      }),
    // Stay open: "accepted" is not "delivered" — the tracker shows what WhatsApp reports next.
    onSuccess: res => setSentId(res.messageId),
    onError: (e: Error) => toast.error('Not sent', e.message),
  });

  if (sentId) {
    return (
      <Modal
        open
        onClose={onClose}
        title={`“${template.name}” → ${phone}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setSentId(null)}>
              Send to another number
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </>
        }
      >
        <DeliveryTracker sessionId={sessionId} messageId={sentId} />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Send “${template.name}”`}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!phoneOk || !filled || send.isPending}
            onClick={() => send.mutate()}
          >
            <Send size={15} /> {send.isPending ? 'Sending…' : `Send now (${price.perMessage})`}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div className="form-group">
          <label className="form-label" htmlFor="send-tpl-phone">
            WhatsApp number *
          </label>
          <input
            id="send-tpl-phone"
            className="form-input"
            inputMode="tel"
            placeholder="6352701839"
            value={phone}
            onChange={e => setPhone(e.target.value.trim())}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="send-tpl-name">
            Their name <span style={{ opacity: 0.7 }}>(fills {'{{name}}'})</span>
          </label>
          <input
            id="send-tpl-name"
            className="form-input"
            placeholder="Ravi"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <CampaignTemplatePicker
          sessionId={sessionId}
          initialKey={`${template.name}|${template.language}`}
          lockTemplate
          recipientsCount={1}
          onChange={tpl => setFilled(tpl)}
        />
      </div>
    </Modal>
  );
}
