document.addEventListener('DOMContentLoaded', () => {
    // console.log("started");
    setInterval(draw, 10);
});

let frame = 0;

let maxwidth = 800;
let maxheight = 800;
let maxdepth = 50;
let border = 100;

let timeFactor = 10;
let numberOfRocks = 15000;
let gravityConst = 6.67e-11;

let planarVelFactor = 15;
let outOfPlaneVelFactor = 1;
let maxMassVariance = 30;
let baseRadius = 0.8;
let baseMass = 1e7;

let simStart = Date.now();

let rocks = [];
for (let i = 0; i < numberOfRocks; i++) {
    let massVariance = getRandomInt(1, maxMassVariance);
    let rock = {
        px: getRandomInt(border, maxwidth - border),
        py: getRandomInt(border, maxheight - border),
        pz: getRandomInt(0, maxdepth),
        r: baseRadius * (massVariance ** (1 / 3)),
        m: baseMass * massVariance,
        // vx: 0,
        // vy: 0,
        // vz: 0,
        vx: ((Math.random() * planarVelFactor)),
        vy: ((Math.random() * planarVelFactor)),
        vz: ((Math.random() * outOfPlaneVelFactor * 2) - outOfPlaneVelFactor),
        ax: 0.0,
        ay: 0.0,
        az: 0.0
    };
    if (rock.px < (maxwidth / 2)) {
        rock.vy *= -1;
    }
    if (rock.py > (maxheight / 2)) {
        rock.vx *= -1;
    }
    rocks.push(rock)
}

rocks[0].m = 1e14;
rocks[0].r = 10;
rocks[0].vx = 0;
rocks[0].vy = 0;
rocks[0].vz = 0;
rocks[0].px = maxwidth / 2;
rocks[0].py = maxheight / 2;
rocks[0].pz = 0 + (maxdepth / 2);

function draw() {
    frame++;
    let startTime = Date.now();
    updateRocks();
    const canvasLeft = document.getElementById("canvasLeft");
    if (canvasLeft.getContext) {
        const ctxLeft = canvasLeft.getContext("2d");
        ctxLeft.clearRect(0, 0, canvasLeft.width, canvasLeft.height);
        ctxLeft.translate(-rocks[0].px + maxwidth / 2, -rocks[0].py + maxheight / 2);
        for (let rock of rocks) {
            ctxLeft.beginPath();
            ctxLeft.arc(rock.px, rock.py, rock.r, 0, Math.PI * 2, true);
            ctxLeft.stroke();
        }
        ctxLeft.setTransform(1, 0, 0, 1, 0, 0);
    }
    const canvasRight = document.getElementById("canvasRight");
    if (canvasRight.getContext) {
        const ctxRight = canvasRight.getContext("2d");
        ctxRight.clearRect(0, 0, canvasRight.width, canvasRight.height);
        ctxRight.translate(-rocks[0].px + maxwidth / 2, -rocks[0].pz + maxheight / 2);

        for (let rock of rocks) {
            ctxRight.beginPath();
            ctxRight.arc(rock.px, rock.pz, rock.r, 0, Math.PI * 2, true);
            ctxRight.stroke();
        }
        ctxRight.setTransform(1, 0, 0, 1, 0, 0);
    }
    let timestring = Date.now() - startTime;
    let simTime = Math.floor((Date.now() - simStart) / 1000);
    document.getElementById("status").innerHTML = timestring + ":" + rocks.length + ":" + frame + ":" + simTime;
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

function updateRocks() {
    for (let i = 0; i < numberOfRocks; i++) {
        rocks[i].ax = 0.0;
        rocks[i].ay = 0.0;
        rocks[i].az = 0.0;
    }

    for (let i = 0; i < numberOfRocks; i++) {
        for (let j = i + 1; j < numberOfRocks; j++) {
            let dist = getDistance(rocks[i], rocks[j]);
            let vecToRockx = (rocks[j].px - rocks[i].px) / dist;
            let vecToRocky = (rocks[j].py - rocks[i].py) / dist;
            let vecToRockz = (rocks[j].pz - rocks[i].pz) / dist;
            let force = gravityConst * rocks[i].m * rocks[j].m / (dist * dist);
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

    // combine rocks
    let newRocks = [];
    let oldIndexOfRocks = [];
    let newNumberOfRocks = numberOfRocks;
    let skipFlag = false;
    for (let i = 0; i < numberOfRocks; i++) {
        for (let j = i + 1; j < numberOfRocks; j++) {
            let dist = getDistance(rocks[i], rocks[j]);
            if (dist <= (rocks[i].r + rocks[j].r)) {
                rocks[i] = combineRocks(rocks[i], rocks[j]);
                rocks.splice(j, 1);
                j--;
                numberOfRocks--;
            }
        }
    }

    // update physics
    for (let rock of rocks) {
        rock.vx += rock.ax;
        rock.vy += rock.ay;
        rock.vz += rock.az;
        rock.px += rock.vx / timeFactor;
        rock.py += rock.vy / timeFactor;
        rock.pz += rock.vz / timeFactor;
    }
}

function getDistance(a, b) {
    let dist = Math.sqrt((a.px - b.px) * (a.px - b.px) + (a.py - b.py) * (a.py - b.py) + (a.pz - b.pz) * (a.pz - b.pz));
    if (dist < (a.r + b.r) / 1) {
        dist = (a.r + b.r) / 1;
    }
    return dist;
}

function combineRocks(a, b) {
    let newm = a.m + b.m;
    let volumea = 4 * Math.PI * (a.r ** 3) / 3;
    let volumeb = 4 * Math.PI * (b.r ** 3) / 3;
    let newVolume = volumea + volumeb;
    let newr = (newVolume * 3 / (4 * Math.PI)) ** (1 / 3);

    let newx = (a.px * a.m + b.px * b.m) / ((a.m + b.m));
    let newy = (a.py * a.m + b.py * b.m) / ((a.m + b.m));
    let newz = (a.pz * a.m + b.pz * b.m) / ((a.m + b.m));

    let newvx = (a.vx * a.m + b.vx * b.m) / newm;
    let newvy = (a.vy * a.m + b.vy * b.m) / newm;
    let newvz = (a.vz * a.m + b.vz * b.m) / newm;

    let rock = {
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
        r: newr
    }

    return rock;
}