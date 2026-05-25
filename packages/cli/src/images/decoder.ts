import sharp from 'sharp';
import { ImageRecord } from './types.js';
import pc from 'picocolors';

export async function decodeImageMetadata(
  record: ImageRecord,
  buffer: Buffer
): Promise<void> {
  // Only decode successful image content type responses
  if (record.statusCode !== 200) {
    return;
  }

  const isImage = record.contentType?.startsWith('image/') || 
                  /\.(jpg|jpeg|png|gif|webp|svg|avif)/i.test(record.src);
  if (!isImage) {
    return;
  }

  try {
    const sharpInstance = sharp(buffer);
    const metadata = await sharpInstance.metadata();

    record.decodedFormat = metadata.format;
    record.decodedWidth = metadata.width;
    record.decodedHeight = metadata.height;
    record.isAnimated = metadata.pages ? metadata.pages > 1 : false;
    record.hasAlpha = metadata.hasAlpha;

    // Generate base64 thumbnail (max 120px)
    try {
      const thumbBuffer = await sharp(buffer)
        .resize(120, 120, { fit: 'inside' })
        .toBuffer();
      record.thumbnail = `data:image/${metadata.format || 'png'};base64,${thumbBuffer.toString('base64')}`;
    } catch {
      // Ignore thumbnail generation errors (e.g. for svgs or corrupt assets)
    }

    // Estimate JPEG Quality (Smart Heuristic)
    if (metadata.format === 'jpeg' && metadata.width && metadata.height && record.bytes) {
      try {
        const stats = await sharpInstance.stats();
        const entropy = stats.channels.reduce((acc, c) => acc + (c as any).entropy, 0) / stats.channels.length;
        const bpp = record.bytes / (metadata.width * metadata.height);
        // Heuristic: bpp (bytes per pixel) divided by entropy
        const ratio = bpp / (entropy || 1);
        record.estimatedQuality = Math.min(100, Math.max(10, Math.round(ratio * 400)));
      } catch {
        // Fallback simple bpp
        const bpp = record.bytes / (metadata.width * metadata.height);
        record.estimatedQuality = Math.min(100, Math.max(10, Math.round(bpp * 250)));
      }
    }
  } catch (err: any) {
    record.decodeFailed = true;
    record.decodeError = err.message || 'Failed to decode image';
  }
}

export async function decodeAllImages(images: ImageRecord[]): Promise<void> {
  console.log(pc.cyan(`\n🎨  Decoding ${images.length} images using sharp...`));

  for (const record of images) {
    const buffer = (record as any)._tempBuffer;
    if (buffer) {
      await decodeImageMetadata(record, buffer);
      // Delete temporary buffer to prevent memory bloat
      delete (record as any)._tempBuffer;
    }
  }
}
