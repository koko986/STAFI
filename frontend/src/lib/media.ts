import { isSupabaseConfigured, supabase } from "./supabase";
import { apiUpload } from "./api";

export type StoredMedia = {
  path: string;
  url: string;
};

export async function uploadMedia(
  bucket: "avatars" | "voice-messages" | "stories" | "chat-files",
  file: Blob,
  extension: string
): Promise<StoredMedia> {
  if (!isSupabaseConfigured) {
    const url = URL.createObjectURL(file);
    return { path: url, url };
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in before uploading media.");

  return apiUpload<StoredMedia>(
    `/api/media/${bucket}`,
    file,
    `upload.${extension.replace(/[^a-z0-9]/gi, "") || "bin"}`
  );
}

export async function storeMedia(
  bucket: "avatars" | "voice-messages" | "stories" | "chat-files",
  file: Blob,
  extension: string
) {
  return (await uploadMedia(bucket, file, extension)).url;
}
