import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene;
let camera;
let renderer;
let controls;
let raycaster;
let pointer;
let interactive = [];
let cards = [];
let onSelect = null;
let resizeObserver;

function textTexture(title, total, active) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  context.fillStyle = active ? '#182338' : '#3a2630';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = active ? '#72e6bb' : '#ff9b9b';
  context.lineWidth = 18;
  context.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
  context.textAlign = 'center';
  context.fillStyle = '#ffffff';
  context.font = '700 58px system-ui, sans-serif';
  context.fillText(title.slice(0, 18), canvas.width / 2, 118, 700);
  context.fillStyle = active ? '#72e6bb' : '#ff9b9b';
  context.font = '800 46px system-ui, sans-serif';
  context.fillText(active ? `${total} unidades` : 'INACTIVO', canvas.width / 2, 214, 700);
  context.fillStyle = '#b9c3d4';
  context.font = '600 34px system-ui, sans-serif';
  context.fillText('Haz clic para donar', canvas.width / 2, 300);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addAvatar(parent, x, z, color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.62, 5, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
  );
  body.position.y = 1.15;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xffcf9a, roughness: 0.7 }),
  );
  head.position.y = 2.05;
  group.add(body, head);
  group.position.set(x, 0, z);
  parent.add(group);
}

function createStand(card, index, count) {
  const group = new THREE.Group();
  const angle = count === 1 ? 0 : (index / count) * Math.PI * 2;
  const radius = count <= 4 ? 5.5 : 7.2;
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  group.position.set(x, 0, z);
  group.rotation.y = -angle;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.25, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x26344a, roughness: 0.65 }),
  );
  base.position.y = 0.125;
  group.add(base);

  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(3.7, 0.18, 2.7),
    new THREE.MeshStandardMaterial({ color: card.sign.active ? 0x72e6bb : 0xb85f75, roughness: 0.6 }),
  );
  awning.position.y = 3.55;
  group.add(awning);

  [-1.45, 1.45].forEach((postX) => {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 3.45, 12),
      new THREE.MeshStandardMaterial({ color: 0xdde7f5, roughness: 0.5 }),
    );
    post.position.set(postX, 1.78, -1.05);
    group.add(post);
  });

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 1.75),
    new THREE.MeshStandardMaterial({
      map: textTexture(card.sign.title, card.total, card.sign.active),
      roughness: 0.5,
      emissive: card.sign.active ? 0x183b32 : 0x351820,
      emissiveIntensity: 0.25,
    }),
  );
  sign.position.set(0, 2.45, 0.15);
  sign.userData.signId = card.id;
  group.add(sign);
  interactive.push(sign);

  addAvatar(group, 0, -0.15, card.sign.active ? 0x8fb6ff : 0xa0a0a0);
  return group;
}

function clearStands() {
  interactive = [];
  scene.children.slice().forEach((object) => {
    if (object.userData.isStand) scene.remove(object);
  });
}

export function initPlaza({ onSelect: selectCallback }) {
  onSelect = selectCallback;
  const canvas = document.getElementById('plaza-canvas');
  const viewport = document.getElementById('plaza-viewport');
  if (!canvas || !viewport) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111827);
  scene.fog = new THREE.Fog(0x111827, 16, 32);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(10.5, 8.5, 12.5);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 1.2, 0);
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 7;
  controls.maxDistance = 22;

  scene.add(new THREE.HemisphereLight(0xcfe1ff, 0x263d32, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(8, 14, 10);
  sun.castShadow = true;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64),
    new THREE.MeshStandardMaterial({ color: 0x40546f, roughness: 0.88 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.6, 0.5, 32),
    new THREE.MeshStandardMaterial({ color: 0x9db3cc, roughness: 0.3, metalness: 0.15 }),
  );
  fountain.position.y = 0.25;
  scene.add(fountain);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  function resize() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(viewport);
  resize();

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingCanvasRect?.() || canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  });
  canvas.addEventListener('click', () => {
    if (!raycaster) return;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(interactive, false)[0];
    if (hit?.object.userData.signId !== undefined) {
      onSelect?.(hit.object.userData.signId, null);
    }
  });

  function animate() {
    controls.update();
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(animate);
}

export function updatePlazaCards(nextCards) {
  if (!scene) return;
  cards = nextCards || [];
  clearStands();
  const count = cards.length;
  cards.forEach((card, index) => {
    const stand = createStand(card, index, count);
    stand.userData.isStand = true;
    scene.add(stand);
  });
}
