// --- SETUP BLACKOUT OVERLAY ---
const blackoutDiv = document.createElement('div');
blackoutDiv.style.position = 'fixed';
blackoutDiv.style.top = '0';
blackoutDiv.style.left = '0';
blackoutDiv.style.width = '100%';
blackoutDiv.style.height = '100%';
blackoutDiv.style.backgroundColor = 'black';
blackoutDiv.style.opacity = '0'; // Awal transparan
blackoutDiv.style.pointerEvents = 'none'; // Agar bisa klik tembus
blackoutDiv.style.transition = 'opacity 0.5s ease-in-out'; // Animasi fade
blackoutDiv.style.zIndex = '9999';
document.body.appendChild(blackoutDiv);

function triggerBlackout(fadeIn) {
    blackoutDiv.style.opacity = fadeIn ? '1' : '0';
}

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GUI } from 'three/addons/libs/lil-gui.module.min.js'
// IMPORT SKY (Wajib untuk atmosfer baru)
import { Sky } from 'three/addons/objects/Sky.js'

const scene = new THREE.Scene()

// --- SETTING RENDERER (Disesuaikan dengan Lighting Golden Hour) ---
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
// Tone mapping Exposure diturunkan sedikit agar matahari sore terlihat dramatis
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
document.body.appendChild(renderer.domElement)

// setup kamera awal
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 5000) // Far clip diperjauh
camera.position.set(-72.87, 0.89, 1.29)
camera.up.set(-0.28, 1.00, 0.00)

// controls
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.target.set(-80.31, -1.60, -11.59)
controls.update()

// ==========================================
// --- BAGIAN LIGHTING & ATMOSFER BARU ---
// ==========================================

// 1. SKYBOX (Procedural Sky)
const sky = new Sky();
sky.scale.setScalar(4500); // Ukuran raksasa
scene.add(sky);

const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 10;
skyUniforms['rayleigh'].value = 3; // Semakin tinggi, semakin merah (efek sore)
skyUniforms['mieCoefficient'].value = 0.005;
skyUniforms['mieDirectionalG'].value = 0.7;

const sun = new THREE.Vector3();
// Konfigurasi posisi matahari (Sore hari)
const elevation = 2;   // 0 sampai 90 (2 = sangat rendah/mau terbenam)
const azimuth = 320;   // Rotasi keliling (180 = depan/samping)

const phi = THREE.MathUtils.degToRad(90 - elevation);
const theta = THREE.MathUtils.degToRad(azimuth);
sun.setFromSphericalCoords(1, phi, theta);

skyUniforms['sunPosition'].value.copy(sun);

// 2. FOG (Kabut agar menyatu dengan cakrawala)
const fogColor = new THREE.Color(0xcc8855);
scene.fog = new THREE.FogExp2(fogColor, 0.008);

// 3. HEMISPHERE LIGHT (Pengganti Ambient Light)
const hemiLight = new THREE.HemisphereLight(0xffeeb1, 0x080820, 2);
scene.add(hemiLight);

// 4. DIRECTIONAL LIGHT (Matahari Utama)
const dirLight = new THREE.DirectionalLight(0xffaa33, 6) // Warna Emas/Oranye
dirLight.position.set(-60, 20, 80);
dirLight.castShadow = true

// Setup kualitas bayangan
dirLight.shadow.mapSize.width = 4096
dirLight.shadow.mapSize.height = 4096
dirLight.shadow.bias = -0.0005;
dirLight.shadow.radius = 2;

// Area cakupan bayangan
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 500;
dirLight.shadow.camera.left = -150;
dirLight.shadow.camera.right = 150;
dirLight.shadow.camera.top = 100;
dirLight.shadow.camera.bottom = -100;
scene.add(dirLight)

// ==========================================
// --- LOGIC GAME & ANIMASI ---
// ==========================================

const clock = new THREE.Clock()
let mixer

// logic variables
let isMoviePlaying = false
let isManualMode = false
let scene6StartTime = 0;
let scene7StartTime = 0;
let scene8StartTime = 0;
let scene9StartTime = 0;
let scene10StartTime = 0;
let scene11StartTime = 0;
let scene12StartTime = 0;
let scene13StartTime = 0;

// loaders
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

// game objects
let ballModel = null
let playerModel = null
let playerAnimations = [];

// --- Helper Functions ---

function fixMaterials(model) {
    model.traverse((child) => {
        if (child.isMesh) {
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => fixMaterialProperties(mat));
                } else {
                    fixMaterialProperties(child.material);
                }
                child.castShadow = true;
                child.receiveShadow = true;
            }
        }
    });
}

function fixMaterialProperties(material) {
    material.transparent = false;
    material.opacity = 1.0;
    material.alphaTest = 0.5;
    material.side = THREE.FrontSide;
    material.needsUpdate = true;
    material.depthTest = true;
    material.depthWrite = true;
    if (material.map) {
        material.map.encoding = THREE.sRGBEncoding;
        material.map.needsUpdate = true;
    }
}

// --- LOADERS ---

// 1. LOAD LAMPU (Kode Baru disisipkan di sini)
gltfLoader.load('./lamp.glb', function (gltf) {
    const lampModel = gltf.scene;

    // Skala
    const scaleFactor = 0.01;
    lampModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    lampModel.updateMatrixWorld(true);

    // Bounding Box
    const box = new THREE.Box3().setFromObject(lampModel);

    // Posisi Target
    const targetX = 2;
    const targetY = 0.57; // Tinggi tanah/jalan
    const targetZ = -20.00;

    lampModel.position.set(targetX, 0, targetZ);

    // Auto-grounding (Y adjustment)
    const bottomOffset = box.min.y;
    lampModel.position.y = targetY - bottomOffset;

    // Material & Add to Scene
    fixMaterials(lampModel);
    scene.add(lampModel);

    // Cahaya Biru Lampu
    const lightHeight = (box.max.y - box.min.y) * 0.9;
    const blueLight = new THREE.PointLight(0x0088ff, 300, 25);
    blueLight.position.set(targetX, lampModel.position.y + lightHeight, targetZ);
    blueLight.castShadow = true;
    blueLight.shadow.bias = -0.0001;
    scene.add(blueLight);
});

// 2. Load Bola
const ballRadius = 2.5
const startBallPos = { x: -75, y: ballRadius, z: 0 }
gltfLoader.load('./beach_ball.glb', function (gltf) {
    ballModel = gltf.scene;
    ballModel.scale.set(0.2, 0.2, 0.2);
    const fixedY = 0.2;
    ballModel.position.set(startBallPos.x, fixedY, startBallPos.z);

    fixMaterials(ballModel); // Pakai fixMaterials biar konsisten
    scene.add(ballModel);
});

// 3. Load Environment
gltfLoader.load('./env2_optimized.glb', function (gltf) {
    const model = gltf.scene;
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.name.toLowerCase().includes('cube') && child.scale.x < 0.1) {
                child.visible = false;
            }
        }
    });
    scene.add(model);
});

// 4. Load Player Utama
gltfLoader.load('./player_kid.glb', function (gltf) {
    playerModel = gltf.scene;
    playerAnimations = gltf.animations;
    playerModel.scale.set(0.6, 0.6, 0.6);
    playerModel.position.set(-95, 0, 0);
    playerModel.rotation.y = 1.570796;

    fixMaterials(playerModel);

    scene.add(playerModel);
    mixer = new THREE.AnimationMixer(playerModel);
    if (playerAnimations.length > 0) {
        switchPlayerAnimation('run');
    }
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) loadingDiv.style.display = 'none';
});

// 5. Load Player Kick
let kickModel = null
let kickMixer = null
let isKickPlaying = false
let kickStartTime = 0
let playerKickPosition = { x: 0, z: 0 }
let kickCompleted = false

gltfLoader.load('./player_kid_kick.glb', function (gltf) {
    kickModel = gltf.scene;
    kickModel.scale.set(0.4, 0.4, 0.4);
    kickModel.position.set(0, 0, 0);
    kickModel.visible = false;
    fixMaterials(kickModel);
    scene.add(kickModel);
    if (gltf.animations.length > 0) {
        kickMixer = new THREE.AnimationMixer(kickModel);
        const kickAction = kickMixer.clipAction(gltf.animations[0]);
        kickAction.setLoop(THREE.LoopOnce);
        kickAction.clampWhenFinished = true;
        kickAction.play();
        kickAction.paused = true;
    }
});

// 6. Load Player Stall (Juggling)
let stallModel = null
let stallMixer = null
let stallAnimation = null
let stallJuggleComplete = false
let scene8Phase = 0
let juggleProgress = 0
let crouchStartTime = 0;


gltfLoader.load('./stall_soccer_kid.glb', function (gltf) {
    stallModel = gltf.scene;
    stallModel.scale.set(0.6, 0.6, 0.6);
    stallModel.visible = false;
    stallModel.rotation.set(0, 0, 0);
    stallModel.rotation.y = 1.570796;
    fixMaterials(stallModel);
    scene.add(stallModel);

    if (gltf.animations.length > 0) {
        stallMixer = new THREE.AnimationMixer(stallModel);
        stallAnimation = stallMixer.clipAction(gltf.animations[0]);
        stallAnimation.setLoop(THREE.LoopRepeat);
        stallAnimation.play();
        stallAnimation.paused = true;
    }
});

let lookModel = null
let lookMixer = null

gltfLoader.load('./kid_lookaround.glb', function (gltf) { // File baru
    lookModel = gltf.scene;

    // Scale & Posisi (Tetap sama sesuai request)
    const scaleFactor = 0.5;
    lookModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
    lookModel.visible = false;

    fixMaterials(lookModel);
    scene.add(lookModel);

    if (gltf.animations.length > 0) {
        lookMixer = new THREE.AnimationMixer(lookModel);
        const action = lookMixer.clipAction(gltf.animations[0]);
        action.play();
    }
}, undefined, function (error) {
    console.error(error);
});

// neighbor
let neighborModel = null
let neighborMixer = null
let neighborAnimations = []
let neighborHasFallen = false

// --- LOADER NEIGHBOR (Sisipkan di bagian Loaders) ---
gltfLoader.load('./neighbor.glb', function (gltf) {
    neighborModel = gltf.scene;
    neighborAnimations = gltf.animations;

    neighborModel.scale.set(0.7, 0.7, 0.7);

    neighborModel.position.set(3.86, 0, -17.32);

    neighborModel.rotation.y = Math.PI / 2;

    neighborModel.visible = false;
    fixMaterials(neighborModel);
    scene.add(neighborModel);

    neighborMixer = new THREE.AnimationMixer(neighborModel);
});

let disbeliefModel = null;
let disbeliefMixer = null;
let scene13Phase = 0;

gltfLoader.load('./neighbor_disbelief.glb', function (gltf) {
    disbeliefModel = gltf.scene;

    disbeliefModel.scale.set(0.45, 0.45, 0.45);

    // Posisi
    disbeliefModel.position.set(1.14, 0, -22.67);
    disbeliefModel.lookAt(1.13, 1.38, -21.80);

    // Posisi awal disembunyikan
    disbeliefModel.visible = false;
    fixMaterials(disbeliefModel);
    scene.add(disbeliefModel);

    disbeliefMixer = new THREE.AnimationMixer(disbeliefModel);

    // Mainkan animasi default (disbelief)
    if (gltf.animations.length > 0) {
        const action = disbeliefMixer.clipAction(gltf.animations[0]);
        action.play();
    }
});

// HELPER FUNCTION
// --- UPDATE HELPER FUNCTION ---
function switchNeighborAnimation(animName) {
    if (!neighborMixer || !neighborAnimations.length) return;

    let clipName = '';
    // Mapping nama animasi
    if (animName === 'idle') clipName = 'Idle';
    else if (animName === 'fall') clipName = 'fall_run';
    else if (animName === 'look') clipName = 'LookAround';
    // Animasi Baru untuk Scene 13
    else if (animName === 'run_attack') clipName = 'RunAttack';
    else if (animName === 'jump_start') clipName = 'JumpStart';
    else if (animName === 'jump_loop') clipName = 'JumpLoop';

    const clip = neighborAnimations.find(a => a.name.toLowerCase().includes(clipName.toLowerCase()));

    if (clip) {
        // Jangan stopAllAction jika kita ingin blending, tapi untuk kasus ini cut action
        const action = neighborMixer.clipAction(clip);

        if (animName === 'jump_start') {
            neighborMixer.stopAllAction();
            action.reset();
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
            action.play();
        }
        else if (animName === 'jump_loop') {
            // Crossfade dari jump_start ke jump_loop
            action.reset();
            action.play();
            // action.crossFadeFrom(prevAction, 0.2, true); // Opsional
        }
        else {
            neighborMixer.stopAllAction();
            action.reset();
            action.play();
        }
    }
}

// --- LOGIC VARIABLES & PHYSICS ---
const ballPhysics = {
    velocity: 0,
    velocityY: 0,
    gravity: 35,
    groundFriction: 0.999,
    airDrag: 0.999,
    isKicked: false,
    kickPower: 8,
    kickLift: 18,
    targetX: -4.0,
    stopThreshold: 0.005
}

const charParams = {
    speed: 1,
    animSpeed: 0.9,
    isRunning: true
}

const cineParams = {
    active: false,
    speedX: 0,
    speedZ: 0
}

// --- GUI SETUP ---
const gui = new GUI({ title: "Production Panel" })
// (Folder Atmosfer opsional, untuk debug lighting jika perlu)
const atmosFolder = gui.addFolder('Atmosphere');
const sunParams = { elevation: 2, azimuth: 320 };
function updateSun() {
    const phi = THREE.MathUtils.degToRad(90 - sunParams.elevation);
    const theta = THREE.MathUtils.degToRad(sunParams.azimuth);
    const sunPos = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms['sunPosition'].value.copy(sunPos);
}
atmosFolder.add(sunParams, 'elevation', 0, 90).onChange(updateSun);
atmosFolder.add(sunParams, 'azimuth', 0, 360).onChange(updateSun);

const manualObj = {
    enableManual: false,
    saveLog: () => {
        const logText = `
// Scene Data Copied:
pos: new THREE.Vector3(${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}),
tgt: new THREE.Vector3(${controls.target.x.toFixed(2)}, ${controls.target.y.toFixed(2)}, ${controls.target.z.toFixed(2)}),
roll: new THREE.Vector3(${camera.up.x.toFixed(2)}, ${camera.up.y.toFixed(2)}, ${camera.up.z.toFixed(2)}),
        `;
        console.log(logText);
        alert("Koordinat dicetak di Console (F12) & Clipboard!");
        navigator.clipboard.writeText(logText);
    }
};

const manualFolder = gui.addFolder('Mode Manual / Camera Tool');
manualFolder.add(manualObj, 'enableManual').name('Enable Free Cam').onChange(v => {
    isManualMode = v;
    if (v) {
        cineParams.active = false;
        isMoviePlaying = false;
        controls.enabled = true;
    }
});
manualFolder.add(manualObj, 'saveLog').name('PRINT COORDINATES');

// Helper Function: Switch Player Animation
function switchPlayerAnimation(animType) {
    if (!mixer || !playerAnimations.length) return;

    let clipName = '';
    if (animType === 'run') {
        clipName = 'runcasual';
    } else if (animType === 'walk') {
        clipName = 'player_body_Anim_rig_Walking';
    } else if (animType === 'idle') {
        clipName = 'idle';
    }
    else if (animType === 'stall') {
        clipName = 'stall';
    }
    else if (animType === 'crouch') {
        clipName = 'crouch_start';
    }
    else if (animType === 'crouchwalk') {
        clipName = 'crouch_walking_forward';
    }

    const clip = playerAnimations.find(a => a.name.toLowerCase().includes(clipName.toLowerCase()));

    if (clip) {
        if (mixer.currentAction && mixer.currentAction.getClip().name === clip.name) {
            mixer.currentAction.paused = false;
            return;
        }

        mixer.stopAllAction();
        const newAction = mixer.clipAction(clip);
        newAction.reset();
        newAction.paused = false;
        newAction.fadeIn(0.2);

        if (animType === 'crouch') {
            newAction.setLoop(THREE.LoopOnce);
            newAction.clampWhenFinished = true;
            newAction.timeScale = 0.25;
        } else {
            newAction.play();
            if (animType === 'walk') {
                newAction.timeScale = 0.8;
            }
            else if (animType === 'crouchwalk') {
                newAction.timeScale = 0.4;
            }
            else newAction.timeScale = charParams.animSpeed;
        }

        newAction.play();
        mixer.currentAction = newAction;
    }
}

// list scenenya (DATA KAMERA MAIN TETAP DIPERTAHANKAN)
const sceneList = {
    scene1: {
        pos: new THREE.Vector3(-72.87, 0.89, 1.29),
        tgt: new THREE.Vector3(-80.31, -1.60, -11.59),
        roll: new THREE.Vector3(-0.28, 1.00, 0.00),
    },
    scene2: {
        pos: new THREE.Vector3(-85.41, 0.53, 1.49),
        tgt: new THREE.Vector3(-85.41, 0.2, 0.0),
        roll: new THREE.Vector3(-0.28, 1.00, 0.00),
    },
    scene3: {
        pos: new THREE.Vector3(-74.5, 0.39, 0.83),
        tgt: new THREE.Vector3(-81.82, -2.40, -9.72),
        roll: new THREE.Vector3(-0.28, 1.00, 0.00),
    },
    scene4: {
        pos: new THREE.Vector3(0, 1.7, 1.5),
        tgt: new THREE.Vector3(0, 1.5, 0),
        roll: new THREE.Vector3(-0.2, 1.00, 0.00),
    },
    scene5: {
        pos: new THREE.Vector3(5, 0.8, 0),
        tgt: new THREE.Vector3(0, 0.8, 0),
        roll: new THREE.Vector3(0, 1, 0),
    },
    scene6: {
        pos: new THREE.Vector3(0, 0, 0),
        tgt: new THREE.Vector3(0, 0, 0),
        roll: new THREE.Vector3(0, 1, 0),
    },
    scene7: {
        pos: new THREE.Vector3(-6.70, 0.22, 0.90),
        tgt: new THREE.Vector3(-6.71, 0.33, -0.72),
        roll: new THREE.Vector3(0.00, 1.00, 0.00),
    },
    scene8: {
        pos: new THREE.Vector3(-5.24, 1.95, -3.29),
        tgt: new THREE.Vector3(-6.58, 1.13, -0.59),
        roll: new THREE.Vector3(0.00, 1.00, 0.00),
    },
    scene9: {
        pos: new THREE.Vector3(-6.22, 1.13, 4.26),
        tgt: new THREE.Vector3(-5.78, 1.33, 0.11),
        roll: new THREE.Vector3(0.00, 1.00, 0.00),
    },
    scene10: {
        pos: new THREE.Vector3(3.06, 1.15, -9.81),
        tgt: new THREE.Vector3(3.77, 1.83, -21.06),
        roll: new THREE.Vector3(0.00, 1.00, 0.00),
    },
    scene11: {
        pos: new THREE.Vector3(-4.22, 2.30, 9.97),
        tgt: new THREE.Vector3(0.95, 1.34, -21.11),
        roll: new THREE.Vector3(0.00, 1.00, 0.00),
    },
    scene12: {
        pos: new THREE.Vector3(2.43, 1.39, -16.38),
        tgt: new THREE.Vector3(1.87, 1.24, -15.30),
        roll: new THREE.Vector3(0.00, 1.00, 0.00),
    },
    scene13: {
        pos: new THREE.Vector3(0.33, 1.56, -15.32),
        tgt: new THREE.Vector3(1.90, -2.16, -21.81),
        roll: new THREE.Vector3(0.50, 1.00, 0.00),
    },
}

function cutTo(sceneKey) {
    const data = sceneList[sceneKey];
    if (!data) return;
    director.currentScene = sceneKey;

    if (playerModel) playerModel.visible = true;
    if (stallModel) stallModel.visible = false;
    if (kickModel) kickModel.visible = false;

    if (sceneKey !== 'scene4' && sceneKey !== 'scene6') {
        camera.position.copy(data.pos);
        controls.target.copy(data.tgt);
    }
    camera.up.copy(data.roll);

    cineParams.active = false;
    controls.update();

    if (sceneKey === 'scene5') {
        setupKickScene();
    }

    if (sceneKey === 'scene6') {
        scene6StartTime = clock.getElapsedTime();
    }

    if (sceneKey === 'scene7') {
        scene7StartTime = clock.getElapsedTime();

        if (playerModel) {
            playerModel.position.set(-10, 0, 0);
            playerModel.position.y = 0;
            switchPlayerAnimation('walk');
        }

        if (ballModel) {
            ballModel.position.set(-10, 0.2, 0);
            ballModel.rotation.set(0, 0, 0);

            ballPhysics.velocity = 5.0;
            ballPhysics.velocityY = 0;
            ballPhysics.isKicked = true;
        }
    }

    if (sceneKey === 'scene8') {
        scene8StartTime = clock.getElapsedTime();
        scene8Phase = 0;
        stallJuggleComplete = false;
        juggleProgress = 0;
        const playerX = playerModel ? playerModel.position.x : -6.5;

        if (stallModel) {
            if (playerModel) playerModel.visible = false;
            stallModel.visible = true;
            stallModel.position.set(playerX, 0, 0);
            stallModel.rotation.set(0, 0, 0);
            stallModel.rotation.y = 1.570796;
            if (stallAnimation) {
                stallAnimation.reset();
                stallAnimation.paused = true;
                stallAnimation.timeScale = 1.0;
                stallAnimation.time = 0;
            }
        }

        if (ballModel) {
            ballModel.position.x = playerX + 0.5;
            ballModel.position.z = 0;
            ballModel.position.y = 0.2;
            ballModel.rotation.set(0, 0, 0);
            ballPhysics.isKicked = false;
            ballPhysics.velocity = 0;
            ballPhysics.velocityY = 0;
            ballModel.visible = true;
        }
    }

    if (sceneKey === 'scene9') {
        scene9StartTime = clock.getElapsedTime();
        neighborHasFallen = false; // Reset agar bisa jatuh lagi

        if (playerModel) playerModel.visible = false;
        if (stallModel) stallModel.visible = false;

        // Tampilkan target zoom (Anak Kecil)
        if (lookModel) {
            lookModel.visible = true;
            lookModel.position.set(-7.5, 0, 0);
            lookModel.rotation.set(0, Math.PI, 0);
        }

        // Tampilkan Neighbor (Posisi Awal: IDLE / BERDIRI)
        if (neighborModel) {
            neighborModel.visible = true;
            neighborModel.position.set(3.86, 0, -17.32);
            neighborModel.rotation.y = Math.PI / 2;
            switchNeighborAnimation('idle');
        }
    }

    if (sceneKey === 'scene10') {
        scene10StartTime = clock.getElapsedTime();

        // 1. PASTIKAN LOOK AROUND MUNCUL
        if (neighborModel) {
            neighborModel.visible = true;
            neighborModel.position.set(3.86, 0, -17.32);
            neighborModel.rotation.y = Math.PI;

            // Force Reset Mixer agar animasi jalan
            if (neighborMixer) neighborMixer.stopAllAction();
            switchNeighborAnimation('look');
        }

        if (disbeliefModel) disbeliefModel.visible = false;

        // Player Utama Idle
        if (playerModel) {
            switchPlayerAnimation('idle');
            playerModel.visible = true;
        }

        if (stallModel) stallModel.visible = false;
        if (lookModel) lookModel.visible = false;

        camera.position.copy(sceneList.scene10.pos);
        controls.target.copy(sceneList.scene10.tgt);
        camera.up.copy(sceneList.scene10.roll);
    }

    if (sceneKey === 'scene11') {
        scene11StartTime = clock.getElapsedTime();

        if (neighborModel) neighborModel.visible = false;
        if (disbeliefModel) disbeliefModel.visible = false;

        camera.position.copy(sceneList.scene11.pos);
        controls.target.copy(sceneList.scene11.tgt);
        camera.up.copy(sceneList.scene11.roll);

        if (playerModel) {
            playerModel.visible = true;
            if (stallModel) stallModel.visible = false;
            playerModel.position.set(-6.21, 0, -1.59);
            playerModel.rotation.set(0, THREE.MathUtils.degToRad(160), 0);
            switchPlayerAnimation('crouchwalk');
        }
    }
    if (sceneKey === 'scene12') {
        scene12StartTime = clock.getElapsedTime();
        camera.position.copy(sceneList.scene12.pos);
        controls.target.copy(sceneList.scene12.tgt);
        camera.up.copy(sceneList.scene12.roll);

        if (playerModel) {
            playerModel.visible = true;
            if (stallModel) stallModel.visible = false;
        }
    }

    if (sceneKey === 'scene13') {
        scene13StartTime = clock.getElapsedTime();
        scene13Phase = 0;

        if (playerModel) playerModel.visible = false;
        if (stallModel) stallModel.visible = false;

        // --- SETUP NEIGHBOR DISBELIEF ---
        if (disbeliefModel) {
            disbeliefModel.visible = true;
            disbeliefModel.position.set(1.14, 0, -22.67);
            // ROTASI 180 DERAJAT
            disbeliefModel.rotation.set(0, 0, 0);
        }

        if (neighborModel) {
            neighborModel.visible = false;
            neighborModel.position.set(1.14, 0, -22.67);
            neighborModel.rotation.set(0, Math.PI, 0);

            // Inisialisasi timer di userData
            neighborModel.userData.freezeTimer = 0;
            neighborModel.userData.jumpTimer = 0;

            switchNeighborAnimation('idle'); // Awalnya idle/diam dulu sebelum lari
            if (neighborMixer) neighborMixer.stopAllAction();
        }

        camera.position.copy(sceneList.scene13.pos);
        controls.target.copy(sceneList.scene13.tgt);
        camera.up.copy(sceneList.scene13.roll);
    }
}

function setupKickScene() {
    if (playerModel) {
        playerKickPosition.x = playerModel.position.x;
        playerKickPosition.z = playerModel.position.z;

        if (ballModel) {
            ballModel.position.set(playerKickPosition.x + 1, 0.2, playerKickPosition.z);
            ballModel.rotation.set(0, 0, 0);
            ballPhysics.velocity = 0;
            ballPhysics.velocityY = 0;
            ballPhysics.isKicked = false;
        }
        playerModel.visible = true;
        switchPlayerAnimation('run');
    }

    if (kickModel) {
        kickModel.visible = false;
        kickModel.position.set(playerKickPosition.x, 0, playerKickPosition.z);
    }
    isKickPlaying = false;
    kickCompleted = false;
}

function playKickAnimation() {
    if (!kickModel || !kickMixer) return;

    if (playerModel) playerModel.visible = false;
    kickModel.visible = true;
    kickModel.position.set(playerKickPosition.x, 0, playerKickPosition.z);
    kickModel.rotation.set(0, 0, 0);
    kickModel.rotation.y = Math.PI / 2;

    isKickPlaying = true;
    kickCompleted = false;
    kickStartTime = clock.getElapsedTime();

    const kickAction = kickMixer._actions[0];
    if (kickAction) {
        kickAction.reset();
        kickAction.paused = false;
        kickAction.timeScale = 1.0;
        kickAction.play();
    }

    setTimeout(() => {
        if (ballModel) {
            ballPhysics.velocity = ballPhysics.kickPower;
            ballPhysics.velocityY = ballPhysics.kickLift;
            ballPhysics.isKicked = true;
        }
    }, 500);
}

const director = {
    currentScene: 'scene1',
    isPaused: false,
    togglePause: function () {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            controls.enabled = true;
            console.log("Scene PAUSED.");
        } else {
            if (!isManualMode) controls.enabled = false;
            console.log("Scene RESUMED.");
        }
    },
    playSequence: () => {
        manualObj.enableManual = false;
        isManualMode = false;
        isMoviePlaying = true;

        if (playerModel) {
            playerModel.position.set(-95, 0, 0);
            playerModel.visible = true;
            switchPlayerAnimation('run');
        }
        if (kickModel) kickModel.visible = false;
        if (ballModel) {
            ballModel.position.set(startBallPos.x, 0.2, startBallPos.z);
            ballModel.visible = true;
        }

        ballPhysics.velocity = 0;
        ballPhysics.velocityY = 0;
        ballPhysics.isKicked = false;
        isKickPlaying = false;
        kickCompleted = false;

        cutTo('scene1');
        cineParams.speedX = -0.25;
        cineParams.speedZ = 0.125;
        cineParams.active = true;

        setTimeout(() => {
            cutTo('scene2');
            setTimeout(() => {
                cutTo('scene3');
                setTimeout(() => {
                    cutTo('scene4');
                    setTimeout(() => {
                        cutTo('scene5');
                        setTimeout(() => {
                            playKickAnimation();
                            setTimeout(() => {
                                if (kickModel) kickModel.visible = false;
                                if (playerModel) {
                                    playerModel.visible = true;
                                    playerModel.position.x = playerKickPosition.x;
                                    playerModel.position.z = playerKickPosition.z;
                                    switchPlayerAnimation('run');
                                }
                                cutTo('scene6');
                                setTimeout(() => {
                                    cutTo('scene7');
                                    setTimeout(() => {
                                        cutTo('scene8');
                                        setTimeout(() => {
                                            cutTo('scene9');
                                            setTimeout(() => {
                                                cutTo('scene10');
                                                setTimeout(() => {
                                                    cutTo('scene11');
                                                    setTimeout(() => {

                                                        // 1. SCENE 12 MULAI
                                                        cutTo('scene12');

                                                        // Durasi Scene 12: 5 Detik
                                                        setTimeout(() => {

                                                            // 2. BLACKOUT TRANSISI (LAYAR GELAP)
                                                            triggerBlackout(true);

                                                            // Tunggu 1 Detik dalam gelap agar transisi terasa
                                                            setTimeout(() => {

                                                                // 3. MASUK SCENE 13 (Posisi Reset, Animasi Reset)
                                                                cutTo('scene13');

                                                                // Tunggu sebentar (0.5s) lalu TERANGKAN LAYAR (FADE IN)
                                                                setTimeout(() => {
                                                                    triggerBlackout(false);
                                                                }, 500);
                                                                setTimeout(() => {
                                                                    triggerBlackout(true);
                                                                }, 13500);

                                                            }, 1000); // Durasi Blackout Transisi

                                                        }, 5000); // Akhir dari Scene 12
                                                    }, 5000); // Akhir dari Scene 11
                                                }, 3000); // Akhir dari Scene 10
                                            }, 8000);
                                        }, 9000);
                                    }, 6000);
                                }, 8000);
                            }, 1000);
                        }, 100);
                    }, 4000);
                }, 4000);
            }, 5000);
        }, 8000);
    }
};

const dirFolder = gui.addFolder('Director Mode');
dirFolder.add(director, 'currentScene', Object.keys(sceneList)).name('Jump to Scene').onChange(val => cutTo(val));
dirFolder.add(director, 'playSequence').name('ACTION (Play Movie)');
dirFolder.add(director, 'togglePause').name('⏯ PAUSE / RESUME');

// animation loop
function animate() {
    requestAnimationFrame(animate)
    const delta = clock.getDelta()
    const now = clock.getElapsedTime()

    if (isManualMode) {
        controls.update();
        renderer.render(scene, camera);
        return;
    }

    if (director.isPaused) {
        controls.update();
        renderer.render(scene, camera);
        return;
    }

    if (isMoviePlaying) {
        // Update mixer
        if (mixer) mixer.update(delta)
        if (kickMixer && isKickPlaying) kickMixer.update(delta)
        if (stallMixer && director.currentScene === 'scene8') {
            stallMixer.update(delta);
        }

        if (lookMixer && director.currentScene === 'scene9') {
            lookMixer.update(delta);
        }

        // --- GERAKAN PLAYER UTAMA ---
        if (playerModel) {
            if (['scene1', 'scene2', 'scene3', 'scene4'].includes(director.currentScene)) {
                playerModel.position.x += (charParams.speed * charParams.animSpeed) * delta
            }
            else if (director.currentScene === 'scene7') {
                if (ballModel && playerModel.position.x < ballModel.position.x - 0.6) {
                    playerModel.position.x += (charParams.speed * 0.5) * delta;
                }
            }
        }

        // --- LOGIKA BOLA ---
        if (ballModel) {
            if (ballPhysics.isKicked) {
                const moveDistance = ballPhysics.velocity * delta;
                ballModel.position.x += moveDistance;
                ballModel.rotation.z -= (moveDistance / ballRadius) * 2.5;

                ballModel.position.y += ballPhysics.velocityY * delta;
                ballPhysics.velocityY -= ballPhysics.gravity * delta;

                if (ballModel.position.y <= 0.2) {
                    ballModel.position.y = 0.2;
                    ballPhysics.velocityY = -ballPhysics.velocityY * 0.5;

                    if (Math.abs(ballPhysics.velocityY) < 1.0) {
                        ballPhysics.velocityY = 0;
                    }

                    const distToTarget = Math.abs(ballPhysics.targetX - ballModel.position.x);
                    if (distToTarget > 8) {
                        ballPhysics.velocity *= ballPhysics.groundFriction;
                    } else if (distToTarget > 3) {
                        ballPhysics.velocity *= 0.985;
                    } else {
                        ballPhysics.velocity *= 0.95;
                    }

                    if (Math.abs(ballPhysics.velocity) < ballPhysics.stopThreshold) {
                        ballPhysics.velocity = 0;
                        ballPhysics.isKicked = false;
                    }
                } else {
                    ballPhysics.velocity *= ballPhysics.airDrag;
                }
            } else {
                if (ballModel.position.y <= 0.2 && director.currentScene === 'scene1') {
                    ballModel.position.x += 0.05 * delta;
                    ballModel.rotation.z -= (0.05 * delta) / 0.2;
                    ballModel.rotation.x = Math.cos(now * 1.0) * 0.05;
                }
                else if (director.currentScene === 'scene3') {
                    ballModel.rotation.z = Math.sin(now * 1.5) * 0.05;
                    ballModel.rotation.x = Math.cos(now * 1.0) * 0.05;
                }
            }
        }

        if (neighborMixer) {
            neighborMixer.update(delta);
        }

        // --- LOGIKA KAMERA PER SCENE ---
        if (director.currentScene === 'scene1' && cineParams.active) {
            camera.position.x += cineParams.speedX * delta
            camera.position.z += cineParams.speedZ * delta
            controls.target.x += cineParams.speedX * delta
            controls.target.z += cineParams.speedZ * delta
        }
        else if (director.currentScene === 'scene2' && playerModel) {
            const standbyX = sceneList.scene2.pos.x
            let currentX = playerModel.position.x;
            if (currentX < standbyX) currentX = standbyX;
            camera.position.x = currentX;
            controls.target.x = currentX;
            camera.position.y = sceneList.scene2.pos.y;
            camera.position.z = sceneList.scene2.pos.z;
            controls.target.y = 0.2;
            controls.target.z = 0;
        }
        else if (director.currentScene === 'scene3' && ballModel) {
            camera.position.copy(sceneList.scene3.pos);
            controls.target.copy(sceneList.scene3.tgt);
            camera.up.copy(sceneList.scene3.roll);
        }
        else if (director.currentScene === 'scene4' && playerModel) {
            camera.position.x = playerModel.position.x;
            camera.position.y = sceneList.scene4.pos.y;
            camera.position.z = sceneList.scene4.pos.z;
            controls.target.x = playerModel.position.x;
            controls.target.y = sceneList.scene4.tgt.y;
            controls.target.z = 0;
        }
        else if (director.currentScene === 'scene5') {
            camera.position.set(
                playerKickPosition.x + sceneList.scene5.pos.x,
                sceneList.scene5.pos.y,
                playerKickPosition.z + sceneList.scene5.pos.z
            );
            controls.target.set(
                playerKickPosition.x + sceneList.scene5.tgt.x,
                sceneList.scene5.tgt.y,
                playerKickPosition.z + sceneList.scene5.tgt.z
            );
            camera.up.copy(sceneList.scene5.roll);

            if (ballModel && ballPhysics.isKicked) {
                controls.target.x = (playerKickPosition.x + ballModel.position.x) * 0.5;
            }
        }
        else if (director.currentScene === 'scene6' && playerModel) {
            const eyeHeight = 1.6;
            const localTime = now - scene6StartTime;
            const runDuration = 2.0;
            const jumpDuration = 0.7;
            const pauseDuration = 1;
            const hopCycle = jumpDuration + pauseDuration;

            let bodyHeight = 0;
            let camBobX = 0;
            let camBobY = 0;

            if (localTime < runDuration) {
                camBobY = Math.sin(localTime * 14) * 0.1;
                camBobX = Math.cos(localTime * 7) * 0.05;
            } else {
                const timeInHopPhase = localTime - runDuration;
                const timeInCycle = timeInHopPhase % hopCycle;
                if (timeInCycle < jumpDuration) {
                    const jumpProgress = timeInCycle / jumpDuration;
                    bodyHeight = Math.sin(jumpProgress * Math.PI) * 1.5;
                    camBobY = 0; camBobX = 0;
                } else {
                    bodyHeight = 0;
                    camBobY = Math.sin(localTime * 14) * 0.1;
                    camBobX = Math.cos(localTime * 7) * 0.05;
                }
            }

            playerModel.position.y = bodyHeight;
            camera.position.x = playerModel.position.x + 0.3 + camBobX;
            camera.position.y = playerModel.position.y + eyeHeight + camBobY;
            camera.position.z = playerModel.position.z;

            controls.target.x = camera.position.x + 10;
            controls.target.y = camera.position.y;
            controls.target.z = camera.position.z;

            playerModel.position.x += (charParams.speed * charParams.animSpeed * 7.0) * delta;
        }
        else if (director.currentScene === 'scene8') {
            const timeInScene = now - scene8StartTime;

            // Juggling Logic (Tetap, tidak diubah)
            if (scene8Phase === 0) {
                // Kamera diam di posisi awal (tanpa yaw/pitch)
                controls.target.copy(sceneList.scene8.tgt);

                if (timeInScene >= 1.0) {
                    scene8Phase = 1;
                    juggleProgress = 0;
                    if (stallAnimation) {
                        stallAnimation.paused = false;
                        stallAnimation.play();
                    }
                }
            }
            else if (scene8Phase === 1 && !stallJuggleComplete) {
                const juggleTime = timeInScene - 1.0;

                // Kamera tetap diam
                controls.target.copy(sceneList.scene8.tgt);

                if (juggleTime < 3.5) {
                    // Logic Bola Juggling (Tetap)
                    juggleProgress = juggleTime / 3.5;
                    if (ballModel && stallModel) {
                        const maxHeight = 0.6;
                        if (juggleTime < 1.5) {
                            const riseProgress = juggleTime / 1.5;
                            const easeProgress = 1 - Math.pow(1 - riseProgress, 3);
                            ballModel.position.y = 0.2 + easeProgress * maxHeight;
                        } else if (juggleTime < 3.5) {
                            const fallProgress = (juggleTime - 1.5) / 2.0;
                            const easeProgress = Math.pow(fallProgress, 3);
                            ballModel.position.y = (0.2 + maxHeight) - easeProgress * maxHeight;
                        }
                        ballModel.position.x = stallModel.position.x + 0.5;
                        if (ballModel.position.y > 0.3) {
                            ballModel.rotation.z += delta * 10;
                            ballModel.rotation.x += delta * 6;
                        }
                    }
                } else {
                    scene8Phase = 2;
                    stallJuggleComplete = true;
                    if (ballModel) ballModel.position.y = 0.2;
                    crouchStartTime = now;
                }
            }
            else if (scene8Phase === 2) {
                // Logic Crouch & Zoom (Tetap)
                if (!playerModel.visible) {
                    if (stallModel) stallModel.visible = false;
                    if (playerModel) {
                        playerModel.visible = true;
                        playerModel.position.copy(stallModel.position);
                        playerModel.rotation.copy(stallModel.rotation);
                        switchPlayerAnimation('crouch');
                        if (ballModel) {
                            ballModel.position.x = playerModel.position.x + 0.5;
                            ballModel.position.y = 0.2;
                        }
                    }
                }
                const timeInPhase2 = now - crouchStartTime;
                const crouchWaitTime = 1.5;
                const zoomDuration = 1.0;

                // Zoom Kamera (Tanpa Yaw/Pitch tambahan)
                const startCamPos = sceneList.scene8.pos;
                const startTgt = sceneList.scene8.tgt;
                const endCamPos = new THREE.Vector3(-6.96, 1.40, -1.25);
                const endTgt = new THREE.Vector3(-7.13, 1.29, -0.51);

                if (timeInPhase2 < crouchWaitTime) {
                    camera.position.copy(startCamPos);
                    controls.target.copy(startTgt);
                } else {
                    const zoomTime = timeInPhase2 - crouchWaitTime;
                    let progress = zoomTime / zoomDuration;
                    if (progress > 1.0) progress = 1.0;
                    const ease = progress * progress * (3 - 2 * progress);
                    camera.position.lerpVectors(startCamPos, endCamPos, ease);
                    controls.target.lerpVectors(startTgt, endTgt, ease);
                }
                camera.up.set(0, 1, 0);
            }
        }

        else if (director.currentScene === 'scene9') {
            const timeInScene = now - scene9StartTime;

            // --- A. LOGIKA KAMERA (ZOOM SELESAI DI DETIK 5) ---
            const startPos = sceneList.scene9.pos;
            const startTgt = sceneList.scene9.tgt;
            const endPos = new THREE.Vector3(-3.70, 1.50, 0.65);
            const endTgt = new THREE.Vector3(-3.69, 1.50, 0.53);

            let currentPos = new THREE.Vector3();
            let currentTgt = new THREE.Vector3();

            // Zoom dimulai detik ke-1, selesai detik ke-5 (Durasi 4 detik)
            let t = (timeInScene - 1.0) / 4.0;

            if (timeInScene < 1.0) {
                currentPos.copy(startPos);
                currentTgt.copy(startTgt);
            } else {
                if (t > 1) t = 1;
                // Ease out cubic agar melambat di akhir
                const ease = 1 - Math.pow(1 - t, 3);
                currentPos.lerpVectors(startPos, endPos, ease);
                currentTgt.lerpVectors(startTgt, endTgt, ease);
            }

            // Sedikit toleh kanan setelah zoom hampir selesai
            let lookRightOffset = 0;
            if (timeInScene > 4.0) {
                const lookTime = timeInScene - 4.0;
                const progress = Math.min(lookTime / 3.0, 1);
                lookRightOffset = Math.sin(progress * Math.PI) * 0.02;
            }

            camera.position.copy(currentPos);
            controls.target.x = currentTgt.x + lookRightOffset;
            controls.target.y = currentTgt.y;
            controls.target.z = currentTgt.z;

            // --- B. LOGIKA NEIGHBOR (BARU JATUH DI DETIK 5.5) ---
            // Jatuh setelah zoom selesai
            if (timeInScene > 5.5 && !neighborHasFallen) {
                if (neighborModel) {
                    switchNeighborAnimation('fall');
                    neighborHasFallen = true;
                }
            }
        }

        else if (director.currentScene === 'scene10') {
            const basePos = sceneList.scene10.pos;
            const baseTgt = sceneList.scene10.tgt;

            // Variabel Yaw & Pitch (Gerakan halus seperti orang melihat)
            const yaw = Math.sin(now * 1) * 0.5; // Kiri Kanan
            const pitch = Math.cos(now * 0.8) * 0.2; // Atas Bawah

            camera.position.copy(basePos);

            // Terapkan ke target
            controls.target.x = baseTgt.x + yaw;
            controls.target.y = baseTgt.y + pitch;
            controls.target.z = baseTgt.z;
        }

        // 
        else if (director.currentScene === 'scene11') {
            const timeInScene = now - scene11StartTime;
            const duration = 5.0;
            let progress = timeInScene / duration;
            if (progress > 1) progress = 1;

            // Yaw ke Kiri (Negatif), Pitch ke Atas (Positif)
            const yaw = -2.0 * progress;  // Bergerak ke kiri sejauh 2 unit
            const pitch = 1.0 * progress; // Bergerak ke atas sejauh 1 unit

            const baseTgt = sceneList.scene11.tgt;

            camera.position.copy(sceneList.scene11.pos);
            controls.target.x = baseTgt.x + yaw;
            controls.target.y = baseTgt.y + pitch;
            controls.target.z = baseTgt.z;

            // Player Crouch Walk
            if (playerModel) {
                const walkSpeed = 0.4;
                playerModel.translateZ(walkSpeed * delta);
            }
        }

        else if (director.currentScene === 'scene11') {
            const timeInScene = now - scene11StartTime;
            const duration = 5.0;
            let progress = timeInScene / duration;
            if (progress > 1) progress = 1;
            const yawOffset = -1.5 * progress;
            const pitchOffset = 0.8 * progress;
            const baseTgt = sceneList.scene11.tgt;
            controls.target.x = baseTgt.x + yawOffset;
            controls.target.y = baseTgt.y + pitchOffset;

            if (playerModel) {
                const walkSpeed = 0.4;
                playerModel.translateZ(walkSpeed * delta);
            }
        }

        else if (director.currentScene === 'scene12') {
            const basePos = sceneList.scene12.pos;
            const baseTgt = sceneList.scene12.tgt;

            // Variabel Yaw & Pitch (Sedikit tegang/cepat)
            const yaw = Math.sin(now * 1.3) * 0.1;
            const pitch = Math.cos(now * 1) * 0.05;

            camera.position.copy(basePos);
            controls.target.x = baseTgt.x + yaw;
            controls.target.y = baseTgt.y + pitch;
            controls.target.z = baseTgt.z;

            if (playerModel) {
                const walkSpeed = 0.4;
                playerModel.translateZ(walkSpeed * delta);
            }
        }

        else if (director.currentScene === 'scene13') {
            const timeInScene = now - scene13StartTime;

            // --- 1. LOGIKA KAMERA (TETAP SAMA) ---
            const startPos = sceneList.scene13.pos;
            const startTgt = sceneList.scene13.tgt;
            const targetY_Lurus = 1.8;
            const camY_Low = 1.35;
            const moveRightDist = 1.0;

            let currCamX = startPos.x;
            let currCamY = startPos.y;
            let currTgtX = startTgt.x;
            let currTgtY = startTgt.y;
            let swayIntensity = 0;

            if (timeInScene < 3.0) {
                let t = timeInScene / 3.0;
                const ease = t * t * t;
                currCamY = startPos.y + (camY_Low - startPos.y) * ease;
                currTgtY = startTgt.y + (targetY_Lurus - startTgt.y) * ease;
                const targetX_Lurus = startPos.x;
                currTgtX = startTgt.x + (targetX_Lurus - startTgt.x) * ease;
                currCamX = startPos.x;
                swayIntensity = 0;
            }
            else if (timeInScene < 7.0) {
                currCamY = camY_Low;
                currTgtY = targetY_Lurus;
                let t = (timeInScene - 3.0) / 4.0;
                const ease = t * t * (3 - 2 * t);
                const targetCamX = startPos.x + moveRightDist;
                currCamX = startPos.x + (targetCamX - startPos.x) * ease;
                currTgtX = currCamX;
                swayIntensity = 0;
            }
            else {
                currCamY = camY_Low;
                currTgtY = targetY_Lurus;
                currCamX = startPos.x + moveRightDist;
                currTgtX = currCamX;
                const swayTime = timeInScene - 7.0;
                swayIntensity = (swayTime < 1.0) ? swayTime : 1;
            }
            camera.position.set(currCamX, currCamY, startPos.z);
            controls.target.set(currTgtX, currTgtY, startTgt.z);

            const yaw = (Math.sin(now * 1.0) * 0.25) * swayIntensity;
            const pitch = (Math.cos(now * 0.8) * 0.15) * swayIntensity;
            controls.target.x += yaw;
            controls.target.y += pitch;
            camera.up.set(0, 1, 0);

            // --- 2. LOGIKA MODEL NEIGHBOR ---

            if (disbeliefMixer && timeInScene < 8) {
                disbeliefMixer.update(delta);
            }

            if (timeInScene >= 8 && scene13Phase === 0) {
                scene13Phase = 0.5; // Phase Freeze
                neighborModel.userData.freezeTimer = 0; // Init timer freeze

                // Matikan Disbelief, Munculkan Neighbor Asli (Posisi Standby/Idle)
                if (disbeliefModel) disbeliefModel.visible = false;
                if (neighborModel) {
                    neighborModel.visible = true;
                    neighborModel.position.y = 0;
                    neighborModel.rotation.set(0, Math.PI, 0);
                    // Kita bisa pakai Idle sebentar atau pose awal run
                    switchNeighborAnimation('idle');
                }
            }

            // C. Logic Freeze (Tunggu 500ms)
            if (scene13Phase === 0.5) {
                neighborModel.userData.freezeTimer += delta;
                if (neighborModel.userData.freezeTimer > 0.5) { // 500ms Freeze
                    scene13Phase = 1; // Lanjut Lari
                    switchNeighborAnimation('run_attack');
                }
            }

            // D. Gerakan Lari & Lompat
            if (scene13Phase >= 1 && neighborModel) {

                // --- FASE LARI ---
                if (scene13Phase === 1) {
                    // LARI LEBIH PELAN LAGI (Speed 1.2)
                    const runSpeed = 1.2;
                    neighborModel.position.z += runSpeed * delta;

                    // Trigger Jump di Z = -17.5
                    if (neighborModel.position.z >= -17.5) {
                        scene13Phase = 2;
                        switchNeighborAnimation('jump_start');
                        neighborModel.userData.jumpTimer = 0;
                    }
                }

                // --- FASE LOMPAT ---
                if (scene13Phase >= 2) {
                    // Maju sedikit saat melompat
                    neighborModel.position.z += 0.8 * delta;

                    neighborModel.userData.jumpTimer += delta;

                    // Switch ke Jump Loop
                    if (neighborModel.userData.jumpTimer > 0.3 && scene13Phase === 2) {
                        scene13Phase = 3;
                        switchNeighborAnimation('jump_loop');
                    }

                    // LOMPAT NAIK (LEBIH RENDAH KECEPATANNYA)
                    // Angka 1.8 ini menentukan seberapa cepat dia naik ke atas
                    neighborModel.position.y += 1.8 * delta;
                }
            }
        }
    }

    if (camera.position.y < 0.2) camera.position.y = 0.2
    controls.update()
    renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})

animate()