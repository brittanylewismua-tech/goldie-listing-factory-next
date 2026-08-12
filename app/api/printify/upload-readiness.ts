export type UploadedImage = {
  id: string;
  file_name?: string;
  height?: number;
  width?: number;
  size?: number;
  mime_type?: string;
  preview_url?: string;
  upload_time?: string;
};

export function uploadedImageIsReady(image: UploadedImage | null | undefined) {
  return Boolean(image?.id && image.preview_url && Number(image.width) > 0 && Number(image.height) > 0);
}
