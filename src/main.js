import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import './style.css';

const species = {
  toothless: { name: 'TOOTHLESS', copy: 'Çevik · Hızlı ve dengeli', asset: new URL('../toothless_all_packed_with_rig.glb', import.meta.url).href, kind: 'gltf', turnY: Math.PI / 2, mountY: 0.62, speed: 48, turn: 1.9, power: 1, mass: 0.9, lift: 1.08, stats: [82, 88, 62] },
  hookfang: { name: 'HOOKFANG', copy: 'Hızlı · Güçlü çarpışma', asset: new URL('../hookfang.glb', import.meta.url).href, kind: 'gltf', turnY: Math.PI / 2, mountY: 0.58, speed: 50, turn: 1.38, power: 1.28, mass: 1.12, lift: 0.98, stats: [88, 63, 76] },
  nadder: { name: 'NADDER', copy: 'Keskin · Hassas manevra', asset: new URL('../deadly_nadder.glb', import.meta.url).href, kind: 'gltf', turnY: Math.PI / 2, mountY: 0.62, speed: 44, turn: 2.12, power: 0.94, mass: 0.88, lift: 1.04, stats: [74, 96, 58] },
  cloudjumper: { name: 'CLOUDJUMPER', copy: 'Dengeli · Akıcı uçuş', asset: '/assets/cloud-jumper/source/Cloudjumper.fbx', kind: 'fbx', turnY: Math.PI / 2, speed: 44, turn: 1.66, power: 1.08, mass: 1, lift: 1.12, stats: [75, 76, 66] },
  screamingDeath: { name: 'SCREAMING DEATH', copy: 'Ağır · Geniş yıkım alanı', asset: '/assets/screaming-death/source/ScreamingDeath.fbx', kind: 'fbx', turnX: Math.PI / 2, mountY: 0.72, speed: 41, turn: 1.02, power: 1.72, mass: 1.42, lift: 0.92, stats: [68, 47, 94] },
  bewilderbeast: { name: 'BEWILDERBEAST', copy: 'Dev · Ezici darbe gücü', asset: '/assets/bewilderbeast/source/Bewilderbeast_OutShow.fbx', kind: 'fbx', turnX: Math.PI / 2, mountY: 0.84, speed: 32, turn: 0.72, power: 2.15, mass: 2, lift: 0.82, stats: [48, 34, 100] }
};

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const modelCache = new Map();
let astridPromise;
let dragonMixer;
let riderMixer;

const viewport = document.querySelector('#viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9eb7b2);
scene.fog = new THREE.Fog(0x9eb7b2, 85, 460);
const camera = new THREE.PerspectiveCamera(63, 1, 0.1, 620);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
viewport.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdce9d5, 0x343b2f, 2.15));
const sun = new THREE.DirectionalLight(0xffe6c1, 3.2);
sun.position.set(-35, 55, 24);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55;
sun.shadow.camera.bottom = -55;
scene.add(sun);

const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x68765b, roughness: 0.97 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.52;
ground.receiveShadow = true;
scene.add(ground);
const runway = new THREE.Mesh(new THREE.PlaneGeometry(7, 260), new THREE.MeshStandardMaterial({ color: 0x85856b, roughness: 0.9 }));
runway.rotation.x = -Math.PI / 2;
runway.position.set(0, -0.505, -112);
scene.add(runway);

const speedLineCount = 72;
const speedLinePositions = new Float32Array(speedLineCount * 6);
const speedLineDepths = new Float32Array(speedLineCount);
for (let index = 0; index < speedLineCount; index++) {
  speedLineDepths[index] = -Math.random() * 48 - 1;
  const offset = index * 6;
  const x = (Math.random() - 0.5) * 42;
  const y = (Math.random() - 0.5) * 24;
  speedLinePositions[offset] = x;
  speedLinePositions[offset + 1] = y;
  speedLinePositions[offset + 2] = speedLineDepths[index];
  speedLinePositions[offset + 3] = x;
  speedLinePositions[offset + 4] = y;
  speedLinePositions[offset + 5] = speedLineDepths[index] + 0.1;
}
const speedLineGeometry = new THREE.BufferGeometry();
speedLineGeometry.setAttribute('position', new THREE.BufferAttribute(speedLinePositions, 3));
const speedLineMaterial = new THREE.LineBasicMaterial({ color: 0xe9f3db, transparent: true, opacity: 0, depthTest: false });
const speedLines = new THREE.LineSegments(speedLineGeometry, speedLineMaterial);
speedLines.frustumCulled = false;
speedLines.renderOrder = 10;
speedLines.visible = false;
camera.add(speedLines);
scene.add(camera);

let world;
let eventQueue;

const stoneMaterials = [0x818276, 0x77796f, 0x929082, 0x6f746a].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
const blocks = [];
const blockByCollider = new Map();
let destroyed = 0;
let currentSpecies = species.toothless;
let dragonVisual;
let modelGeneration = 0;
let dragonBody;
let dragonCollider;
let wingBones = [];
let firstPerson = false;
let yaw = 0;
let pitch = 0;
let targetYaw = 0;
let targetPitch = 0;
let boostHeld = false;
let breathCooldown = 0;
let hitCooldown = 0;
let toastTimeout;
let worldTime = 0;
let frameAccumulator = 0;
let previousTime = performance.now();
const keys = new Set();
const fireballs = [];
const effects = [];

function makeBlock(x, y, z, width, height, depth, materialIndex = Math.floor(Math.random() * stoneMaterials.length)) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), stoneMaterials[materialIndex]);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(width * 0.49, height * 0.49, depth * 0.49).setFriction(0.78).setRestitution(0.12).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
  const block = { mesh, body, collider, x, y, z, destroyed: false };
  blocks.push(block);
  blockByCollider.set(collider.handle, block);
}

function makeWall(centerX, centerZ, columns, rows, width = 2.05) {
  const height = 1.12;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const offset = row % 2 ? width * 0.5 : 0;
      const x = centerX + (column - (columns - 1) / 2) * width + offset;
      makeBlock(x, height / 2 + row * height, centerZ, width * 0.96, height * 0.96, 1.35);
    }
  }
}

function makeTower(x, z, rows = 6) {
  for (let row = 0; row < rows; row++) {
    const height = 1.08;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [dx, dz] of corners) makeBlock(x + dx * 0.72, height / 2 + row * height, z + dz * 0.72, 1.45, height * 0.95, 1.45);
  }
  makeBlock(x, rows * 1.08 + 0.4, z, 2.35, 0.8, 2.35);
}

function makeTarget() {
  makeWall(0, -35, 11, 4, 1.9);
  makeTower(-17, -29, 6);
  makeTower(18, -43, 7);
  makeWall(-32, -60, 9, 3, 2.1);
  makeWall(34, -72, 10, 4, 1.8);
  makeTower(-8, -93, 7);
  makeTower(14, -112, 6);
  makeWall(-26, -155, 12, 4, 2.2);
  makeTower(24, -174, 9);
  makeWall(30, -220, 14, 5, 2.1);
  makeTower(-36, -248, 10);
  makeWall(-14, -295, 15, 5, 2.25);
  makeTower(39, -326, 11);
  for (let index = 0; index < 34; index++) {
    const angle = index * 0.72;
    const radius = 135 + (index % 5) * 20;
    const x = Math.cos(angle) * radius;
    const z = -145 + Math.sin(angle) * radius;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(9 + (index % 3) * 3, 0), new THREE.MeshStandardMaterial({ color: index % 2 ? 0x6c796d : 0x7d8171, roughness: 1 }));
    rock.position.set(x, 2, z);
    rock.scale.y = 1.25;
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 2, z));
    world.createCollider(RAPIER.ColliderDesc.ball(9.5 + (index % 3) * 3), body);
  }
}

async function loadAsset(asset, kind) {
  if (kind === 'fbx') {
    const loader = new FBXLoader();
    loader.setResourcePath(new URL('../textures/', new URL(asset, window.location.href)).href);
    const scene = await loader.loadAsync(asset);
    return { scene, animations: scene.animations };
  }
  const gltf = await gltfLoader.loadAsync(asset);
  return { scene: gltf.scene, animations: gltf.animations };
}

function normalizeModel(model, longestSide) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const dimensions = bounds.getSize(new THREE.Vector3());
  const largestDimension = Math.max(dimensions.x, dimensions.y, dimensions.z);
  if (!largestDimension) return;
  model.scale.multiplyScalar(longestSide / largestDimension);
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  model.position.sub(bounds.getCenter(new THREE.Vector3()));
}

function getModel(asset, kind) {
  if (!modelCache.has(asset)) modelCache.set(asset, loadAsset(asset, kind));
  return modelCache.get(asset).then(source => ({ model: cloneSkeleton(source.scene), animations: source.animations }));
}

function playAnimation(root, clips, pattern) {
  const clip = clips.find(candidate => pattern.test(candidate.name));
  if (!clip) return undefined;
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  return mixer;
}

async function createDragonModel(dragon) {
  const generation = ++modelGeneration;
  showToast(`${dragon.name} hazırlanıyor`);
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const previous = dragonVisual;
  try {
    const assetData = await getModel(dragon.asset, dragon.kind);
    const model = assetData.model;
    model.rotation.set(dragon.turnX || 0, dragon.turnY || 0, dragon.turnZ || 0, 'YXZ');
    normalizeModel(model, 5.2);
    const nextWingBones = [];
    model.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
      if (object.isBone && /wing.*shoulder|wingroot|wingbase|clavicle/i.test(object.name)) {
        nextWingBones.push({ bone: object, base: object.rotation.z, side: /\.L|left|_L|\bL\b/i.test(object.name) ? 1 : -1 });
      }
    });
    root.add(model);
    const nextDragonMixer = playAnimation(model, assetData.animations, /fly|flight|move01|armaturetaction/i);

    astridPromise ??= loadAsset('/assets/astrid/source/how_to_train_your_dragon_the_journey_-_astrid.glb', 'gltf');
    const riderData = await astridPromise;
    const astrid = cloneSkeleton(riderData.scene);
    astrid.rotation.y = Math.PI;
    normalizeModel(astrid, 1.4);
    astrid.position.set(0, dragon.mountY || 0.62, 0.18);
    astrid.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    root.add(astrid);
    const nextRiderMixer = playAnimation(astrid, riderData.animations, /idle01/i);
    if (generation !== modelGeneration) {
      scene.remove(root);
      return;
    }
    root.visible = true;
    dragonVisual = root;
    dragonMixer = nextDragonMixer;
    riderMixer = nextRiderMixer;
    wingBones = nextWingBones;
    showToast(`${dragon.name} hazır`);
    if (previous && previous !== root) {
      scene.remove(previous);
    }
  } catch (error) {
    scene.remove(root);
    console.error(`Model yüklenemedi: ${dragon.name}`, error);
    showToast(`${dragon.name} modeli yüklenemedi`);
  }
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), 1900);
}

function selectDragon(key) {
  currentSpecies = species[key];
  document.querySelector('#dragon-name').textContent = currentSpecies.name;
  document.querySelector('#dragon-copy').textContent = currentSpecies.copy;
  document.querySelectorAll('.dragon-option').forEach(button => button.classList.toggle('is-active', button.dataset.dragon === key));
  ['speed', 'turn', 'power'].forEach((stat, index) => {
    document.querySelector(`#stat-${stat}`).style.setProperty('--value', `${currentSpecies.stats[index]}%`);
  });
  if (dragonCollider) dragonCollider.setMass(82 * currentSpecies.mass);
  if (dragonCollider) dragonCollider.setRestitution(0.2 + currentSpecies.power * 0.1);
  createDragonModel(currentSpecies);
}

function explodeAt(position, radius, force, source = 'breath') {
  const material = new THREE.MeshBasicMaterial({ color: source === 'impact' ? 0xe8edb4 : 0xff8a4c, transparent: true, opacity: 0.52, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material);
  mesh.position.copy(position);
  scene.add(mesh);
  effects.push({ mesh, age: 0, duration: 0.42, radius });

  let broken = 0;
  for (const block of blocks) {
    if (block.destroyed) continue;
    const dx = block.x - position.x;
    const dy = block.y - position.y;
    const dz = block.z - position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance > radius) continue;
    block.destroyed = true;
    block.mesh.material = stoneMaterials[1];
    block.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    block.body.setLinearDamping(0.18);
    block.body.setAngularDamping(0.2);
    const direction = new THREE.Vector3(dx, dy + 1.4, dz).normalize();
    const power = force * (1 - distance / radius) + 2.4;
    block.body.applyImpulse({ x: direction.x * power, y: direction.y * power, z: direction.z * power }, true);
    block.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * power, y: (Math.random() - 0.5) * power, z: (Math.random() - 0.5) * power }, true);
    broken++;
  }
  if (broken) {
    destroyed += broken;
    document.querySelector('#score').textContent = String(destroyed).padStart(3, '0');
  }
}

function breathe() {
  if (!dragonVisual || breathCooldown > 0) return;
  breathCooldown = 0.62;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(dragonVisual.quaternion);
  const origin = dragonVisual.position.clone().add(forward.clone().multiplyScalar(2.1));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.37, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffa45a }));
  ball.position.copy(origin);
  scene.add(ball);
  fireballs.push({ mesh: ball, velocity: forward.multiplyScalar(49), age: 0 });
}

function buildScenery() {
  makeTarget();
  const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xd5f36a, emissive: 0x52621c, emissiveIntensity: 0.45, roughness: 0.58 });
  for (const side of [-1, 1]) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.22, 8, 0.22), markerMaterial);
    marker.position.set(side * 12, 3.5, 5);
    scene.add(marker);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), markerMaterial);
    lamp.position.set(side * 12, 7.7, 5);
    scene.add(lamp);
  }
}

function bindControls() {
  let pointerDown = false;
  let previousPointerX = 0;
  let previousPointerY = 0;
  renderer.domElement.addEventListener('pointerdown', event => {
    pointerDown = true;
    previousPointerX = event.clientX;
    previousPointerY = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', event => {
    if (!pointerDown) return;
    const dx = event.clientX - previousPointerX;
    const dy = event.clientY - previousPointerY;
    previousPointerX = event.clientX;
    previousPointerY = event.clientY;
    targetYaw -= dx * 0.0042;
    targetPitch = THREE.MathUtils.clamp(targetPitch - dy * 0.0035, -0.92, 0.92);
  });
  const stopPointer = () => { pointerDown = false; };
  renderer.domElement.addEventListener('pointerup', stopPointer);
  renderer.domElement.addEventListener('pointercancel', stopPointer);

  window.addEventListener('keydown', event => {
    keys.add(event.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyF' && !event.repeat) breathe();
    if (event.code === 'KeyC' && !event.repeat) document.querySelector('#camera-toggle').click();
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') boostHeld = true;
  });
  window.addEventListener('keyup', event => {
    keys.delete(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') boostHeld = false;
  });
  window.addEventListener('blur', () => { boostHeld = false; keys.clear(); });

  const boost = document.querySelector('#boost');
  boost.addEventListener('pointerdown', event => {
    event.preventDefault();
    boost.setPointerCapture(event.pointerId);
    boostHeld = true;
    boost.classList.add('is-held');
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) boost.addEventListener(type, () => { boostHeld = false; boost.classList.remove('is-held'); });
  document.querySelector('#breath').addEventListener('pointerdown', event => { event.preventDefault(); breathe(); });
  document.querySelectorAll('.dragon-option').forEach(button => button.addEventListener('click', () => selectDragon(button.dataset.dragon)));
  const cameraToggle = document.querySelector('#camera-toggle');
  cameraToggle.addEventListener('click', () => {
    firstPerson = !firstPerson;
    cameraToggle.setAttribute('aria-pressed', String(firstPerson));
    cameraToggle.setAttribute('aria-label', firstPerson ? 'Takip kamerasına geç' : 'Birinci şahıs kameraya geç');
    document.querySelector('#camera-label').textContent = firstPerson ? '1. ŞAHIS' : 'TAKİP';
    showToast(firstPerson ? 'Birinci şahıs uçuş' : 'Takip kamerası');
  });
}

function updateFlight(delta) {
  const keyboardYaw = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  const keyboardPitch = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  targetYaw += keyboardYaw * currentSpecies.turn * delta;
  targetPitch = THREE.MathUtils.clamp(targetPitch + keyboardPitch * currentSpecies.turn * delta, -0.92, 0.92);
  const turnBlend = 1 - Math.exp(-currentSpecies.turn * 2.7 * delta);
  yaw += (targetYaw - yaw) * turnBlend;
  pitch += (targetPitch - pitch) * turnBlend;

  const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, -keyboardYaw * 0.13, 'YXZ'));
  dragonBody.setRotation({ x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w }, true);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation);
  const position = dragonBody.translation();
  const velocity = dragonBody.linvel();
  const currentVelocity = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
  const speedLimit = currentSpecies.speed * (boostHeld ? 1.72 : 0.88);
  const targetVelocity = forward.multiplyScalar(speedLimit / 3.6);
  const response = Math.min(1, (boostHeld ? 2.9 : 1.45) * delta);
  const impulse = targetVelocity.sub(currentVelocity).multiplyScalar(dragonBody.mass() * response);
  dragonBody.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);

  const speed = currentVelocity.length();
  const lift = speed * 0.21 * currentSpecies.lift;
  dragonBody.applyImpulse({ x: 0, y: (lift + (boostHeld ? 1.4 : 0)) * dragonBody.mass() * delta, z: 0 }, true);

  dragonVisual.position.set(position.x, position.y, position.z);
  dragonVisual.quaternion.copy(orientation);
  const flap = Math.sin(worldTime * (boostHeld ? 15 : 8)) * (boostHeld ? 0.62 : 0.34);
  for (const { bone, base, side } of wingBones) bone.rotation.z = base + flap * side;

  const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation);
  const cameraPosition = firstPerson
    ? dragonVisual.position.clone().addScaledVector(cameraForward, currentSpecies.cameraOffset || 3.55).add(new THREE.Vector3(0, 0.82, 0))
    : dragonVisual.position.clone().addScaledVector(cameraForward, -10.5).add(new THREE.Vector3(0, 3.1, 0));
  const shake = boostHeld ? 0.045 : Math.max(0, speed - 16) * 0.0007;
  cameraPosition.x += Math.sin(worldTime * 27) * shake;
  cameraPosition.y += Math.sin(worldTime * 19) * shake * 0.65;
  camera.position.lerp(cameraPosition, 1 - Math.exp(-(firstPerson ? 10 : 3.4) * delta));
  const lookAt = dragonVisual.position.clone().addScaledVector(cameraForward, firstPerson ? 24 : 7);
  camera.lookAt(lookAt);

  const kmh = Math.round(speed * 3.6);
  const targetFov = (firstPerson ? 78 : 63) + Math.min(kmh / 10, 10) + (boostHeld ? 4 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, delta * 2.5);
  camera.updateProjectionMatrix();
  if (firstPerson) camera.rotateZ(-THREE.MathUtils.clamp((targetYaw - yaw) * 0.34, -0.28, 0.28));
  speedLines.visible = kmh > 24 || boostHeld;
  speedLineMaterial.opacity = THREE.MathUtils.clamp((kmh - 20) / 70, 0, 0.48) + (boostHeld ? 0.15 : 0);
  for (let index = 0; index < speedLineCount; index++) {
    const offset = index * 6;
    speedLineDepths[index] += delta * (5 + kmh * 0.68);
    if (speedLineDepths[index] > -0.8) {
      speedLineDepths[index] = -48;
      speedLinePositions[offset] = (Math.random() - 0.5) * 42;
      speedLinePositions[offset + 1] = (Math.random() - 0.5) * 24;
    }
    speedLinePositions[offset + 2] = speedLineDepths[index];
    speedLinePositions[offset + 3] = speedLinePositions[offset] * 1.04;
    speedLinePositions[offset + 4] = speedLinePositions[offset + 1] * 1.04;
    speedLinePositions[offset + 5] = speedLineDepths[index] + Math.min(2.4, kmh * 0.025);
  }
  speedLineGeometry.attributes.position.needsUpdate = true;
  document.querySelector('#speed').textContent = String(kmh).padStart(3, '0');
  document.querySelector('#speed-bar').style.width = `${Math.min(100, kmh / (currentSpecies.speed * 0.36) * 100)}%`;
  document.querySelector('#altitude').textContent = `${String(Math.max(0, Math.round(position.y))).padStart(3, '0')} m`;
  document.querySelector('#mode-label').textContent = boostHeld ? 'KANAT GÜCÜ' : (kmh < 28 ? 'SÜZÜLÜŞ' : 'SEYİR');
}

function updateObjects(delta) {
  breathCooldown = Math.max(0, breathCooldown - delta);
  hitCooldown = Math.max(0, hitCooldown - delta);
  for (let index = fireballs.length - 1; index >= 0; index--) {
    const fireball = fireballs[index];
    fireball.age += delta;
    fireball.mesh.position.addScaledVector(fireball.velocity, delta);
    fireball.mesh.scale.setScalar(1 + fireball.age * 0.4);
    let impact = false;
    for (const block of blocks) {
      if (!block.destroyed && fireball.mesh.position.distanceTo(block.mesh.position) < 2.1) { impact = true; break; }
    }
    if (impact || fireball.age > 1.8) {
      explodeAt(fireball.mesh.position, 6.4, 14 * currentSpecies.power);
      scene.remove(fireball.mesh);
      fireball.mesh.geometry.dispose();
      fireball.mesh.material.dispose();
      fireballs.splice(index, 1);
    }
  }
  for (let index = effects.length - 1; index >= 0; index--) {
    const effect = effects[index];
    effect.age += delta;
    const progress = effect.age / effect.duration;
    effect.mesh.scale.setScalar(0.6 + progress * effect.radius * 0.72);
    effect.mesh.material.opacity = 0.52 * (1 - progress);
    if (progress >= 1) {
      scene.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      effect.mesh.material.dispose();
      effects.splice(index, 1);
    }
  }
  for (const block of blocks) {
    if (!block.destroyed) continue;
    const position = block.body.translation();
    const rotation = block.body.rotation();
    block.mesh.position.set(position.x, position.y, position.z);
    block.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  }
}

function handleCollisions() {
  eventQueue.drainCollisionEvents((handleA, handleB, started) => {
    if (!started || hitCooldown > 0) return;
    const first = blockByCollider.get(handleA);
    const second = blockByCollider.get(handleB);
    const block = first || second;
    if (!block || block.destroyed) return;
    const velocity = dragonBody.linvel();
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    if (speed < 10) return;
    hitCooldown = 0.35;
    const position = block.mesh.position.clone();
    explodeAt(position, Math.min(6.5, 3.2 + speed * 0.06), currentSpecies.power * (3 + speed * 0.14), 'impact');
  });
}

function resize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  camera.aspect = width / height;
  camera.fov = width < 700 ? 68 : 63;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - previousTime) / 1000, 0.04);
  previousTime = now;
  worldTime += delta;
  if (!dragonVisual) {
    renderer.render(scene, camera);
    return;
  }
  dragonMixer?.update(delta);
  riderMixer?.update(delta);
  updateFlight(delta);
  updateObjects(delta);
  frameAccumulator += delta;
  while (frameAccumulator >= 1 / 60) {
    world.step(eventQueue);
    frameAccumulator -= 1 / 60;
  }
  handleCollisions();
  renderer.render(scene, camera);
}

async function start() {
  showToast('Uçuş alanı hazırlanıyor');
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  eventQueue = new RAPIER.EventQueue(true);
  world.createCollider(RAPIER.ColliderDesc.cuboid(450, 0.5, 450), world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1.02, 0)));
  buildScenery();
  dragonBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 8).setGravityScale(0.24).setLinearDamping(0.12).setAngularDamping(5).setCcdEnabled(true));
  dragonCollider = world.createCollider(RAPIER.ColliderDesc.ball(0.78).setMass(82).setRestitution(0.3).setFriction(0.62).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), dragonBody);
  dragonBody.setAdditionalMass(0, true);
  const modelLoading = createDragonModel(currentSpecies);
  bindControls();
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(animate);
  await modelLoading;
  showToast('Sürükle ve uç. Yapıları parçalamak serbest.');
}

start().catch(error => {
  console.error(error);
  showToast('Oyun başlatılamadı. Sayfayı yenileyip tekrar dene.');
});