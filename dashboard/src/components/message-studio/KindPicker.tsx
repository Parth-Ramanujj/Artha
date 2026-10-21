import { useState } from 'react';
import {
  BadgeCheck,
  ClipboardList,
  Home,
  Mic,
  Navigation,
  Smile,
  FileText,
  GalleryHorizontal,
  Image,
  LayoutGrid,
  List,
  MapPin,
  MessageSquare,
  MousePointerClick,
  ShoppingBag,
  Sparkles,
  UserSquare,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { StudioCapabilities } from '../../types/messageStudio';
import {
  KIND_CARDS,
  KIND_CATEGORIES,
  PRESETS,
  cardAvailability,
  type KindCard,
  type Preset,
} from '../../utils/messageStudio';

const ICONS: Record<string, LucideIcon> = {
  audio: Mic,
  sticker: Smile,
  home: Home,
  navigation: Navigation,
  form: ClipboardList,
  smile: Smile,
  message: MessageSquare,
  image: Image,
  video: Video,
  file: FileText,
  buttons: MousePointerClick,
  list: List,
  bag: ShoppingBag,
  grid: LayoutGrid,
  carousel: GalleryHorizontal,
  badge: BadgeCheck,
  pin: MapPin,
  contact: UserSquare,
};

interface KindPickerProps {
  capabilities?: StudioCapabilities;
  onPickCard: (card: KindCard) => void;
  onPickPreset: (preset: Preset) => void;
}

/** Step one of a new message: choose a type, or start from a preset. */
export function KindPicker({ capabilities, onPickCard, onPickPreset }: KindPickerProps) {
  const [category, setCategory] = useState<(typeof KIND_CATEGORIES)[number]['id']>('all');
  const cards = KIND_CARDS.filter(c => category === 'all' || c.category === category);

  return (
    <div className="ms-picker">
      <section aria-labelledby="ms-presets-heading">
        <h2 id="ms-presets-heading" className="ms-section-title">
          <Sparkles size={16} aria-hidden="true" /> Start from a preset
        </h2>
        <ul className="ms-preset-grid">
          {PRESETS.map(p => (
            <li key={p.key}>
              <button className="ms-preset" onClick={() => onPickPreset(p)}>
                <strong>{p.name}</strong>
                <span>{p.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ms-kinds-heading">
        <h2 id="ms-kinds-heading" className="ms-section-title">
          Or choose a message type
        </h2>
        <div className="ms-tabs" role="tablist" aria-label="Message categories">
          {KIND_CATEGORIES.map(c => (
            <button
              key={c.id}
              role="tab"
              aria-selected={category === c.id}
              className={`ms-tab ${category === c.id ? 'is-active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <ul className="ms-kind-grid">
          {cards.map(card => {
            const Icon = ICONS[card.icon] ?? MessageSquare;
            const { available, reason } = cardAvailability(card, capabilities);
            return (
              <li key={card.id}>
                <button
                  className={`ms-kind-card ${available ? '' : 'is-limited'}`}
                  onClick={() => onPickCard(card)}
                  aria-describedby={available ? undefined : `ms-kind-${card.id}-why`}
                >
                  <span className="ms-kind-icon" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <strong>{card.title}</strong>
                  <span className="ms-muted">{card.description}</span>
                  <span className="ms-kind-example">{card.example}</span>
                  {!available && (
                    <span className="ms-kind-why" id={`ms-kind-${card.id}-why`}>
                      {reason} {card.alternative}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
