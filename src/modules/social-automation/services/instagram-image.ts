import sharp from 'sharp';

// Instagram feed photos: aspect ratio 4:5 (portrait) to 1.91:1 (landscape), width 320-1440px, JPEG only.
const MIN_RATIO = 4 / 5;
const MAX_RATIO = 1.91;
const MIN_WIDTH = 320;
const MAX_WIDTH = 1440;

/** The canvas Instagram accepts for a w×h photo: same ratio when allowed, else the nearest allowed one. */
export function instagramFrame(width: number, height: number): { width: number; height: number } {
  const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
  const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
  return { width: w, height: Math.round(w / ratio) };
}

/**
 * Turns any photo into one Instagram accepts: JPEG, allowed size, allowed aspect ratio. A photo that is
 * too tall or too wide is fitted whole onto a white canvas (nothing is cropped away).
 */
export async function fitForInstagram(input: Buffer): Promise<Buffer> {
  const image = sharp(input, { failOn: 'none' }).rotate(); // apply EXIF orientation first
  const { width, height } = await image
    .metadata()
    .then(m =>
      (m.orientation ?? 1) >= 5 ? { width: m.height, height: m.width } : { width: m.width, height: m.height },
    );
  if (!width || !height) throw new Error('Could not read the image size');
  const frame = instagramFrame(width, height);
  return image
    .resize(frame.width, frame.height, { fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
