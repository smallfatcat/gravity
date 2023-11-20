importScripts("chroma.js");

const MATERIAL_STAR = 0;
const MATERIAL_SOLID = 1;
const LEFT_PANE  = 0;
const RIGHT_PANE = 1;

let rocks = [];
let numberOfRocks = 0;
let timeFactor = 10;
let uniqueID = 0;

let gravityConst    = 6.67e-11;
let genID = 0;

let paused = false;

let tickStart = Date.now();

let simEnable = false;

let updateNumber = 0;

// let updateIntervalID;

onmessage = (evt) => {
    let data = JSON.parse(evt.data);
    if(data.t == 'UPDATE'){
        rocks = data.rocks;
        uniqueID = 0;
        numberOfRocks = rocks.length;
        updateNumber = data.u;
        // updateIntervalID = setInterval(updateRocks, 16);
        throttleUpdates();
    }
    if(data.t == 'PAUSE'){
        paused = true;
    }
    if(data.t == 'PLAY'){
        paused = false;
    }
}

function throttleUpdates() {
    setTimeout(updateRocks, 10);
}

function updateRocks() {
    if(!paused){
        tickStart = Date.now();
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

        let tickDuration = Date.now() - tickStart;

        postMessage(JSON.stringify({rocks: rocks, uniqueID: uniqueID, u: updateNumber, tickDuration: tickDuration}));
    }
    throttleUpdates();
}


function combineRocks(a, b) {
    //console.log(a, b);
    let newm = a.m + b.m;
    let volumea = 4 * Math.PI * (a.r ** 3) / 3;
    let volumeb = 4 * Math.PI * (b.r ** 3) / 3;
    let newVolume = volumea + volumeb;
    let newr = a.material != MATERIAL_STAR ? (newVolume * 3 / (4 * Math.PI)) ** (1 / 3) : a.r;

    // let newx = (a.px * a.m + b.px * b.m) / ((a.m + b.m));
    // let newy = (a.py * a.m + b.py * b.m) / ((a.m + b.m));
    // let newz = (a.pz * a.m + b.pz * b.m) / ((a.m + b.m));

    let newvx = (a.vx * a.m + b.vx * b.m) / newm;
    let newvy = (a.vy * a.m + b.vy * b.m) / newm;
    let newvz = (a.vz * a.m + b.vz * b.m) / newm;

    let newmaterial = a.material;

    let colors = [chroma(a.matColor._rgb[0],a.matColor._rgb[1],a.matColor._rgb[2]), chroma(b.matColor._rgb[0],b.matColor._rgb[1],b.matColor._rgb[2])];
    let newColor = chroma.average(colors, 'lch', [volumea/newVolume, volumeb/newVolume]);

    let rock = {
        id: a.m >= b.m ? a.id : b.id,
        px: a.m >= b.m ? a.px : b.px,
        py: a.m >= b.m ? a.py : b.py,
        pz: a.m >= b.m ? a.pz : b.pz,
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

function getNewID() {
    uniqueID++;
    return uniqueID;
}
