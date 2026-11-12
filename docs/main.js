"use strict";

const scenes = {
  "carla-stop-m1": { title: "Stop and resume · Layout 1" },
  "carla-turn-m2": { title: "90-degree turn · Layout 2" },
  "carla-run-m1": { title: "Walk to run · Layout 1" },
  "carla-scurve": { title: "S-curve · Layout 1" },
  "carla-gentle-m3": { title: "45-degree turn · Layout 3" },
  "carla-straight-m1": { title: "Straight walking · Layout 1" },
  "carla-turn-m3": { title: "90-degree turn · Layout 3" },
  "carla-stop": { title: "Stop and resume · Layout 2" }
};

for (const gallery of document.querySelectorAll('[data-gallery="carla"]')) {
  const player = gallery.querySelector("video");
  const error = gallery.querySelector(".video-error");
  const buttons = gallery.querySelectorAll("[data-scene]");

  for (const button of buttons) {
    button.addEventListener("click", () => {
      if (button.getAttribute("aria-pressed") === "true") return;
      const key = button.dataset.scene;
      const scene = scenes[key];
      if (!scene) return;
      player.pause();
      error.hidden = true;
      for (const other of buttons) other.setAttribute("aria-pressed", String(other === button));
      player.poster = `assets/images/${key}-reprojection.jpg?v=dashcam`;
      player.src = `assets/videos/${key}-reprojection.mp4?v=dashcam`;
      player.setAttribute("aria-label", scene.title);
      player.load();
      syncVideoPlayback(player);
    });
  }

  player.addEventListener("error", () => { error.hidden = false; });
}
// Start silent videos when visible; suspend them offscreen or in a hidden tab.
const videos = document.querySelectorAll("video");
const visibleVideos = new Set();
function syncVideoPlayback(video) {
  if (visibleVideos.has(video) && !document.hidden) video.play().catch(() => {});
  else video.pause();
}
const videoVisibility = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) visibleVideos.add(entry.target);
    else visibleVideos.delete(entry.target);
    syncVideoPlayback(entry.target);
  }
}, { threshold: 0 });
for (const video of videos) {
  video.muted = true;
  video.autoplay = true;
  video.loop = true;
  video.addEventListener("play", () => {
    if (!visibleVideos.has(video) || document.hidden) video.pause();
  });
  videoVisibility.observe(video);
}
document.addEventListener("visibilitychange", () => {
  for (const video of videos) syncVideoPlayback(video);
});

// The real-world gallery renders directly inside the main page.
const replay = document.querySelector("#replay-viewer");
const replayButtons = document.querySelectorAll('[data-gallery="real"] [data-scene]');
for (const button of replayButtons) {
  button.addEventListener("click", () => {
    if (button.getAttribute("aria-pressed") === "true") return;
    for (const other of replayButtons) other.setAttribute("aria-pressed", String(other === button));
    const letter = button.dataset.scene.slice(-1);
    replay.src = `viewer.html?scene=${letter}&embed=1`;
    replay.title = `Interactive 3D replay · Scene ${letter.toUpperCase()}`;
  });
}
let replayVisible = true;
const updateReplayVisibility = () => replay.contentWindow?.postMessage({ type: "replay-visibility", visible: replayVisible }, location.origin);
replay.addEventListener("load", updateReplayVisibility);
new IntersectionObserver(([entry]) => {
  replayVisible = entry.isIntersecting;
  updateReplayVisibility();
}, { threshold: 0 }).observe(replay);
