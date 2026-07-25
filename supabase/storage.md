# Storage Buckets

Create these private Supabase Storage buckets:

- `avatars` for profile images
- `voice-messages` for audio clips
- `stories` for story images and videos

Files are stored below the authenticated user's ID:

```text
voice-messages/{user-id}/{file-id}.webm
stories/{user-id}/{file-id}.jpg
avatars/{user-id}/{file-id}.jpg
```

Users should only upload to paths prefixed with their own auth user ID. The frontend generates a
signed URL after upload. In production, generate short-lived voice-message URLs in the Java backend
after checking conversation membership. Do not make private voice messages permanently public.
