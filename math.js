const X = 0, Y = 1, Z = 2;
const R = 0, G = 1, B = 2, A = 3;

const { round, floor, ceil, abs, sign, sin, cos, tan, asin, acos, atan, atan2, sqrt, PI, log, log2, pow, exp, random, min, max } = Math;
const TAU = PI*2;
const SQRT2 = sqrt(2);
const SQRT3 = sqrt(3);


const saw = (n, m) => (n%m + m)%m;
const saw2 = ([nx, ny], [mx, my]) => [ (nx%mx + mx)%mx, (ny%my + my)%my ];
// const tri = (n, m) => (n%(m*2) + m)%m;

const add = (a, b) => [ a[X] + b[X], a[Y] + b[Y] ];
const sub = (a, b) => [ a[X] - b[X], a[Y] - b[Y] ];
const scl = (v, s) => [ v[X]*s, v[Y]*s ];
const len = ([ x, y ]) => sqrt(x*x + y*y);
const dst = (a, b) => sqrt((a[X] - b[X])**2 + (a[Y] - b[Y])**2);

const mul = (a, b) => [ a[X]*b[X], a[Y]*b[Y] ];
const div = (a, b) => [ a[X]/b[X], a[Y]/b[Y] ];

const lenSqr = ([ x, y ]) => x*x + y*y;
const dstSqr = (a, b) => (a[X] - b[X])**2 + (a[Y] - b[Y])**2;
const normalize = v => scl(v, 1/len(v));

const a2v = (a, r = 1) => [ cos(a)*r, sin(a)*r ];
const v2a = v => atan2(v[Y], v[X]);

const dot = (a, b) => a[X]*b[X] + a[Y]*b[Y];

const rot = (p, a) => [ p[X]*cos(a) - p[Y]*sin(a), p[Y]*cos(a) + p[X]*sin(a) ];


const polygonContainsP = (shapeP, shapeA, vertices, p) => {
  p = sub(p, shapeP);
  p = rot(p, -shapeA);

  let intersections = 0;
  for (let i = 0; i < vertices.length; ++i) {
    let a = vertices[saw(i, vertices.length)];
    let b = vertices[saw(i + 1, vertices.length)];

    if ((a[Y] <= p[Y] && b[Y] <= p[Y] )
      || (a[Y] >= p[Y] && b[Y] >= p[Y] )
      || (a[Y] == p[Y] && b[Y] == p[Y])) continue;

    if (p[X] < a[X] && p[X] < b[X]) intersections++;
    else {
      let d = sub(b, a);

      let dy = b[Y] - a[Y];
      let dyPrime = p[Y] - a[Y];
      let projected = add(a, scl(d, dyPrime/dy));
      if (p[X] < projected[X]) intersections++;
    }
  }

  return intersections%2;
};

const segSegIntersection = ([ a0, a1 ], [ b0, b1 ]) => {
  let dA = sub(a1, a0);
  let dB = sub(b1, b0);

  let dirA = normalize(dA);

  let dA0B0 = sub(b0, a0);

  let lenA0S = dot(dA, dA0B0)/len(dA);
  let s = add(a0, scl(dirA, lenA0S));
  let dB0S = sub(s, b0);

  let lenB0M = dot(dB0S, dB)/len(dB0S);

  let bT = len(dB0S)/lenB0M;
  let intersect = add(b0, scl(dB, bT));
  let dA0Intersect = sub(intersect, a0);
  let aT = len(dA0Intersect)/len(dA);
  
  aT *= sign(dot(dA, dA0Intersect));

  // ctx.beginPath();
  // ctx.arc(...s, 2, 0, TAU);
  // ctx.fill();
  // ctx.beginPath();
  // ctx.arc(...intersect, 2, 0, TAU);
  // ctx.fill();

  // ctx.beginPath();
  // ctx.moveTo(...a0);
  // ctx.lineTo(...a1);
  // ctx.stroke();
  // ctx.beginPath();
  // ctx.moveTo(...b0);
  // ctx.lineTo(...s);
  // ctx.stroke();
  // ctx.beginPath();
  // ctx.moveTo(...b0);
  // ctx.lineTo(...b1);
  // ctx.stroke();


  return [ intersect, aT, bT ];
};

const polygonSegIntersection = (shapeP, shapeA, vertices, seg) => {
  seg = seg.map(p => sub(p, shapeP));
  seg = seg.map(p => rot(p, -shapeA));


  let intersectionP;
  let intersected;
  let smallestD = Infinity;
  let vt;
  
  for (let i = 0; i < vertices.length; ++i) {
    let v0 = vertices[i];
    let v1 = vertices[(i + 1)%vertices.length];
    let [ p, ds, dv ] = segSegIntersection(seg, [ v0, v1 ]);

    if (ds > 0 && dv > 0 && dv <= 1 && ds <= smallestD) {
      smallestD = ds;
      intersectionP = p;
      intersected = [ v0, v1 ];
      vt = dv;

    }
  }

  return [intersectionP, intersected, smallestD, vt];
};


const discSegIntersection = (p, r, seg) => {
  let d0 = dst(p, seg[0]), d1 = dst(p, seg[1]);
  if (false && d0 < r || d1 < r) {
    if (d0 < d1) {
      let delta = sub(seg[0], p);
      let intercept = add(p, scl(normalize(delta), r));
      return [ intercept, d0 - r ];
    } else {
      let delta = sub(seg[1], p);
      let intercept = add(p, scl(normalize(delta), r));
      return [ intercept, d1 - r ];
    }
  } else {
    let dseg = sub(seg[1], seg[0]);
    let segLen = len(dseg);
    let projectionD = dot(dseg, sub(p, seg[0]));
    let projectionP = add(seg[0], scl(dseg, projectionD/segLen/segLen));
    let obj2project = dst(projectionP, p);
  
    if (obj2project <= r) {
      let side = sqrt(r**2 - dst(p, projectionP)**2);
      let intercept = sub(projectionP, scl(dseg, side/segLen));
  
      let distance = dst(intercept, seg[0]);
      if (distance < segLen) return [ intercept, distance ];
    }
  }
};

const OFFSET8 = [
  [ 1, 0 ],
  [ 1, 1 ],
  [ 0, 1 ],
  [-1, 1 ],
  [-1, 0 ],
  [-1,-1 ],
  [ 0,-1 ],
  [ 1,-1 ],
];
const DIR8 = OFFSET8.map(dir => normalize(dir));
const A8 = new Array(8).fill().map((n, i) => i*TAU/8);

const RIGHT        = OFFSET8.RIGHT        = DIR8.RIGHT        = 0;
const BOTTOM_RIGHT = OFFSET8.BOTTOM_RIGHT = DIR8.BOTTOM_RIGHT = 1;
const BOTTOM       = OFFSET8.BOTTOM       = DIR8.BOTTOM       = 2;
const BOTTOM_LEFT  = OFFSET8.BOTTOM_LEFT  = DIR8.BOTTOM_LEFT  = 3;
const LEFT         = OFFSET8.LEFT         = DIR8.LEFT         = 4;
const TOP_LEFT     = OFFSET8.TOP_LEFT     = DIR8.TOP_LEFT     = 5;
const TOP          = OFFSET8.TOP          = DIR8.TOP          = 6;
const TOP_RIGHT    = OFFSET8.TOP_RIGHT    = DIR8.TOP_RIGHT    = 7;

const DOWN_RIGHT = OFFSET8.DOWN_RIGHT = DIR8.DOWN_RIGHT = 1;
const DOWN       = OFFSET8.DOWN       = DIR8.DOWN       = 2;
const DOWN_LEFT  = OFFSET8.DOWN_LEFT  = DIR8.DOWN_LEFT  = 3;
const UP_LEFT    = OFFSET8.UP_LEFT    = DIR8.UP_LEFT    = 5;
const UP         = OFFSET8.UP         = DIR8.UP         = 6;
const UP_RIGHT   = OFFSET8.UP_RIGHT   = DIR8.UP_RIGHT   = 7;


const lerp1 = (a, b, t) => a*(1 - t) + b*t;
const lerp = (a, b, t) => add(scl(a, 1 - t), scl(b, t));
const interpolateBezier = (curve, t) => {
  while (curve.length > 1) {
    let interpolatedPoints = new Array(curve.length - 1);
    for (let i = 0; i < interpolatedPoints.length; ++i) {
      interpolatedPoints[i] = lerp(curve[i], curve[i + 1], t);
    }

    curve = interpolatedPoints;
  }

  return curve[0];
}

const clamp1 = (minS, maxS, s) => min(maxS, max(minS, s));
const clamp2 = ([ minX, minY ], [ maxX, maxY ], v) => [
  min(maxX, max(minX, v[X])),
  min(maxY, max(minY, v[Y])),
];


const pickRandom = ls => ls[floor(random()*ls.length)];
const pickWeighted = (weights, total = 1) => {
  let r = random()*total;
  let sum = 0;
  for (let i = 0; i < weights.length; ++i) {
    sum += weights[i];

    if (sum > r) return i;
  }

  invalidCodePath();
}

const weightedSample = (choices, weights, total = 0, random = Math.random) => {
  if (total <= 0) total = weights.reduce((sum, w) => sum + w, 0);

  let sample = random()*total;
  let sum = 0;
  for (let i = 0; i < weights.length; ++i) {
    sum += weights[i];

    if (sum > sample) return choices[i];
  }

  invalidCodePath();
};


const polygonFromDim = dim => [
  [-dim[X]/2,-dim[Y]/2 ],
  [ dim[X]/2,-dim[Y]/2 ],
  [ dim[X]/2, dim[Y]/2 ],
  [-dim[X]/2, dim[Y]/2 ]
];
const insideOutPolygonFromDim = dim => [
  [-dim[X]/2,-dim[Y]/2 ],
  [-dim[X]/2, dim[Y]/2 ],
  [ dim[X]/2, dim[Y]/2 ],
  [ dim[X]/2,-dim[Y]/2 ]
];


let Random = {
  bilateral: () => 2*random() - 1,
  unilateral: () => random(),
  bilateral2: () => [ 2*random() - 1, 2*random() - 1 ],
  unilateral2: () => [ random(), random() ],
};