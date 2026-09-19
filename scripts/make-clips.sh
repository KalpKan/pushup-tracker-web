#!/usr/bin/env bash
# Re-creates the ground-truth clips in tests/fixtures/clips/ from Kalp's original recordings
# (640 px wide, 30 fps, H.264, no audio, rotation metadata baked in). Only needed if a clip is
# added; the outputs are committed. Uses the ffmpeg binary bundled with imageio-ffmpeg in .venv.
set -euo pipefail
cd "$(dirname "$0")/.."
FF=$(.venv/bin/python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())")
SRC="/Users/kalp/Desktop/Out and About/Sidequest/AI_Pushup_Tracking"
OUT=tests/fixtures/clips
enc() { "$FF" -y -loglevel error -i "$1" -vf "scale=640:-2,fps=30" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -an "$OUT/$2"; echo "$2 $(du -k "$OUT/$2" | cut -f1) KB"; }
enc "$SRC/AI-Pushup-Form-Tracker/test_video/test_video.mp4"   test_video.mp4
enc "$SRC/AI-Pushup-Form-Tracker/test_video/test_video_2.mp4" test_video_2.mp4
enc "$SRC/AI-Pushup-Form-Tracker/test_video/test_video3.mp4"  test_video3.mp4
enc "$SRC/AI-Pushup-Form-Tracker/test_video/test_video_4.mp4" test_video_4.mp4   # 180° rotation metadata is applied
enc "$SRC/data/good_form/IMG_4378.mp4"        good_IMG_4378.mp4
enc "$SRC/data/good_form/IMG_4409.mp4"        good_IMG_4409.mp4
enc "$SRC/data/bad_form/IMG_4456.mp4"         bad_IMG_4456.mp4
enc "$SRC/data/bad_form/IMG_4470.mp4"         bad_IMG_4470.mp4
enc "$SRC/data/bad_form/Copy of IMG_4451.mp4" bad_IMG_4451.mp4
