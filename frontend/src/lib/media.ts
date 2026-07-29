import { isSupabaseConfigured, supabase } from "./supabase";

export async function storeMedia(bucket: "avatars" | "voice-messages" | "stories", file: Blob, extension: string) {
  if (!isSupabaseConfigured) {
    return URL.createObjectURL(file);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Sign in before uploading media.");

  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;

  const { data, error: signedUrlError } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
  if (signedUrlError) throw signedUrlError;
  return data.signedUrl;
}
