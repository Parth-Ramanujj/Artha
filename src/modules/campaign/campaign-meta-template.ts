/** An approved Meta template a Cloud API campaign sends instead of free text (messageOptions.metaTemplate). */
export interface CampaignMetaTemplate {
  name: string;
  language: string;
  /** One value per body variable, in order; "{{name}}" inside a value becomes the recipient's name. */
  bodyParams: string[];
  /** For NAMED templates: the variable name of each bodyParams entry. */
  paramNames?: string[];
  /** Value for a TEXT header's variable (may contain {{name}}); with headerParamName for NAMED templates. */
  headerParam?: string;
  headerParamName?: string;
  /** What {{name}} becomes for a recipient without a name (e.g. "Sir/Madam"). */
  nameFallback?: string;
  /** Uploaded header media (Meta media id). */
  headerMedia?: { type: 'image' | 'video' | 'document'; id: string; filename?: string };
  /** Legacy form of headerMedia for image headers. */
  headerImageId?: string;
  headerLocation?: { latitude: number; longitude: number; name?: string; address?: string };
  /** COPY_CODE button: its position among the buttons and the code to copy. */
  couponCode?: string;
  couponIndex?: number;
  /** Meta category of the template (marketing/utility/…), for wallet checks before sending. */
  category?: string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const MEDIA = ['image', 'video', 'document'] as const;

export function readMetaTemplate(options: Record<string, unknown> | null): CampaignMetaTemplate | null {
  const t = options?.metaTemplate as Partial<CampaignMetaTemplate> | undefined;
  if (!t || !str(t.name) || !str(t.language)) return null;
  const media = t.headerMedia;
  const loc = t.headerLocation;
  return {
    name: str(t.name)!,
    language: str(t.language)!,
    bodyParams: Array.isArray(t.bodyParams) ? t.bodyParams.map(p => String(p)) : [],
    ...(Array.isArray(t.paramNames) ? { paramNames: t.paramNames.map(p => String(p)) } : {}),
    ...(str(t.category) ? { category: str(t.category)!.toLowerCase() } : {}),
    ...(str(t.headerParam) ? { headerParam: str(t.headerParam) } : {}),
    ...(str(t.headerParamName) ? { headerParamName: str(t.headerParamName) } : {}),
    ...(str(t.nameFallback) ? { nameFallback: str(t.nameFallback) } : {}),
    ...(media && MEDIA.includes(media.type) && str(media.id)
      ? {
          headerMedia: {
            type: media.type,
            id: str(media.id)!,
            ...(str(media.filename) ? { filename: str(media.filename) } : {}),
          },
        }
      : {}),
    ...(str(t.headerImageId) ? { headerImageId: str(t.headerImageId) } : {}),
    ...(loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude))
      ? {
          headerLocation: {
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            ...(str(loc.name) ? { name: str(loc.name) } : {}),
            ...(str(loc.address) ? { address: str(loc.address) } : {}),
          },
        }
      : {}),
    ...(str(t.couponCode) && Number.isInteger(t.couponIndex)
      ? { couponCode: str(t.couponCode), couponIndex: t.couponIndex }
      : {}),
  };
}

/** The send-time components for one recipient. */
export function metaTemplateComponents(
  t: CampaignMetaTemplate,
  contactName: string | null | undefined,
): Array<Record<string, unknown>> | undefined {
  // Meta rejects an empty parameter, so a missing name falls back to the campaign's chosen word.
  const name = contactName?.trim() || t.nameFallback || 'there';
  const fill = (v: string) => v.replace(/\{\{\s*name\s*\}\}/gi, name) || name;
  const components: Array<Record<string, unknown>> = [];

  const media = t.headerMedia ?? (t.headerImageId ? { type: 'image' as const, id: t.headerImageId } : undefined);
  if (media) {
    const value: Record<string, unknown> = { id: media.id };
    if (media.type === 'document' && media.filename) value.filename = media.filename;
    components.push({ type: 'header', parameters: [{ type: media.type, [media.type]: value }] });
  } else if (t.headerLocation) {
    components.push({ type: 'header', parameters: [{ type: 'location', location: t.headerLocation }] });
  } else if (t.headerParam) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'text',
          text: fill(t.headerParam),
          ...(t.headerParamName ? { parameter_name: t.headerParamName } : {}),
        },
      ],
    });
  }

  if (t.bodyParams.length) {
    components.push({
      type: 'body',
      parameters: t.bodyParams.map((p, i) => ({
        type: 'text',
        text: fill(p),
        ...(t.paramNames?.[i] ? { parameter_name: t.paramNames[i] } : {}),
      })),
    });
  }

  if (t.couponCode && t.couponIndex !== undefined) {
    components.push({
      type: 'button',
      sub_type: 'copy_code',
      index: String(t.couponIndex),
      parameters: [{ type: 'coupon_code', coupon_code: t.couponCode }],
    });
  }
  return components.length ? components : undefined;
}
