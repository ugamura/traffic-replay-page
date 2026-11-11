import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createDashcamClock } from "./dashcam-sync.js";

async function unpack(url, ArrayType, expectedLength) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Motion data is unavailable");
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  const data = new ArrayType(await new Response(stream).arrayBuffer());
  if (data.length !== expectedLength) throw new Error("Motion data length mismatch");
  return data;
}

export async function loadAnimatedScene(config, base, stage) {
  const [gltf, positions, indices, clock] = await Promise.all([
    new GLTFLoader().loadAsync(base + config.vehicle),
    unpack(base + config.positions, Float32Array, config.human_frames * config.human_vertices * 3),
    unpack(base + config.indices, Uint16Array, config.human_indices),
    createDashcamClock(config, base)
  ]);
  const group = new THREE.Group();
  const vehicle = new THREE.Group();
  const fitted = new THREE.Group();
  const oriented = new THREE.Group();
  oriented.rotation.y = config.vehicle_yaw_radians;
  oriented.add(gltf.scene);
  fitted.add(oriented);
  fitted.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(fitted);
  const size = bounds.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every(v => Number.isFinite(v) && v > 0)) throw new Error("Invalid vehicle dimensions");
  const [width, height, length] = config.vehicle_dimensions_scene;
  fitted.scale.set(width / size.x, height / size.y, length / size.z);
  fitted.updateMatrixWorld(true);
  bounds.setFromObject(fitted);
  const center = bounds.getCenter(new THREE.Vector3());
  fitted.position.set(-center.x, -bounds.min.y, -center.z);
  vehicle.add(fitted);
  vehicle.updateMatrixWorld(true);
  stage.dataset.vehicleBounds = JSON.stringify((() => { const b = new THREE.Box3().setFromObject(vehicle); return [b.min.toArray(), b.max.toArray()]; })());
  stage.dataset.vehicleModel = "urban10";
  vehicle.matrixAutoUpdate = false;
  group.add(vehicle);
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const attribute = new THREE.BufferAttribute(new Float32Array(config.human_vertices * 3), 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", attribute);
  const material = new THREE.MeshStandardMaterial({ color: 0x69cedd, roughness: 0.8, metalness: 0 });
  const human = new THREE.Mesh(geometry, material);
  human.frustumCulled = false;
  group.add(human);
  const play = document.querySelector("#toggle-play");
  const timeline = document.querySelector("#timeline");
  const time = document.querySelector("#playback-time");
  const availability = document.querySelector("#human-interval");
  timeline.max = config.frame_count - 1;
  availability.textContent = `Pedestrian visible: ${(config.human_frame_range[0] / config.fps).toFixed(1)}–${(config.human_frame_range[1] / config.fps).toFixed(1)} s`;
  let playing = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastFrame = -1;
  const updateButton = () => {
    play.textContent = playing ? "Pause" : "Play";
    play.setAttribute("aria-label", playing ? "Pause replay" : "Play replay");
    stage.dataset.playing = String(playing);
    clock.setPlaying(playing);
  };
  const applyFrame = () => {
    const frame = clock.frame();
    if (frame === lastFrame) return;
    lastFrame = frame;
    // Source matrices are row-major; Three.js stores matrices column-major.
    vehicle.matrix.fromArray(config.vehicle_matrices[frame].flat()).transpose();
    vehicle.matrixWorldNeedsUpdate = true;
    const meshFrame = config.frame_to_mesh[frame];
    human.visible = meshFrame >= 0;
    if (human.visible) {
      const stride = config.human_vertices * 3;
      attribute.copyArray(positions.subarray(meshFrame * stride, (meshFrame + 1) * stride));
      attribute.needsUpdate = true;
      geometry.computeVertexNormals();
    }
    timeline.value = frame;
    const sceneTime = config.scene_times_s?.[frame] ?? (config.start_frame + frame) / config.fps;
    const endTime = config.scene_times_s?.at(-1) ?? config.end_frame / config.fps;
    time.textContent = `${sceneTime.toFixed(1)} / ${endTime.toFixed(1)} s`;
    timeline.setAttribute("aria-valuetext", `Scene time ${sceneTime.toFixed(1)} seconds`);
    stage.dataset.frame = String(config.start_frame + frame);
    stage.dataset.humanVisible = String(human.visible);
    stage.dataset.actorSample = JSON.stringify([attribute.array[0], attribute.array[1], attribute.array[2], ...vehicle.matrix.elements.slice(12, 15)]);
  };
  play.addEventListener("click", () => { playing = !playing; updateButton(); });
  timeline.addEventListener("input", () => {
    playing = false;
    clock.seek(Number(timeline.value));
    updateButton();
    applyFrame();
  });
  document.querySelector("#dashcam-video").addEventListener("replay-autoplay-blocked", () => { playing = false; updateButton(); });
  updateButton();
  applyFrame();
  document.querySelector("#playback").hidden = false;
  return {
    group,
    pause() { playing = false; updateButton(); },
    setActive(value) { clock.setActive(value); },
    update() { applyFrame(); },
    dispose() { clock.dispose(); geometry.dispose(); material.dispose(); vehicle.traverse(object => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const m of materials) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); }
    }); }
  };
}
