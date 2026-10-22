# Video clips

## What it does

People can put video clips in their designs: their own uploads, or stock videos from Pexels and Pixabay (see
[stock-media.md](../integrations/stock-media.md#videos)). The server checks every clip with `ffprobe` and makes it
web-ready with `ffmpeg`, so every browser can play it and the editor can scrub and export it quickly:

- **Every clip ends up the same:** H.264 video with AAC sound in an MP4, at most 1920 by 1080 (1080 by 1920 for
  portrait clips).
- **A clip that is already like that** (most phone recordings from Android, screen recordings, stock videos) is
  only rewrapped. That takes a second or two, and the upload answers when it's done. It keeps the key frames
  it came with.
- **Anything else** (iPhone HEVC and HDR clips, 4K, ProRes, VP9, AVI and so on) is converted in the background,
  with a key frame every two seconds.
  The upload answers right away with `status: processing`, and the editor shows the clip as soon as it is
  `ready`. A five-minute 4K iPhone clip takes about a minute on a few CPU cores.
- **Each clip also gets** a poster (the frame that thumbnails, PNG and PDF downloads and the server's image export
  show), a filmstrip for the timeline, and its sound as a separate file for the audio mix.

The clip and these files count against the person's storage quota (`USER_STORAGE_QUOTA_BYTES`).

## Requirements

- **Docker:** `INSTALL_FFMPEG=true` (the default) builds ffmpeg into the image, which adds about 250 MB. The
  `api`, `realtime` and `mcp` services are built from the same Dockerfile, so all three images have it; only
  `api` converts clips.
- **Without Docker:** install the `ffmpeg` package (it includes `ffprobe`):

  ```bash
  sudo apt install ffmpeg
  ```

Without ffmpeg, the server takes no video: uploads of video files are refused as before, and the Videos tool
shows no stock tab. Set `VIDEO_ENABLED=false` to turn video off on a server that has ffmpeg.

## Settings

See [Video clips in configuration.md](configuration.md#video-clips). The ones you are most likely to change:

```ini
MAX_VIDEO_UPLOAD_BYTES=209715200      # 200 MB per clip
MAX_VIDEO_DURATION_SECONDS=600        # 10 minutes, the video export's own limit
VIDEO_MAX_CONCURRENCY=2               # clips worked on at once in each API process
VIDEO_FFMPEG_THREADS=2                # threads one conversion's encoder uses
VIDEO_MAX_PROCESSING_PER_USER=3       # clips one person can have converting at once
```

Uploads go through nginx, which limits request bodies. The configurations in this repository allow 210 MB for
`/api/v1/assets/` and 30 MB elsewhere. If you raise `MAX_VIDEO_UPLOAD_BYTES`, raise `client_max_body_size` in
the `location = /api/v1/assets/` block too.

Converting is CPU-heavy. Each API process runs ffmpeg on at most `VIDEO_MAX_CONCURRENCY` clips at a time.
When that is 2 or more, one of those places is kept for clips that only need rewrapping, so an upload from a
phone never waits behind a conversion that takes minutes: the process converts at most
`VIDEO_MAX_CONCURRENCY` minus one clips at once, and more wait their turn. The limit is per process: the whole
server works on up to `VIDEO_MAX_CONCURRENCY` times the number of API workers at once (`WEB_CONCURRENCY` with
Docker, `--workers` in `doory-api.service` without, 3 by default). Each conversion's encoder uses
`VIDEO_FFMPEG_THREADS` threads and decoding the source takes a little more, so plan for about workers times
`VIDEO_MAX_CONCURRENCY` times `VIDEO_FFMPEG_THREADS` busy cores at the peak. On a small server, keep
`VIDEO_MAX_CONCURRENCY` at 1 or 2.

One person can have at most `VIDEO_MAX_PROCESSING_PER_USER` clips converting at once. Another upload or stock
video that needs converting is refused (429, `too_many_conversions`) until one of them is done. Clips that
only need rewrapping don't count.

A conversion never writes more than `MAX_VIDEO_DURATION_SECONDS` of video or a file larger than twice
`MAX_VIDEO_UPLOAD_BYTES`, whatever the source claims. A clip that would be larger is refused.

If you store media in S3-compatible storage, the bucket's CORS settings must also allow range requests: see
[object-storage.md](../integrations/object-storage.md).

## Check it works

1. In the editor, open **Videos** and upload a short clip from a phone.
2. It appears in the list, then turns into a thumbnail. An iPhone clip shows a spinner first.
3. Run `docker compose exec api ffmpeg -version`, or `ffmpeg -version` without Docker. Either should print a
   version.

## Troubleshooting

- **A clip stays "processing", then fails with "The conversion was interrupted":** the API process stopped
  while it was converting (a restart or a deployment). Upload the clip again. `python manage.py
  sweep_video_jobs` marks such clips failed straight away. Otherwise they are marked when someone opens them.
  The sweep also removes the temporary folders such conversions leave in `VIDEO_WORK_DIR`, so it's worth
  running every hour (see [Scheduled tasks](README.md#scheduled-tasks)). An ffmpeg left running by a killed
  API process finishes its clip, and stops itself at the latest after `VIDEO_TRANSCODE_TIMEOUT_SECONDS` of CPU
  time for each core.
- **"The server is busy converting other videos":** every ffmpeg place stayed busy for 20 seconds, which
  can only happen to a clip that needs no conversion when `VIDEO_MAX_CONCURRENCY` is 1 or many such clips
  arrive at once. Raise `VIDEO_MAX_CONCURRENCY` if the server has spare CPU.
- **"You have several videos converting already":** the person has `VIDEO_MAX_PROCESSING_PER_USER` clips
  converting. They can upload more once one is ready.
- **Uploads of large clips fail with 413 before they start:** nginx's `client_max_body_size` is lower than the
  clip (see above).
- **HDR clips look flat:** the ffmpeg build has no `zscale` filter (zimg), so HDR is converted without tone
  mapping. Debian's and Ubuntu's ffmpeg include it. Some other builds don't.

## Licence

Debian's `ffmpeg` package is licensed under the GPL. Doory doesn't link to it or include its code: it runs the
`ffmpeg` and `ffprobe` commands as separate programs (see [THIRD_PARTY.md](../../THIRD_PARTY.md)).
