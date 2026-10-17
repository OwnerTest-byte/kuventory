import { describe, it, expect } from 'vitest';
import { normalizeImageUrl } from '../components/ImageUploadInput';

describe('normalizeImageUrl Utility', () => {
  it('returns empty string on empty input', () => {
    expect(normalizeImageUrl('')).toBe('');
    expect(normalizeImageUrl('   ')).toBe('');
  });

  it('preserves data:image URLs without alteration', () => {
    const dataUrl = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v39';
    expect(normalizeImageUrl(dataUrl)).toBe(dataUrl);
  });

  it('auto-prefixes https:// to scheme-less web URLs', () => {
    expect(normalizeImageUrl('example.com/photos/latte.jpg')).toBe('https://example.com/photos/latte.jpg');
    expect(normalizeImageUrl('images.unsplash.com/photo-1514432324607-a09d9b4aefdd')).toBe('https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd');
  });

  it('transforms Google Drive file share URLs to direct content URLs', () => {
    const shareUrl = 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view?usp=sharing';
    const transformed = normalizeImageUrl(shareUrl);
    expect(transformed).toBe('https://lh3.googleusercontent.com/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');

    const openUrl = 'https://drive.google.com/open?id=123ABC_xyz';
    expect(normalizeImageUrl(openUrl)).toBe('https://lh3.googleusercontent.com/d/123ABC_xyz');
  });

  it('transforms Imgur page URLs to direct image URLs', () => {
    expect(normalizeImageUrl('https://imgur.com/ABC1234')).toBe('https://i.imgur.com/ABC1234.jpg');
    expect(normalizeImageUrl('https://www.imgur.com/gallery/XYZ789')).toBe('https://i.imgur.com/XYZ789.jpg');
  });

  it('transforms Dropbox URLs to direct download raw URLs', () => {
    const dropUrl = 'https://www.dropbox.com/s/xyz123/coffee.jpg?dl=0';
    expect(normalizeImageUrl(dropUrl)).toBe('https://www.dropbox.com/s/xyz123/coffee.jpg?raw=1');
  });

  it('extracts direct image URL from Google Images search result URLs', () => {
    const googleImgUrl = 'https://www.google.com/imgres?imgurl=https%3A%2F%2Fexample.com%2Fbeans.jpg&imgrefurl=https%3A%2F%2Fexample.com';
    expect(normalizeImageUrl(googleImgUrl)).toBe('https://example.com/beans.jpg');
  });

  it('transforms GitHub blob URLs to raw user content URLs', () => {
    const ghUrl = 'https://github.com/user/repo/blob/main/photos/cup.png';
    expect(normalizeImageUrl(ghUrl)).toBe('https://raw.githubusercontent.com/user/repo/main/photos/cup.png');
  });

  it('transforms Postimages page URLs to direct image URLs', () => {
    const postimgUrl = 'https://postimg.cc/ABCD1234';
    expect(normalizeImageUrl(postimgUrl)).toBe('https://i.postimg.cc/ABCD1234/image.jpg');
  });

  it('transforms Wikimedia Commons File page URLs to Special:FilePath URLs', () => {
    const wikiUrl = 'https://commons.wikimedia.org/wiki/File:Espresso.jpg';
    expect(normalizeImageUrl(wikiUrl)).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Espresso.jpg');
  });
});
