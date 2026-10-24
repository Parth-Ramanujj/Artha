import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { isSsrfProtectionEnabled, withSafeFetch } from '../../common/security/ssrf-guard';
import { CompanySignal, SalesActivity, SalesCompany, SalesProspect } from './entities/sales-agent.entity';
import { normalizePhone } from './sales-rules';
import { buildOverpassQuery, closeEnough, explicitSplit, parseBusiness, tokenize } from './search-query';

const USER_AGENT = 'OpenWA-SalesAgent/1.0 (+https://github.com/rmyndharis/OpenWA)';
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const MAX_PAGE_BYTES = 1_500_000;
/** Search is limited to India: west, south, east, north. */
const INDIA_BBOX = [68.1, 6.5, 97.4, 35.7] as const;
/** Photon results that are places (cities, areas, districts), not shops or streets. */
const PLACE_KEYS = new Set(['place', 'boundary']);

const TECH: Array<[string, RegExp]> = [
  ['WordPress', /wp-content\//i],
  ['Shopify', /cdn\.shopify\.com/i],
  ['Wix', /static\.wixstatic\.com|wix\.com/i],
  ['Squarespace', /squarespace\.com/i],
  ['HubSpot', /js\.hs-scripts\.com|hubspot/i],
  ['Calendly', /calendly\.com/i],
  ['WooCommerce', /woocommerce/i],
];
const BOOKING_HINTS =
  /calendly|acuityscheduling|setmore|simplybook|book-?now|book an appointment|schedule-?appointment|practo|zocdoc|fresha|booksy/i;
const INBOX_PREFERRED = ['owner', 'office', 'info', 'contact', 'hello', 'sales', 'enquiry', 'enquiries', 'admin'];

export interface DiscoverInput {
  /** Free text, e.g. "insurance agent ahmedabad" or "dentist near Bopal". */
  query: string;
  /** Optional place, used when the query names none. */
  location?: string;
  radiusKm?: number;
  limit?: number;
  /** Prepended to local phone numbers in listings. */
  countryCode?: string;
}

export interface DiscoverResult {
  found: number;
  added: number;
  /** How the query was read, shown back so a wrong guess is obvious. */
  understood: { business: string; nameWords: string[]; place: string; radiusKm: number };
}

interface Place {
  lat: number;
  lng: number;
  label: string;
}

export function inIndia(lat: number, lng: number): boolean {
  return lng >= INDIA_BBOX[0] && lng <= INDIA_BBOX[2] && lat >= INDIA_BBOX[1] && lat <= INDIA_BBOX[3];
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    countrycode?: string;
    osm_key: string;
  };
}

export function domainOf(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Free website signals (no model call): ads, booking, schema, tech, contact addresses. */
export function readSignals(html: string, domain: string, countryCode = '') {
  const signals: CompanySignal[] = [];
  if (/googleadservices\.com|gtag\/js\?id=AW-|google_conversion/i.test(html)) {
    signals.push({ code: 'RUNNING_GOOGLE_ADS', detail: 'Google Ads conversion tag on the homepage' });
  }
  if (/connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(['"]init/i.test(html)) {
    signals.push({ code: 'RUNNING_META_ADS', detail: 'Meta pixel on the homepage' });
  }
  if (!BOOKING_HINTS.test(html)) signals.push({ code: 'NO_ONLINE_BOOKING', detail: 'No online booking found' });
  if (!(/application\/ld\+json/i.test(html) && /"@type"/.test(html))) {
    signals.push({ code: 'NO_SCHEMA_MARKUP', detail: 'No structured data (schema.org)' });
  }
  const tech = TECH.filter(([, re]) => re.test(html)).map(([name]) => name);
  if (tech.length) signals.push({ code: 'TECH_STACK', detail: tech.join(', ') });
  if (/wa\.me\/|api\.whatsapp\.com/i.test(html))
    signals.push({ code: 'HAS_WHATSAPP_LINK', detail: 'Links to WhatsApp' });

  const emails = new Set<string>();
  for (const m of html.matchAll(/(?:mailto:)?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/gi)) {
    const e = m[1].toLowerCase();
    if (domain && (e.endsWith(`@${domain}`) || e.endsWith(`.${domain}`)) && !/\.(png|jpg|gif|webp|svg)$/.test(e)) {
      emails.add(e);
    }
  }
  const ranked = [...emails].sort((a, b) => rank(a) - rank(b));
  // wa.me numbers are always international; tel: links may be local.
  const phones = [
    ...[...html.matchAll(/wa\.me\/\+?(\d{8,15})/gi)].map(m => m[1]),
    ...[...html.matchAll(/tel:(\+?[\d\s()-]{8,20})/gi)].map(m => normalizePhone(m[1], countryCode)),
  ];
  return { signals, email: ranked[0] ?? '', phone: phones.find(p => p.length >= 8 && p.length <= 15) ?? '' };
}

function rank(email: string): number {
  const i = INBOX_PREFERRED.indexOf(email.split('@')[0]);
  return i < 0 ? INBOX_PREFERRED.length : i;
}

@Injectable()
export class SalesDiscoveryService {
  private readonly logger = new Logger(SalesDiscoveryService.name);
  private readonly geoCache = new Map<string, Place>();

  constructor(
    @InjectRepository(SalesCompany, 'data') private readonly companies: Repository<SalesCompany>,
    @InjectRepository(SalesProspect, 'data') private readonly prospects: Repository<SalesProspect>,
    @InjectRepository(SalesActivity, 'data') private readonly activity: Repository<SalesActivity>,
  ) {}

  /** Finds businesses in India on OpenStreetMap (free, no key) from a free-text query and stores the new ones. */
  async discover(businessId: string, input: DiscoverInput): Promise<DiscoverResult> {
    const { what, place } = await this.splitQuery(input.query, input.location);
    const business = parseBusiness(what);
    if (!business.category && !business.nameWords.length) {
      throw new BadRequestException(
        `Say what kind of business to find, e.g. "insurance agent ${place.label.split(',')[0]}"`,
      );
    }
    const radiusKm = Math.min(Math.max(input.radiusKm ?? 10, 1), 50);
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 300);
    const query = buildOverpassQuery(business, place.lat, place.lng, Math.round(radiusKm * 1000), limit);
    const elements = (await this.overpass(query)).filter(el => {
      const at = el.center ?? { lat: el.lat, lon: el.lon };
      return at.lat === undefined || at.lon === undefined || inIndia(at.lat, at.lon);
    });
    const industry = business.category?.label ?? business.nameWords.join(' ');
    const understood = { business: industry, nameWords: business.nameWords, place: place.label, radiusKm };

    let added = 0;
    for (const el of elements) {
      const t = el.tags ?? {};
      if (!t.name) continue;
      const externalId = `osm:${el.type}/${el.id}`;
      const website = t.website || t['contact:website'] || '';
      const domain = website ? domainOf(website) : '';
      const exists = await this.companies.findOne({
        where: domain
          ? [
              { businessId, externalId },
              { businessId, domain },
            ]
          : { businessId, externalId },
      });
      if (exists) continue;
      const company = await this.companies.save(
        this.companies.create({
          businessId,
          name: t.name.slice(0, 200),
          website: website.slice(0, 300),
          domain,
          phone: normalizePhone(
            t['contact:whatsapp'] || t.phone || t['contact:phone'] || '',
            input.countryCode ?? '',
          ).slice(0, 20),
          industry: industry.slice(0, 100),
          location: [t['addr:street'], t['addr:city'] || place.label.split(',')[0]]
            .filter(Boolean)
            .join(', ')
            .slice(0, 200),
          externalId,
          signals: website ? [] : [{ code: 'NO_WEBSITE', detail: 'Listed with no website' }],
          profiledAt: null,
        }),
      );
      added++;
      // No website to read, so the listing is all there is: a phone is enough to reach them.
      if (!website) await this.ensureProspect(company, '', '');
    }
    await this.log(businessId, 'discover', { query: input.query, ...understood, found: elements.length, added });
    return { found: elements.length, added, understood };
  }

  /** Reads websites of companies not profiled yet and turns each into a reachable prospect. */
  async profilePending(businessId: string, countryCode: string, limit = 10): Promise<number> {
    const pending = await this.companies.find({
      where: { businessId, profiledAt: IsNull() },
      order: { createdAt: 'ASC' },
      take: limit,
    });
    for (const company of pending) {
      let email = '';
      let phone = '';
      if (company.website) {
        const html = (await this.fetchPage(company.website)) + (await this.fetchPage(this.contactUrl(company.website)));
        const read = readSignals(html, company.domain, countryCode);
        company.signals = [...company.signals.filter(s => s.code === 'NO_WEBSITE'), ...read.signals];
        email = read.email;
        phone = read.phone;
      }
      company.profiledAt = new Date();
      await this.companies.save(company);
      await this.ensureProspect(company, email, phone);
    }
    return pending.length;
  }

  private async ensureProspect(company: SalesCompany, email: string, sitePhone: string): Promise<void> {
    const phone = company.phone || sitePhone;
    if (!phone && !email) return;
    const existing = await this.prospects.findOne({ where: { businessId: company.businessId, companyId: company.id } });
    if (existing) return;
    const facts = company.signals.map(s => `${s.code}: ${s.detail}`).join('; ');
    await this.prospects.save(
      this.prospects.create({
        businessId: company.businessId,
        companyId: company.id,
        companyName: company.name,
        name: '',
        title: '',
        phone,
        email,
        status: 'new',
        source: 'discover:osm',
        notes: [company.industry, company.location, company.website, facts].filter(Boolean).join(' | ').slice(0, 1000),
      }),
    );
  }

  private contactUrl(website: string): string {
    try {
      return new URL('/contact', website.startsWith('http') ? website : `https://${website}`).toString();
    } catch {
      return '';
    }
  }

  /** Fetches a public page through the SSRF guard; any failure just means no signals from it. */
  private async fetchPage(url: string): Promise<string> {
    if (!url) return '';
    const target = url.startsWith('http') ? url : `https://${url}`;
    try {
      return await withSafeFetch(
        target,
        { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, signal: AbortSignal.timeout(10_000) },
        async res => {
          if (!res.ok || !/html|xml|text/i.test(res.headers.get('content-type') ?? '')) return '';
          const text = await res.text();
          return text.slice(0, MAX_PAGE_BYTES);
        },
        { guard: isSsrfProtectionEnabled(), followRedirects: true },
      );
    } catch (err) {
      this.logger.debug(`Profile fetch failed for ${target}: ${err instanceof Error ? err.message : String(err)}`);
      return '';
    }
  }

  /**
   * Separates the business from the place. "X in/near/at Y" and "X, Y" split there; otherwise the
   * longest tail of the query (up to 3 words) that is a real place in India is the place.
   */
  private async splitQuery(query: string, location?: string): Promise<{ what: string; place: Place }> {
    const explicit = explicitSplit(query);
    if (explicit) return { what: explicit.what, place: await this.geocode(explicit.where) };
    const tokens = tokenize(query);
    for (let n = Math.min(3, tokens.length - 1); n >= 1; n--) {
      const place = await this.findPlace(tokens.slice(-n).join(' '));
      if (place) return { what: tokens.slice(0, -n).join(' '), place };
    }
    if (location?.trim()) return { what: query, place: await this.geocode(location) };
    throw new BadRequestException(`Add a city or area in India, e.g. "${query} ahmedabad"`);
  }

  private async geocode(text: string): Promise<Place> {
    const coords = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
    if (coords) {
      const [lat, lng] = [Number(coords[1]), Number(coords[2])];
      if (!inIndia(lat, lng)) throw new BadRequestException('Those coordinates are outside India');
      return { lat, lng, label: `${lat}, ${lng}` };
    }
    const place = await this.findPlace(text);
    if (!place) throw new BadRequestException(`Could not find "${text}" in India`);
    return place;
  }

  /**
   * A city/area/district in India matching `text`, typo-tolerant (Photon), with Nominatim as backup.
   * Every typed word must resemble the place's name, city, district or state, so "agent ahmedabad"
   * is not mistaken for a shop called "Agent".
   */
  private async findPlace(text: string): Promise<Place | null> {
    const key = text.trim().toLowerCase();
    if (!key) return null;
    const cached = this.geoCache.get(key);
    if (cached) return cached;
    const typed = tokenize(key);
    const resembles = (known: string[]) => typed.every(t => known.some(k => closeEnough(t, k)));
    let place: Place | null = null;
    try {
      const url = `https://photon.komoot.io/api/?limit=8&lang=en&bbox=${INDIA_BBOX.join(',')}&q=${encodeURIComponent(key)}`;
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) });
      const body = res.ok ? ((await res.json()) as { features?: PhotonFeature[] }) : {};
      const hit = (body.features ?? []).find(f => {
        const p = f.properties;
        if (p.countrycode !== 'IN' || !PLACE_KEYS.has(p.osm_key)) return false;
        return resembles(tokenize([p.name, p.city, p.district, p.county, p.state].filter(Boolean).join(' ')));
      });
      if (hit) {
        const p = hit.properties;
        const label = [...new Set([p.name, p.city, p.state].filter(Boolean))].join(', ');
        place = { lng: hit.geometry.coordinates[0], lat: hit.geometry.coordinates[1], label };
      }
    } catch (err) {
      this.logger.debug(`Photon lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!place) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(key)}`,
          { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) },
        );
        const rows = res.ok ? ((await res.json()) as Array<{ lat: string; lon: string; display_name: string }>) : [];
        const row = rows[0];
        if (row && resembles(tokenize(row.display_name))) {
          const label = row.display_name.split(',').slice(0, 2).join(',');
          place = { lat: Number(row.lat), lng: Number(row.lon), label };
        }
      } catch (err) {
        this.logger.debug(`Nominatim lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (place) this.geoCache.set(key, place);
    return place;
  }

  private async overpass(query: string): Promise<OverpassElement[]> {
    let lastError = '';
    for (const mirror of OVERPASS_MIRRORS) {
      try {
        const res = await fetch(mirror, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(75_000),
        });
        if (res.ok) return ((await res.json()) as { elements?: OverpassElement[] }).elements ?? [];
        lastError = `${mirror} answered ${res.status}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    throw new BadRequestException(`OpenStreetMap search failed: ${lastError}`);
  }

  private async log(businessId: string, type: string, details: Record<string, unknown>) {
    await this.activity.save(this.activity.create({ businessId, type, details }));
  }
}
