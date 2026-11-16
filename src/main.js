import * as THREE from 'three';

/* ══════════════ RENDERER ══════════════ */
const canvas   = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
scene.fog = new THREE.FogExp2(0x05070a, 0.05);

const camera = new THREE.PerspectiveCamera(82, innerWidth / innerHeight, 0.05, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.add(new THREE.HemisphereLight(0x1b2a44, 0x05070a, 0.55));
const moon = new THREE.DirectionalLight(0x9fb8d8, 0.9);
moon.position.set(-40, 60, 25);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
Object.assign(moon.shadow.camera, { left:-60, right:60, top:60, bottom:-60, near:1, far:200 });
scene.add(moon);

const flash = new THREE.SpotLight(0xfff1cf, 130, 48, 0.58, 0.55, 1.6);
flash.target.position.set(0, 0, -1);
camera.add(flash, flash.target);

/* ══════════════ WORLD ══════════════ */
const ARENA = 34;
const colliders = [];
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const crateMat = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.85, metalness: 0.12 });
const wallMat  = new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.95 });

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x0d1218, roughness: 0.96, metalness: 0.05 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function addBox(w, h, d, x, z, mat = crateMat) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(w, h, d);
  m.position.set(x, h / 2, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  colliders.push({ minX: x - w/2, maxX: x + w/2, minZ: z - d/2, maxZ: z + d/2 });
  return m;
}

addBox(ARENA*2, 7, 1.2,  0, -ARENA, wallMat);
addBox(ARENA*2, 7, 1.2,  0,  ARENA, wallMat);
addBox(1.2, 7, ARENA*2, -ARENA, 0, wallMat);
addBox(1.2, 7, ARENA*2,  ARENA, 0, wallMat);

let seed = 1337;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const openSpots = [];
for (let i = 0; i < 60; i++) {
  const a = rand() * Math.PI * 2, r = 6 + rand() * (ARENA - 8);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  addBox(0.9 + rand() * 2.4, 0.7 + rand() * 2.6, 0.9 + rand() * 2.4, x, z);
}
// scattered open points for relic / monsters
for (let i = 0; i < 40; i++) {
  const a = rand() * Math.PI * 2, r = 8 + rand() * (ARENA - 12);
  openSpots.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
}

/* ══════════════ INPUT ══════════════ */
const keys = new Set();
const isTouch = matchMedia('(pointer: coarse)').matches;
const overlay = document.getElementById('overlay');
const hud     = document.getElementById('hud');
const joyEl   = document.getElementById('joy');
const knobEl  = document.getElementById('knob');
const fireBtn = document.getElementById('fireBtn');
const reloadBtn = document.getElementById('reloadBtn');
const useBtn  = document.getElementById('useBtn');

if (isTouch) {
  joyEl.style.display = 'flex';
  fireBtn.style.display = 'flex';
  reloadBtn.style.display = 'flex';
  hud.innerHTML = 'Left pad — move<br>Right — look';
} else {
  hud.innerHTML = 'WASD — move · Shift — sprint<br>LMB — fire · R — reload · E — use';
}

let started = false;
let yaw = 0, pitch = 0;

function startGame() {
  if (started) return;
  started = true;
  overlay.classList.add('hidden');
  if (!isTouch) canvas.requestPointerLock?.();
}

overlay.addEventListener('pointerdown', (e) => { e.preventDefault(); startGame(); });

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyE') tryUse();
});
addEventListener('keyup', (e) => keys.delete(e.code));

canvas.addEventListener('pointerdown', () => {
  if (!started || isTouch) return;
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  else shoot();
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw   -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch  = Math.max(-1.45, Math.min(1.45, pitch));
});

fireBtn.addEventListener('pointerdown',   (e) => { e.stopPropagation(); shoot(); });
reloadBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); reload(); });
useBtn.addEventListener('pointerdown',    (e) => { e.stopPropagation(); tryUse(); });

const joy  = { active:false, id:null, cx:0, cy:0, x:0, y:0, mag:0 };
const look = { active:false, id:null, lx:0, ly:0 };
const JOY_MAX = 55;

function joyCenter() {
  const r = joyEl.getBoundingClientRect();
  joy.cx = r.left + r.width / 2;
  joy.cy = r.top + r.height / 2;
}
joyCenter();
addEventListener('resize', joyCenter);

canvas.addEventListener('pointerdown', (e) => {
  if (!started || !isTouch) return;
  if (e.clientX < innerWidth * 0.45 && !joy.active) {
    joy.active = true; joy.id = e.pointerId; joyCenter();
  } else if (e.clientX >= innerWidth * 0.45 && !look.active) {
    look.active = true; look.id = e.pointerId;
    look.lx = e.clientX; look.ly = e.clientY;
  }
});
addEventListener('pointermove', (e) => {
  if (joy.active && e.pointerId === joy.id) {
    const dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
    const len = Math.hypot(dx, dy) || 1e-4;
    const cl = Math.min(len, JOY_MAX), nx = dx / len, ny = dy / len;
    knobEl.style.transform = `translate(${nx*cl}px, ${ny*cl}px)`;
    joy.x = (nx * cl) / JOY_MAX;
    joy.y = -(ny * cl) / JOY_MAX;
    joy.mag = cl / JOY_MAX;
  }
  if (look.active && e.pointerId === look.id) {
    yaw   -= (e.clientX - look.lx) * 0.0035;
    pitch -= (e.clientY - look.ly) * 0.0035;
    pitch  = Math.max(-1.45, Math.min(1.45, pitch));
    look.lx = e.clientX; look.ly = e.clientY;
  }
});
function endPointer(e) {
  if (e.pointerId === joy.id) {
    joy.active = false; joy.id = null; joy.x = joy.y = joy.mag = 0;
    knobEl.style.transform = 'translate(0,0)';
  }
  if (e.pointerId === look.id) { look.active = false; look.id = null; }
}
addEventListener('pointerup', endPointer);
addEventListener('pointercancel', endPointer);

/* ══════════════ PLAYER ══════════════ */
const SPEED = 5.2, SPRINT = 1.6, EYE = 1.62, RADIUS = 0.42;
const player = { pos: new THREE.Vector3(0,0,6), vel: new THREE.Vector3(), bob:0, hp:100, dead:false };

function resolveCollisions(p, r) {
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx*dx + dz*dz;
    if (d2 < 1e-8) {
      const l = p.x-b.minX, rr = b.maxX-p.x, u = p.z-b.minZ, dn = b.maxZ-p.z;
      const m = Math.min(l, rr, u, dn);
      if (m===l) p.x = b.minX-r; else if (m===rr) p.x = b.maxX+r;
      else if (m===u) p.z = b.minZ-r; else p.z = b.maxZ+r;
      continue;
    }
    if (d2 < r*r) {
      const d = Math.sqrt(d2), push = (r-d)/d;
      p.x += dx*push; p.z += dz*push;
    }
  }
}

/* ══════════════ WEAPON VIEWMODEL ══════════════ */
const weapon = new THREE.Group();
weapon.position.set(0.26, -0.24, -0.52);
camera.add(weapon);

const gunBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.09, 0.11, 0.42),
  new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 0.55, metalness: 0.7 })
);
const gunBarrel = new THREE.Mesh(
  new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8),
  new THREE.MeshStandardMaterial({ color: 0x0e1218, roughness: 0.4, metalness: 0.9 })
);
gunBarrel.rotation.x = Math.PI/2;
gunBarrel.position.set(0, 0.012, -0.3);
const gunGrip = new THREE.Mesh(
  new THREE.BoxGeometry(0.07, 0.16, 0.1),
  new THREE.MeshStandardMaterial({ color: 0x141920, roughness: 0.8 })
);
gunGrip.position.set(0, -0.11, 0.12);
weapon.add(gunBody, gunBarrel, gunGrip);

const muzzle = new THREE.PointLight(0xffb050, 0, 12, 2);
muzzle.position.set(0.26, -0.2, -0.95);
camera.add(muzzle);

const flashSprite = new THREE.Mesh(
  new THREE.SphereGeometry(0.075, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffcf80, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
);
flashSprite.position.copy(muzzle.position);
camera.add(flashSprite);

/* ══════════════ COMBAT STATE ══════════════ */
const MAG_SIZE = 12;
const weaponState = { ammo: MAG_SIZE, reloading: false, reloadEnd: 0, lastShot: 0, recoil: 0, flashT: 0 };
const raycaster = new THREE.Raycaster();
const crosshairEl = document.getElementById('crosshair');
const ammoEl = document.getElementById('ammo');

function updateAmmoUI() {
  ammoEl.innerHTML = `${weaponState.ammo}<span> / ${MAG_SIZE}</span>`;
  ammoEl.classList.toggle('empty', weaponState.ammo === 0);
}

function reload() {
  if (!started || player.dead) return;
  if (weaponState.reloading || weaponState.ammo === MAG_SIZE) return;
  weaponState.reloading = true;
  weaponState.reloadEnd = time + 1.35;
}

function shoot() {
  if (!started || player.dead || weaponState.reloading) return;
  if (time - weaponState.lastShot < 0.12) return;
  if (weaponState.ammo <= 0) { reload(); return; }

  weaponState.lastShot = time;
  weaponState.ammo--;
  updateAmmoUI();

  // camera kick
  weaponState.recoil = 1;
  pitch = Math.min(1.45, pitch + 0.018);
  yaw  += (Math.random() - 0.5) * 0.006;

  // muzzle flash
  weaponState.flashT = 0.055;
  muzzle.intensity = 42;
  flashSprite.material.opacity = 1;
  flashSprite.rotation.z = Math.random() * Math.PI;

  // loud noise — this is the whole game
  emitNoise(player.pos, 80);

  // raycast
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  raycaster.far = 120;
  const targets = monsters.filter(m => !m.dead).map(m => m.group);
  const hits = raycaster.intersectObjects(targets, true);

  // tracer
  const end = hits.length
    ? hits[0].point.clone()
    : camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(60));
  spawnTracer(camera.position.clone(), end);

  if (hits.length) {
    const mon = monsters.find(m => !m.dead && isDescendant(hits[0].object, m.group));
    if (mon) {
      mon.hp -= 22;
      mon.staggerUntil = time + 0.28;
      mon.alertTo(player.pos);
      crosshairEl.classList.add('hit');
      setTimeout(() => crosshairEl.classList.remove('hit'), 90);
      if (mon.hp <= 0) killMonster(mon);
    }
  }
}

function isDescendant(o, root) {
  while (o) { if (o === root) return true; o = o.parent; }
  return false;
}

const tracers = [];
function spawnTracer(a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tracers.push({ line, life: 0.07 });
}

/* ══════════════ NOISE SYSTEM ══════════════ */
const noise = { pos: new THREE.Vector3(), radius: 0, lastAt: -999, visual: 0 };

function emitNoise(pos, radius) {
  noise.pos.copy(pos);
  noise.radius = Math.max(noise.radius, radius);
  noise.lastAt = time;
  noise.visual = Math.min(1, radius / 80);
}

/* ══════════════ MONSTER ══════════════ */
const monsters = [];

function createMonster() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x181318, roughness: 0.92, metalness: 0.04 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.05, 4, 8), skin);
  torso.position.y = 1.55; torso.castShadow = true; g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
  head.position.y = 2.42; g.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  const eyeGeo = new THREE.SphereGeometry(0.052, 8, 6);
  const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.095, 2.47, -0.23);
  const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set( 0.095, 2.47, -0.23);
  g.add(eL, eR);

  const armGeo = new THREE.CapsuleGeometry(0.085, 1.25, 4, 6);
  const aL = new THREE.Mesh(armGeo, skin); aL.position.set(-0.48, 1.45, 0); g.add(aL);
  const aR = new THREE.Mesh(armGeo, skin); aR.position.set( 0.48, 1.45, 0); g.add(aR);

  const legGeo = new THREE.CapsuleGeometry(0.105, 0.95, 4, 6);
  const lL = new THREE.Mesh(legGeo, skin); lL.position.set(-0.15, 0.5, 0); g.add(lL);
  const lR = new THREE.Mesh(legGeo, skin); lR.position.set( 0.15, 0.5, 0); g.add(lR);

  const glow = new THREE.PointLight(0xff1a1a, 2.2, 5.5, 2);
  glow.position.y = 2.45; g.add(glow);

  scene.add(g);

  return {
    group: g, hp: 100, dead: false,
    state: 'PATROL',
    pos: new THREE.Vector3(),
    target: new THREE.Vector3(),
    lastHeard: new THREE.Vector3(),
    lastHeardAt: -999,
    staggerUntil: 0,
    attackCd: 0,
    respawnAt: 0,
    spawn() {
      const spot = openSpots[Math.floor(Math.random() * openSpots.length)];
      this.pos.copy(spot);
      this.group.position.copy(spot);
      this.hp = 100; this.dead = false;
      this.state = 'PATROL';
      this.group.visible = true;
      this.target.copy(openSpots[Math.floor(Math.random() * openSpots.length)]);
    },
    alertTo(p) {
      this.lastHeard.copy(p);
      this.lastHeardAt = time;
      this.state = 'HUNT';
      this.target.copy(p);
    }
  };
}

for (let i = 0; i < 2; i++) {
  const m = createMonster();
  monsters.push(m);
  m.spawn();
}

function killMonster(m) {
  m.dead = true;
  m.group.visible = false;
  m.respawnAt = time + 26;
  emitNoise(m.pos, 40); // its death scream draws the other one
}

function updateMonster(m, dt) {
  if (m.dead) {
    if (time > m.respawnAt) m.spawn();
    return;
  }
  if (m.staggerUntil > time) return;

  // hearing
  if (time - noise.lastAt < 0.4) {
    const d = m.pos.distanceTo(noise.pos);
    if (d < noise.radius) m.alertTo(noise.pos);
  }

  // state machine
  if (m.state === 'HUNT' && time - m.lastHeardAt > 4.5) m.state = 'PATROL';

  if (m.state === 'PATROL' && m.pos.distanceTo(m.target) < 1.5) {
    m.target.copy(openSpots[Math.floor(Math.random() * openSpots.length)]);
  }

  const speed = m.state === 'HUNT' ? 4.3 : 1.7;
  const dir = m.target.clone().sub(m.pos); dir.y = 0;
  const dist = dir.length();
  if (dist > 0.05) {
    dir.normalize();
    m.pos.addScaledVector(dir, speed * dt);
    m.group.rotation.y = Math.atan2(-dir.x, -dir.z);
  }

  // keep inside arena + avoid walls crudely
  resolveCollisions(m.pos, 0.55);
  m.pos.x = Math.max(-ARENA + 1.6, Math.min(ARENA - 1.6, m.pos.x));
  m.pos.z = Math.max(-ARENA + 1.6, Math.min(ARENA - 1.6, m.pos.z));

  // attack
  m.attackCd -= dt;
  const pd = m.pos.distanceTo(player.pos);
  if (pd < 2.1 && m.attackCd <= 0 && !player.dead) {
    m.attackCd = 1.25;
    damagePlayer(22);
    // shove
    const away = player.pos.clone().sub(m.pos).setY(0).normalize();
    player.vel.addScaledVector(away, 9);
  }

  m.group.position.copy(m.pos);
  m.group.position.y = Math.sin(time * 3 + m.pos.x) * 0.04;

  // eye pulse when hunting
  m.group.children.forEach(c => {
    if (c.material && c.material.color && c.material.color.r > 0.9 && c.material.color.g < 0.3) {
      c.material.color.setRGB(1, 0.12 + Math.sin(time * 8) * 0.08, 0.12);
    }
  });
}

/* ══════════════ RELIC + EXTRACTION ══════════════ */
const EXTRACT_TIME = 120;

const relicGroup = new THREE.Group();
const relicOrb = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.32, 1),
  new THREE.MeshStandardMaterial({ color: 0x6ee7b7, emissive: 0x34d399, emissiveIntensity: 2.2, roughness: 0.3 })
);
relicGroup.add(relicOrb);
const relicLight = new THREE.PointLight(0x34d399, 6, 12, 2);
relicGroup.add(relicLight);
scene.add(relicGroup);

const beaconGroup = new THREE.Group();
const beaconPillar = new THREE.Mesh(
  new THREE.CylinderGeometry(1.6, 1.6, 60, 20, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
);
beaconPillar.position.y = 30;
const beaconRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.7, 0.06, 8, 32),
  new THREE.MeshBasicMaterial({ color: 0x93c5fd })
);
beaconRing.rotation.x = Math.PI / 2;
beaconRing.position.y = 0.06;
beaconGroup.add(beaconPillar, beaconRing);
beaconGroup.visible = false;
scene.add(beaconGroup);

const game = { phase: 'FIND', timerEnd: 0 };

function placeRelic() {
  const spot = openSpots[Math.floor(Math.random() * openSpots.length)];
  relicGroup.position.copy(spot);
  relicGroup.position.y = 1.0;
  relicGroup.visible = true;
}

const BEACON_POS = new THREE.Vector3(0, 0, -ARENA + 6);
beaconGroup.position.copy(BEACON_POS);

function tryUse() {
  if (!started || player.dead) return;
  if (game.phase === 'FIND' && player.pos.distanceTo(relicGroup.position) < 2.2) {
    game.phase = 'EXTRACT';
    game.timerEnd = time + EXTRACT_TIME;
    relicGroup.visible = false;
    beaconGroup.visible = true;
    emitNoise(player.pos, 95); // picking it up is loud
    document.getElementById('objective').textContent = 'Reach the beacon';
    timerEl.classList.add('on');
  }
}

const timerEl = document.getElementById('timer');
const objectiveEl = document.getElementById('objective');
const hpBarEl = document.getElementById('hpbar');
const noiseFill = document.getElementById('noisefill');
const dangerEl = document.getElementById('danger');

function damagePlayer(amount) {
  if (player.dead) return;
  player.hp = Math.max(0, player.hp - amount);
  hpBarEl.style.width = player.hp + '%';
  hpBarEl.style.background = player.hp > 60 ? '#4ade80' : player.hp > 30 ? '#facc15' : '#ff5252';
  if (player.hp <= 0) die('THE ISLAND TOOK YOU');
}

function die(reason) {
  player.dead = true;
  overlay.className = 'dead';
  overlay.innerHTML = `<h1>${reason}</h1><p>Tap / click to try again</p>`;
  overlay.classList.remove('hidden');
  overlay.addEventListener('pointerdown', () => location.reload(), { once: true });
  document.exitPointerLock?.();
}

function win() {
  overlay.className = 'win';
  overlay.innerHTML = `<h1>EXTRACTED</h1><p>You made it out.<br>Tap / click to run again</p>`;
  overlay.classList.remove('hidden');
  overlay.addEventListener('pointerdown', () => location.reload(), { once: true });
  document.exitPointerLock?.();
  game.phase = 'DONE';
  player.dead = true;
}

placeRelic();
updateAmmoUI();

/* ══════════════ MAIN LOOP ══════════════ */
const clock = new THREE.Clock();
let time = 0;

function update(dt) {
  time += dt;

  /* ---- player movement ---- */
  if (!player.dead) {
    let fwd = 0, strafe = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp'))    fwd    += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown'))  fwd    -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft'))  strafe -= 1;
    fwd += joy.y; strafe += joy.x;

    let wl = Math.hypot(strafe, fwd);
    if (wl > 1) { strafe /= wl; fwd /= wl; wl = 1; }

    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight') || joy.mag > 0.92;
    const speed = SPEED * (sprinting && wl > 0.1 ? SPRINT : 1);

    const s = Math.sin(yaw), c = Math.cos(yaw);
    const wx =  c*strafe - s*fwd;
    const wz = -s*strafe - c*fwd;

    const k = 1 - Math.exp(-13*dt);
    player.vel.x += (wx*speed - player.vel.x) * k;
    player.vel.z += (wz*speed - player.vel.z) * k;

    player.pos.x += player.vel.x * dt;
    player.pos.z += player.vel.z * dt;
    resolveCollisions(player.pos, RADIUS);
    player.pos.x = Math.max(-ARENA + 1.5, Math.min(ARENA - 1.5, player.pos.x));
    player.pos.z = Math.max(-ARENA + 1.5, Math.min(ARENA - 1.5, player.pos.z));

    /* noise from movement */
    const spd = Math.hypot(player.vel.x, player.vel.z);
    if (spd > 0.6) {
      const r = sprinting ? 24 : 7;
      if (time - noise.lastAt > 0.25) emitNoise(player.pos, r);
      else noise.radius = Math.max(noise.radius, r);
    }

    /* head bob */
    playe
