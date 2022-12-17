let mouse = [ 0, 0 ];
simulationCanvas.addEventListener("mousemove", e => mouse = [ e.clientX, e.clientY ]);

const compileShader = (gl, source, type) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  console.log(gl.getShaderInfoLog(shader));
  return shader;
}
const buildProgram = (gl, fs, vs) => {
  vs = compileShader(gl, vs, gl.VERTEX_SHADER);
  fs = compileShader(gl, fs, gl.FRAGMENT_SHADER);
  
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  console.log(gl.getProgramInfoLog(program));

  return program;
}

const buildTexture = (gl, dim, internal, format, type, data=null) => {
  const tex0 = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, dim[X], dim[Y], 0, format, type, data);
  return tex0;
};




let simDim = [ 1024, 1024 ];
[ simulationCanvas.width, simulationCanvas.height ] = simDim;

const invSimDim = div([ 1, 1 ], simDim);
const agentCount = simDim[X]*simDim[Y];

///
///
///



const SPEED = 0.0005;
const ROTATION = TAU/8;
const SENSOR_ANGLE = TAU/8;
const SENSOR_DISTANCE = 10.5 / max(...simDim);
const DECAY_RATE = 0.84;
const DEPOSIT_RATE = 0.03;

const  LOW_DENSITY = 0.2;
const HIGH_DENSITY = 0.5;

const simulationConstantsFragment = 
`
#define SPEED           ${SPEED.toPrecision(21)}
#define ROTATION        ${ROTATION.toPrecision(21)}
#define SENSOR_ANGLE    ${SENSOR_ANGLE.toPrecision(21)}
#define SENSOR_DISTANCE ${SENSOR_DISTANCE.toPrecision(21)}
#define DECAY_RATE      ${DECAY_RATE.toPrecision(21)}
#define DEPOSIT_RATE    ${DEPOSIT_RATE.toPrecision(21)}
#define  LOW_DENSITY    ${LOW_DENSITY.toPrecision(21)}
#define HIGH_DENSITY    ${HIGH_DENSITY.toPrecision(21)}

#define SIM_X ${simDim[X].toPrecision(21)}
#define SIM_Y ${simDim[Y].toPrecision(21)}

const vec2 SIM_DIM = vec2(SIM_X, SIM_Y);
const vec2 LATTICE_SPACING = 1.0/SIM_DIM;
`;

const mathFragment =
`
#define TAU ${TAU.toPrecision(21)}
vec2 a2v(const float a) { return vec2(cos(a), sin(a)); }

float tri(float n) {
  n = fract(n);
  if (n < 0.0) n = 1.0 - n;
  return n;
}
vec2 tri(vec2 n) {
  return vec2(tri(n.x), tri(n.y));
}

`;


const preludeFragment = 
`#version 300 es

precision highp float;


${simulationConstantsFragment}
${mathFragment}
`;


const packUnpackFragment = `
const float PackUpscale = 256. / 255.; // fraction -> 0..1 (including 1)
const float UnpackDownscale = 255. / 256.; // 0..1 -> fraction (excluding 1)
const vec3 PackFactors = vec3( 256. * 256. * 256., 256. * 256.,  256. );
const vec4 UnpackFactors = UnpackDownscale / vec4( PackFactors, 1. );
const float ShiftRight8 = 1. / 256.;

vec4 pack( const in float v ) {
	vec4 r = vec4( fract( v * PackFactors ), v );
	r.yzw -= r.xyz * ShiftRight8; // tidy overflow
	return r * PackUpscale;
}
float unpack( const in vec4 v ) {
	return dot( v, UnpackFactors );
}
`;


const samplersFragment =
`
uniform sampler2D        xTex;
uniform sampler2D        yTex;
uniform sampler2D  headingTex;
uniform sampler2D  densityTex;
`;

const outFragment =
`
layout(location = 0) out vec4       xBuf;
layout(location = 1) out vec4       yBuf;
layout(location = 2) out vec4 headingBuf;
layout(location = 3) out vec4 densityBuf;
`;


const passThroughVertexShader = 
`${preludeFragment}

in vec4 position;
void main() { gl_Position = position; }
`;

const simFragmentShader =
`${preludeFragment}

${packUnpackFragment}
${samplersFragment}
uniform vec2 mouse;
uniform float t;

${outFragment}


// Taken from the book of shaders
float random (vec2 st) {
    return fract(sin(dot(st.xy,
                         vec2(12.9898,78.233)))*
        43758.5453123);
}

void main() {
  vec2 uv = (gl_FragCoord.xy) / SIM_DIM;

  float x = unpack(texture(xTex, uv));
  float y = unpack(texture(yTex, uv));
  vec2 p = vec2(x, y);

  float heading = unpack(texture(headingTex, uv))*TAU;


  float sensorDistance = 1.0*SENSOR_DISTANCE;
  float speed = SPEED;
  float decayRate = DECAY_RATE;
  float deposit = 0.0;

  if (distance(p, mouse) < 0.1) {
    sensorDistance = 4.0/SIM_X;
    speed *= 1.4;
    
  }
  if (distance(uv, mouse) < 0.1) {
    decayRate *= 0.9;
    // deposit = -0.01;
  }

  float    leftSample = unpack(texture(densityTex, p + sensorDistance*a2v(heading - SENSOR_ANGLE)));
  float forwardSample = unpack(texture(densityTex, p + sensorDistance*a2v(heading)));
  float   rightSample = unpack(texture(densityTex, p + sensorDistance*a2v(heading + SENSOR_ANGLE)));

  const float V_HIGH  = 1.0;
  if (leftSample < LOW_DENSITY
    && forwardSample < HIGH_DENSITY
    && HIGH_DENSITY <= rightSample) {
      if (false && V_HIGH <= rightSample)
        heading -= ROTATION;
      else
        heading += ROTATION;
  } else if (
    rightSample < LOW_DENSITY
    && forwardSample < HIGH_DENSITY
    && HIGH_DENSITY <= leftSample) {
      if (false && V_HIGH <= leftSample)
        heading += ROTATION;
      else
        heading -= ROTATION;
  } else if (
    
    (HIGH_DENSITY <= leftSample
    && forwardSample < HIGH_DENSITY
    && HIGH_DENSITY <= rightSample
    )
  ) {
    // TODO: more randomly
    heading += sign(sin(t)*cos(11131.3*gl_FragCoord.x)*cos(7131.3*gl_FragCoord.y))*ROTATION;
  } else if (V_HIGH <= forwardSample) {
    heading += TAU/2.0;
  }

  p = tri(p + speed*a2v(heading));
  if (distance(p, vec2(0.5)) > 0.45) {
    p = vec2(0.5) + 0.45*((random(uv*3.+t/1.5)))*a2v(TAU*random(uv.yx+t));
  }


  vec3 spacing = vec3(LATTICE_SPACING, 0.0);
  float diffuse = (
    unpack(texture(densityTex, uv))
    + (
      (
        unpack(texture(densityTex, uv + spacing.zy)) + // north
        unpack(texture(densityTex, uv + spacing.xz)) + // east
        unpack(texture(densityTex, uv - spacing.zy)) + // south
        unpack(texture(densityTex, uv - spacing.xz))   // west
      )/5.0
      + (
        unpack(texture(densityTex, uv + spacing.zy + spacing.xz)) + // ne
        unpack(texture(densityTex, uv - spacing.zy + spacing.xz)) + // se
        unpack(texture(densityTex, uv - spacing.zy - spacing.xz)) + // sw
        unpack(texture(densityTex, uv + spacing.zy - spacing.xz))   // nw
      )/20.0
      // 4/5 + 4/20 = (16 + 4)/20 = 1
    )
  )/2.0;

        xBuf = pack(p.x);
        yBuf = pack(p.y);
  headingBuf = pack(tri(heading/TAU));
  densityBuf = pack(max(0.0, decayRate*diffuse + deposit));
}
`;

const renderDensityFragmentShader =
`${preludeFragment}

${samplersFragment}
${packUnpackFragment}

out vec4 color;

void main() {
  float density = unpack(texture(densityTex, gl_FragCoord.xy/SIM_DIM));
  float heading = unpack(texture(headingTex, gl_FragCoord.xy/SIM_DIM));
  float x = unpack(texture(xTex, gl_FragCoord.xy/SIM_DIM));
  float y = unpack(texture(yTex, gl_FragCoord.xy/SIM_DIM));
  color = vec4(density, density, density, 1.0);

  color.xyz = vec3(density*density*1.2);

  vec2 p = vec2(x, y);

  float    leftSample = unpack(texture(densityTex, p + SENSOR_DISTANCE*a2v(heading - SENSOR_ANGLE)));
  float forwardSample = unpack(texture(densityTex, p + SENSOR_DISTANCE*a2v(heading)));
  float   rightSample = unpack(texture(densityTex, p + SENSOR_DISTANCE*a2v(heading + SENSOR_ANGLE)));

  // color.rgb = vec3(leftSample < LOW_DENSITY && forwardSample < HIGH_DENSITY && HIGH_DENSITY <= rightSample);
  // color.rgb = vec3(x);
  // color.rgb = vec3(heading);

}
`;

const agentMappingVertexShader = 
`${preludeFragment}

${samplersFragment}

in vec2 agentUV;

${packUnpackFragment}


void main() {
  // TODO: do we need to add a translation of 0.5/textureDim so that we draw at the center of the fragment?

  float x = unpack(texture(xTex, agentUV));
  float y = unpack(texture(yTex, agentUV));
  gl_Position = vec4(x*2.0 - 1.0, y*2.0 - 1.0, 0.0, 1.0);
  // gl_Position = vec4(agentUV, 0.0, 1.0);
  
  // gl_Position = vec4(0.25, 0.25, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;

const depositFragmentShader =
`${preludeFragment}

${packUnpackFragment}

out vec4 densityBuf;
void main() {
  densityBuf = pack(DEPOSIT_RATE);
  // densityBuf.a = 1.0;
}

`;


const gl = simulationCanvas.getContext("webgl2", { premultipliedAlpha: false });
if (!gl) {
  simulationCanvas.classList.add("not-supported");
  let video = document.createElement("video");
  video.src = "mold_06.mp4";
  video.classList.add("demo-video");
  video.controls = "controls"
  video.autoplay = "autoplay"
  simulationCanvas.parentElement.append(video);
} else {




gl.enable(gl.BLEND);
// Do I need the separate?
gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
gl.blendFuncSeparate(gl.ONE, gl.ZERO, gl.ONE, gl.ZERO);


///
/// Build programs
///

const     simProgram = buildProgram(gl,           simFragmentShader,  passThroughVertexShader);
const depositProgram = buildProgram(gl,       depositFragmentShader, agentMappingVertexShader);
const  renderProgram = buildProgram(gl, renderDensityFragmentShader,  passThroughVertexShader);


///
/// Build textures and frame buffers
///


let initialX = new Uint8Array(new Array(agentCount*4).fill().map(() => floor(random()*(0xff))));
let initialY = new Uint8Array(new Array(agentCount*4).fill().map(() => floor(random()*(0xff))));
let initialHeading = new Uint8Array(new Array(agentCount*4).fill().map(() => floor(random()*0xff)));
let initialDensity = new Uint8Array(new Array(agentCount*4).fill().map(() => floor(random()*0xff)));

let       xTex0 = buildTexture(gl, simDim, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, initialX);
let       yTex0 = buildTexture(gl, simDim, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, initialY);
let headingTex0 = buildTexture(gl, simDim, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, initialHeading);
let densityTex0 = buildTexture(gl, simDim, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, initialDensity);

let       xTex1 = buildTexture(gl, simDim, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, initialX);
let       yTex1 = buildTexture(gl, simDim, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, initialY);
let headingTex1 = buildTexture(gl, simDim, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, initialHeading);
let densityTex1 = buildTexture(gl, simDim, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, initialDensity);

let       xTexs = [       xTex0,       xTex1 ];
let       yTexs = [       yTex0,       yTex1 ];
let headingTexs = [ headingTex0, headingTex1 ];
let densityTexs = [ densityTex0, densityTex1 ];







const screenCoveringTriangle = new Float32Array([
 -1, 3, 0,
  3,-1, 0,
 -1,-1, 0
]);
const triangleBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
gl.bufferData(gl.ARRAY_BUFFER, screenCoveringTriangle,  gl.STATIC_DRAW);



const agentUVs = new Float32Array(new Array(agentCount).fill().flatMap((_, i) => {
  let x = i% simDim[X];
  let y = floor(i/simDim[X]);
  return mul([ x + 0.5, y + 0.5 ], invSimDim);
}));

const agentUVBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, agentUVBuffer);
gl.bufferData(gl.ARRAY_BUFFER, agentUVs,  gl.STATIC_DRAW);



///
/// Set up attributes
///

const simPositionAttrib = gl.getAttribLocation(simProgram, "position");
gl.enableVertexAttribArray(simPositionAttrib);


const renderPositionAttrib = gl.getAttribLocation(renderProgram, "position");
gl.enableVertexAttribArray(renderPositionAttrib);

const depositAgentUVAttrib = gl.getAttribLocation(depositProgram, "agentUV");
gl.enableVertexAttribArray(depositAgentUVAttrib);



const       simXTexUniform = gl.getUniformLocation(simProgram,       "xTex");
const       simYTexUniform = gl.getUniformLocation(simProgram,       "yTex");
const simHeadingTexUniform = gl.getUniformLocation(simProgram, "headingTex");
const simDensityTexUniform = gl.getUniformLocation(simProgram, "densityTex");


const simTUniform = gl.getUniformLocation(simProgram, "t");
const simMouseUniform = gl.getUniformLocation(simProgram, "mouse");

const       renderXTexUniform = gl.getUniformLocation(renderProgram,       "xTex");
const       renderYTexUniform = gl.getUniformLocation(renderProgram,       "yTex");
const renderHeadingTexUniform = gl.getUniformLocation(renderProgram, "headingTex");
const renderDensityTexUniform = gl.getUniformLocation(renderProgram, "densityTex");

const       depositXTexUniform = gl.getUniformLocation(depositProgram,       "xTex");
const       depositYTexUniform = gl.getUniformLocation(depositProgram,       "yTex");
const depositHeadingTexUniform = gl.getUniformLocation(depositProgram, "headingTex");
const depositDensityTexUniform = gl.getUniformLocation(depositProgram, "densityTex");



let ping = 0;

const update = t => {
  let rect = simulationCanvas.getBoundingClientRect();
  let _mouse = [...mouse];
  _mouse[X] -= rect.left;
  _mouse[X] /= rect.width;
  _mouse[Y] -= rect.top;
  _mouse[Y] /= rect.height;
  _mouse[Y] = 1 - _mouse[Y];

  let pong = (ping + 1)%2;

  
  // run simulation
  
  gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
  gl.blendFuncSeparate(gl.ONE, gl.ZERO, gl.ONE, gl.ZERO);

  gl.useProgram(simProgram);

  let fb = gl.createFramebuffer();
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.viewport(0, 0, ...simDim);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,       xTexs[pong], 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D,       yTexs[pong], 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, headingTexs[pong], 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, densityTexs[pong], 0);

  gl.uniform1f(simTUniform, t);
  gl.uniform2f(simMouseUniform, _mouse[X], _mouse[Y]);

  gl.uniform1i(simXTexUniform, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,       xTexs[ping]);
  
  gl.uniform1i(simYTexUniform, 1);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D,       yTexs[ping]);
  
  gl.uniform1i(simHeadingTexUniform, 2);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, headingTexs[ping]);
  
  gl.uniform1i(simDensityTexUniform, 3);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, densityTexs[ping]);

  gl.clearColor(0, 0, 0, 0);   // clear to blue
  gl.clear(gl.COLOR_BUFFER_BIT);


  gl.drawBuffers([
    gl.COLOR_ATTACHMENT0,
    gl.COLOR_ATTACHMENT1,
    gl.COLOR_ATTACHMENT2,
    gl.COLOR_ATTACHMENT3,
  ]);
  gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
  gl.vertexAttribPointer(simPositionAttrib, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);


  ///
  /// Run deposit step
  ///
  gl.useProgram(depositProgram);
  
  
  gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
  // gl.blendFuncSeparate(gl.ZERO, gl.ONE, gl.ZERO, gl.ONE);

  fb = gl.createFramebuffer();

  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.viewport(0, 0, ...simDim);

  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, densityTexs[pong], 0);

  gl.uniform1i(depositXTexUniform, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,       xTexs[pong]);
  
  gl.uniform1i(depositYTexUniform, 1);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D,       yTexs[pong]);
  

  // gl.drawBuffers([ gl.COLOR_ATTACHMENT0, ]);
  gl.bindBuffer(gl.ARRAY_BUFFER, agentUVBuffer);
  gl.vertexAttribPointer(depositAgentUVAttrib, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.POINTS, 0, agentCount);
  
  
  ///
  /// Run deposit step
  ///
  gl.useProgram(depositProgram);
  
  
  gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
  // gl.blendFuncSeparate(gl.ONE, gl.ZERO, gl.ONE, gl.ZERO);
  gl.blendFuncSeparate(gl.ZERO, gl.ONE, gl.ZERO, gl.ONE);

  // fb = gl.createFramebuffer();

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, ...simDim);

  // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, densityTexs[pong], 0);


  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


  gl.uniform1i(depositXTexUniform, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,       xTexs[pong]);
  
  gl.uniform1i(depositYTexUniform, 1);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D,       yTexs[pong]);
  

  // gl.drawBuffers([ gl.COLOR_ATTACHMENT0, ]);
  gl.bindBuffer(gl.ARRAY_BUFFER, agentUVBuffer);
  gl.vertexAttribPointer(depositAgentUVAttrib, 2, gl.FLOAT, false, 0, 0);
  // gl.drawArrays(gl.POINTS, 0, agentCount);




/*
*/
  ///
  /// render
  ///

  
  // gl.bufferData(gl.ARRAY_BUFFER, screenCoveringTriangle, gl.STATIC_DRAW);

  gl.useProgram(renderProgram);


gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
gl.blendFuncSeparate(gl.ONE, gl.ZERO, gl.ONE, gl.ZERO);






  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, ...simDim);

  // gl.clearColor(0, 0, 0, 1);
  // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // gl.clearColor(0, 0, 0, 1);
  // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  
  gl.uniform1i(renderXTexUniform, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,       xTexs[pong]);
  
  gl.uniform1i(renderYTexUniform, 1);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D,       yTexs[pong]);
  
  gl.uniform1i(renderHeadingTexUniform, 2);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, headingTexs[pong]);
  
  gl.uniform1i(renderDensityTexUniform, 3);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, densityTexs[pong]);

  

  gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
  gl.vertexAttribPointer(renderPositionAttrib, 3, gl.FLOAT, false, 0, 0);
  
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  

  ping = pong;
}


let looping = false;

// window.recorder = new CanvasRecorder(simulationCanvas);
// let recording = false;


let loopHandle;
let loop = (t) => {
  loopHandle = requestAnimationFrame(loop);
  update(t);
};

requestAnimationFrame(loop);

/*

// let intervalHandle;

window.addEventListener('mousedown', () => {

  if (!looping) {
    looping = true;
    loopHandle = requestAnimationFrame(loop);
  }

  if (!recording) {
    recorder.start();
    recording = true;
  } else {
    recorder.stop();
    recording = false;
  }
});

/**/
}