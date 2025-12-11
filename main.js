import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GUI } from 'three/addons/libs/lil-gui.module.min.js'

const scene = new THREE.Scene()

// --- SETTING ATMOSFER ---
const skyColor = new THREE.Color(0xddeeff);
scene.background = skyColor;

// setup kamera
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000)
camera.position.set(-72.87, 0.89, 1.29)
camera.up.set(-0.28, 1.00, 0.00)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.setClearColor(skyColor);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement)

// controls
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.target.set(-80.31, -1.60, -11.59)
controls.update()

// --- SETTING LIGHTING ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
scene.add(ambientLight)

const dirLight = new THREE.DirectionalLight(0xffffff, 2.5)
dirLight.position.set(-30, 80, 150)
dirLight.castShadow = true
dirLight.shadow.mapSize.width = 4096
dirLight.shadow.mapSize.height = 4096
dirLight.shadow.bias = -0.0001;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 500;
dirLight.shadow.camera.left = -100;
dirLight.shadow.camera.right = 100;
dirLight.shadow.camera.top = 100;
dirLight.shadow.camera.bottom = -100;

scene.add(dirLight)

const clock = new THREE.Clock()
let mixer

// logic variables
let isMoviePlaying = false
let isManualMode = false
let scene6StartTime = 0;
let scene7StartTime = 0;

// loaders
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

// game objects
let ballModel = null
let playerModel = null
let playerAnimations = [];
let rightArmBone = null
let leftArmBone = null

const ballRadius = 2.5
const startBallPos = { x: -75, y: ballRadius, z: 0 }

// --- FISIKA BOLA ---
const ballPhysics = {
    velocity: 0,
    velocityY: 0,
    gravity: 35,

    groundFriction: 0.999,
    airDrag: 0.999,

    isKicked: false,
    kickPower: 8,
    kickLift: 18,

    targetX: -2, // Target berhenti di depan kamera (-7)
    stopThreshold: 0.005 // Threshold diperkecil lagi biar berhenti benar-benar pelan
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

// variabel kick animation
let kickModel = null
let kickMixer = null
let isKickPlaying = false
let kickStartTime = 0
let playerKickPosition = { x: 0, z: 0 }
let kickCompleted = false

// --- GUI SETUP ---
const gui = new GUI({ title: "Production Panel" })

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

// 1. camera info
const camFolder = gui.addFolder('Camera Debug');
camFolder.add(camera.position, 'x').name('cam x').listen();
camFolder.add(camera.position, 'y').name('cam y').listen();
camFolder.add(camera.position, 'z').name('cam z').listen();
camFolder.add(controls.target, 'x').name('target x').listen();

const camRoll = { value: 0.2 };
camFolder.add(camRoll, 'value', -1, 1).name('roll (tilt)').onChange((v) => {
    camera.up.set(v, 1, 0);
    controls.update();
});

// Helper Function: Switch Player Animation
function switchPlayerAnimation(animType) {
    if (!mixer || !playerAnimations.length) return;

    let clipName = '';

    // TENTUKAN NAMA ANIMASI BERDASARKAN TIPE
    if (animType === 'run') {
        // Gunakan 'runcasual' sesuai permintaan
        clipName = 'runcasual';
    } else if (animType === 'walk') {
        // Gunakan nama spesifik dari user
        clipName = 'player_body_Anim_rig_Walking';
        // Note: Saya ambil bagian uniknya saja 'Walking' atau full string untuk pencarian
    }

    // Cari animasi yang cocok
    const clip = playerAnimations.find(a => a.name.toLowerCase().includes(clipName.toLowerCase()));

    if (clip) {
        // Jika animasi sudah sama, jangan restart
        if (mixer.currentAction && mixer.currentAction.getClip().name === clip.name) return;

        // Stop action sebelumnya
        mixer.stopAllAction();

        const newAction = mixer.clipAction(clip);
        newAction.reset();
        newAction.fadeIn(0.2);
        newAction.play();
        mixer.currentAction = newAction; // Simpan referensi

        if (animType === 'walk') {
            newAction.timeScale = 0.8;
        } else {
            newAction.timeScale = charParams.animSpeed;
        }
    }
}

// Loaders
gltfLoader.load('./ball.glb', function (gltf) {
    ballModel = gltf.scene;
    ballModel.scale.set(0.0005, 0.0005, 0.0005);
    ballModel.position.set(startBallPos.x, 0.2, startBallPos.z);
    ballModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.material.transparent = true;
            child.material.opacity = 0.9;
        }
    });
    scene.add(ballModel);
});

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

gltfLoader.load('./player_kid.glb', function (gltf) {
    playerModel = gltf.scene;
    playerAnimations = gltf.animations; // Simpan animasi global
    playerModel.scale.set(0.6, 0.6, 0.6);
    playerModel.position.set(-95, 0, 0);
    playerModel.rotation.y = 1.570796;

    playerModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    scene.add(playerModel);

    mixer = new THREE.AnimationMixer(playerModel);
    if (playerAnimations.length > 0) {
        switchPlayerAnimation('run'); // Default runcasual
    }
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) loadingDiv.style.display = 'none';
});

gltfLoader.load('./player_kid_kick.glb', function (gltf) {
    kickModel = gltf.scene;
    kickModel.scale.set(0.4, 0.4, 0.4);
    kickModel.position.set(0, 0, 0);
    kickModel.visible = false;

    kickModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

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

// --- DIRECTOR SYSTEM ---
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
        pos: new THREE.Vector3(-74.81, 0.39, 0.83),
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
    // SCENE 7: Kamera Statis di Lantai
    scene7: {
        pos: new THREE.Vector3(-6.03, 0.20, 0.96),
        tgt: new THREE.Vector3(-6.45, -0.80, -25.56),
        roll: new THREE.Vector3(0.00, 1.00, 0.00),
    }
}

function cutTo(sceneKey) {
    const data = sceneList[sceneKey];
    if (!data) return;
    director.currentScene = sceneKey;

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

    // SETUP SCENE 7
    if (sceneKey === 'scene7') {
        scene7StartTime = clock.getElapsedTime();

        // Pindahkan player lebih dekat ke kamera
        if (playerModel) {
            playerModel.position.set(-12, 0, 0); // Majukan dari -25 ke -12
            playerModel.position.y = 0;
            switchPlayerAnimation('walk'); // Ganti ke Walking
        }
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
        if (ballModel) ballModel.position.set(startBallPos.x, 0.2, startBallPos.z);

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
            cutTo('scene2'); // 8s
            setTimeout(() => {
                cutTo('scene3'); // +5s
                setTimeout(() => {
                    cutTo('scene4'); // +4s
                    setTimeout(() => {
                        cutTo('scene5'); // +4s
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
                                cutTo('scene6'); // FPV Player

                                setTimeout(() => {
                                    cutTo('scene7');
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

    if (isMoviePlaying) {
        if (mixer) mixer.update(delta)

        if (kickMixer && isKickPlaying) {
            kickMixer.update(delta)
            const kickAction = kickMixer._actions[0];
            if (kickAction && kickAction.time >= kickAction._clip.duration) {
                isKickPlaying = false;
                kickCompleted = true;
            }
        }

        // --- GERAKAN PLAYER UTAMA ---
        if (playerModel) {
            // Scene 1-4 & 6 (Lari)
            if (director.currentScene === 'scene1' ||
                director.currentScene === 'scene2' ||
                director.currentScene === 'scene3' ||
                director.currentScene === 'scene4') {

                playerModel.position.x += (charParams.speed * charParams.animSpeed) * delta
            }

            // Scene 7 (Walk Approaching Ball)
            else if (director.currentScene === 'scene7') {
                // Jalan pelan mendekati bola
                if (ballModel && playerModel.position.x < ballModel.position.x - 1) {
                    playerModel.position.x += (charParams.speed * 0.5) * delta;
                }
            }
        }

        // --- LOGIKA BOLA ---
        if (ballModel) {
            if (ballPhysics.isKicked) {
                const moveDistance = ballPhysics.velocity * delta;

                ballModel.position.x += moveDistance;
                // Rotasi dipercepat (x2.5) agar terlihat realistis
                ballModel.rotation.z -= (moveDistance / ballRadius) * 2.5;

                ballModel.position.y += ballPhysics.velocityY * delta;
                ballPhysics.velocityY -= ballPhysics.gravity * delta;

                if (ballModel.position.y <= 0.2) {
                    ballModel.position.y = 0.2;
                    ballPhysics.velocityY = -ballPhysics.velocityY * 0.5;

                    if (Math.abs(ballPhysics.velocityY) < 1.0) {
                        ballPhysics.velocityY = 0;
                    }

                    // --- LOGIKA PENGEREMAN SLOWMO HALUS ---
                    const distToTarget = ballPhysics.targetX - ballModel.position.x;

                    if (distToTarget > 8) {
                        // Masih jauh: coasting (hampir tanpa gesekan)
                        ballPhysics.velocity *= ballPhysics.groundFriction;
                    } else if (distToTarget > 3) {
                        // Mulai dekat: rem sangat halus (slow motion feel)
                        ballPhysics.velocity *= 0.985;
                    } else {
                        // Sangat dekat: rem akhir
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
                // --- IDLE ANIMATION (HANYA SCENE 1) ---
                if (ballModel.position.y <= 0.2 && director.currentScene === 'scene1') {
                    ballModel.rotation.z = Math.sin(now * 1.5) * 0.1;
                    ballModel.rotation.x = Math.cos(now * 1.0) * 0.05;
                }
            }
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
                bodyHeight = 0;
            }
            else {
                const timeInHopPhase = localTime - runDuration;
                const timeInCycle = timeInHopPhase % hopCycle;

                if (timeInCycle < jumpDuration) {
                    const jumpProgress = timeInCycle / jumpDuration;
                    bodyHeight = Math.sin(jumpProgress * Math.PI) * 1.5;
                    camBobY = 0;
                    camBobX = 0;
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