// SETUP BLACKOUT OVERLAY
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

// SETTING RENDERER (Disesuaikan dengan Lighting Golden Hour)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
// Tone mapping Exposure diturunkan sedikit agar matahari sore terlihat dramatis
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
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
const elevation = 2;
const azimuth = 320;

const phi = THREE.MathUtils.degToRad(90 - elevation);
const theta = THREE.MathUtils.degToRad(azimuth);
sun.setFromSphericalCoords(1, phi, theta);

skyUniforms['sunPosition'].value.copy(sun);

// 2. FOG (Kabut agar menyatu dengan cakrawala)
const fogColor = new THREE.Color(0xcc8855);
scene.fog = new THREE.FogExp2(fogColor, 0.008);

// 3. Ambient Light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// 4. DIRECTIONAL LIGHT
const dirLight = new THREE.DirectionalLight(0xffaa33, 6) // Warna Emas/Oranye
dirLight.position.set(-60, 50, 80);
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

// VARIABEL LAMPU (Global untuk diakses)

let spotLight1 = null;
let spotLight2 = null;
let lampReflectiveFloors = [];

const pmremGenerator = new THREE.PMREMGenerator(renderer)
pmremGenerator.compileEquirectangularShader()

function updateSkyEnvironment() {
    const skyRT = pmremGenerator.fromScene(sky)
    scene.environment = skyRT.texture
}

updateSkyEnvironment()

// LOGIC GAME & ANIMASI

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

// COLLISION SYSTEM VARIABLES
const raycaster = new THREE.Raycaster();
const collidableObjects = []; // Array untuk menyimpan objek tembok/lantai
const collisionDistance = 0.5; // Jarak minimal kamera ke tembok

// Variabel Kontrol Kamera
const camSettings = {
    fov: 45,
    roll: 0.0,
    pitch: 0.0,
    yaw: 0.0,
    droneMode: true,
    speed: 15.0,
    lookSpeed: 0.002
};

// loaders
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

// game objects
let ballModel = null
let playerModel = null
let playerAnimations = [];

// Helper Functions

function fixMaterials(model) {
    model.traverse((child) => {
        if (child.isMesh) {
            // 1. Aktifkan Bayangan pada Mesh
            child.castShadow = true;
            child.receiveShadow = true;

            // 2. Terapkan fixMaterialProperties ke materialnya
            if (child.material) {
                if (Array.isArray(child.material)) {
                    // Jika materialnya banyak (array)
                    child.material.forEach(mat => fixMaterialProperties(mat));
                } else {
                    // Jika materialnya satu
                    fixMaterialProperties(child.material);
                }
            }
        }
    });
}

function makeCharacterGlossy(model) {
    model.traverse(child => {
        if (!child.isMesh || !child.material) return;

        // Pastikan PBR
        if (!(child.material instanceof THREE.MeshStandardMaterial)) {
            const oldMap = child.material.map || null;
            child.material = new THREE.MeshStandardMaterial({
                map: oldMap
            });
        }

        child.material.metalness = 1.0;
        child.material.roughness = 2;
        child.material.clearcoat = 1.5;
        child.material.clearcoatRoughness = 0.06;
        child.material.envMapIntensity = 2.9;

        // Warna tekstur aman
        if (child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace;
        }

        child.castShadow = true;
        child.receiveShadow = true;
        child.material.needsUpdate = true;
    });
}


function fixMaterialProperties(material) {

    if (!(material instanceof THREE.MeshStandardMaterial)) {
        material = new THREE.MeshStandardMaterial({
            map: material.map || null // diffuse
        })
    }
    // SPECULAR / REFLECTION SETTING

    material.metalness = material.metalness ?? 0.2
    material.roughness = material.roughness ?? 0.4
    material.clearcoat = 0.4
    material.clearcoatRoughness = 0.25
    material.envMapIntensity = 1.1

    material.transparent = false
    material.opacity = 1
    material.side = THREE.FrontSide
    material.depthTest = true
    material.depthWrite = true

    if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace
        material.map.needsUpdate = true
    }

    material.needsUpdate = true
    return material
}



// FUNGSI UNTUK MEMBUAT AREA SPECULAR DI BAWAH LAMPU
function createReflectiveFloorUnderLamp(lampPosition, lampIndex) {
    // Buat lingkaran reflektif di bawah lampu untuk specular highlight
    const geometry = new THREE.CircleGeometry(1.2, 32);

    // Material dengan specular tinggi
    const material = new THREE.MeshStandardMaterial({
        color: 0x775533,
        roughness: 0.15,
        metalness: 0.25,
        side: THREE.DoubleSide
    });

    const reflectiveCircle = new THREE.Mesh(geometry, material);
    reflectiveCircle.position.set(lampPosition.x, 0.01, lampPosition.z);
    reflectiveCircle.rotation.x = -Math.PI / 2; // Horizontal

    reflectiveCircle.receiveShadow = true;
    reflectiveCircle.userData.isReflectiveFloor = true;
    reflectiveCircle.userData.lampIndex = lampIndex;

    scene.add(reflectiveCircle);
    lampReflectiveFloors.push(reflectiveCircle);

    return reflectiveCircle;
}

// LOADERS

gltfLoader.load('./door.glb', function (gltf) {
    // PINTU 1
    const door1 = gltf.scene;
    door1.scale.set(1.6, 1.3, 1.3); // Sesuaikan scale jika perlu
    door1.position.set(-4.55, 0.5, -13.9);

    door1.rotation.y = 0;

    fixMaterials(door1);

    door1.traverse((child) => {
        if (child.isMesh) collidableObjects.push(child); // Tambah collision
    });
    scene.add(door1);

    //
    const door2 = door1.clone();
    door2.position.set(0.55, 0.5, -22.91);

    // Fix shadow untuk clone
    door2.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    door2.traverse((child) => {
        if (child.isMesh) collidableObjects.push(child); // Tambah collision
    });
    scene.add(door2);
});

// 2. LOAD WALL LAMP (lamp2.glb) - DENGAN SPOTLIGHT KUAT & HELPER
gltfLoader.load('./lamp2.glb', function (gltf) {
    // LAMPU 1 (KIRI)
    const lamp1 = gltf.scene;
    lamp1.scale.set(1.0, 1.0, 1.0);
    lamp1.position.set(-0.04, 3.17, -22.8);
    lamp1.rotation.y = 0;
    fixMaterials(lamp1);
    scene.add(lamp1);

    spotLight1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xff0000 })); // Dummy placeholder jika perlu, tapi pakai SpotLight asli di bawah:

    spotLight1 = new THREE.SpotLight(0xffaa33, 150);
    spotLight1.position.set(-0.04, 3.17 + 0.2, -22.8 + 0.5);
    spotLight1.angle = Math.PI / 3;
    spotLight1.penumbra = 0.5;
    spotLight1.decay = 1.0;
    spotLight1.distance = 30;
    spotLight1.castShadow = true;

    spotLight1.shadow.mapSize.width = 2048; // Resolusi bayangan dipertinggi
    spotLight1.shadow.mapSize.height = 2048;
    spotLight1.shadow.bias = -0.0001; // Mengurangi shadow acne (garis-garis)
    spotLight1.shadow.normalBias = 0.02;

    // Target diarahkan lurus ke bawah (lantai)
    spotLight1.target.position.set(-0.04, 0, -22.8 + 0.5);

    scene.add(spotLight1);
    scene.add(spotLight1.target);

    // Buat area specular di bawah lampu 1
    createReflectiveFloorUnderLamp(
        new THREE.Vector3(-0.04, 0, -22.8),
        1
    );

    // LAMPU 2 (KANAN)
    const lamp2 = lamp1.clone();
    lamp2.position.set(2.4, 3.5, -22.8);

    lamp2.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            if (child.material) {

                if (
                    child.name.toLowerCase().includes('glass') ||
                    child.name.toLowerCase().includes('bulb') ||
                    child.name.toLowerCase().includes('lamp')
                ) {
                    child.userData.isLampGlow = true;

                    child.material.emissive = new THREE.Color(0xffaa33);
                    child.material.emissiveIntensity = 0.6;

                    child.material.roughness = 0.08;
                    child.material.metalness = 0.35;
                    child.material.clearcoat = 1.0;
                    child.material.clearcoatRoughness = 0.05;
                    child.material.envMapIntensity = 1.5;
                }
            }
        }
    });

    scene.add(lamp2);

    spotLight2 = new THREE.SpotLight(0xffaa33, 150);
    spotLight2.position.set(2.4, 3.5 + 0.2, -22.8 + 0.5);
    spotLight2.angle = Math.PI / 3;
    spotLight2.penumbra = 0.5;
    spotLight2.decay = 1.0;
    spotLight2.distance = 30;
    spotLight2.castShadow = true;

    spotLight2.shadow.mapSize.width = 2048;
    spotLight2.shadow.mapSize.height = 2048;
    spotLight2.shadow.bias = -0.0001;
    spotLight2.shadow.normalBias = 0.02;

    // Target diarahkan lurus ke bawah
    const target2 = new THREE.Object3D();
    target2.position.set(2.4, 0, -22.8 + 0.5);
    spotLight2.target = target2;

    scene.add(spotLight2);
    scene.add(target2);

    // Buat area specular di bawah lampu 2
    createReflectiveFloorUnderLamp(
        new THREE.Vector3(2.4, 0, -22.8),
        2
    );

    // Tambah objek reflektif kecil di bawah lampu untuk specular highlight
    addReflectiveObjects();
});

// WINDOW LOADER
gltfLoader.load('./glass3.glb', function (gltf) {
    const rawModel = gltf.scene;

    // FUNGSI SETUP MATERIAL OTOMATIS
    // Memisahkan mana Frame (Solid) dan mana Kaca (Transparan)
    function setupWindowMaterial(model) {
        model.traverse((child) => {
            if (child.isMesh) {
                collidableObjects.push(child);

                if (child.material) {
                    const matName = child.material.name.toLowerCase();
                    const currentOpacity = child.material.opacity;

                    // Cek Logika
                    const isGlass = matName.includes('glass') ||
                        matName.includes('window') ||
                        matName.includes('kaca') ||
                        currentOpacity < 0.99;

                    if (isGlass) {


                        child.material = new THREE.MeshPhysicalMaterial({
                            color: 0xffffff,
                            metalness: 0,
                            roughness: 0,
                            transmission: 1.0,
                            thickness: 0.5,
                            ior: 1.5,
                            envMapIntensity: 2.0,
                            opacity: 1.0,
                            transparent: true,
                            side: THREE.DoubleSide
                        });

                        child.castShadow = false;
                        child.receiveShadow = true;

                    } else {
                        // MATERIAL FRAME (Putihkan Frame)
                        child.castShadow = true;
                        child.receiveShadow = true;
                        fixMaterialProperties(child.material);
                        child.material.color.setHex(0xffffff);
                        child.material.roughness = 0.5;
                    }
                }
            }
        });
    }

    // JENDELA 1 
    const window1 = rawModel;
    setupWindowMaterial(window1); // Jalankan deteksi material

    window1.scale.set(2.5, 1.2, 1.5);
    window1.position.set(-7.95, 1.2, -28.3);
    window1.rotation.y = Math.PI / 2;
    scene.add(window1);

});

// Fungsi untuk menambah objek reflektif di area lampu
function addReflectiveObjects() {
    // Objek reflektif di bawah lampu 1
    const reflectiveObject1 = createReflectiveObject(
        new THREE.Vector3(-0.04, 0.3, -22.3),
        0x886644
    );

    // Objek reflektif di bawah lampu 2
    const reflectiveObject2 = createReflectiveObject(
        new THREE.Vector3(2.4, 0.3, -22.3),
        0x886644
    );
}

function createReflectiveObject(position, color) {
    // Buat objek kecil reflektif (misalnya bingkai foto atau vas kecil)
    const geometry = new THREE.BoxGeometry(0.3, 0.1, 0.3);
    const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.15,    // Sangat rendah untuk specular kuat
        metalness: 0.35,    // Sedikit metalik
        envMapIntensity: 1.0
    });

    const object = new THREE.Mesh(geometry, material);
    object.position.copy(position);
    object.castShadow = true;
    object.receiveShadow = true;

    scene.add(object);
    return object;
}

// 2. Load Bola
const ballRadius = 2.5
const startBallPos = { x: -75, y: ballRadius, z: 0 }
gltfLoader.load('./beach_ball.glb', function (gltf) {
    ballModel = gltf.scene;
    ballModel.scale.set(0.2, 0.2, 0.2);
    const fixedY = 0.2;
    ballModel.position.set(startBallPos.x, fixedY, startBallPos.z);

    // SETUP KHUSUS AGAR BOLA MENGKILAP (SPECULAR)
    ballModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            collidableObjects.push(child);

            if (child.material) {
                // Pastikan material standar
                if (!(child.material instanceof THREE.MeshStandardMaterial)) {
                    child.material = new THREE.MeshStandardMaterial({
                        map: child.material.map || null, // diffuse texture
                        color: child.material.color || 0xffffff // diffuse color
                    });
                }

                child.material.roughness = 0.2;
                child.material.metalness = 0;

                child.material.clearcoat = 1.0;
                child.material.clearcoatRoughness = 0.1;

                // Agar pantulan lingkungan (langit) terlihat jelas
                child.material.envMapIntensity = 0.6;

                child.material.needsUpdate = true;
            }
        }
    });

    scene.add(ballModel);
});

// 3. Load Environment
gltfLoader.load('./env2_optimized.glb', function (gltf) {
    const model = gltf.scene;
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            collidableObjects.push(child);

            // Optimasi material untuk area dalam rumah (di sekitar lampu)
            if (child.material &&
                (child.position.z < -10 && child.position.z > -25) &&
                (child.position.x > -5 && child.position.x < 5)) {

                // Untuk lantai di dalam rumah, buat lebih reflektif
                if (child.position.y < 0.5) {
                    if (child.material.roughness !== undefined) {
                        child.material.roughness = 0.3; // Lebih reflektif
                    }
                    if (child.material.metalness !== undefined) {
                        child.material.metalness = 0.15;
                    }
                }

                // Untuk dinding di dalam rumah
                if (child.position.y > 1.0) {
                    if (child.material.roughness !== undefined) {
                        child.material.roughness = 0.4;
                    }
                }
            }

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

    playerModel.traverse((child) => {
        if (child.isMesh) {
            collidableObjects.push(child);
        }
    });

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

// LOADER NEIGHBOR (Sisipkan di bagian Loaders)
gltfLoader.load('./neighbor.glb', function (gltf) {
    neighborModel = gltf.scene;
    neighborAnimations = gltf.animations;

    neighborModel.scale.set(0.7, 0.7, 0.7);

    neighborModel.position.set(3.86, 0, -17.32);

    neighborModel.rotation.y = Math.PI / 2;

    neighborModel.visible = false;
    makeCharacterGlossy(neighborModel);
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
    disbeliefModel.position.set(1.14, 0, -21.67);
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
// UPDATE HELPER FUNCTION
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

// LOGIC VARIABLES & PHYSICS
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

// SETUP GUI & CONTROLS

const gui = new GUI({ title: "CONTROL PANEL" });

// 1. FOLDER KAMERA & TILT
const camFolder = gui.addFolder('Camera Adjustment');

// FOV
camFolder.add(camSettings, 'fov', 10, 120).name('Zoom (FOV)').listen().onChange(v => {
    camera.fov = v;
    camera.updateProjectionMatrix();
});

// ROLL (Miring Kiri/Kanan)
camFolder.add(camSettings, 'roll', -0.5, 0.5).name('Roll (Tilt)').listen().onChange(v => {
    if (isManualMode) camera.rotation.z = v;
});

// PITCH (Ndongak/Nunduk) - Manual Control via GUI
camFolder.add(camSettings, 'pitch', -1.5, 1.5).name('Pitch (Up/Down)').listen().onChange(v => {
    if (isManualMode) camera.rotation.x = v;
});

// YAW (Tengok Kiri/Kanan) - Manual Control via GUI
camFolder.add(camSettings, 'yaw', -3.14, 3.14).name('Yaw (Left/Right)').listen().onChange(v => {
    if (isManualMode) camera.rotation.y = v;
});

// 2. FOLDER NAVIGASI
const navFolder = gui.addFolder('Navigation Mode');
navFolder.add(camSettings, 'droneMode').name('Active Drone/FPS').listen().onChange(isActive => {
    isManualMode = isActive;
    controls.enabled = !isActive; // Jika Drone aktif, Orbit mati

    if (isActive) {
        controls.reset();
    } else {
        document.exitPointerLock();
        camera.rotation.z = 0; // Reset roll
        camera.rotation.x = 0; // Reset pitch agar tidak miring aneh saat kembali ke orbit
    }
});
navFolder.add(camSettings, 'speed', 5, 50).name('Fly Speed');

const envRotateSettings = {
    active: false,
    speed: 5,
    zoomOut: true
};

const envFolder = gui.addFolder('ENVIRONMENT SHOWCASE');

envFolder.add(envRotateSettings, 'active').name('Start Orbit Environment').onChange(isActive => {
    if (isActive) {
        // SAAT DIAKTIFKAN 

        // 1. Matikan Drone Mode
        isManualMode = false;
        camSettings.droneMode = false;
        controls.enabled = true;
        document.exitPointerLock();

        // 2. Reset Orientasi
        camera.up.set(0, 1, 0);
        camera.rotation.z = 0;
        controls.target.set(0, 0, 0);

        // 3. SET POSISI TINGGI (High Angle)
        if (envRotateSettings.zoomOut) {

            camera.position.set(0, 100, 100);
        }

        // 4. Update agar posisi tersimpan di controls
        controls.update();

        // 5. KUNCI SUDUT VERTIKAL (PENTING) 
        // Kita ambil sudut pandang saat ini, lalu kunci MIN dan MAX-nya sama.
        // Akibatnya: Kamera TIDAK BISA naik/turun, hanya bisa muter horisontal.
        const currentPolar = controls.getPolarAngle();
        controls.minPolarAngle = currentPolar;
        controls.maxPolarAngle = currentPolar;

        // 6. Nyalakan Putaran
        controls.autoRotate = true;
        controls.autoRotateSpeed = envRotateSettings.speed;

    } else {
        // SAAT DIMATIKAN
        controls.autoRotate = false;

        // 7. LEPAS KUNCIAN (Bebaskan lagi)
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = Math.PI;

        controls.update();
    }
});

envFolder.add(envRotateSettings, 'speed', 0.1, 10).name('Speed').onChange(v => {
    controls.autoRotateSpeed = v;
});

// 3. TOMBOL PLAY SCENE (MAIN FEATURE)
const playFolder = gui.addFolder('ACTION');
const playBtn = {
    start: () => {
        // 1. Matikan mode manual
        isManualMode = false;
        camSettings.droneMode = false;
        controls.enabled = false;
        document.exitPointerLock();

        // 2. Sembunyikan GUI
        gui.hide();

        // 3. Mulai Sequence
        director.playSequence();
    }
};
playFolder.add(playBtn, 'start').name('PLAY SCENE');

// Default Start State
isManualMode = true; // User mulai di mode Drone
controls.enabled = false;

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

function checkCollision(position, direction, distance) {
    // Set posisi raycaster dari kamera
    raycaster.set(position, direction);

    // Cek tabrakan dengan objek di array collidableObjects
    const intersects = raycaster.intersectObjects(collidableObjects, true);

    // Jika ada objek yang lebih dekat dari jarak toleransi, return true (nabrak)
    if (intersects.length > 0 && intersects[0].distance < distance) {
        return true;
    }
    return false;
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
        tgt: new THREE.Vector3(-6.5, 1.0, 0),
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

        // SETUP NEIGHBOR DISBELIEF
        if (disbeliefModel) {
            disbeliefModel.visible = true;
            disbeliefModel.position.set(1.14, 0, -21.67);
            // ROTASI 180 DERAJAT
            disbeliefModel.rotation.set(0, 0, 0);
        }

        if (neighborModel) {
            neighborModel.visible = false;
            neighborModel.position.set(1.14, 0, -21.67);
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
        camSettings.droneMode = false;
        if (typeof droneToggle !== 'undefined') droneToggle.updateDisplay();
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
                                                                }, 12200);

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

// WASD CONTROL VARIABLES
const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false, // Naik
    ctrl: false,  // Turun
    shift: false
};

window.addEventListener('keydown', (e) => {
    if (!isManualMode) return;
    switch (e.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Space': keys.space = true; break;      // SPASI (Naik)
        case 'ControlLeft': keys.ctrl = true; break; // CTRL KIRI (Turun)
        case 'ShiftLeft': keys.shift = true; break;
        case 'shift': keys.shift = true; break;
    }
});

window.addEventListener('keyup', (e) => {
    if (!isManualMode) return;
    switch (e.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyD': keys.d = false; break;
        case 'Space': keys.space = false; break;
        case 'ControlLeft': keys.ctrl = false; break;
        case 'ShiftLeft': keys.shift = false; break;
    }
});

// SCROLL UNTUK ZOOM (FOV)
window.addEventListener('wheel', (event) => {
    // Hanya aktif jika mode Drone/Manual
    if (isManualMode) {
        // Scroll ke bawah = Zoom Out (FOV nambah), ke atas = Zoom In
        const delta = event.deltaY > 0 ? 1 : -1;
        camSettings.fov += delta * 2; // Kecepatan zoom

        // Batasi FOV
        camSettings.fov = THREE.MathUtils.clamp(camSettings.fov, 10, 120);

        // Update Kamera & GUI
        camera.fov = camSettings.fov;
        camera.updateProjectionMatrix();
    }
});

// MOUSE LOOK LOGIC (POINTER LOCK)
// 1. Klik layar untuk kunci mouse saat mode drone
document.addEventListener('dblclick', () => {
    if (isManualMode) {
        document.body.requestPointerLock();
    }
});

// 2. Gerakkan kamera saat mouse bergerak (hanya jika terkunci)
document.addEventListener('mousemove', (event) => {
    if (isManualMode && document.pointerLockElement === document.body) {
        // Gunakan camSettings (bukan camConfig)
        camera.rotation.y -= event.movementX * camSettings.lookSpeed;
        camera.rotation.x -= event.movementY * camSettings.lookSpeed;

        // Clamp Pitch (Supaya tidak salto)
        const PI_2 = Math.PI / 2;
        camera.rotation.x = Math.max(-PI_2, Math.min(PI_2, camera.rotation.x));

        // Update nilai GUI agar sinkron
        camSettings.pitch = camera.rotation.x;
        camSettings.yaw = camera.rotation.y;

        camera.rotation.order = "YXZ";
    }
});

// animation loop
function animate() {

    requestAnimationFrame(animate)
    const delta = clock.getDelta()
    const now = clock.getElapsedTime()

    // LAMP SHIMMER SYSTEM

    const lampGlowMeshes = [];

    scene.traverse(obj => {
        if (obj.userData && obj.userData.isLampGlow) {
            lampGlowMeshes.push(obj);
        }
    });


    // LAMP SHIMMER ANIMATION

    lampGlowMeshes.forEach(mesh => {
        if (!mesh.material) return;

        const t = clock.getElapsedTime();

        // Denyut cahaya halus
        mesh.material.emissiveIntensity =
            0.6 + Math.sin(t * 3.5 + mesh.id) * 0.15;

        // Kilau specular mikro (seperti kaca)
        mesh.material.clearcoatRoughness =
            0.04 + Math.sin(t * 6.0 + mesh.id) * 0.01;

        // Pantulan lingkungan ikut "hidup"
        mesh.material.envMapIntensity =
            1.4 + Math.sin(t * 2.0) * 0.2;

        mesh.material.needsUpdate = true;
    });

    // LOGIKA DRONE / FPS DENGAN COLLISION
    if (isManualMode) {
        // 1. Update Rotasi (Pitch, Yaw, Roll)
        // Yaw & Pitch dihandle oleh event listener mousemove (lihat poin 6 di bawah), Roll via GUI
        camera.rotation.z = camSettings.roll;

        // 2. Hitung Kecepatan Frame Ini
        const actualSpeed = (keys.shift ? camSettings.speed * 2.5 : camSettings.speed) * delta;

        // 3. Tentukan Arah Gerak
        const forwardDir = new THREE.Vector3();
        camera.getWorldDirection(forwardDir);
        forwardDir.y = 0; // Agar W/S gerak datar, tidak terbang ke arah pandangan
        forwardDir.normalize();

        const rightDir = new THREE.Vector3();
        rightDir.crossVectors(camera.up, forwardDir).normalize();

        // PROSES GERAKAN DENGAN COLLISION CHECK
        const nextPos = camera.position.clone();

        // A. Gerak Maju/Mundur (W/S)
        if (keys.w || keys.s) {
            const dir = keys.w ? forwardDir : forwardDir.clone().negate();
            // Cek tabrakan sebelum gerak
            if (!checkCollision(camera.position, dir, collisionDistance)) {
                camera.position.addScaledVector(dir, actualSpeed);
            }
        }

        // B. Gerak Kiri/Kanan (A/D)
        if (keys.a || keys.d) {
            const dir = keys.d ? rightDir.clone().negate() : rightDir;
            // Cek collision
            if (!checkCollision(camera.position, dir, collisionDistance)) {
                camera.position.addScaledVector(dir, actualSpeed);
            }
        }

        // C. Gerak Vertikal (Spasi/Ctrl) - Naik Turun
        // Kita raycast ke atas dan bawah
        if (keys.space) {
            const upDir = new THREE.Vector3(0, 1, 0);
            if (!checkCollision(camera.position, upDir, collisionDistance)) {
                camera.position.y += actualSpeed;
            }
        }
        if (keys.ctrl) {
            const downDir = new THREE.Vector3(0, -1, 0);
            // Cek lantai
            if (!checkCollision(camera.position, downDir, 1.0)) { // Toleransi lantai lebih kecil
                camera.position.y -= actualSpeed;
            }
        }

        // Hard Limit lantai (Safety net)
        if (camera.position.y < 1.0) camera.position.y = 1.0;

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

        if (disbeliefMixer && director.currentScene === 'scene13') {
            disbeliefMixer.update(delta);
        }

        // GERAKAN PLAYER UTAMA
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

        // LOGIKA BOLA
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

        // LOGIKA KAMERA PER SCENE
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
        // SCENE 8: ORBIT ROTATE (MULUS DARI POSISI AWAL)
        else if (director.currentScene === 'scene8') {
            const timeInScene = now - scene8StartTime;

            // FASE 0: PERSIAPAN (DIAM)
            if (scene8Phase === 0) {
                camera.position.copy(sceneList.scene8.pos);
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
            // FASE 1: JUGGLING + ORBIT ROTATE
            else if (scene8Phase === 1 && !stallJuggleComplete) {
                const juggleTime = timeInScene - 1.0;


                // 1. Tentukan Pusat Putaran (Posisi Player)
                const centerX = -6.5;
                const centerZ = 0;

                // 2. Ambil Posisi Awal Kamera Scene 8 (Dari data sceneList)
                const startCamX = sceneList.scene8.pos.x;
                const startCamZ = sceneList.scene8.pos.z;

                // 3. Hitung Jarak (Radius) & Sudut Awal secara Matematis
                // Ini memastikan kamera mulai berputar TEPAT dari posisi awalnya
                const dx = startCamX - centerX;
                const dz = startCamZ - centerZ;
                const radius = Math.sqrt(dx * dx + dz * dz); // Jarak otomatis
                const startAngle = Math.atan2(dz, dx);   // Sudut awal otomatis

                // 4. Update Sudut Berdasarkan Waktu
                const speed = 1.5; // Kecepatan putar (bisa diubah)
                const currentAngle = startAngle + (juggleTime * speed);

                // 5. Terapkan Posisi Baru
                camera.position.x = centerX + Math.cos(currentAngle) * radius;
                camera.position.z = centerZ + Math.sin(currentAngle) * radius;
                camera.position.y = sceneList.scene8.pos.y; // Tinggi tetap sama

                // Selalu melihat ke arah pemain
                controls.target.set(centerX, 1.0, 0);

                // LOGIKA BOLA JUGGLING (TETAP)
                if (juggleTime < 3.5) {
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
            // FASE 2: SWAP MODEL + ZOOM
            else if (scene8Phase === 2) {
                if (!playerModel.visible) {
                    if (stallModel) stallModel.visible = false;
                    if (playerModel) {
                        playerModel.visible = true;
                        playerModel.position.copy(stallModel.position);

                        playerModel.rotation.set(0, THREE.MathUtils.degToRad(150), 0);

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

                // Koordinat Zoom
                const startCamPos = sceneList.scene8.pos;
                const startTgt = sceneList.scene8.tgt;
                const endCamPos = new THREE.Vector3(-6.96, 1.40, -1.25);
                const endTgt = new THREE.Vector3(-7.13, 1.29, -0.51);

                if (timeInPhase2 < crouchWaitTime) {
                    // Reset kamera ke posisi awal agar zoom rapi
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

            // A. LOGIKA KAMERA (ZOOM SELESAI DI DETIK 5)
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

            // B. LOGIKA NEIGHBOR (BARU JATUH DI DETIK 5.5)
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

            const yaw = Math.sin(now * 1) * 0.5;
            const pitch = Math.cos(now * 0.8) * 0.2;
            const rollVal = Math.sin(now * 1) * 0.1;

            camera.position.copy(basePos);

            // Terapkan ke target
            controls.target.x = baseTgt.x + yaw;
            controls.target.y = baseTgt.y + pitch;
            controls.target.z = baseTgt.z;

            camera.up.set(rollVal, 1, 0);
            camera.up.normalize();
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

            // 1. LOGIKA KAMERA
            const startPos = sceneList.scene13.pos;
            const startTgt = sceneList.scene13.tgt;

            // Variabel Animasi Kamera Awal (0 - 7 detik)
            const targetY_Lurus = 1.8;
            const camY_Low = 1.35;
            const moveRightDist = 1.0;

            let currCamX = startPos.x;
            let currCamY = startPos.y;
            let currCamZ = startPos.z; // Kita manipulasi Z untuk Zoom Out
            let currTgtX = startTgt.x;
            let currTgtY = startTgt.y;
            let currTgtZ = startTgt.z; // Target Z juga ikut mundur
            let swayIntensity = 0;

            if (timeInScene < 8.0) {
                // FASE AWAL (Sway & Posisi Awal)
                // (Menggunakan logika lama 0-7 detik Anda, tapi diperpanjang dikit sampai 8s)
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
                else {
                    currCamY = camY_Low;
                    currTgtY = targetY_Lurus;
                    let t = (Math.min(timeInScene, 7.0) - 3.0) / 4.0; // Clamp di 7s
                    const ease = t * t * (3 - 2 * t);
                    const targetCamX = startPos.x + moveRightDist;
                    currCamX = startPos.x + (targetCamX - startPos.x) * ease;
                    currTgtX = currCamX;

                    const swayTime = timeInScene - 7.0;
                    swayIntensity = (swayTime > 0 && swayTime < 1.0) ? swayTime : (swayTime >= 1.0 ? 1 : 0);
                }
            }
            else {
                // FASE ZOOM OUT (RUN ATTACK) > 8.0 Detik
                currCamY = camY_Low;
                currTgtY = targetY_Lurus;
                currCamX = startPos.x + moveRightDist;
                currTgtX = currCamX;
                swayIntensity = 1;
                let zoomTime = timeInScene - 8.0;


                if (zoomTime > 1) {
                    zoomTime = 1;
                }

                const zoomSpeed = 2.0; // Kecepatan mundur

                // Terapkan ke posisi Z (Mundur menjauhi objek)
                currCamZ = startPos.z + (zoomTime * zoomSpeed);
                currTgtZ = startTgt.z + (zoomTime * zoomSpeed);
            }

            // Set Posisi Akhir
            camera.position.set(currCamX, currCamY, currCamZ);
            controls.target.set(currTgtX, currTgtY, currTgtZ);

            // Tambahkan Sway
            const yaw = (Math.sin(now * 1.0) * 0.25) * swayIntensity;
            const pitch = (Math.cos(now * 0.8) * 0.15) * swayIntensity;
            controls.target.x += yaw;
            controls.target.y += pitch;
            camera.up.set(0, 1, 0);


            // 2. LOGIKA NEIGHBOR (Disbelief -> Lari -> Lompat)

            // Transisi ke FREEZE / IDLE (Detik 8.0 - 8.5)
            if (timeInScene >= 8.0 && scene13Phase === 0) {
                scene13Phase = 0.5;
                neighborModel.userData.freezeTimer = 0;

                if (disbeliefModel) disbeliefModel.visible = false;
                if (neighborModel) {
                    neighborModel.visible = true;
                    neighborModel.position.y = 0;
                    neighborModel.rotation.set(0, Math.PI, 0);
                    switchNeighborAnimation('idle');
                }
            }

            if (neighborModel && spotLight1) {
                const dist = neighborModel.position.distanceTo(spotLight1.position);

                neighborModel.traverse(child => {
                    if (!child.isMesh || !child.material) return;

                    // Semakin dekat lampu → semakin glossy
                    const boost = THREE.MathUtils.clamp(3.2 - dist / 6, 2, 3);
                    child.material.envMapIntensity = boost;
                    child.material.clearcoatRoughness = 0.04 + dist * 0.005;
                });
            }


            // Transisi ke LARI (Detik 8.5)
            if (scene13Phase === 0.5) {
                neighborModel.userData.freezeTimer += delta;
                if (neighborModel.userData.freezeTimer > 0.5) {
                    scene13Phase = 1;
                    switchNeighborAnimation('run_attack');
                }
            }

            // Gerakan Lari & Lompat
            if (scene13Phase >= 1 && neighborModel) {
                if (scene13Phase === 1) {
                    const runSpeed = 1.2;
                    neighborModel.position.z += runSpeed * delta;

                    // Trigger Jump di Z = -17.5
                    if (neighborModel.position.z >= -17.5) {
                        scene13Phase = 2;
                        switchNeighborAnimation('jump_start');
                        neighborModel.userData.jumpTimer = 0;
                    }
                }
                if (scene13Phase >= 2) {
                    neighborModel.position.z += 0.8 * delta;
                    neighborModel.userData.jumpTimer += delta;

                    if (neighborModel.userData.jumpTimer > 0.3 && scene13Phase === 2) {
                        scene13Phase = 3;
                        switchNeighborAnimation('jump_loop');
                    }
                    neighborModel.position.y += 1.3 * delta; // Lompat naik
                }
            }
        }
    }

    if (camera.position.y < 0.2) camera.position.y = 0.2;
    if (!isManualMode) {
        controls.update();
    }
    renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})

animate()