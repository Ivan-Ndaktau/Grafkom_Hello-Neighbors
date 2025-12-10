import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GUI } from 'three/addons/libs/lil-gui.module.min.js'

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xa0a0a0)

// --- SETUP KAMERA ---
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000)
// posisi awal (scene 1)
camera.position.set(-72.87, 0.89, 1.29)
camera.up.set(-0.28, 1.00, 0.00)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
// shadow map setup yang lebih halus
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)

// --- CONTROLS ---
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.target.set(-80.31, -1.60, -11.59)
controls.update()

// --- LIGHTING (MATAHARI) ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6) // sedikit lebih terang
scene.add(ambientLight)

const dirLight = new THREE.DirectionalLight(0xffffff, 2.5) // intensitas matahari dinaikkan
dirLight.position.set(100, 150, 50) // posisi matahari agak tinggi menyamping
dirLight.castShadow = true

// optimasi bayangan agar tidak kotak-kotak atau aneh
dirLight.shadow.mapSize.width = 4096
dirLight.shadow.mapSize.height = 4096
dirLight.shadow.bias = -0.0001; // mencegah shadow acne (garis-garis aneh)
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 500;
// memperluas area cakupan bayangan
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

// loaders
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

// game objects
let ballModel = null
let playerModel = null
const ballRadius = 2.5
const startBallPos = { x: -75, y: ballRadius, z: 0 }

const ballPhysics = {
    velocity: 0,
    friction: 0.98,
    isKicked: false,
    kickPower: 40
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

// --- VARIABEL BARU UNTUK KICK ANIMATION ---
let kickModel = null
let kickMixer = null
let isKickPlaying = false
let kickStartTime = 0
let playerKickPosition = { x: 0, z: 0 }
let kickCompleted = false

// gui setup
const gui = new GUI({ title: "production panel" })

// 0. manual / free cam mode
const manualObj = {
    enableManual: false,
    saveLog: () => {
        console.log(`
        // data scene (salin ke sceneList):
        pos: new THREE.Vector3(${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}),
        tgt: new THREE.Vector3(${controls.target.x.toFixed(2)}, ${controls.target.y.toFixed(2)}, ${controls.target.z.toFixed(2)}),
        roll: new THREE.Vector3(${camera.up.x.toFixed(2)}, ${camera.up.y.toFixed(2)}, ${camera.up.z.toFixed(2)}),
        `);
        alert("koordinat tersimpan di console (tekan f12)");
    }
};

gui.add(manualObj, 'enableManual').name('enable manual/free cam').onChange(v => {
    isManualMode = v;
    if (v) {
        cineParams.active = false;
        isMoviePlaying = false;
    }
});

// 1. camera info
const camFolder = gui.addFolder('camera & target info');
camFolder.add(camera.position, 'x').name('cam x').listen();
camFolder.add(camera.position, 'y').name('cam y').listen();
camFolder.add(camera.position, 'z').name('cam z').listen();
camFolder.add(controls.target, 'x').name('target x').listen().onChange(() => controls.update());
camFolder.add(controls.target, 'y').name('target y').listen().onChange(() => controls.update());
camFolder.add(controls.target, 'z').name('target z').listen().onChange(() => controls.update());

const camRoll = { value: 0.2 };
camFolder.add(camRoll, 'value', -1, 1).name('roll (tilt)').onChange((v) => {
    camera.up.set(v, 1, 0);
    controls.update();
});
camFolder.add(manualObj, 'saveLog').name('copy scene data');

// 2. lighting & character & ball
const lightFolder = gui.addFolder('lighting');
lightFolder.add(ambientLight, 'intensity', 0, 2).name('ambient');
lightFolder.add(dirLight, 'intensity', 0, 5).name('sun light');
// kontrol arah matahari (opsional jika ingin geser bayangan)
lightFolder.add(dirLight.position, 'x', -200, 200).name('sun x');
lightFolder.add(dirLight.position, 'y', 0, 200).name('sun y');
lightFolder.add(dirLight.position, 'z', -200, 200).name('sun z');

const charFolder = gui.addFolder('character');
charFolder.add(charParams, 'speed', 0, 10).name('run speed');
charFolder.add(charParams, 'animSpeed', 0.1, 2).name('anim speed').onChange((v) => {
    if (mixer && mixer.existingAction) mixer.existingAction.timeScale = v;
});
charFolder.add(charParams, 'isRunning').name('is running');

const ballFolder = gui.addFolder('soccer ball');
ballFolder.add(ballPhysics, 'kickPower', 10, 100).name('kick power');
const ballActions = {
    kick: () => { ballPhysics.velocity = ballPhysics.kickPower; ballPhysics.isKicked = true; },
    reset: () => {
        ballPhysics.velocity = 0;
        ballPhysics.isKicked = false;
        if (ballModel) {
            ballModel.position.set(startBallPos.x, 0.2, startBallPos.z);
            ballModel.rotation.set(0, 0, 0);
        }
    }
};
ballFolder.add(ballActions, 'kick').name('kick ball');
ballFolder.add(ballActions, 'reset').name('reset ball');

// --- LOADERS ---
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
            child.material.roughness = 0.1;
            child.material.metalness = 0.1;
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
    const animations = gltf.animations;
    playerModel.scale.set(0.6, 0.6, 0.6);
    playerModel.position.set(-95, 0, 0);
    playerModel.rotation.y = 1.570796;
    playerModel.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    scene.add(playerModel);

    mixer = new THREE.AnimationMixer(playerModel);
    if (animations.length > 0) {
        const animNames = animations.map(clip => clip.name);
        let defaultAnimName = animNames.find(name => name.toLowerCase().includes('runcasual')) || animNames[0];
        const action = mixer.clipAction(animations.find(a => a.name === defaultAnimName));
        action.timeScale = charParams.animSpeed;
        action.play();
        mixer.existingAction = action;
    }
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) loadingDiv.style.display = 'none';
});

// --- LOAD KICK MODEL ---
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
        roll: new THREE.Vector3(-0.28, 1.00, 0.00)
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
        roll: new THREE.Vector3(-0.1, 1.00, 0.00),
    },
    // scene 5: KICK ANIMATION SCENE (dari depan)
    scene5: {
        pos: new THREE.Vector3(5, 0.8, 0), 
        tgt: new THREE.Vector3(0, 0.8, 0), // Lihat ke arah badan karakter
        roll: new THREE.Vector3(0, 1, 0),
    },
    // scene 6: first person view (fpv)
    scene6: {
        pos: new THREE.Vector3(0, 0, 0),
        tgt: new THREE.Vector3(0, 0, 0),
        roll: new THREE.Vector3(0, 1, 0),
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
    
    // Setup khusus untuk scene 5
    if (sceneKey === 'scene5') {
        setupKickScene();
    }
}

// --- FUNGSI UNTUK KICK SCENE ---
function setupKickScene() {
    // Catat posisi player saat ini
    if (playerModel) {
        playerKickPosition.x = playerModel.position.x;
        playerKickPosition.z = playerModel.position.z;
        
        // Posisikan bola di depan player
        if (ballModel) {
            ballModel.position.set(playerKickPosition.x + 1, 0.2, playerKickPosition.z);
            ballPhysics.velocity = 0;
            ballPhysics.isKicked = false;
        }
        
        playerModel.visible = true;
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
    
    // Switch model
    if (playerModel) {
        playerModel.visible = false;
    }
    
    kickModel.visible = true;
    kickModel.position.set(playerKickPosition.x, 0, playerKickPosition.z);
    
    // --- PERBAIKAN ROTASI ---
    // Samakan dengan playerModel (1.57... adalah 90 derajat / hadap kanan)
    kickModel.rotation.y = Math.PI / 2; 
    
    isKickPlaying = true;
    kickCompleted = false;
    kickStartTime = clock.getElapsedTime();
    
    // Reset dan play animasi
    const kickAction = kickMixer._actions[0];
    if (kickAction) {
        kickAction.reset();
        kickAction.paused = false;
        kickAction.timeScale = 1.0;
        kickAction.play();
    }
    
    // Tendang bola (Timing disesuaikan dengan animasi)
    setTimeout(() => {
        if (ballModel) {
            ballPhysics.velocity = ballPhysics.kickPower * 0.7;
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

        // Reset semua state
        if (playerModel) {
            playerModel.position.set(-95, 0, 0);
            playerModel.visible = true;
        }
        if (kickModel) kickModel.visible = false;
        if (ballModel) ballModel.position.set(startBallPos.x, 0.2, startBallPos.z);
        
        ballPhysics.velocity = 0;
        ballPhysics.isKicked = false;
        isKickPlaying = false;
        kickCompleted = false;

        // 1. mulai scene 1
        cutTo('scene1');
        cineParams.speedX = -0.25;
        cineParams.speedZ = 0.125;
        cineParams.active = true;

        // 3. timeline
        setTimeout(() => {
            // cut ke scene 2 (8 detik setelah start)
            cutTo('scene2');

            setTimeout(() => {
                // cut ke scene 3 (5 detik setelah scene 2)
                cutTo('scene3');

                setTimeout(() => {
                    // cut ke scene 4 (4 detik setelah scene 3)
                    cutTo('scene4');

                    setTimeout(() => {
                        // cut ke scene 5 - KICK ANIMATION (4 detik setelah scene 4)
                        cutTo('scene5');
                        
                        // Mainkan animasi tendang setelah delay
                        setTimeout(() => {
                            playKickAnimation();
                            
                            // Setelah selesai tendang, lanjut ke scene 6 (FPV)
                            setTimeout(() => {
                                // Kembali ke model lari
                                if (kickModel) kickModel.visible = false;
                                if (playerModel) {
                                    playerModel.visible = true;
                                    // Teruskan posisi dari kick model ke player model
                                    playerModel.position.x = playerKickPosition.x;
                                    playerModel.position.z = playerKickPosition.z;
                                }
                                
                                // Lanjut ke scene 6 (FPV)
                                cutTo('scene6');
                                
                            }, 1500); // 1.5 detik setelah tendangan

                        }, 100); // tunggu 1 detik sebelum mulai tendang

                    }, 4000);

                }, 4000);

            }, 5000);

        }, 8000);
    }
};

// --- GUI UNTUK KICK ANIMATION ---
const kickFolder = gui.addFolder('kick animation');
kickFolder.add({ 
    testKick: () => {
        cutTo('scene5');
        setTimeout(() => playKickAnimation(), 500);
    }
}, 'testKick').name('test kick scene');

// 5. director mode folder
const dirFolder = gui.addFolder('director mode');
dirFolder.add(director, 'currentScene', Object.keys(sceneList)).name('jump to scene').onChange(val => cutTo(val));
dirFolder.add(director, 'playSequence').name('action (play movie)');

// --- ANIMATION LOOP ---
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
        // Update mixer animasi lari
        if (mixer) mixer.update(delta)
        
        // Update mixer animasi tendang
        if (kickMixer && isKickPlaying) {
            kickMixer.update(delta)
            
            // Cek jika animasi sudah selesai
            const kickAction = kickMixer._actions[0];
            if (kickAction && kickAction.time >= kickAction._clip.duration) {
                isKickPlaying = false;
                kickCompleted = true;
            }
        }

        // 1. karakter lari (hanya di scene 1-4)
        if (playerModel && charParams.isRunning && 
            (director.currentScene === 'scene1' || 
             director.currentScene === 'scene2' || 
             director.currentScene === 'scene3' || 
             director.currentScene === 'scene4')) {
            playerModel.position.x += (charParams.speed * charParams.animSpeed) * delta
        }

        // 2. bola
        if (ballModel) {
            if (ballPhysics.isKicked && ballPhysics.velocity > 0.1) {
                const moveDistance = ballPhysics.velocity * delta
                ballModel.position.x += moveDistance
                ballModel.rotation.z -= moveDistance / ballRadius
                ballPhysics.velocity *= ballPhysics.friction
            } else if (!ballPhysics.isKicked) {
                // animasi goyang natural
                ballModel.rotation.z = Math.sin(now * 2.0) * 0.03;
                ballModel.rotation.x = Math.sin(now * 1.5) * 0.03;
            } else {
                ballPhysics.velocity = 0
            }
        }

        // 3. logika kamera per scene

        // scene 1: panning
        if (director.currentScene === 'scene1' && cineParams.active) {
            camera.position.x += cineParams.speedX * delta
            camera.position.z += cineParams.speedZ * delta
            controls.target.x += cineParams.speedX * delta
            controls.target.z += cineParams.speedZ * delta
        }

        // scene 2: diam -> geser
        else if (director.currentScene === 'scene2' && playerModel) {
            const standbyX = sceneList.scene2.pos.x
            let currentX = playerModel.position.x;

            if (currentX < standbyX) {
                currentX = standbyX;
            }

            camera.position.x = currentX;
            controls.target.x = currentX;

            camera.position.y = sceneList.scene2.pos.y;
            camera.position.z = sceneList.scene2.pos.z;
            controls.target.y = 0.2;
            controls.target.z = 0;
        }

        // scene 3: fokus bola (diam)
        else if (director.currentScene === 'scene3' && ballModel) {
            camera.position.copy(sceneList.scene3.pos);
            controls.target.copy(sceneList.scene3.tgt);
            camera.up.copy(sceneList.scene3.roll);
        }

        // scene 4: close up player (back to player)
        else if (director.currentScene === 'scene4' && playerModel) {
            camera.position.x = playerModel.position.x;
            camera.position.y = sceneList.scene4.pos.y;
            camera.position.z = sceneList.scene4.pos.z;

            controls.target.x = playerModel.position.x;
            controls.target.y = sceneList.scene4.tgt.y;
            controls.target.z = 0;
        }

        // scene 5: KICK ANIMATION (dari depan)
        else if (director.currentScene === 'scene5') {
            // Kamera menempel relatif terhadap posisi pemain
            // Karena sceneList.scene5.pos.x kita set 5, maka kamera ada di (PlayerX + 5)
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
            
            // OPSIONAL: Jika ingin kamera sedikit melirik bola saat meluncur (sinematik)
            if (ballModel && ballPhysics.isKicked) {
                // Kamera tetap di depan player, tapi mata melirik bola sedikit
                controls.target.x = (playerKickPosition.x + ballModel.position.x) * 0.5;
            }
        }

        // scene 6: first person view (fpv)
        else if (director.currentScene === 'scene6' && playerModel) {
            const eyeHeight = 1.6;
            const bobbing = Math.sin(now * 15) * 0.05;

            camera.position.x = playerModel.position.x + 0.2;
            camera.position.y = playerModel.position.y + eyeHeight + bobbing;
            camera.position.z = playerModel.position.z;

            controls.target.x = camera.position.x + 10;
            controls.target.y = camera.position.y;
            controls.target.z = camera.position.z;
            
            // Karakter terus bergerak maju di FPV
            playerModel.position.x += (charParams.speed * charParams.animSpeed) * delta;
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