import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, ExternalLink, Plus, RotateCcw } from 'lucide-react';

/**
 * Step-by-step guide (Gujarati) for connecting an Instagram professional account and a Facebook Page
 * through a Meta app. Ticked steps are remembered per browser only.
 */

const STORAGE_KEY = 'artha_social_setup_guide_done';

const PERMISSIONS = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
  'pages_manage_metadata',
  'pages_manage_posts',
  'pages_manage_engagement',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
].join('\n');
const DM_PERMISSIONS = 'pages_messaging\ninstagram_manage_messages';
const ACCOUNTS_QUERY = 'me/accounts?fields=id,name,access_token,instagram_business_account{id,username}';

interface GuideStep {
  id: string;
  title: ReactNode;
  why?: ReactNode;
  body: ReactNode;
}

interface GuideStage {
  title: string;
  intro?: ReactNode;
  steps: GuideStep[];
}

interface SetupGuideProps {
  webhookUrl: string;
  verifyTokens: { id: string; name: string; token: string }[];
  onConnectAccount: () => void;
}

function loadDone(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveDone(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: progress just isn't remembered.
  }
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  };
  return (
    <div className="sg-copy">
      <pre>{text}</pre>
      <button type="button" className="btn btn-secondary btn-sm" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

const Ext = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children} <ExternalLink size={12} aria-hidden="true" />
  </a>
);
const Warn = ({ children }: { children: ReactNode }) => <div className="sg-note warn">{children}</div>;
const Ok = ({ children }: { children: ReactNode }) => <div className="sg-note ok">{children}</div>;

function FieldTable({ label, rows }: { label: string; rows: [string, ReactNode][] }) {
  return (
    <table className="sg-fields" aria-label={label}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function buildStages({ webhookUrl, verifyTokens, onConnectAccount }: SetupGuideProps): GuideStage[] {
  return [
    {
      title: 'શરૂ કરતાં પહેલાં આ તૈયાર રાખો',
      intro: 'આમાંથી એક પણ વસ્તુ ખૂટશે તો આગળ અટકી જશો.',
      steps: [
        {
          id: 'ready-2fa',
          title: 'Facebook નું પોતાનું account, two-factor authentication ચાલુ કરેલું',
          why: 'Meta આ વગર post publish કરવા દેતું નથી.',
          body: (
            <ul>
              <li>
                Facebook → <b>Settings &amp; privacy</b> → <b>Settings</b> → <b>Accounts Center</b> →{' '}
                <b>Password and security</b> → <b>Two-factor authentication</b> → ચાલુ કરો.
              </li>
            </ul>
          ),
        },
        {
          id: 'ready-page',
          title: 'Facebook Page, જેના તમે admin છો',
          why: 'Instagram પણ Page મારફતે જ જોડાય છે, એટલે ફક્ત Instagram વાપરવું હોય તો પણ Page જોઈએ.',
          body: (
            <ul>
              <li>
                Page ન હોય તો Facebook → <b>Pages</b> → <b>Create new Page</b> થી બનાવો.
              </li>
              <li>
                Page પર તમારી પાસે <b>Full control</b> (admin) હોવો જોઈએ.
              </li>
            </ul>
          ),
        },
        {
          id: 'ready-https',
          title: (
            <>
              Artha નું server ઇન્ટરનેટ પર <code>https://</code> વાળા domain પર ચાલતું હોય
            </>
          ),
          why: (
            <>
              Meta comments ની ખબર તમારા server ને મોકલે છે. <code>localhost</code> કે <code>http://</code> પર એ પહોંચી
              શકતું નથી.
            </>
          ),
          body: (
            <p>
              આ server નું webhook address: <code>{webhookUrl}</code>
            </p>
          ),
        },
        {
          id: 'ready-policy',
          title: 'Privacy Policy નું public link',
          why: 'Meta App ને Live કરવા માટે Meta આ માગે છે (Step 18). તમારી website પરનું કોઈ પણ privacy policy page ચાલે.',
          body: null,
        },
      ],
    },
    {
      title: 'ભાગ 1 · Instagram અને Page તૈયાર કરો',
      intro: 'આ બધું તમારા phone ની Instagram app માંથી થઈ જશે.',
      steps: [
        {
          id: 'ig-pro',
          title: 'Instagram ને Professional account બનાવો',
          body: (
            <>
              <ul>
                <li>
                  Instagram → તમારી profile → ઉપર જમણે <b>☰</b> → <b>Settings and activity</b>.
                </li>
                <li>
                  <b>Account type and tools</b> → <b>Switch to professional account</b> → <b>Business</b> → category →{' '}
                  <b>Done</b>.
                </li>
              </ul>
              <Warn>
                <b>ધ્યાન રાખો:</b> Account <b>Public</b> હોવું જોઈએ. <b>Account privacy</b> માં <b>Private account</b> બંધ
                રાખો, નહીં તો comments ની ખબર Meta મોકલશે જ નહીં.
              </Warn>
            </>
          ),
        },
        {
          id: 'ig-link',
          title: 'Instagram ને Facebook Page સાથે જોડો',
          why: (
            <>
              બીજી રીત: Instagram app → <b>Edit profile</b> → <b>Page</b> → <b>Connect</b>.
            </>
          ),
          body: (
            <ul>
              <li>Facebook પર તમારા Page ની profile પર switch કરો.</li>
              <li>
                <b>Settings &amp; privacy</b> → <b>Settings</b> → <b>Linked accounts</b> → <b>Instagram</b> →{' '}
                <b>Connect account</b>.
              </li>
              <li>
                Instagram માં login કરો અને permission આપો. પૂછે તો Instagram messages ની access પણ <b>Allow</b> કરો.
              </li>
            </ul>
          ),
        },
        {
          id: 'ig-dm',
          title: 'Instagram DM ની access ચાલુ કરો (ફક્ત auto-DM વાપરવું હોય તો)',
          why: (
            <>
              અમુક account માં આ <b>Business tools and controls</b> હેઠળ હોય છે.
            </>
          ),
          body: (
            <ul>
              <li>
                Instagram → <b>Settings and activity</b> → <b>Messages and story replies</b> → <b>Message controls</b>.
              </li>
              <li>
                <b>Connected tools</b> માં <b>Allow access to messages</b> ચાલુ કરો.
              </li>
            </ul>
          ),
        },
      ],
    },
    {
      title: 'ભાગ 2 · Meta App બનાવો',
      intro: (
        <>
          આ ભાગ computer પર <Ext href="https://developers.facebook.com/">developers.facebook.com</Ext> પર કરો, એ જ
          Facebook account થી જે Page નો admin છે.
        </>
      ),
      steps: [
        {
          id: 'meta-dev',
          title: 'Meta Developer account બનાવો',
          body: (
            <ul>
              <li>
                <Ext href="https://developers.facebook.com/">developers.facebook.com</Ext> → <b>Get Started</b> (અથવા{' '}
                <b>Log in</b>).
              </li>
              <li>
                Phone number અને email verify કરો, role માં <b>Developer</b> પસંદ કરો.
              </li>
            </ul>
          ),
        },
        {
          id: 'meta-app',
          title: 'નવી App બનાવો',
          body: (
            <ul>
              <li>
                <b>My Apps</b> → <b>Create App</b>.
              </li>
              <li>
                App name (દા.ત. <code>Mari Dukan Social</code>) અને email નાખો → <b>Next</b>.
              </li>
              <li>
                Use case માં <b>Other</b> → <b>Next</b>.
              </li>
              <li>
                App type માં <b>Business</b> → <b>Next</b>.
              </li>
              <li>
                Business portfolio હોય તો પસંદ કરો (ન હોય તો ચાલે) → <b>Create app</b> → Facebook password નાખો.
              </li>
            </ul>
          ),
        },
        {
          id: 'meta-products',
          title: 'App માં જરૂરી products ઉમેરો',
          body: (
            <ul>
              <li>
                App dashboard → <b>Add products to your app</b> (અથવા ડાબી બાજુ <b>Add product</b>).
              </li>
              <li>
                <b>Instagram</b> → <b>Set up</b> → <b>API setup with Facebook login</b>.
              </li>
              <li>
                <b>Webhooks</b> → <b>Set up</b>.
              </li>
              <li>
                Auto-DM વાપરવું હોય તો <b>Messenger</b> → <b>Set up</b> પણ ઉમેરો.
              </li>
            </ul>
          ),
        },
        {
          id: 'meta-secret',
          title: 'App ની basic વિગતો ભરો અને App Secret server પર મૂકો',
          body: (
            <>
              <ul>
                <li>
                  ડાબી બાજુ <b>App settings</b> → <b>Basic</b>.
                </li>
                <li>
                  <b>Privacy Policy URL</b>, <b>App icon</b> અને <b>Category</b> ભરો → <b>Save changes</b>.
                </li>
                <li>
                  <b>App secret</b> સામે <b>Show</b> → password નાખો → secret copy કરો.
                </li>
                <li>
                  Server ની <code>.env</code> file માં આ line ઉમેરો અને server restart કરો:
                </li>
              </ul>
              <CopyBlock label="env line" text="META_APP_SECRET=અહીં-copy-કરેલું-App-secret" />
              <Warn>
                <b>ધ્યાન રાખો:</b> App secret કોઈને મોકલશો નહીં. એ વગર Artha production માં Meta ના messages સ્વીકારતું
                નથી, એટલે auto-reply ચાલશે જ નહીં.
              </Warn>
            </>
          ),
        },
        {
          id: 'meta-roles',
          title: 'Page સંભાળનાર વ્યક્તિને App માં role આપો (જો બીજું કોઈ token બનાવશે તો)',
          why: 'App બનાવનાર પોતે જ Page admin હોય તો આ step છોડી દો.',
          body: (
            <>
              <ul>
                <li>
                  <b>App roles</b> → <b>Roles</b> → <b>Add People</b> → <b>Administrator</b> કે <b>Developer</b>.
                </li>
              </ul>
              <Warn>
                <b>બીજાની Pages જોડવી હોય તો:</b> customers ની Pages (જેમાં તમારી App માં role ન હોય) જોડવા Meta ની{' '}
                <b>App Review</b> અને <b>Business Verification</b> જરૂરી છે. પોતાની Page માટે એની જરૂર નથી.
              </Warn>
            </>
          ),
        },
      ],
    },
    {
      title: 'ભાગ 3 · Access Token અને IDs મેળવો',
      intro: 'Token એ ચાવી છે જેનાથી Artha તમારા નામે post અને reply કરી શકે. આ સૌથી અગત્યનો ભાગ છે, ધીમે ધીમે કરો.',
      steps: [
        {
          id: 'token-explorer',
          title: 'Graph API Explorer માં token બનાવો',
          body: (
            <>
              <ul>
                <li>
                  <Ext href="https://developers.facebook.com/tools/explorer/">Graph API Explorer</Ext> ખોલો.
                </li>
                <li>
                  જમણી બાજુ <b>Meta App</b> માં તમારી નવી App પસંદ કરો.
                </li>
                <li>
                  <b>User or Page</b> માં <b>Get User Access Token</b> પસંદ કરો.
                </li>
                <li>
                  <b>Permissions</b> માં નીચેની બધી permissions ઉમેરો (એક પણ ભૂલશો નહીં):
                </li>
              </ul>
              <CopyBlock label="permissions" text={PERMISSIONS} />
              <p>Auto-DM માટે આ બે વધારે ઉમેરો:</p>
              <CopyBlock label="DM permissions" text={DM_PERMISSIONS} />
              <ul>
                <li>
                  <b>Generate Access Token</b> દબાવો → Facebook ની window ખૂલશે.
                </li>
                <li>
                  તમારું <b>Page</b> અને <b>Instagram account</b> બંને પસંદ કરો, બધી permissions <b>Allow</b> રાખો →{' '}
                  <b>Save</b>.
                </li>
              </ul>
              <Warn>
                <b>ધ્યાન રાખો:</b> Window માં Page કે Instagram પસંદ કરવાનું રહી જાય તો Artha એને જોઈ શકશે નહીં. ભૂલ થાય
                તો ફરી <b>Generate Access Token</b> દબાવો.
              </Warn>
            </>
          ),
        },
        {
          id: 'token-long',
          title: 'Token ને લાંબો ચાલે એવો બનાવો',
          why: 'Explorer નો token 1-2 કલાકમાં જ બંધ થઈ જાય છે.',
          body: (
            <ul>
              <li>Explorer નો token copy કરો.</li>
              <li>
                <Ext href="https://developers.facebook.com/tools/debug/accesstoken/">Access Token Debugger</Ext> ખોલો →
                token paste કરો → <b>Debug</b>.
              </li>
              <li>
                નીચે <b>Extend Access Token</b> દબાવો → નવો token copy કરો. આ <b>long-lived User token</b> છે (આશરે 60
                દિવસ ચાલે).
              </li>
            </ul>
          ),
        },
        {
          id: 'token-ids',
          title: 'Page ID, Instagram ID અને Page token મેળવો',
          body: (
            <>
              <ul>
                <li>
                  Graph API Explorer માં ઉપરના <b>Access Token</b> ખાનામાં long-lived token paste કરો.
                </li>
                <li>
                  Method <b>GET</b> રાખો, નીચેની line address ના ખાનામાં paste કરો → <b>Submit</b>:
                </li>
              </ul>
              <CopyBlock label="Graph API query" text={ACCOUNTS_QUERY} />
              <p>જવાબમાંથી આ ત્રણ વસ્તુ notepad માં લખી લો:</p>
              <FieldTable
                label="Explorer ના જવાબમાંથી શું લેવું"
                rows={[
                  [
                    'id',
                    <>
                      <b>Facebook Page ID</b>
                    </>,
                  ],
                  [
                    'access_token',
                    <>
                      <b>Page Access Token</b>. Artha માં આ જ નાખવાનો છે.
                    </>,
                  ],
                  [
                    'instagram_business_account.id',
                    <>
                      <b>Instagram Business Account ID</b> (સામાન્ય રીતે <code>1784…</code> થી શરૂ થાય)
                    </>,
                  ],
                ]}
              />
              <Ok>
                <b>ચકાસો:</b> Page token ને Access Token Debugger માં નાખો. <b>Expires</b> માં <b>Never</b> દેખાય તો
                બરાબર છે.
              </Ok>
              <Warn>
                <b>Instagram ID ન દેખાય તો:</b> Instagram ને Page સાથે જોડવાનું (ભાગ 1) અથવા token બનાવતી વખતે Instagram
                account પસંદ કરવાનું રહી ગયું છે.
              </Warn>
              <details className="sg-details">
                <summary>Agency કે મોટા business માટે: કાયમી System User token (વૈકલ્પિક)</summary>
                <ul>
                  <li>
                    <Ext href="https://business.facebook.com/settings">Business Settings</Ext> → <b>Users</b> →{' '}
                    <b>System users</b> → <b>Add</b> → role <b>Admin</b>.
                  </li>
                  <li>
                    <b>Assign assets</b> → Page અને Instagram account, <b>Full control</b> સાથે. <b>Apps</b> માં તમારી App
                    → <b>Manage app</b>.
                  </li>
                  <li>
                    <b>Generate new token</b> → App પસંદ કરો → ઉપરની બધી permissions ટિક કરો → token copy કરો.
                  </li>
                  <li>
                    Meta કેટલાક business ને 60 દિવસે બંધ થતો token જ આપે છે. તો 60 દિવસ પહેલાં નવો token બનાવી{' '}
                    <b>Edit</b> થી બદલો.
                  </li>
                </ul>
              </details>
            </>
          ),
        },
      ],
    },
    {
      title: 'ભાગ 4 · Artha માં account જોડો',
      intro: 'Instagram અને Facebook Page અહીં બે અલગ accounts તરીકે ઉમેરાય છે. બંને વાપરવા હોય તો બંને ઉમેરો.',
      steps: [
        {
          id: 'artha-connect',
          title: 'Connected Accounts માં account ઉમેરો',
          body: (
            <>
              <p>
                <button type="button" className="btn btn-primary btn-sm" onClick={onConnectAccount}>
                  <Plus size={14} /> Connect Account ખોલો
                </button>
              </p>
              <p>
                <b>Instagram માટે:</b>
              </p>
              <FieldTable
                label="Instagram માટે ખાનાં"
                rows={[
                  ['Platform', 'Instagram Business / Creator'],
                  ['Account Label', 'ઓળખ માટેનું નામ (ખાલી રાખો તો Instagram નું નામ આવી જશે)'],
                  ['Instagram Business Account ID', 'ભાગ 3 નું instagram_business_account.id'],
                  ['Linked Facebook Page ID', 'ભાગ 3 નું Page id'],
                  ['Meta Long-Lived Access Token', 'ભાગ 3 નો Page access_token'],
                ]}
              />
              <p>
                <b>Facebook Page માટે:</b>
              </p>
              <FieldTable
                label="Facebook Page માટે ખાનાં"
                rows={[
                  ['Platform', 'Facebook Page'],
                  ['Facebook Page ID', 'ભાગ 3 નું Page id'],
                  ['Meta Long-Lived Access Token', 'એ જ Page access_token'],
                ]}
              />
              <ul>
                <li>
                  <b>Connect Account</b> દબાવો, પછી account ની લીટીમાં <b>Test</b> દબાવો.
                </li>
                <li>
                  લીલો સંદેશ <b>Posting and comment webhooks are ready</b> આવે તો બધું બરાબર છે.
                </li>
              </ul>
              <Ok>
                <b>Artha આપમેળે શું કરે છે:</b> User token નાખ્યો હોય તો એને Page token માં બદલી નાખે છે, અને Page ને તમારી
                Meta App સાથે જોડી દે છે, જેથી comments ની ખબર આવવા લાગે.
              </Ok>
              <Warn>
                <b>Test માં &quot;Webhooks off&quot; દેખાય તો:</b> token માં <code>pages_manage_metadata</code> permission રહી
                ગઈ છે. Token ફરી બનાવો → <b>Edit</b> → નવો token → <b>Save Changes</b> → ફરી <b>Test</b>.
              </Warn>
            </>
          ),
        },
      ],
    },
    {
      title: 'ભાગ 5 · Comments ની ખબર ચાલુ કરો (Webhook) અને App Live કરો',
      intro: 'Auto-reply માટે આ ભાગ જરૂરી છે. ફક્ત post મૂકવી હોય તો Step 18 નું Live કરવું પૂરતું છે.',
      steps: [
        {
          id: 'hook',
          title: 'Meta App માં webhook ઉમેરો',
          body: (
            <>
              <p>Callback URL:</p>
              <CopyBlock label="callback URL" text={webhookUrl} />
              <p>Verify token:</p>
              {verifyTokens.length === 0 ? (
                <Warn>પહેલાં ભાગ 4 માં account ઉમેરો. Verify token ત્યારે જ બને છે.</Warn>
              ) : (
                verifyTokens.map(v => (
                  <div key={v.id} className="sg-token">
                    <span className="sa-help">{v.name}</span>
                    <CopyBlock label={`verify token for ${v.name}`} text={v.token} />
                  </div>
                ))
              )}
              <ul>
                <li>
                  Meta App dashboard → ડાબી બાજુ <b>Webhooks</b>.
                </li>
                <li>
                  Dropdown માં <b>Instagram</b> → <b>Subscribe to this object</b> → Callback URL અને Verify token paste કરો
                  → <b>Verify and save</b>.
                </li>
                <li>
                  List માં <b>comments</b> ની સામે <b>Subscribe</b>.
                </li>
                <li>
                  Dropdown માં <b>Page</b> → એ જ URL અને token → <b>Verify and save</b> → <b>feed</b> ની સામે{' '}
                  <b>Subscribe</b>.
                </li>
              </ul>
              <Warn>
                <b>&quot;Verify and save&quot; fail થાય તો:</b> (1) Artha માં account પહેલાં ઉમેરો. (2) URL{' '}
                <code>https://</code> થી શરૂ થાય અને browser માં ખૂલે એ તપાસો. (3) Token માં આગળ-પાછળ space ન આવે.
              </Warn>
            </>
          ),
        },
        {
          id: 'live',
          title: 'App ને Live mode માં મૂકો',
          body: (
            <>
              <ul>
                <li>
                  Meta App dashboard ની ઉપર <b>App Mode</b> માં <b>Development</b> થી <b>Live</b> કરો.
                </li>
                <li>Meta કંઈ ખૂટતું બતાવે (Privacy Policy, icon, category) તો App settings માં ભરો અને ફરી પ્રયત્ન કરો.</li>
              </ul>
              <Warn>
                <b>ધ્યાન રાખો:</b> Development mode માં Meta comments ની ખબર મોકલતું જ નથી. Auto-reply ન ચાલવાનું સૌથી
                સામાન્ય કારણ આ જ છે.
              </Warn>
            </>
          ),
        },
      ],
    },
    {
      title: 'ભાગ 6 · બધું ચાલે છે કે નહીં, ચકાસો',
      steps: [
        {
          id: 'check-post',
          title: 'પહેલી post મૂકી જુઓ',
          body: (
            <>
              <ul>
                <li>
                  ઉપર <b>New Post</b> → platform, photo નું <b>public https link</b> અને caption.
                </li>
                <li>
                  <b>Publish Immediately</b> ટિક રાખીને save કરો. થોડી સેકન્ડમાં post દેખાશે.
                </li>
              </ul>
              <Warn>
                <b>Photo ના નિયમ:</b> Instagram માટે photo <b>JPEG (.jpg)</b> જ ચાલે. Link login વગર browser માં ખૂલવું
                જોઈએ, Google Drive નું share link નહીં ચાલે. Reel માટે <b>Video / Reel</b> પસંદ કરો, તૈયાર થવામાં 1-3
                મિનિટ લાગી શકે.
              </Warn>
            </>
          ),
        },
        {
          id: 'check-rule',
          title: 'Auto-reply rule બનાવો અને simulator માં ચકાસો',
          body: (
            <ul>
              <li>
                <b>Auto-Reply &amp; Like Rules</b> → <b>New Rule</b> → keywords <code>price, rate, kitna</code> → reply
                લખો → <b>Save Rule</b>.
              </li>
              <li>
                <b>Comment Simulator &amp; Logs</b> માં comment લખીને જુઓ કે કયો rule લાગે છે. આમાં Meta પર કંઈ મોકલાતું
                નથી.
              </li>
            </ul>
          ),
        },
        {
          id: 'check-real',
          title: 'સાચો comment કરીને ચકાસો',
          why: 'Business account ના પોતાના comments ને Artha જાણી જોઈને જવાબ નથી આપતું, જેથી reply પર reply નો loop ન બને.',
          body: (
            <ul>
              <li>
                <b>બીજા</b> Instagram account થી (business account પોતે નહીં) તમારી post પર <code>price?</code> comment
                કરો.
              </li>
              <li>આશરે 5-15 સેકન્ડમાં reply આવી જશે, અને Logs માં દેખાશે.</li>
            </ul>
          ),
        },
      ],
    },
  ];
}

const TROUBLES: [string, ReactNode[]][] = [
  [
    'Test દબાવતાં "Invalid OAuth access token" આવે છે',
    [
      'Token ખોટો copy થયો છે કે બંધ થઈ ગયો છે. ભાગ 3 ફરી કરો.',
      <>
        <b>Edit</b> → નવો token → <b>Save Changes</b>. Token ખાલી રાખો તો જૂનો token જ રહે છે.
      </>,
    ],
  ],
  [
    '"(#10)" કે "(#200) permission" વાળી error આવે છે',
    [
      'Token માં કોઈ permission ખૂટે છે. ભાગ 3 ની list સાથે મેળવો અને token ફરી બનાવો.',
      'Facebook ની window માં Page / Instagram પસંદ કરવાનું રહી ગયું હોય તો પણ આ error આવે.',
    ],
  ],
  [
    'Post fail થાય છે',
    [
      'Instagram photo JPEG નથી, અથવા link public નથી.',
      'Facebook account માં two-factor authentication બંધ છે.',
      <>
        Page પર <b>Page Publishing Authorization</b> બાકી છે: Facebook જે verification માગે એ પૂરું કરો.
      </>,
      'Instagram 24 કલાકમાં API થી મર્યાદિત posts જ (Meta ના docs માં 50 થી 100) મૂકવા દે છે.',
    ],
  ],
  [
    'Comments નો reply નથી આવતો',
    [
      <>
        Meta App <b>Live</b> નથી.
      </>,
      <>
        Server પર <code>META_APP_SECRET</code> નથી, અથવા પછી server restart નથી કર્યું.
      </>,
      <>
        Instagram account <b>Private</b> છે.
      </>,
      <>
        Webhook માં <b>comments</b> (Instagram) કે <b>feed</b> (Page) subscribe નથી.
      </>,
      <>
        <b>Test</b> દબાવો. &quot;Webhooks off&quot; દેખાય તો <code>pages_manage_metadata</code> ખૂટે છે.
      </>,
      'Rule Paused છે, અથવા keyword મેળ ખાતો નથી. Simulator માં ચકાસો.',
      'Comment business account પોતે કરે છે. બીજા account થી કરો.',
    ],
  ],
  [
    'Auto-like Instagram પર નથી થતું',
    ['Instagram ના API માં comment like કરવાની સગવડ જ નથી. Auto-like ફક્ત Facebook Page ના comments પર ચાલે છે.'],
  ],
  [
    'Auto-DM નથી જતું',
    [
      <>
        Instagram માં <b>Allow access to messages</b> બંધ છે.
      </>,
      <>
        Token માં <code>pages_messaging</code> અને <code>instagram_manage_messages</code> નથી.
      </>,
      'Meta એક comment પર ફક્ત એક જ DM, અને comment થયાના 7 દિવસની અંદર જ મોકલવા દે છે.',
    ],
  ],
  [
    'પહેલાં ચાલતું હતું, હવે અચાનક બંધ થઈ ગયું',
    [
      'Facebook password બદલ્યો હોય, Page admin માંથી કોઈને કાઢ્યા હોય કે App ની permission હટાવી હોય તો Meta token બંધ કરી દે છે.',
      <>
        ભાગ 3 ફરી કરો અને <b>Edit</b> થી નવો token મૂકો.
      </>,
    ],
  ],
];

export function SetupGuide(props: SetupGuideProps) {
  const [done, setDone] = useState<string[]>(loadDone);
  useEffect(() => saveDone(done), [done]);

  const stages = buildStages(props);
  const total = stages.reduce((n, s) => n + s.steps.length, 0);
  const finished = stages.reduce((n, s) => n + s.steps.filter(st => done.includes(st.id)).length, 0);
  const toggle = (id: string) => setDone(d => (d.includes(id) ? d.filter(x => x !== id) : [...d, id]));
  const stepNumber = new Map(stages.flatMap(s => s.steps).map((st, i) => [st.id, i + 1]));

  return (
    <div className="sg">
      <div className="sa-panel sg-intro">
        <h3>Instagram અને Facebook Page જોડવાની પૂરી રીત</h3>
        <p className="sa-help">
          એક પછી એક step કરો અને પૂરું થાય એટલે ખાનું ✔ કરો. Meta ની website અંગ્રેજીમાં છે, એટલે દબાવવાના button નાં
          નામ <b>bold</b> માં અંગ્રેજીમાં લખ્યાં છે. આશરે 45 મિનિટ લાગશે, computer પર કરવું સહેલું છે.
        </p>
        <div className="sg-progress" aria-live="polite">
          <div className="sg-bar" aria-hidden="true">
            <span style={{ width: `${total ? (finished / total) * 100 : 0}%` }} />
          </div>
          <span className="sg-count">
            {finished} / {total} પૂરા
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDone([])}>
            <RotateCcw size={12} /> ફરી શરૂ
          </button>
        </div>
      </div>

      {stages.map(stage => (
        <section key={stage.title} className="sg-stage" aria-label={stage.title}>
          <div className="sg-stage-head">
            <h3>{stage.title}</h3>
            {stage.intro && <p className="sa-help">{stage.intro}</p>}
          </div>
          {stage.steps.map(step => {
            const number = stepNumber.get(step.id) ?? 0;
            const checked = done.includes(step.id);
            const inputId = `sg-${step.id}`;
            return (
              <article key={step.id} className={`sg-step ${checked ? 'done' : ''}`}>
                <div className="sg-check">
                  <span className="sg-num">{number}</span>
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(step.id)}
                    aria-label={`Step ${number} પૂરું`}
                  />
                </div>
                <div className="sg-body">
                  <label htmlFor={inputId} className="sg-title">
                    {step.title}
                  </label>
                  {step.why && <p className="sa-help">{step.why}</p>}
                  {step.body}
                </div>
              </article>
            );
          })}
        </section>
      ))}

      <section className="sg-stage" aria-label="કંઈ ન ચાલે તો">
        <div className="sg-stage-head">
          <h3>કંઈ ન ચાલે તો</h3>
          <p className="sa-help">તમારો problem દબાવીને ઉકેલ જુઓ.</p>
        </div>
        {TROUBLES.map(([q, answers]) => (
          <details key={q} className="sg-details">
            <summary>{q}</summary>
            <ul>
              {answers.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </details>
        ))}
      </section>

      <p className="sa-help">
        Meta તેની website નાં બટનનાં નામ ક્યારેક બદલે છે. કોઈ નામ બરાબર ન મળે તો એના જેવો જ અર્થ ધરાવતો વિકલ્પ શોધો.
      </p>
    </div>
  );
}
