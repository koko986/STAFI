# Storage Buckets

The app uses these Supabase Storage buckets:

- `avatars` for public profile images
- `voice-messages` for audio clips
- `stories` for story images and videos

Files are stored below the authenticated user's ID:

```text
voice-messages/{user-id}/{file-id}.webm
stories/{user-id}/{file-id}.jpg
avatars/{user-id}/{file-id}.jpg
```

The frontend sends media to the authenticated Java endpoint at `/api/media/{bucket}`. The backend
validates the file, stores it with the Supabase server secret, and prefixes the path with the
authenticated user's ID. Avatar URLs are public. Voice messages and stories use signed URLs and
remain private.

Never put `SUPABASE_SECRET_KEY` in the frontend environment or browser code.
