import vision from "@google-cloud/vision";
import { env } from "../config/env.js";

const client = new vision.ImageAnnotatorClient({
  projectId: env.googleProjectId
});

export const extractTextFromImage = async (imageBuffer: Buffer): Promise<string> => {
  const [result] = await client.textDetection({
    image: { content: imageBuffer }
  });

  return result.fullTextAnnotation?.text ?? result.textAnnotations?.[0]?.description ?? "";
};
