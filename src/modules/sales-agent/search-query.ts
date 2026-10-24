/**
 * Free-text business search ("insurence agent ahemdabad") → what to look for on OpenStreetMap.
 * Pure functions; the geocoding of the place part lives in the discovery service.
 */

export type OsmTag = [string, string];

interface Category {
  label: string;
  keywords: string[];
  tags: OsmTag[];
  /** Words that commonly appear in such businesses' names (matched as whole words). */
  names: string[];
}

export const CATEGORIES: Category[] = [
  {
    label: 'insurance',
    keywords: ['insurance', 'bima', 'lic', 'policy'],
    tags: [['office', 'insurance']],
    names: ['insurance', 'lic', 'bima'],
  },
  {
    label: 'financial advisor',
    keywords: ['financial', 'finance', 'wealth', 'investment', 'mutual', 'loan', 'stock', 'broking'],
    tags: [
      ['office', 'financial_advisor'],
      ['office', 'financial'],
      ['amenity', 'bureau_de_change'],
    ],
    names: ['finance', 'financial', 'wealth', 'investment', 'capital', 'finserv', 'broking'],
  },
  {
    label: 'dentist',
    keywords: ['dentist', 'dental', 'teeth', 'orthodontist'],
    tags: [
      ['amenity', 'dentist'],
      ['healthcare', 'dentist'],
    ],
    names: ['dental', 'dentist'],
  },
  {
    label: 'clinic / hospital',
    keywords: ['clinic', 'doctor', 'hospital', 'physician', 'physiotherapy', 'physio', 'skin', 'dermatologist'],
    tags: [
      ['amenity', 'clinic'],
      ['amenity', 'doctors'],
      ['amenity', 'hospital'],
      ['healthcare', 'clinic'],
    ],
    names: ['clinic', 'hospital', 'physio'],
  },
  {
    label: 'lawyer',
    keywords: ['lawyer', 'advocate', 'attorney', 'legal', 'vakil', 'notary'],
    tags: [
      ['office', 'lawyer'],
      ['office', 'notary'],
    ],
    names: ['advocate', 'legal', 'law', 'lawyer'],
  },
  {
    label: 'accountant / CA',
    keywords: ['accountant', 'ca', 'chartered', 'tax', 'gst', 'audit', 'accounting'],
    tags: [
      ['office', 'accountant'],
      ['office', 'tax_advisor'],
    ],
    names: ['chartered', 'accountant', 'tax', 'gst'],
  },
  {
    label: 'real estate',
    keywords: ['realestate', 'estate', 'property', 'properties', 'broker', 'realtor', 'realty'],
    tags: [['office', 'estate_agent']],
    names: ['estate', 'properties', 'realty', 'realtors'],
  },
  {
    label: 'builder / construction',
    keywords: ['builder', 'builders', 'construction', 'contractor', 'developer', 'developers'],
    tags: [
      ['craft', 'builder'],
      ['office', 'construction_company'],
    ],
    names: ['construction', 'builders', 'developers', 'infra'],
  },
  {
    label: 'travel agent',
    keywords: ['travel', 'travels', 'tour', 'tours', 'tourism', 'holiday', 'holidays', 'visa'],
    tags: [
      ['office', 'travel_agent'],
      ['shop', 'travel_agency'],
    ],
    names: ['travels', 'tours', 'holidays', 'travel'],
  },
  {
    label: 'IT / software company',
    keywords: ['software', 'it', 'technology', 'technologies', 'infotech', 'website', 'app', 'digital'],
    tags: [
      ['office', 'it'],
      ['office', 'company'],
    ],
    names: ['technologies', 'infotech', 'software', 'solutions', 'digital', 'tech'],
  },
  {
    label: 'marketing agency',
    keywords: ['marketing', 'advertising', 'agency', 'seo', 'branding'],
    tags: [['office', 'advertising_agency']],
    names: ['marketing', 'advertising', 'media', 'branding'],
  },
  {
    label: 'restaurant',
    keywords: ['restaurant', 'restaurants', 'dhaba', 'food'],
    tags: [
      ['amenity', 'restaurant'],
      ['amenity', 'fast_food'],
    ],
    names: ['restaurant', 'dhaba', 'kitchen'],
  },
  { label: 'cafe', keywords: ['cafe', 'coffee', 'tea'], tags: [['amenity', 'cafe']], names: ['cafe', 'coffee'] },
  {
    label: 'gym / fitness',
    keywords: ['gym', 'fitness', 'yoga', 'crossfit', 'zumba'],
    tags: [
      ['leisure', 'fitness_centre'],
      ['leisure', 'sports_centre'],
    ],
    names: ['gym', 'fitness', 'yoga'],
  },
  {
    label: 'salon / beauty',
    keywords: ['salon', 'parlour', 'parlor', 'beauty', 'spa', 'hair', 'makeup', 'barber'],
    tags: [
      ['shop', 'hairdresser'],
      ['shop', 'beauty'],
      ['leisure', 'spa'],
    ],
    names: ['salon', 'parlour', 'beauty', 'spa'],
  },
  {
    label: 'hotel',
    keywords: ['hotel', 'hotels', 'lodge', 'resort', 'guesthouse', 'homestay'],
    tags: [
      ['tourism', 'hotel'],
      ['tourism', 'guest_house'],
      ['tourism', 'motel'],
    ],
    names: ['hotel', 'resort', 'inn', 'lodge'],
  },
  {
    label: 'school / coaching',
    keywords: ['school', 'coaching', 'tuition', 'classes', 'academy', 'institute', 'college', 'education'],
    tags: [
      ['amenity', 'school'],
      ['amenity', 'college'],
      ['amenity', 'training'],
    ],
    names: ['academy', 'classes', 'institute', 'coaching', 'school'],
  },
  {
    label: 'car repair / dealer',
    keywords: ['garage', 'mechanic', 'car', 'cars', 'automobile', 'bike', 'motors'],
    tags: [
      ['shop', 'car_repair'],
      ['shop', 'car'],
      ['shop', 'motorcycle'],
    ],
    names: ['motors', 'automobiles', 'garage'],
  },
  {
    label: 'pharmacy',
    keywords: ['pharmacy', 'chemist', 'medical', 'medicine', 'druggist'],
    tags: [
      ['amenity', 'pharmacy'],
      ['shop', 'chemist'],
    ],
    names: ['medical', 'pharmacy', 'chemist'],
  },
  {
    label: 'jewellery',
    keywords: ['jewellery', 'jewelry', 'jeweller', 'jewellers', 'gold', 'diamond'],
    tags: [['shop', 'jewelry']],
    names: ['jewellers', 'jewellery', 'gold', 'diamonds'],
  },
  {
    label: 'optician',
    keywords: ['optician', 'optical', 'opticals', 'eyewear', 'spectacles'],
    tags: [['shop', 'optician']],
    names: ['optical', 'opticals', 'optics'],
  },
  { label: 'furniture', keywords: ['furniture'], tags: [['shop', 'furniture']], names: ['furniture'] },
  {
    label: 'electronics / mobile',
    keywords: ['electronics', 'mobile', 'mobiles', 'phone', 'computer', 'laptop'],
    tags: [
      ['shop', 'electronics'],
      ['shop', 'mobile_phone'],
      ['shop', 'computer'],
    ],
    names: ['electronics', 'mobile', 'computers'],
  },
  {
    label: 'clothing',
    keywords: ['clothes', 'clothing', 'boutique', 'fashion', 'garments', 'saree', 'tailor'],
    tags: [
      ['shop', 'clothes'],
      ['shop', 'boutique'],
      ['craft', 'tailor'],
    ],
    names: ['fashion', 'boutique', 'garments', 'creations'],
  },
  {
    label: 'hardware / tiles',
    keywords: ['hardware', 'tiles', 'sanitary', 'paint', 'paints', 'plywood'],
    tags: [
      ['shop', 'hardware'],
      ['shop', 'doityourself'],
      ['shop', 'paint'],
    ],
    names: ['hardware', 'tiles', 'ceramics', 'sanitary'],
  },
  {
    label: 'grocery / supermarket',
    keywords: ['grocery', 'kirana', 'supermarket', 'mart'],
    tags: [
      ['shop', 'supermarket'],
      ['shop', 'convenience'],
    ],
    names: ['mart', 'kirana', 'provision'],
  },
  {
    label: 'bakery',
    keywords: ['bakery', 'cake', 'cakes', 'sweets'],
    tags: [
      ['shop', 'bakery'],
      ['shop', 'confectionery'],
    ],
    names: ['bakery', 'cakes', 'sweets'],
  },
  { label: 'plumber', keywords: ['plumber', 'plumbing'], tags: [['craft', 'plumber']], names: ['plumbing'] },
  {
    label: 'electrician',
    keywords: ['electrician', 'electrical', 'electric'],
    tags: [['craft', 'electrician']],
    names: ['electricals', 'electric'],
  },
  {
    label: 'AC / HVAC',
    keywords: ['ac', 'hvac', 'aircondition', 'cooling'],
    tags: [['craft', 'hvac']],
    names: ['aircon', 'cooling'],
  },
  {
    label: 'photographer',
    keywords: ['photographer', 'photography', 'studio'],
    tags: [
      ['craft', 'photographer'],
      ['shop', 'photo'],
    ],
    names: ['studio', 'photography'],
  },
  { label: 'roofing', keywords: ['roof', 'roofing', 'roofer'], tags: [['craft', 'roofer']], names: ['roofing'] },
  {
    label: 'landscaping',
    keywords: ['landscaping', 'garden', 'gardener', 'nursery'],
    tags: [
      ['craft', 'gardener'],
      ['shop', 'garden_centre'],
    ],
    names: ['nursery', 'garden'],
  },
];

/** Filler words that describe neither the business type nor the place. */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'in',
  'at',
  'near',
  'nearby',
  'me',
  'around',
  'of',
  'for',
  'and',
  'best',
  'top',
  'good',
  'agent',
  'agents',
  'agency',
  'agencies',
  'office',
  'offices',
  'shop',
  'shops',
  'service',
  'services',
  'company',
  'companies',
  'center',
  'centre',
  'wala',
  'wale',
  'list',
  'all',
  'business',
  'businesses',
  'dealer',
  'dealers',
  'provider',
  'providers',
  'consultant',
  'consultants',
  'india',
  'store',
  'stores',
]);

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Typo tolerance grows with word length; very short words must match exactly. */
export function closeEnough(typed: string, word: string): boolean {
  if (typed.length <= 3 || word.length <= 3) return typed === word;
  return levenshtein(typed, word) <= (Math.max(typed.length, word.length) <= 5 ? 1 : 2);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Splits "X in Y" / "X near Y" / "X, Y"; null when the query has no explicit place marker. */
export function explicitSplit(query: string): { what: string; where: string } | null {
  const m = /^(.*?)(?:\s+(?:in|near|at|around)\s+|\s*,\s*)(.+)$/i.exec(query.trim());
  return m && m[1].trim() && m[2].trim() ? { what: m[1].trim(), where: m[2].trim() } : null;
}

export interface BusinessQuery {
  category: Category | null;
  /** Whole words to find in business names (typos corrected to the category's spelling). */
  nameWords: string[];
}

/** Reads the business part of a query: a known category (typo-tolerant) plus words to match in names. */
export function parseBusiness(what: string): BusinessQuery {
  const tokens = tokenize(what).filter(t => !STOPWORDS.has(t));
  let category: Category | null = null;
  let best = Infinity;
  const corrected = tokens.map(t => {
    for (const c of CATEGORIES) {
      for (const k of c.keywords) {
        if (!closeEnough(t, k)) continue;
        const d = levenshtein(t, k);
        if (d < best) {
          best = d;
          category = c;
        }
        return k;
      }
    }
    return t;
  });
  const words = new Set([...corrected.filter(w => w.length >= 3), ...((category as Category | null)?.names ?? [])]);
  return { category, nameWords: [...words].slice(0, 8) };
}

/** Overpass QL: category tags plus business-like places whose name contains one of the words. */
export function buildOverpassQuery(q: BusinessQuery, lat: number, lng: number, radiusM: number, limit: number): string {
  const around = `(around:${radiusM},${lat},${lng})`;
  const parts = (q.category?.tags ?? []).map(([k, v]) => `nwr["${k}"="${v}"]${around};`);
  // Name matching is slow on Overpass, so it only runs for kinds of business without a known category.
  if (!q.category && q.nameWords.length) {
    const words = q.nameWords.map(w => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
    // Whole-word match, so "lic" doesn't hit "Public" or "Clinic".
    const re = `(^|[^a-z])(${words.join('|')})([^a-z]|$)`;
    // Only real businesses (any of these keys), not roads or areas that happen to share the word.
    parts.push(`nwr["name"~"${re}",i][~"^(office|shop|amenity|craft|healthcare|tourism|leisure)$"~"."]${around};`);
  }
  return `[out:json][timeout:60];(${parts.join('')});out center ${limit};`;
}
