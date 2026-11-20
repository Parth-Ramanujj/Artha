import sharp from 'sharp';
import { fitForInstagram, instagramFrame } from './instagram-image';

describe('instagramFrame', () => {
  it('keeps an allowed ratio and size', () => {
    expect(instagramFrame(1080, 1080)).toEqual({ width: 1080, height: 1080 });
  });
  it('pads a phone screenshot (9:16) to 4:5', () => {
    expect(instagramFrame(1080, 1920)).toEqual({ width: 1080, height: 1350 });
  });
  it('pads a wide banner to 1.91:1 and caps width at 1440', () => {
    expect(instagramFrame(3000, 1000)).toEqual({ width: 1440, height: 754 });
  });
  it('raises a tiny photo to the 320px minimum width', () => {
    expect(instagramFrame(100, 100)).toEqual({ width: 320, height: 320 });
  });
});

describe('fitForInstagram', () => {
  it('turns a tall PNG into a 4:5 JPEG', async () => {
    const png = await sharp({ create: { width: 600, height: 1600, channels: 4, background: '#ff0000' } })
      .png()
      .toBuffer();
    const meta = await sharp(await fitForInstagram(png)).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width / meta.height).toBeCloseTo(0.8, 2);
  });
});
