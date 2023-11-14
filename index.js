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

let workerDone = true;
let workerTime = 0;
let timeInWorker = 0;

let canvasWidth     = 800;
let canvasHeight    = 800;
let canvasDepth     = 25;
let canvasBorder    = 100;
let canvasScale     = 1.0;

let spawnDiscTop    = 400;
let spawnDiscBottom = 400;
let spawnInnerRadius = 100;
let spawnOuterRadius = 400;

let timeFactor      = 10;
let gravityConst    = 6.67e-11;

let uniqueID        = 0;
let initVelocityXY  = 1;
let initVelocityZ   = 0;
let initMassVar     = 30;
let initRadius      = 1.0;
let initMass        = 1e7;
let initSolarMass   = 1e14;
let initSolarRadius = 10;


let numberOfRocks   = 1500;
let frameCounter    = 0;

let frameTime;
let fps;
let simTime;
let simStart = window.performance.now();
let timestring;
let paused = false;

let defaultSeed = Date.now();
let rand;

let rocks = initRocks(defaultSeed);
sendRocksToWorker();

function reset() {
    paused = true;
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
    sendRocksToWorker();
    paused = false;
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

    rocks[0].m = initSolarMass;
    rocks[0].r = initSolarRadius;
    rocks[0].vx = 0;
    rocks[0].vy = 0;
    rocks[0].vz = 0;
    rocks[0].px = canvasWidth / 2;
    rocks[0].py = canvasHeight / 2;
    rocks[0].pz = canvasHeight / 2;
    rocks[0].material = MATERIAL_STAR;
    rocks[0].matColor = chroma(237,226,12);

    
    for(let i = 1; i < numberOfRocks; i++){
        getRockInRing(400, 400, spawnInnerRadius, spawnOuterRadius, rocks[i]);
        setVelocityVector(rocks[0], rocks[i], initVelocityXY, LEFT_PANE);
        setVelocityVector(rocks[0], rocks[i], initVelocityZ, RIGHT_PANE);
    }
    
    rocks[1].vx = rocks[0].vx;
    rocks[1].vy = rocks[0].vy;
    rocks[1].vz = -10;
    rocks[1].px = rocks[0].px-100;
    rocks[1].py = rocks[0].py-100;
    rocks[1].pz = rocks[0].pz + 1000;
    rocks[1].m  = rocks[0].m/10;

    return rocks;
}

physicsWorker.onmessage = (evt) => {
    workerDone = true;
    
    let data = JSON.parse(evt.data);
    rocks = data.rocks;
    numberOfRocks = rocks.length;
    uniqueID = data.uniqueID;
    frameCounter++;
    
    timeInWorker = window.performance.now() - workerTime;
    simTime = Math.floor((window.performance.now() - simStart) / 1000);
}

function sendRocksToWorker() {
    if(workerDone){
        workerDone = false;
        workerTime = window.performance.now();
        physicsWorker.postMessage(JSON.stringify({t: 'UPDATE', rocks: rocks, uniqueID: uniqueID}));
    }
}

function doSim() {
    if(workerDone){
        workerDone = false;
        workerTime = window.performance.now();
        physicsWorker.postMessage(JSON.stringify({t: 'SIM'}));
    }
}

function draw() {
    if (!paused) {
        //updateRocks();
        doSim();
    }
    
    let drawTimeStart = window.performance.now();

    let rocksSortedZ = clone(rocks);
    rocksSortedZ.sort((a, b) => a.pz - b.pz);
    let rocksSortedY = clone(rocks);
    rocksSortedY.sort((a, b) => a.py - b.py);

    drawCanvas("canvasLeft", false, rocksSortedZ);
    drawCanvas("canvasRight", true, rocksSortedY);
    
    let drawTime = window.performance.now() - drawTimeStart;
    fps = 1000 / (timeInWorker + drawTime);

    document.getElementById("status").innerHTML = "Physics Time:" + timeInWorker.toFixed(1)
        + " Draw Time:" + drawTime.toFixed(1)
        + " FPS:" + fps.toFixed(1)
        + " N:" + rocks.length
        + " Frame:" + frameCounter
        + " Time:" + simTime;
    document.getElementById("scalelabel").innerHTML = (canvasScale * 100).toFixed(0) + "%";
}

function drawCanvas(canvasId, topView, sortedRocks) {
    const canvas = document.getElementById(canvasId);
    if (canvasLeft.getContext) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(canvasScale, canvasScale);
        ctx.lineWidth = 1 / canvasScale;
        ctx.translate(-rocks[0].px + canvasWidth / 2 / canvasScale,
            -(topView ? rocks[0].pz : rocks[0].py) + canvasHeight / 2 / canvasScale
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

function updateRocks() {
    for (let i = 0; i < numberOfRocks; i++) {
        rocks[i].ax = 0.0;
        rocks[i].ay = 0.0;
        rocks[i].az = 0.0;
    }

    // combine rocks
    for (let i = 0; i < numberOfRocks; i++) {
        for (let j = i + 1; j < numberOfRocks; j++) {
            let dist2 = getDistance2(rocks[i], rocks[j]);
            if (dist2 <= (rocks[i].r + rocks[j].r) * (rocks[i].r + rocks[j].r)) {
                rocks[i] = combineRocks(rocks[i], rocks[j]);
                rocks.splice(j, 1);
                j--;
                numberOfRocks--;
            }
        }
    }

    // Calc acceleration due to gravity
    for (let i = 0; i < numberOfRocks; i++) {
        for (let j = i + 1; j < numberOfRocks; j++) {
            let dist = getDistance(rocks[i], rocks[j]);
            let distinv = 1 / dist;
            let vecToRockx = (rocks[j].px - rocks[i].px) * distinv;
            let vecToRocky = (rocks[j].py - rocks[i].py) * distinv;
            let vecToRockz = (rocks[j].pz - rocks[i].pz) * distinv;
            let force = gravityConst * rocks[i].m * rocks[j].m * distinv * distinv;
            let accela = force / rocks[i].m;
            let accelb = force / rocks[j].m;
            rocks[i].ax += vecToRockx * accela;
            rocks[i].ay += vecToRocky * accela;
            rocks[i].az += vecToRockz * accela;
            rocks[j].ax -= vecToRockx * accelb;
            rocks[j].ay -= vecToRocky * accelb;
            rocks[j].az -= vecToRockz * accelb;
        }
    }

    // update physics
    for (let rock of rocks) {
        rock.vx += rock.ax / timeFactor;
        rock.vy += rock.ay / timeFactor;
        rock.vz += rock.az / timeFactor;
        rock.px += rock.vx / timeFactor;
        rock.py += rock.vy / timeFactor;
        rock.pz += rock.vz / timeFactor;
    }
}

function combineRocks(a, b) {
    let newm = a.m + b.m;
    let volumea = 4 * Math.PI * (a.r ** 3) / 3;
    let volumeb = 4 * Math.PI * (b.r ** 3) / 3;
    let newVolume = volumea + volumeb;
    let newr = a.material != MATERIAL_STAR ? (newVolume * 3 / (4 * Math.PI)) ** (1 / 3) : a.r;

    let newx = (a.px * a.m + b.px * b.m) / ((a.m + b.m));
    let newy = (a.py * a.m + b.py * b.m) / ((a.m + b.m));
    let newz = (a.pz * a.m + b.pz * b.m) / ((a.m + b.m));

    let newvx = (a.vx * a.m + b.vx * b.m) / newm;
    let newvy = (a.vy * a.m + b.vy * b.m) / newm;
    let newvz = (a.vz * a.m + b.vz * b.m) / newm;

    let newmaterial = a.material;

    let colors = [a.matColor, b.matColor];
    let newColor = chroma.average(colors, 'lch', [volumea/newVolume, volumeb/newVolume]);

    let rock = {
        id: a.material != MATERIAL_STAR ? getNewID() : 0,
        px: newx,
        py: newy,
        pz: newz,
        vx: newvx,
        vy: newvy,
        vz: newvz,
        ax: 0,
        ay: 0,
        az: 0,
        m: newm,
        r: newr,
        material: newmaterial,
        matColor: a.material != MATERIAL_STAR ? newColor : chroma(237,226,12),
    }
    return rock;
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

function getDistance(a, b) {
    let dist = Math.hypot((a.px - b.px), (a.py - b.py), (a.pz - b.pz));
    if (dist < (a.r + b.r)) {
        dist = a.r + b.r;
    }
    return dist;
}

function getDistance2(a, b) {
    let dist2 = (a.px - b.px) * (a.px - b.px) + (a.py - b.py) * (a.py - b.py) + (a.pz - b.pz) * (a.pz - b.pz);
    if (dist2 < (a.r + b.r)) {
        dist2 = (a.r + b.r) * (a.r + b.r);
    }
    return dist2;
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
        paused = false;
        document.getElementById("pause").innerHTML = "Pause";
    }
    else {
        paused = true;
        document.getElementById("pause").innerHTML = "Play";
    }
}

function canvasClick(evt) {
    let worldCoordX = ((evt.offsetX - rocks[0].px) / canvasScale) + rocks[0].px;
    if(evt.srcElement.id == 'canvasLeft') {
        let worldCoordY = ((evt.offsetY - rocks[0].py) / canvasScale) + rocks[0].py;
        console.log(getClosestRockIndex(worldCoordX, worldCoordY, LEFT_PANE));
    }
    if(evt.srcElement.id == 'canvasRight') {
        let worldCoordZ = ((evt.offsetY - rocks[0].pz) / canvasScale) + rocks[0].pz;
        console.log(getClosestRockIndex(worldCoordX, worldCoordZ, RIGHT_PANE));
    }
}

function getClosestRockIndex(x, y, pane){
    let closestDist = Infinity;
    let closestIndex = 0;
    for(let i=0; i < numberOfRocks; i++) {
        let opt = pane == LEFT_PANE ? rocks[i].py - y : rocks[i].pz - y;
        // let dist = ((rocks[i].px - x) * (rocks[i].px - x) +  opt * opt)**0.5;
        let dist = Math.hypot(rocks[i].px - x, opt);
        if (dist < closestDist) {
            closestIndex = i;
            closestDist = dist;
        }
    }
    return rocks[closestIndex];
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
