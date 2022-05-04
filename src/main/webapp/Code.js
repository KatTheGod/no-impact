import * as THREE from "./three.module.js"
import {OrbitControls} from "./OrbitControls.js";
import {PointerLockControls} from "./PointerLockControls.js";

//KeyCodes I care about
let KAT_KEY_W = 87;
let KAT_KEY_A = 65;
let KAT_KEY_S = 83;
let KAT_KEY_D = 68;
let KAT_KEY_M = 77;
let KAT_KEY_N = 78;
let KAT_KEY_UP = 38;
let KAT_KEY_DOWN = 40;
let KAT_KEY_LEFT = 37;
let KAT_KEY_RIGHT = 39;
let KAT_KEY_SHIFT = 16;
let KAT_KEY_COMMA = 188;
let KAT_KEY_PERIOD = 190;
let KAT_KEY_SPACE = 32;
let KAT_KEY_ENTER = 13;

let revolution = Math.PI * 2;
let sceneDimensions = 1000;
let tiny = 0.01;
let halfSize = 0.5;
let cameraOffset = 10;

let scene, renderer, camera, controls;
let box, floorBox;

let sun, character;

let acceleration, yVelocity, healthBar;

let topRight;

let pressedKeys = [];
let allBoxes = [];
let allBoxHelpers = [];
let fireBalls = [];

let nameCharacter = "KatCube";
let nameSphere = "Sphere";
let nameObstacles = "KatObstacles";
let nameCube = "KatC";

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let arrowHelperContainer, verticesContainer;

class HealthBar{
    constructor(container){
        this.health = 100;
        this.healthBarWidth = 3;
        this.healthBarHeight = 0.25;

        this.healthObject = new THREE.Object3D();
        this.backGround = new THREE.Mesh(new THREE.PlaneGeometry(this.healthBarWidth * 1.05, this.healthBarHeight * 1.1), new THREE.MeshBasicMaterial({color: "black"}));
        this.foreGround = new THREE.Mesh(new THREE.PlaneGeometry(this.healthBarWidth, this.healthBarHeight), new THREE.MeshBasicMaterial({color: "green"}));

        this.healthObject.add(this.backGround);

        this.foreGround.translateZ(tiny);
        this.healthObject.add(this.foreGround);

        this.healthObject.translateY(5);
        //this.healthObject.translateZ(2);

        container.add(this.healthObject);
    }

    loseHealth(amount){
        amount = (amount === undefined) ? 1 : amount;
        this.health = Math.max(0, this.health - amount);

        let percentage = this.health / 100
        this.foreGround.scale.x = percentage;
        this.foreGround.position.x = percentage * this.healthBarWidth / 2 - this.healthBarWidth / 2;

        return this.health === 0;
    }

    fixLookAt(){
        let cameraPos = camera.position.clone();
        camera.localToWorld(cameraPos);
        this.healthObject.lookAt(cameraPos.x, cameraPos.y, cameraPos.z);
    }

    hideBar(){
        this.healthObject.visible = false;
    }
}
class DeathAnimation{
    constructor(mesh) {
        this.mesh = mesh;
        this.normals = [];
        this.died = false;
        this.disposed = false;
        this.dying = false;
    }

    death(){
        if (!this.died){
            this.dying = true;
            let noVertices = 250;
            let geometry = new THREE.SphereGeometry(0.3);
            let material = new THREE.MeshStandardMaterial({color: "red"});
            material.color.set(this.mesh.material.color);
            this.circles = new THREE.InstancedMesh(geometry, material, noVertices);

            let interval = this.mesh.geometry.attributes.position.count / noVertices;
            let i = 0;

            let meshGlobalPosition = new THREE.Vector3().setFromMatrixPosition(this.mesh.matrixWorld);

            for (let vertexIndexCounter = 0; vertexIndexCounter < this.mesh.geometry.attributes.position.count; vertexIndexCounter += interval){
                let vertexIndex = Math.floor(vertexIndexCounter);
                if (i === noVertices){
                    break;
                }
                let positionArray = this.mesh.geometry.attributes.position;

                let x = positionArray.array[vertexIndex * 3];
                let y = positionArray.array[vertexIndex * 3 + 1];
                let z = positionArray.array[vertexIndex * 3 + 2];

                let pos = new THREE.Vector3(x, y, z);

                this.mesh.localToWorld(pos);

                let normal = new THREE.Vector3().subVectors(pos, meshGlobalPosition).normalize();
                this.normals.push(normal);

                let matrix = new THREE.Matrix4();
                matrix.makeTranslation(meshGlobalPosition.x, meshGlobalPosition.y, meshGlobalPosition.z);
                this.circles.setMatrixAt(i, matrix);

                i++;
            }

            scene.add(this.circles);

            scene.remove(this.mesh);

            this.died = true;
        }
    }

    moveCircles(){
        if (this.died && !this.disposed){
            let disappeared = false;
            let travelSlowingFactor = 4;
            let scalingSlowingFactor = 0.02;
            for (let i = this.circles.count - 1; i >= 0; i--){

                let ballMatrix = new THREE.Matrix4();
                this.circles.getMatrixAt(i, ballMatrix);

                let normal = this.normals[i];
                let currPos = new THREE.Vector3().setFromMatrixPosition(ballMatrix);
                let currScale = new THREE.Vector3().setFromMatrixScale(ballMatrix);

                currPos.x += normal.x / travelSlowingFactor;
                currPos.y += normal.y / travelSlowingFactor;
                currPos.z += normal.z / travelSlowingFactor;

                currScale.x -= scalingSlowingFactor;
                currScale.y -= scalingSlowingFactor;
                currScale.z -= scalingSlowingFactor;

                ballMatrix.makeScale(currScale.x, currScale.y, currScale.z);
                ballMatrix.setPosition(currPos.x, currPos.y, currPos.z);

                this.circles.setMatrixAt(i, ballMatrix);

                //normal.y -= 0.1;

                if (currScale.x <= 0){
                    disappeared = true;
                    break;
                }

                //break;
            }

            if (disappeared){
                console.log("KILLED");
                scene.remove(this.circles);
                this.circles.count = 0;
                this.circles.dispose();
                this.normals = [];
                this.disposed = true;
                return false;
            }
            else {
                this.circles.instanceMatrix.needsUpdate = true;
                return true;
            }
        }
        else {
            return true;
        }
    }
}

class Fireball{
    constructor(initialPosition, initialDirection, rate){
        let radius = 1;
        this.damage = 20;
        this.distanceTravelled = 0;
        this.maxDistance = 100;
        this.rate = rate;

        this.ball = new THREE.Object3D();
        this.ball.position.copy(initialPosition);
        this.ball.position.y += radius / 2;

        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius), new THREE.MeshStandardMaterial({color: "red"}));
        this.mesh.geometry.computeBoundingBox();

        this.ball.add(this.mesh);

        this.directionVector = initialDirection.copy(initialDirection);
        this.directionVector.y = 0;
        this.directionVector.normalize();

        this.box = new THREE.Box3();
        this.boxHelper = new THREE.Box3Helper(this.box, "black");

        scene.add(this.ball);
        scene.add(this.boxHelper);
    }

    update(){
        this.ball.translateOnAxis(this.directionVector, -this.rate);
        this.ball.scale.x += 0.4;
        this.ball.scale.y += 0.4;
        this.ball.scale.z += 0.4;
        this.damage += 2;

        this.distanceTravelled += this.rate;

        this.ball.updateWorldMatrix(true, false);
        this.box.copy(this.mesh.geometry.boundingBox).applyMatrix4(this.ball.matrixWorld);

        let obstacles = getObjectInContainer(scene, nameObstacles);
        let intersected = false;
        for (let i = allBoxes.length - 1; i >= 0; i--){
            let otherBox = allBoxes[i];
            if (this.box.intersectsBox(otherBox)){
                let obstacleContainer = obstacles.children[i];
                let obstacleMesh = obstacleContainer.children[0];
                let objectHealth = obstacleContainer.hObject;

                if (!obstacleContainer.dObject.dying){
                    if (objectHealth.loseHealth(this.damage)){
                        obstacleContainer.dObject.death();
                        obstacleMesh.material.visible = false;
                        objectHealth.hideBar();
                        scene.remove(allBoxHelpers[i]);
                    }

                    intersected = true;
                }
            }
        }

        if (this.distanceTravelled >= this.maxDistance || intersected){
            scene.remove(this.ball);
            scene.remove(this.boxHelper);
            return false;
        }
        else {
            return true;
        }
    }
}

init();

function init(){
    //Initializing other variables
    topRight = new THREE.Vector3(0, 1, 1).normalize();
    box = new THREE.Box3();
    floorBox = new THREE.Box3();
    //sphereBox = new THREE.Box3();
    acceleration = -0.1;
    yVelocity = 0;
    fireBalls = [];

    //Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog("white", 0, sceneDimensions / 4);

    //Camera
    camera = new THREE.PerspectiveCamera(90, innerWidth/ innerHeight, 0.1, 2000);
    //camera.position.set(0, cameraOffset, cameraOffset);
    camera.translateOnAxis(topRight, cameraOffset);
    camera.lookAt(new THREE.Vector3(0, 0.5, -cameraOffset));

    //Renderer Initialization
    renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setSize(innerWidth, innerHeight);
    document.body.appendChild(renderer.domElement);
    renderer.setClearColor(new THREE.Color("white"));
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap

    //Orbit Controls
    initializeCharacter();
    //initializeSphere();
    //scene.add(new THREE.Box3Helper(sphereBox, "black"));
    scene.add(new THREE.Box3Helper(box, "black"));
    scene.add(new THREE.Box3Helper(floorBox, "black"));


    controls = new PointerLockControls(character, document.body);
    scene.add(controls.getObject());

    //Grid Helper
    //scene.add(katGridHelper(1));

    //Lights
    sun = new THREE.PointLight("white", 1, 0);
    sun.position.set(0, sceneDimensions / 2, 0);

    //Set up shadow properties for the light
    sun.castShadow = true
    sun.shadow.mapSize.width = 1024; // default
    sun.shadow.mapSize.height = 1024; // default
    sun.shadow.camera.near = 0.1; // default
    sun.shadow.camera.far = 750; // default

    //Light helpers
    scene.add(sun);
    scene.add(new THREE.PointLightHelper(sun, 5, "black"));
    scene.add(new THREE.CameraHelper(sun.shadow.camera));

    //Event Listeners
    document.addEventListener("keydown", katKeyDown, false);
    document.addEventListener("keyup", katKeyUp, false);
    document.addEventListener("click", lockControls, false);
    window.addEventListener( 'pointermove', onPointerMove );

    staticScene();

    verticesContainer = new THREE.Object3D();
    arrowHelperContainer = new THREE.Object3D();
    scene.add(arrowHelperContainer);
    scene.add(verticesContainer);

    updateBoxesObstacles();

    healthBar = new HealthBar(character);

    animate();
}

function onPointerMove( event ) {

    // calculate pointer position in normalized device coordinates
    // (-1 to +1) for both components

    pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
    pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;

}

function lockControls(event){
    controls.lock();

    if (controls.isLocked){
        fireBalls.push(new Fireball(character.position, getCharacterFacing(), 3))
    }
}

function getCharacterFacing(){
    let facing = new THREE.Vector3();
    character.getWorldDirection(facing);
    return facing;
}

function katKeyDown(event){
    let present = false;
    for (let i = 0; i < pressedKeys.length; i++){
        if (pressedKeys[i] === event.keyCode){
            present = true;
            break;
        }
    }
    if (!present){
        pressedKeys.push(event.keyCode);
    }
}

function katKeyUp(event){
    for (let i = 0; i < pressedKeys.length; i++){
        if (pressedKeys[i] === event.keyCode){
            pressedKeys.splice(i, 1);
        }
    }
}

function getObjectInContainer(container, name){
    for (let i = 0; i < container.children.length; i++){
        if (container.children[i].katName !== undefined &&
            container.children[i].katName.localeCompare(name) === 0){
            return container.children[i];
        }
    }
    return undefined;
}

function staticScene(){
    let ground = createGround("rgb(200, 200, 200)");
    ground.updateWorldMatrix(true, false);
    floorBox.copy(ground.children[0].geometry.boundingBox).applyMatrix4(ground.matrixWorld);

    let obstacles = createObstacles();
    obstacles.castShadow = true;
    obstacles.katName = nameObstacles;

    scene.add(ground);
    scene.add(obstacles);
}

function initializeCharacter(){
    let geometry = new THREE.BoxGeometry(1, 1, 1);
    let material = new THREE.MeshStandardMaterial({color: "grey", wireframe: false});
    let cube = new THREE.Mesh(geometry, material);
    cube.geometry.computeBoundingBox();
    let containerForName = new THREE.Object3D();
    containerForName.add(cube);
    containerForName.katName = nameCharacter;
    character = new THREE.Object3D();
    character.add(containerForName);
    cube.castShadow = false;
    character.position.y += 0.5;
    character.castShadow = false;
    //character.add(controls.getObject());
    character.add(camera);
    scene.add(character);

    console.log("original geometry");
    console.log(geometry);
    console.log("dick")

    console.log("lets see material");
    console.log(material);
    console.log("Done");
}

/*function initializeSphere(){
    let geometry = new THREE.SphereGeometry(1);
    let material = new THREE.MeshStandardMaterial({color: "blue", wireframe: false});
    let cube = new THREE.Mesh(geometry, material);
    cube.geometry.computeBoundingBox();
    sphere = new THREE.Object3D();
    sphere.position.y += 1;
    sphere.add(cube);
    scene.add(sphere);
}*/

function createGround(colour){
    colour = (colour === undefined) ? "white" : colour;
    let geometry = new THREE.BoxGeometry(sceneDimensions, 10, sceneDimensions);
    let material = new THREE.MeshStandardMaterial({color: colour});
    let ground = new THREE.Mesh(geometry, material);
    let container = new THREE.Object3D();
    container.add(ground);
    ground.geometry.computeBoundingBox();
    ground.recieveShadow = true;
    ground.castShadow = false;
    container.position.y = -5;
    container.castShadow = false;
    container.recieveShadow = true;
    return container;
}

function createObstacles(number){
    number = (number === undefined) ? sceneDimensions : number;
    let node = new THREE.Object3D();

    let maxSize = 5;
    for (let i = 0; i < number; i++){
        let randomSize = Math.random() * (maxSize - 1) + 1;

        let x = (Math.random() * (sceneDimensions / 2) + 0)* getRandomSign();
        let z = (Math.random() * (sceneDimensions / 2) + 0) * getRandomSign();
        let y = Math.random() * (cameraOffset) * 5;

        let threeColour = new THREE.Color();
        threeColour.r = Math.random();
        threeColour.g = Math.random();
        threeColour.b = Math.random();

        let geometry = new THREE.SphereGeometry(randomSize);
        let material = new THREE.MeshStandardMaterial({color: threeColour});
        let cube = new THREE.Mesh(geometry, material);

        cube.castShadow = true;
        cube.geometry.computeBoundingBox();

        let container = new THREE.Object3D();
        container.castShadow = true;
        container.add(cube);

        container.dObject = new DeathAnimation(cube);
        container.hObject = new HealthBar(container);

        let containerBox = new THREE.Box3();
        let containerBoxHelper = new THREE.Box3Helper(containerBox, "black");
        allBoxes.push(containerBox);
        allBoxHelpers.push(containerBoxHelper);
        scene.add(containerBoxHelper);

        //cube.position.set(x, randomSize / 2, z);
        container.position.set(x, randomSize + y, z);
        node.add(container);
    }

    node.castShadow = true;

    return node;
}

function getRandomSign(){
    let sign = Math.random() * 2;
    if (sign > 1){
        return -1;
    }
    return 1;
}

function animation(){

}

function moveOffGround(){
    let onGround = false;

    if (box.intersectsBox(floorBox)){
        let yDir = 0;

        if (box.min.y > floorBox.min.y && box.min.y < floorBox.max.y){
            yDir = floorBox.max.y - box.min.y;
            yDir += tiny;
            onGround = true;
            yVelocity = 0;
            character.position.y += yDir;
        }
    }
    return onGround;
}

function moveCamera(){
    let distance = 1;

    let spacePressed = false;
    let mPressed = false;
    let nPressed = false;
    let downwards = false;
    let upwards = false;
    let forward = false;
    let backwards = false;
    let leftwards = false;
    let rightwards = false;
    let enterPressed = false;

    for (let i = 0; i < pressedKeys.length; i++){
        let key = pressedKeys[i];
        switch (key){
            case KAT_KEY_W: forward = true; break
            case KAT_KEY_UP: forward = true; break;

            case KAT_KEY_A: leftwards = true; break
            case KAT_KEY_LEFT: leftwards = true; break;

            case KAT_KEY_S: backwards = true; break
            case KAT_KEY_DOWN: backwards = true; break;

            case KAT_KEY_D: rightwards = true; break
            case KAT_KEY_RIGHT: rightwards = true; break;

            case KAT_KEY_COMMA: downwards = true; break

            case KAT_KEY_PERIOD: upwards = true; break

            case KAT_KEY_SPACE: spacePressed = true; break;

            case KAT_KEY_M: mPressed = true; break;

            case KAT_KEY_N: nPressed = true; break;

            case KAT_KEY_ENTER: enterPressed = true; break;
        }
    }

    let hitGround = moveOffGround();

    let c = adjustFromWall();
    let canLeft = c[0];
    let canRight = c[1];
    let canDown = c[2]
    let canUp = c[3];
    let canBack = c[4];
    let canForward = c[5];

    if (enterPressed){
        healthBar.loseHealth();
    }

    if (nPressed){
        character.rotateOnAxis(new THREE.Vector3(0, 1, 0), distance / 10);
    }
    else if (mPressed){
        character.rotateOnAxis(new THREE.Vector3(0, 1, 0), -distance / 10);
    }

    if (leftwards && canLeft){
        controls.moveRight(-distance);
    }
    else if (rightwards && canRight){
        controls.moveRight(distance);
    }

    if (forward && canForward){
        controls.moveForward(distance);
    }
    else if (backwards && canBack){
        controls.moveForward(-distance);
    }

    let jumping = false;
    if (canUp && spacePressed && (!canDown || yVelocity === 0)){
        yVelocity = 2;
        jumping = true;
    }

    if (canDown){
        //console.log("can down");
        character.position.y += yVelocity;
        yVelocity += acceleration;
    }
    else if (!jumping){
        //console.log("Floor")
        yVelocity = 0;
    }

    /*if (upwards && shiftPressed && canUp){
        character.translateOnAxis(new THREE.Vector3(0,1,0).normalize(), -distance);
    }
    else if (downwards && shiftPressed && canDown){
        character.translateOnAxis(new THREE.Vector3(0,1,0).normalize(), distance);
    }*/

    //Fixing character rotation
    let characterBox = getObjectInContainer(character, nameCharacter);
    characterBox = getObjectInContainer(character, nameCharacter);

    let object = new THREE.Object3D();
    object.position.copy(character.position);

    let forwardVector = new THREE.Vector3(0, 0, -10);
    forwardVector.applyQuaternion(character.quaternion);

    object.translateOnAxis(forwardVector.normalize(), 1);
    object.position.y = 0.5;

    characterBox.lookAt(object.position);

    box.copy(characterBox.children[0].geometry.boundingBox).applyMatrix4(characterBox.matrixWorld);

    moveOffGround();
    adjustFromWall();

    characterBox.updateWorldMatrix(true, true);
    box.copy(characterBox.children[0].geometry.boundingBox).applyMatrix4(characterBox.matrixWorld);
}

function adjustFromWall(){
    let canDown = true;
    let canUp = true;
    let canForward = true;
    let canBackward = true;
    let canLeft = true;
    let canRight = true;

    let obstacles = getObjectInContainer(scene, nameObstacles);
    for (let i = 0; i < allBoxes.length; i++){
        let dying = obstacles.children[i].dObject.dying;
        let otherBox = allBoxes[i];
        if (box.intersectsBox(otherBox) && !dying){
            let xDir = 0;
            let yDir = 0;
            let zDir = 0;

            if (box.min.x > otherBox.min.x && box.min.x < otherBox.max.x){
                xDir = otherBox.max.x - box.min.x;
                xDir += tiny;
                canLeft = false;
            }
            else if (box.max.x > otherBox.min.x && box.max.x < otherBox.max.x){
                xDir = otherBox.min.x - box.max.x;
                xDir -= tiny;
                canRight = false;
            }

            if (box.min.y > otherBox.min.y && box.min.y < otherBox.max.y){
                yDir = otherBox.max.y - box.min.y;
                yDir += tiny;
                canDown = false;
            }
            else if (box.max.y > otherBox.min.y && box.max.y < otherBox.max.y){
                yDir = otherBox.min.y - box.max.y;
                yDir -= halfSize;
                canUp = false;
            }

            if (box.min.z > otherBox.min.z && box.min.z < otherBox.max.z){
                zDir = otherBox.max.z - box.min.z;
                zDir += tiny;
                canForward = false;
            }
            else if (box.max.z > otherBox.min.z && box.max.z < otherBox.max.z){
                zDir = otherBox.min.z - box.max.z;
                zDir -= tiny;
                canBackward = false;
            }

            let numbers = [Math.abs(xDir), Math.abs(yDir), Math.abs(zDir)].sort((a,b)=>a-b);
            for (let i = 0; i < numbers.length; i++){
                let number = numbers[i];
                if (Math.abs(number) !== numbers[0]){
                    break;
                }
                if (number === Math.abs(xDir)){
                    //controls.moveRight(xDir);
                    character.position.x += xDir;
                }
                else if (number === Math.abs(yDir)){
                    console.log("Topped y");
                    console.log("Down: " + canDown);
                    console.log("Up: " + canUp);
                    character.position.y += yDir;
                    yVelocity = 0;
                }
                else if (number === Math.abs(zDir)){
                    character.position.z += zDir;
                }
            }
        }
    }

    let holder = [canLeft, canRight, canDown, canUp, canBackward, canForward];

    return holder;
}

function moveFireballs(){
    for (let i = fireBalls.length - 1; i >= 0; i--){
        let fireBall = fireBalls[i];
        if (!fireBall.update()){
            fireBalls.splice(i, 1);
        }
    }
}

function controlDeaths(){
    let obstacles = getObjectInContainer(scene, nameObstacles);
    for (let i = obstacles.children.length - 1; i >= 0; i--){
        let dObject = obstacles.children[i].dObject;
        if (!dObject.moveCircles()){
            obstacles.remove(obstacles.children[i]);
            allBoxes.splice(i, 1);
            allBoxHelpers.splice(i, 1);
        }
    }
}

function fixHeathBars(){
    let obstaclesContainer = getObjectInContainer(scene, nameObstacles);
    for (let i = 0; i < obstaclesContainer.children.length; i++){
        let health = obstaclesContainer.children[i].hObject;
        health.fixLookAt();
    }
}

function animate(){
    requestAnimationFrame(animate);

    animation();

    moveFireballs();

    moveCamera();

    controlDeaths();

    fixHeathBars();

    //updateBoxesObstacles();

    //tmpFunction();

    //collisions();

    betterCollisions();

    //theirRender();

    //controls.update();


    renderer.render(scene, camera);

    //renderer.render(scene, camera);
}

function betterCollisions(){
    let obstacles = getObjectInContainer(scene, nameObstacles);
    for (let i = 0; i < allBoxes.length; i++){
        let otherBox = allBoxes[i];
        if (box.intersectsBox(otherBox)){
            let mesh = obstacles.children[i].children[0];
            mesh.material.color.set("red");
        }
    }
}

/*function tmpFunction(){
    if (box.intersectsBox(sphereBox)){
        sphere.children[0].material.color.set("red");
    }
    else {
        sphere.children[0].material.color.set("blue");
    }
}*/

function updateBoxesObstacles(){
    let obstacles = getObjectInContainer(scene, nameObstacles);
    for (let i = 0; i < obstacles.children.length; i++){
        let container = obstacles.children[i];
        container.updateWorldMatrix(true, false);
        allBoxes[i].copy(container.children[0].geometry.boundingBox).applyMatrix4(container.matrixWorld);
    }
}

function theirRender(){
    let dir = new THREE.Vector3();
    character.getWorldDirection(dir);

    let dirContainer = new THREE.Object3D();
    dirContainer.lookAt(dir.x, dir.y, dir.z);
    dirContainer.rotateY(revolution / 2);

    dirContainer.getWorldDirection(dir);
    dir.y = 0;

    raycaster.set(character.position, dir.normalize());

    //raycaster.setFromCamera( pointer, camera );

    arrowHelperContainer.children.pop();

    let arrowHelper = new THREE.ArrowHelper(raycaster.ray.direction, raycaster.ray.origin, sceneDimensions, 0x000000);

    arrowHelperContainer.add(arrowHelper);

    // calculate objects intersecting the picking ray
    const intersects = raycaster.intersectObjects( scene.children );

    for ( let i = 0; i < intersects.length; i ++ ) {

        /*if (intersects[i].katName === undefined &&
            intersects[i].object.parent.katName !== undefined && intersects[i].object.parent.katName !== nameObstacles){
        }*/
        intersects[ i ].object.material.color.set( 0xff0000 );

    }
}

function collisions(){
    let originPoint = character.position.clone();
    let cubeContainer = getObjectInContainer(character, nameCharacter);
    let cube = cubeContainer.children[0];

    /*while (verticesContainer.children.length !== 0){
        verticesContainer.children.pop();
    }*/

    //console.log("Started");
    let noVertices = 5;
    let interval = Math.floor(cube.geometry.attributes.position.count / noVertices);
    for (let vertexIndex = 0; vertexIndex < cube.geometry.attributes.position.count; vertexIndex += interval){
        let positionArray = cube.geometry.attributes.position;

        let x = positionArray.array[vertexIndex * 3];
        let y = positionArray.array[vertexIndex * 3 + 1];
        let z = positionArray.array[vertexIndex * 3 + 2];

        let pos = new THREE.Vector3(x, y, z);
        cubeContainer.localToWorld(pos);

        /*let sphere = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshStandardMaterial({color: "blue"}));
        sphere.position.copy(pos);*/

        //verticesContainer.add(sphere);

        let object = new THREE.Object3D();
        object.position.copy(originPoint);
        object.lookAt(pos);
        let dir = new THREE.Vector3();
        object.getWorldDirection(dir);
        dir.normalize();

        let near = 0;
        let far = originPoint.distanceTo(pos);

        //console.log("far:" + far);

        raycaster.set(originPoint, dir, near, far);
        //verticesContainer.add(new THREE.ArrowHelper(raycaster.ray.direction, raycaster.ray.origin, sceneDimensions, 0x000000));

        let collisions = raycaster.intersectObjects(getObjectInContainer(scene, nameObstacles).children, true);

        for (let i = 0; i < collisions.length; i++){
            if (collisions[i].distance <= far){
                collisions[i].object.material.color.set("red");
            }
        }

    }
    console.log("Ended")

    /*let sphere = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshStandardMaterial({color: "red"}));
    sphere.position.copy(originPoint);
    verticesContainer.add(sphere);*/
}

/**
 * @param blockSize = 10
 * @returns {GridHelper}
 */
function katGridHelper(blockSize){
    blockSize = (blockSize === undefined) ? 10 : blockSize;

    return new THREE.GridHelper(sceneDimensions, sceneDimensions / blockSize);
}