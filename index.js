document.addEventListener('DOMContentLoaded', () => {
    document.getElementById("scaleup").addEventListener("click", scaleUp);
    document.getElementById("scaledn").addEventListener("click", scaleDn);
    document.getElementById("pause").addEventListener("click", pauseClick);
    document.getElementById("reset").addEventListener("click", reset);
    document.getElementById("canvasLeft").addEventListener("click", canvasClick);
    document.getElementById("canvasRight").addEventListener("click", canvasClick);
    document.getElementById("seed").value = defaultSeed;
    document.getElementById("startn").value = numberOfRocks;
    document.getElementById("mass").value = initMass.toExponential();
    document.getElementById("massv").value = initMassVar;
    document.getElementById("vel").value = initVelocityXY;
    document.getElementById("velz").value = initVelocityZ;
    document.getElementById("radius").value = initRadius;
    document.getElementById("solarradius").value = initSolarRadius;
    document.getElementById("solarmass").value = initSolarMass.toExponential();
    document.getElementById("disctop").value = spawnDiscTop;
    document.getElementById("discbottom").value = spawnDiscBottom;
    
    requestAnimationFrame(animate);
});

function animate(timeStamp) {
    draw();
    requestAnimationFrame((t) => animate(t));
}

const MATERIAL_STAR = 0;
const MATERIAL_SOLID = 1;
const LEFT_PANE  = 0;
const RIGHT_PANE = 1;

const clone = (items) => items.map(item => Array.isArray(item) ? clone(item) : item);
const physicsWorker = new Worker("physics.js")

let tickDuration = 0;
let tickDurationInterval = 10;

let canvasScale     = 0.6;

let spawnDiscTop    = -25;
let spawnDiscBottom = 25;
let spawnInnerRadius = 100;
let spawnOuterRadius = 400;

let gravityConst    = 6.67e-11;

let uniqueID        = 0;
let initVelocityXY  = 1;
let initVelocityZ   = 0;
let initMassVar     = 30;
let initRadius      = 2.0;
let initMass        = 1e7;
let initSolarMass   = 1e14;
let initSolarRadius = 10;

let selectedRock = -1;


let numberOfRocks   = 500;
let frameCounter    = 0;

let fps;
let simTime;
let simStart = window.performance.now();
let paused = false;

let defaultSeed = Date.now();
let rand;

let rocksSortedZ;
let rocksSortedY;

let rocks = initRocks(defaultSeed);
initSpecialRocks();
depthSort();
sendRocksToWorker();

function reset() {
    // rocksSortedY = [];
    // rocksSortedZ = [];
    // rocks = [];
    pausePlayback();
    numberOfRocks = document.getElementById("startn").value;;
    frameCounter = 0;
    simStart = window.performance.now();

    defaultSeed     = Number(document.getElementById("seed").value);
    initRadius      = Number(document.getElementById("radius").value);
    initMass        = Number(document.getElementById("mass").value);
    initMassVar     = Number(document.getElementById("massv").value);
    initVelocityXY  = Number(document.getElementById("vel").value);
    initVelocityZ   = Number(document.getElementById("velz").value);
    initSolarMass   = Number(document.getElementById("solarmass").value);
    initSolarRadius = Number(document.getElementById("solarradius").value);
    spawnDiscTop    = Number(document.getElementById("disctop").value);
    spawnDiscBottom = Number(document.getElementById("discbottom").value);

    rocks = initRocks(defaultSeed);
    initSpecialRocks();
    depthSort();
    sendRocksToWorker();
    resumePlayback();
}

function initRocks(rockSeed) {
    // reseed the rng thingy
    let seed = rockSeed ^ 0xDEADBEEF; // 32-bit seed with optional XOR value
    rand = sfc32(0x9E3779B9, 0x243F6A88, 0xB7E15162, seed);
    for (let i = 0; i < 15; i++) rand();

    let rocks = [];
    for (let i = 0; i < numberOfRocks; i++) {
        let massVariance = getRandomInt(1, initMassVar);
        let randomColor = "rgb(" + getRandomInt(128, 255) + "," + getRandomInt(128, 255) + "," + getRandomInt(128, 255) + ")";
        let rock = {
            id: getNewID(),
            px: 0,
            py: 0,
            pz: getRandomInt(spawnDiscTop, spawnDiscBottom),
            r: initRadius * (massVariance ** (1 / 3)),
            m: initMass * massVariance,
            vx: 0.0,
            vy: 0.0,
            vz: ((rand() * initVelocityZ * 2) - initVelocityZ),
            ax: 0.0,
            ay: 0.0,
            az: 0.0,
            material: MATERIAL_SOLID,
            matColor: chroma(getRandomInt(0, 255),getRandomInt(0, 255),getRandomInt(0, 255))
        };
        rocks.push(rock)
    }

    initStar(rocks[0]);
       
    for(let i = 1; i < numberOfRocks; i++){
        getRockInRing(0, 0, spawnInnerRadius, spawnOuterRadius, rocks[i]);
        setVelocityVector(rocks[0], rocks[i], initVelocityXY, LEFT_PANE);
        setVelocityVector(rocks[0], rocks[i], initVelocityZ, RIGHT_PANE);
    }

    return rocks;
}

function initStar(rock) {
    rock.m = initSolarMass;
    rock.r = initSolarRadius;
    rock.vx = 0;
    rock.vy = 0;
    rock.vz = 1;
    rock.px = 0;
    rock.py = 0;
    rock.pz = 0;
    rock.material = MATERIAL_STAR;
    rock.matColor = chroma(237,226,12);
}

function initSpecialRocks() {
    rocks[1].vx = rocks[0].vx;
    rocks[1].vy = rocks[0].vy;
    rocks[1].vz = -10;
    rocks[1].px = rocks[0].px+450;
    rocks[1].py = rocks[0].py-100;
    rocks[1].pz = rocks[0].pz + 1000;
    rocks[1].m  = rocks[0].m/10;
    rocks[1].r  = 10;
    rocks[1].matColor  = chroma(237,226,12);
}

physicsWorker.onmessage = (evt) => {
    let data = JSON.parse(evt.data);
    rocks = data.rocks;
    numberOfRocks = rocks.length;
    uniqueID = data.uniqueID;
    tickDuration = data.tickDuration;
    
    frameCounter++;

    // if(!paused){
        depthSort();
    // }
    
    simTime = Math.floor((window.performance.now() - simStart) / 1000);
}

function depthSort() {
    // depth sort for canvas
    rocksSortedZ = clone(rocks);
    rocksSortedZ.sort((a, b) => b.pz - a.pz);
    rocksSortedY = clone(rocks);
    rocksSortedY.sort((a, b) => a.py - b.py);
}

function sendRocksToWorker() {
    physicsWorker.postMessage(JSON.stringify({t: 'UPDATE', rocks: rocks, uniqueID: uniqueID}));
}

function draw() {
    let drawTimeStart = window.performance.now();

    drawCanvas("canvasLeft", false, rocksSortedZ);
    drawCanvas("canvasRight", true, rocksSortedY);
    
    let drawTime = window.performance.now() - drawTimeStart;
    fps = 1000 / (tickDuration + drawTime + tickDurationInterval);

    let so = '<span width="20px>"'

    document.getElementById("status").innerHTML = 
        debugText("Physics Time:",  (tickDuration + tickDurationInterval),    20)
        + debugText(" Draw Time:",    drawTime.toFixed(1),                    20)
        + debugText(" FPS:",          fps.toFixed(1),                         20)
        + debugText(" N:",            rocks.length,                           20)
        + debugText(" Frame:",        frameCounter,                           20)
        + debugText(" Time:",         simTime,                                20)
    document.getElementById("scalelabel").innerHTML = (canvasScale * 100).toFixed(0) + "%";

    if(selectedRock != -1){
        drawRockInfo(selectedRock);
    }
}

function debugText(label, value, width) {
    let retText = label + '<span width="' + width + '">' + value + '</span>';
    return retText;
}

function drawCanvas(canvasId, topView, sortedRocks) {
    const canvas = document.getElementById(canvasId);
    if (canvasLeft.getContext) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(canvasScale, canvasScale);
        ctx.lineWidth = 1 / canvasScale;
        ctx.translate(-rocks[0].px + canvas.width / 2 / canvasScale,
            -(topView ? rocks[0].pz : rocks[0].py) + canvas.height / 2 / canvasScale
        );
        for (let rock of sortedRocks) {
            ctx.beginPath();
            ctx.arc(rock.px, topView ? rock.pz : rock.py, rock.r, 0, Math.PI * 2, true);
            ctx.fillStyle = chroma(rock.matColor._rgb[0],rock.matColor._rgb[1],rock.matColor._rgb[2]);
            //ctx.strokeStyle = '#cccccc';
            ctx.fill();
            ctx.stroke();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
}

function drawRockInfo(rockID){
    let ff = (element) => rockID == element.id;
    let rockIndex = rocks.findIndex(ff);
    if(rockID != undefined && rockIndex != -1){

        document.getElementById("srock").hidden         = false;
        document.getElementById("rockid").innerHTML     = rocks[rockIndex].id;
        document.getElementById("rockmass").innerHTML   = rocks[rockIndex].m.toExponential();
        document.getElementById("rockposx").innerHTML   = rocks[rockIndex].px.toFixed(3);
        document.getElementById("rockposy").innerHTML   = rocks[rockIndex].py.toFixed(3);
        document.getElementById("rockposz").innerHTML   = rocks[rockIndex].pz.toFixed(3);
        document.getElementById("rockvelx").innerHTML   = rocks[rockIndex].vx.toFixed(3);
        document.getElementById("rockvely").innerHTML   = rocks[rockIndex].vy.toFixed(3);
        document.getElementById("rockvelz").innerHTML   = rocks[rockIndex].vz.toFixed(3);
        document.getElementById("rockaccx").innerHTML   = rocks[rockIndex].ax.toFixed(3);
        document.getElementById("rockaccy").innerHTML   = rocks[rockIndex].ay.toFixed(3);
        document.getElementById("rockaccz").innerHTML   = rocks[rockIndex].az.toFixed(3);
        document.getElementById("rockradius").innerHTML = rocks[rockIndex].r.toFixed(1);
    }
    else{
        document.getElementById("srock").hidden         = true;
        document.getElementById("rockid").innerHTML     = "";
        document.getElementById("rockmass").innerHTML   = "";
        document.getElementById("rockposx").innerHTML   = "";
        document.getElementById("rockposy").innerHTML   = "";
        document.getElementById("rockposz").innerHTML   = "";
        document.getElementById("rockvelx").innerHTML   = "";
        document.getElementById("rockvely").innerHTML   = "";
        document.getElementById("rockvelz").innerHTML   = "";
        document.getElementById("rockaccx").innerHTML   = "";
        document.getElementById("rockaccy").innerHTML   = "";
        document.getElementById("rockaccz").innerHTML   = "";
        document.getElementById("rockradius").innerHTML = "";
    }
}

function setVelocityVector(to, from, velocity, pane) {
    let ox = to.px - from.px;
    let oy = pane == LEFT_PANE ? to.py - from.py : to.pz - from.pz;
    let r = Math.hypot(ox, oy);
    ox = ox / r;
    oy = oy / r;
    velocity *= (gravityConst * to.m / r) ** 0.5;
    if(pane == LEFT_PANE){
        from.vx = oy*velocity;
        from.vy = -ox*velocity;
    }
    else{
        from.vx += oy*velocity;
        from.vz = -ox*velocity;
    }
    return from;
}

function getRadius(density, mass) {
    // Earth 5000kg/m3
    // Sun   1400kg/m3
    let volume = mass/density;
    let radius = getSphereRadius(volume);
    return radius;
}

function getSphereVolume(radius) {
    let volume = 4/3*Math.PI*(radius**3);
    return volume;
}

function getSphereRadius(volume) {
    let radius = (3*volume/4*Math.PI)**(1/3);
    return radius;
}

function crossProduct(a, b,) {
    let crossProduct = []
    crossProduct[0] = a[1] * b[2]- a[2] * b[1];
    crossProduct[1] = a[2] * b[0]- a[0] * b[2];
    crossProduct[2] = a[0] * b[1]- a[1] * b[0];
    return crossProduct;
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(rand() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

function sfc32(a, b, c, d) {
    return function () {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        var t = (a + b) | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        d = d + 1 | 0;
        t = t + d | 0;
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
    }
}

function scaleUp() {
    canvasScale += 0.1;
}

function scaleDn() {
    canvasScale -= 0.1;
}

function pauseClick() {
    if (paused) {
        resumePlayback();
    }
    else {
        pausePlayback();
    }
}

function resumePlayback() {
    paused = false;
    physicsWorker.postMessage(JSON.stringify({t: 'PLAY'}));
    document.getElementById("pause").innerHTML = "Pause";
}

function pausePlayback() {
    paused = true;
    physicsWorker.postMessage(JSON.stringify({t: 'PAUSE'}));
    document.getElementById("pause").innerHTML = "Play";
}

function canvasClick(evt) {
    let canvasLeft = document.getElementById("canvasLeft");
    let canvasRight = document.getElementById("canvasRight");
    if(evt.srcElement.id == 'canvasLeft') {
        let worldCoordX = (evt.offsetX - (canvasLeft.width / 2) ) / canvasScale + rocks[0].px;
        let worldCoordY = (evt.offsetY - (canvasLeft.height / 2) ) / canvasScale + rocks[0].py;
        selectedRock = getClosestRockID(worldCoordX, worldCoordY, LEFT_PANE);
    }
    if(evt.srcElement.id == 'canvasRight') {
        let worldCoordX = (evt.offsetX - (canvasRight.width / 2)) / canvasScale + rocks[0].px;
        let worldCoordZ = (evt.offsetY - (canvasRight.height / 2)) / canvasScale + rocks[0].pz;
        selectedRock = getClosestRockID(worldCoordX, worldCoordZ, RIGHT_PANE);
    }
}

function getClosestRockID(x, y, pane){
    let closestDist = Infinity;
    let closestId = -1;
    for(let i=0; i < numberOfRocks; i++) {
        let opt = pane == LEFT_PANE ? rocks[i].py - y : rocks[i].pz - y;
        // let dist = ((rocks[i].px - x) * (rocks[i].px - x) +  opt * opt)**0.5;
        let dist = Math.hypot(rocks[i].px - x, opt);
        if (dist < closestDist) {
            closestId = rocks[i].id;
            closestDist = dist;
        }
    }
    return closestId;
}

function getNewID() {
    uniqueID++;
    return uniqueID;
}

function getRockInRing(centerX, centerY, innerRadius, outerRadius, rock){
    let ringWidth = outerRadius - innerRadius;
    let theta = rand()*Math.PI*2;
    rock.px = ((rand()*ringWidth) + innerRadius) * Math.sin(theta) + centerX;
    rock.py = ((rand()*ringWidth) + innerRadius) * Math.cos(theta) + centerY;
    return rock;
}
