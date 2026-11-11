import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

const stage = document.querySelector("#viewer-stage");
const status = document.querySelector("#viewer-status");
const reset = document.querySelector("#reset-view");
let renderer, controls, splats, spark, actors, motion;
const parameters = new URLSearchParams(location.search);
const embedded = parameters.get("embed") === "1";
if (embedded) document.documentElement.classList.add("embedded");
let parentVisible = true;
window.addEventListener("message", (event) => {
  if (!embedded || event.origin !== location.origin || event.source !== window.parent) return;
  if (event.data?.type === "replay-visibility") {
    parentVisible = event.data.visible === true;
    motion?.setActive(!document.hidden && parentVisible);
  }
  if (event.data?.type === "replay-pause") motion?.pause();
});
const requestedScene = /^[a-d]$/.test(parameters.get("scene") || "") ? parameters.get("scene") : "a";
const fallbackVideo = document.querySelector("#fallback-video");
fallbackVideo.href = `assets/interactive/dashcam/${requestedScene}.mp4`;
fallbackVideo.textContent = `Watch the original Scene ${requestedScene.toUpperCase()} dashcam input`;
const assetBase = "assets/interactive/motion/";
document.addEventListener("visibilitychange", () => motion?.setActive(!document.hidden && parentVisible));

async function load() {
  try {
    const response = await fetch(assetBase + `${requestedScene}.json`);
    if (!response.ok) throw new Error("Scene configuration is unavailable");
    const config = await response.json();
    document.querySelector("#scene-name").textContent = config.scene;
    document.title = `${config.scene} · Interactive replay`;
    document.querySelector("#scene-mode").textContent = "· animated replay";
    stage.setAttribute("aria-label", `Interactive 3D reconstruction of ${config.scene}`);
    for (const link of document.querySelectorAll("[data-viewer-scene]")) {
      if (link.dataset.viewerScene === requestedScene) link.setAttribute("aria-current", "page");
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e2427);
    const camera = new THREE.PerspectiveCamera(config.fov_degrees, 1, 0.01, 200);
    camera.up.fromArray(config.up).normalize();
    camera.position.fromArray(config.eye);
    camera.lookAt(new THREE.Vector3().fromArray(config.target));
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    stage.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Drag to rotate the reconstructed scene");
    renderer.domElement.tabIndex = 0;
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.fromArray(config.target);
    controls.minDistance = 0.5;
    controls.maxDistance = 15;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    let userMoved = false;
    controls.addEventListener("start", () => { userMoved = true; });
    const publishCamera = () => { stage.dataset.camera = JSON.stringify(camera.position.toArray()); };
    controls.addEventListener("change", publishCamera);
    controls.update();
    publishCamera();
    const restoreDefaultView = () => {
      // Consume and clear orbit/pan inertia before restoring the exact view.
      controls.enableDamping = false;
      controls.update();
      camera.up.fromArray(config.up).normalize();
      const target = new THREE.Vector3().fromArray(config.target);
      const offset = new THREE.Vector3().fromArray(config.eye).sub(target);
      camera.position.copy(target).add(offset);
      controls.target.fromArray(config.target);
      controls.update();
      controls.enableDamping = true;
      publishCamera();
    };
    reset.addEventListener("click", () => {
      userMoved = false;
      restoreDefaultView();
    });
    const resize = () => {
      const width = stage.clientWidth, height = stage.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(config.fov_degrees) / 2) * Math.max(1, (16 / 9) / camera.aspect)));
      camera.updateProjectionMatrix();
      if (!userMoved) restoreDefaultView();
    };
    new ResizeObserver(resize).observe(stage);
    resize();
    const ambient = new THREE.HemisphereLight(0xffffff, 0x777777, 2);
    ambient.position.fromArray(config.up);
    scene.add(ambient);
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.copy(camera.position);
    scene.add(light);
    spark = new SparkRenderer({ renderer, enableLod: false });
    scene.add(spark);
    let lastTime = performance.now();
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.25);
      lastTime = now;
      if (document.hidden || !parentVisible) return;
      motion?.update(delta);
      controls.update();
      light.position.copy(camera.position);
      renderer.render(scene, camera);
    });
    status.textContent = "Loading background and actors…";
    const actorPromise = import("./animated-scene.js").then(({ loadAnimatedScene }) => loadAnimatedScene(config, assetBase, stage));
    const backgroundResponse = await fetch(assetBase + config.background);
    if (!backgroundResponse.ok) throw new Error("Background is unavailable");
    const stream = backgroundResponse.body.pipeThrough(new DecompressionStream("gzip"));
    const bytes = await new Response(stream).arrayBuffer();
    splats = new SplatMesh({ fileBytes: bytes, fileName: "background.splat", lod: false });
    scene.add(splats);
    await splats.initialized;
    const result = await actorPromise;
    motion = result;
    actors = motion.group;
    motion.setActive(!document.hidden && parentVisible);
    const human = actors.getObjectByName("pedestrian_C2");
    human?.traverse((object) => {
      if (!object.isMesh) return;
      object.material = object.material.clone();
      object.material.metalness = 0;
      object.material.roughness = 0.8;
    });
    scene.add(actors);
    stage.setAttribute("aria-busy", "false");
    stage.dataset.state = "ready";
    stage.dataset.splats = String(splats.numSplats);
    status.hidden = true;
    reset.disabled = false;
  } catch (error) {
    console.error("Interactive replay:", error);
    renderer?.setAnimationLoop(null);
    status.hidden = true;
    stage.setAttribute("aria-busy", "false");
    stage.dataset.state = "error";
    document.querySelector("#viewer-fallback").hidden = false;
  }
}

window.addEventListener("pagehide", () => {
  renderer?.setAnimationLoop(null);
  controls?.dispose();
  motion?.dispose();
  splats?.dispose();
  spark?.dispose();
  renderer?.dispose();
});
load();
