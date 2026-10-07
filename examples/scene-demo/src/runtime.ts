import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { parseScenePayload, type SceneObject } from "./definition.ts";

/** User-side renderer: Publisle only supplies the registered island's payload. */
export function mountScene(host: HTMLElement, input: unknown): () => void {
  const payload = parseScenePayload(input);
  const root = document.createElement("section");
  root.setAttribute("aria-label", "3D scene inspector");
  const viewport = document.createElement("div");
  viewport.style.cssText =
    "width:100%;height:320px;position:relative;background:" +
    payload.background;
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const list = document.createElement("div");
  list.setAttribute("aria-label", "Scene objects");
  list.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin:12px 0";
  const inspector = document.createElement("pre");
  inspector.style.cssText = "overflow:auto;max-height:260px;font-size:12px";
  inspector.setAttribute("aria-label", "Selected object properties");
  root.append(viewport, list, status, inspector);
  host.append(root);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(payload.background);
  const camera = new THREE.PerspectiveCamera(
    payload.camera.fov,
    1,
    0.01,
    10000,
  );
  camera.position.fromArray(payload.camera.position);
  camera.lookAt(new THREE.Vector3(...payload.camera.target));
  scene.add(
    new THREE.AmbientLight(
      payload.lights.ambient.color,
      payload.lights.ambient.intensity,
    ),
  );
  const light = new THREE.DirectionalLight(
    payload.lights.directional.color,
    payload.lights.directional.intensity,
  );
  light.position.fromArray(payload.lights.directional.position);
  scene.add(light);
  const meshes = new Map<
    string,
    THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  >();
  for (const object of payload.objects) {
    const [a, b, c] = object.geometry.dimensions;
    const geometry =
      object.geometry.type === "box"
        ? new THREE.BoxGeometry(a, b, c)
        : object.geometry.type === "sphere"
          ? new THREE.SphereGeometry(a, 32, 24)
          : new THREE.CylinderGeometry(a, b, c, 32);
    const material = new THREE.MeshStandardMaterial(object.material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = object.id;
    mesh.position.fromArray(object.position);
    mesh.rotation.set(...object.rotation);
    mesh.scale.fromArray(object.scale);
    meshes.set(object.id, mesh);
    scene.add(mesh);
  }

  let renderer: THREE.WebGLRenderer | undefined;
  let controls: OrbitControls | undefined;
  let observer: ResizeObserver | undefined;
  let lost = false;
  const render = () => {
    if (!lost) renderer?.render(scene, camera);
  };
  const buttons = new Map<string, HTMLButtonElement>();
  const select = (object: SceneObject) => {
    if (!payload.controls.selection) return;
    for (const [id, mesh] of meshes) {
      mesh.material.emissive.set(id === object.id ? "#333333" : "#000000");
      buttons.get(id)?.setAttribute("aria-pressed", String(id === object.id));
    }
    inspector.textContent = JSON.stringify(object, null, 2);
    status.textContent =
      `Selected ${object.name}` +
      (lost ? ". WebGL unavailable; showing scene data." : "");
    render();
  };
  for (const object of payload.objects) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = object.name;
    button.disabled = !payload.controls.selection;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      select(object);
    });
    buttons.set(object.id, button);
    list.append(button);
  }
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset View";
  reset.hidden = !payload.controls.reset;
  reset.addEventListener("click", () => {
    camera.position.fromArray(payload.camera.position);
    controls?.target.fromArray(payload.camera.target);
    camera.lookAt(new THREE.Vector3(...payload.camera.target));
    controls?.update();
    render();
  });
  list.append(reset);

  const raycaster = new THREE.Raycaster();
  let down: [number, number] | undefined;
  const pointerDown = (event: PointerEvent) => {
    down = [event.clientX, event.clientY];
  };
  const pointerUp = (event: PointerEvent) => {
    if (!renderer || !down || !payload.controls.selection) return;
    const start = down;
    down = undefined;
    if (Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 5)
      return;
    const bounds = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
      ),
      camera,
    );
    const hit = raycaster.intersectObjects([...meshes.values()])[0];
    const object = payload.objects.find((obj) => obj.id === hit?.object.name);
    if (object) select(object);
  };
  const unavailable = () => {
    lost = true;
    status.textContent =
      "WebGL unavailable. The scene objects and their properties are available below.";
    if (renderer) renderer.domElement.hidden = true;
    reset.disabled = true;
  };
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute(
      "aria-label",
      "3D scene. Use the object buttons to inspect scene data.",
    );
    viewport.append(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.fromArray(payload.camera.target);
    controls.enableRotate = payload.controls.orbit;
    controls.enablePan = payload.controls.pan;
    controls.enableZoom = payload.controls.zoom;
    controls.update();
    controls.addEventListener("change", render);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("webglcontextlost", unavailable);
    const resize = () => {
      const width = Math.max(viewport.clientWidth, 1);
      const height = Math.max(viewport.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer?.setSize(width, height);
      render();
    };
    observer = new ResizeObserver(resize);
    observer.observe(viewport);
    resize();
    status.textContent =
      "Drag to orbit, scroll to zoom. Select an object to inspect its payload.";
  } catch {
    unavailable();
  }
  return () => {
    observer?.disconnect();
    controls?.removeEventListener("change", render);
    controls?.dispose();
    renderer?.domElement.removeEventListener("pointerdown", pointerDown);
    renderer?.domElement.removeEventListener("pointerup", pointerUp);
    renderer?.domElement.removeEventListener("webglcontextlost", unavailable);
    for (const mesh of meshes.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    renderer?.dispose();
    root.remove();
  };
}
