import type { PosterTemplate } from './readyMade';

export interface AgentBrand {
  name: string;
  phone: string;
}

const SIZE = 1080;
const FOOTER = 200;
const FONT = "'Segoe UI', 'Nirmala UI', 'Noto Sans Gujarati', 'Noto Sans Devanagari', 'Noto Sans', sans-serif";
const LOGO_URL = `${import.meta.env.BASE_URL}branding/padosi-agent-logo.png`;

let logo: Promise<HTMLImageElement> | null = null;
function loadLogo(): Promise<HTMLImageElement> {
  logo ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      logo = null;
      reject(new Error('Could not load the Padosi Agent logo'));
    };
    img.src = LOGO_URL;
  });
  return logo;
}

/** Greedy word wrap; explicit \n starts a new line. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Shrinks the font until the text fits in `maxLines` lines. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, start: number, maxWidth: number, maxLines: number) {
  let size = start;
  let lines: string[];
  do {
    ctx.font = `${weight} ${size}px ${FONT}`;
    lines = wrap(ctx, text, maxWidth);
    size -= 4;
  } while (lines.length > maxLines && size > 28);
  return { lines, size: size + 4 };
}

/** Draws a 1080×1080 Padosi Agent branded poster and returns it as a JPEG data URL. */
export async function renderPoster(t: PosterTemplate, brand: AgentBrand): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser');

  // Background gradient with soft circles.
  const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE - FOOTER);
  bg.addColorStop(0, t.colors[0]);
  bg.addColorStop(1, t.colors[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (const [x, y, r] of [
    [960, 120, 260],
    [80, 760, 200],
    [1000, 760, 120],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const pad = 80;
  const width = SIZE - pad * 2;

  // Tag pill.
  ctx.font = `700 30px ${FONT}`;
  const tagW = ctx.measureText(t.tag).width + 48;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.roundRect(pad, 70, tagW, 56, 28);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(t.tag, pad + 24, 99);

  // Emoji.
  ctx.textBaseline = 'alphabetic';
  ctx.font = `150px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', ${FONT}`;
  ctx.fillText(t.emoji, pad - 6, 320);

  // Headline + sub line.
  const head = fit(ctx, t.headline, 800, 84, width, 3);
  let y = 400 + head.size * 0.4;
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${head.size}px ${FONT}`;
  for (const line of head.lines) {
    ctx.fillText(line, pad, y);
    y += head.size * 1.18;
  }
  const sub = fit(ctx, t.sub, 500, 40, width, 4);
  y += 20;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = `500 ${sub.size}px ${FONT}`;
  for (const line of sub.lines) {
    ctx.fillText(line, pad, y);
    y += sub.size * 1.35;
  }

  // White footer: logo left, agent contact right.
  const top = SIZE - FOOTER;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, top, SIZE, FOOTER);
  ctx.fillStyle = t.colors[1];
  ctx.fillRect(0, top, SIZE, 8);
  const img = await loadLogo();
  const logoH = 96;
  const logoW = (img.width / img.height) * logoH;
  ctx.drawImage(img, 50, top + 34, logoW, logoH);

  ctx.textAlign = 'right';
  const right = SIZE - 50;
  const name = brand.name.trim();
  const phone = brand.phone.trim();
  ctx.fillStyle = '#0f2a44';
  if (name || phone) {
    ctx.font = `700 38px ${FONT}`;
    if (name) ctx.fillText(name, right, top + (phone ? 72 : 92));
    ctx.font = `600 34px ${FONT}`;
    ctx.fillStyle = '#17705a';
    if (phone) ctx.fillText(`📞 ${phone}`, right, top + (name ? 120 : 92));
  } else {
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText('padosiagent.com', right, top + 92);
  }
  if (!t.greeting) {
    ctx.fillStyle = '#64748b';
    ctx.font = `400 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('Insurance is the subject matter of solicitation.', SIZE / 2, SIZE - 22);
  }
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/jpeg', 0.92);
}
