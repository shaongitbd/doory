# S3-compatible object storage

## What it does

Stores media (uploads, fonts, element packs, audio, models) in an S3-compatible bucket instead of the local
`media` volume or `MEDIA_ROOT`. Use it when you run more than one server or want media off the host.

## Requirements

A bucket and an access key from any S3-compatible service, hosted or self-hosted.

## Turn it on

```ini
USE_S3=true
AWS_STORAGE_BUCKET_NAME=doory-media
AWS_S3_ENDPOINT_URL=https://s3.example.com     # leave empty for the default endpoint
AWS_S3_REGION_NAME=eu-central-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Restart the services, then run the [content](../self-hosting/content.md) commands again so fonts, packs, audio
and models are copied into the bucket.

Server-side exports waiting to be downloaded stay on local disk (`EXPORT_STORAGE_ROOT`), not in the bucket.

## Settings

See [Media storage in configuration.md](../self-hosting/configuration.md#media-storage-and-per-user-limits).

## Check it works

Upload an image in the editor, then check that it appears in the bucket.

## Troubleshooting

- **Images don't load in the editor:** Doory links to files with plain, unsigned URLs, so the bucket (or a CDN
  in front of it) must allow public reads, and its CORS settings must allow `SITE_URL`.
- **Video clips don't play, or the video export fails with a "tainted" error:** clips are streamed in pieces, so
  the bucket's CORS rule must also allow the `Range` request header and expose `Content-Range`,
  `Accept-Ranges` and `Content-Length`. For example, for S3:

  ```json
  [{"AllowedOrigins": ["https://doory.example.com"], "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"], "ExposeHeaders": ["Content-Range", "Accept-Ranges", "Content-Length"]}]
  ```
- **Moving an existing site:** copy the contents of the `media` volume into the bucket before switching
  `USE_S3` on.
