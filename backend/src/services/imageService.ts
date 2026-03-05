import sharp from "sharp";

export const preprocessForOcr = async (input: Buffer, adaptiveThreshold = true): Promise<Buffer> => {
  let pipeline = sharp(input)
    .rotate()
    .grayscale()
    .normalize()
    .modulate({ brightness: 1.08 })
    .linear(1.1, -10)
    .sharpen();

  if (adaptiveThreshold) {
    pipeline = pipeline.threshold(180);
  }

  return pipeline.png().toBuffer();
};

export const compressForStorage = async (input: Buffer): Promise<Buffer> =>
  sharp(input)
    .rotate()
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 65, mozjpeg: true })
    .toBuffer();
