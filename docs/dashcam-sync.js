// The displayed input frame is the common clock for the video and 3D replay.
export async function createDashcamClock(config, base) {
  const root = new URL("../dashcam/", new URL(base, location.href));
  const letter = String.fromCharCode(97 + config.scene_id);
  const response = await fetch(new URL(`${letter}.json`, root));
  if (!response.ok) throw new Error("Dashcam timing is unavailable");
  const meta = await response.json();
  if (meta.frame_count !== config.frame_count || meta.start_frame !== config.start_frame) throw new Error("Dashcam timing mismatch");
  const video = document.querySelector("#dashcam-video");
  video.muted = true;
  video.loop = true;
  let frame = config.initial_index;
  let active = false, playing = false, disposed = false;
  const paint = (index) => {
    frame = Math.max(0, Math.min(config.frame_count - 1, index));
    document.querySelector("#dashcam-unavailable").hidden = meta.available[frame];
    video.dataset.frame = String(config.start_frame + frame);
  };
  const hasFrameCallback = typeof video.requestVideoFrameCallback === "function";
  let callback;
  const onFrame = (_, metadata) => {
    if (disposed) return;
    // A queued callback can describe the frame before a paused seek.
    // Keep the requested sample while paused; playback uses displayed frames.
    if (!video.seeking && playing) paint(Math.round(metadata.mediaTime * meta.fps));
    callback = video.requestVideoFrameCallback(onFrame);
  };
  const metadataReady = new Promise((resolve, reject) => {
    video.addEventListener("loadedmetadata", resolve, { once: true });
    video.addEventListener("error", () => reject(new Error("Dashcam video could not be loaded")), { once: true });
  });
  video.src = new URL(meta.video, root).href;
  await metadataReady;
  const syncPlayback = () => {
    if (active && playing) video.play().catch(() => {
      playing = false;
      video.dispatchEvent(new CustomEvent("replay-autoplay-blocked"));
    });
    else video.pause();
  };
  const seek = (index) => {
    paint(index);
    // Seek inside the desired sample, rather than on a floating-point boundary.
    video.currentTime = (frame + 0.1) / meta.fps;
  };
  seek(config.initial_index);
  if (hasFrameCallback) callback = video.requestVideoFrameCallback(onFrame);
  document.querySelector("#dashcam-input").hidden = false;
  return {
    frame() {
      // Paused seeks retain their requested sample instead of a queued old clock.
      if (playing && !video.seeking) {
        const mediaFrame = Math.min(config.frame_count - 1, Math.floor(video.currentTime * meta.fps + 1e-6));
        // Frame callbacks may stall across a paused seek or native loop.
        // Recover from the media clock rather than retaining the old end frame.
        if (!hasFrameCallback || Math.abs(mediaFrame - frame) > 1) paint(mediaFrame);
      }
      return frame;
    },
    seek,
    setPlaying(value) { playing = value; syncPlayback(); },
    setActive(value) { if (active !== value) { active = value; syncPlayback(); } },
    dispose() {
      disposed = true;
      if (hasFrameCallback && callback !== undefined) video.cancelVideoFrameCallback(callback);
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  };
}
