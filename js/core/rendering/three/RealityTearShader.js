import { tearAnalogShader } from './RealityTearAnalogShader.js';

export const tearVertex = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
export const tearFragment = `
uniform sampler2D uScene;
uniform vec2 uResolution, uCenter;
uniform float uHorizontal, uAmplitude, uGap, uAngle, uOpening, uPixelTime;
varying vec2 vUv;
float curve(float t) {
    return .035 * t + uAmplitude * (18.0 * (sin(t * .007 + .5) - sin(.5))
        + 7.0 * (sin(t * .023 + 1.4) - sin(1.4)) + 2.0 * sin(t * .085));
}
float distanceToCut(vec2 p) {
    vec2 q = p - uCenter;
    return mix(q.x - curve(q.y), q.y - curve(q.x), uHorizontal);
}
vec4 sceneAt(vec2 p) { return texture2D(uScene, vec2(p.x / uResolution.x, 1.0 - p.y / uResolution.y)); }
${tearAnalogShader}
void main() {
    vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uResolution;
    float side = distanceToCut(p) < 0.0 ? -1.0 : 1.0;
    vec2 normal = mix(vec2(1.0, 0.0), vec2(0.0, 1.0), uHorizontal);
    vec2 along = normal.yx;
    float angle = side * uAngle * uOpening;
    float c = cos(angle), s = sin(angle);
    vec2 q = p - uCenter - side * uOpening * (normal * uGap + along * 6.0);
    q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y) / (1.0 + .012 * uOpening) + uCenter;
    float d = distanceToCut(q) * side;
    float t = dot(q - uCenter, along);
    // Fine fibers, rather than regularly spaced polygon teeth.
    float fiber = (sin(t * 1.7) * .48 + sin(t * 3.91 + .7) * .25) * min(1.0, uOpening * 10.0);
    float seam = smoothstep(-.65, .65, d + fiber);
    float fold = exp(-max(0.0, d) / 19.0) * uOpening;
    vec2 curled = q + normal * side * fold * 14.0 + along * fold * sin(t * .026) * 2.5;
    vec4 surface = sceneAt(clamp(curled, vec2(.5), uResolution - .5));
    surface = tearAnalogSurface(surface, curled, d, normal, along);
    // A narrow paper edge catches light; the inner fold carries the source color.
    float rim = exp(-pow(max(0.0, d) / 1.3, 2.0)) * uOpening;
    float shoulder = exp(-pow((max(0.0, d) - 14.0) / 9.0, 2.0)) * uOpening;
    surface.rgb = surface.rgb * (1.0 - fold * .46 + shoulder * .16) + vec3(.20, .19, .17) * rim;
    vec3 reflection = sceneAt(clamp(q, vec2(.5), uResolution - .5)).rgb;
    vec3 depth = vec3(.0015, .0018, .0024) + reflection * .032 * exp(-abs(d) / 22.0);
    float veil = tearAnalogVeil(q, d) * smoothstep(.08, .65, uOpening);
    depth = mix(depth, surface.rgb * .55, veil);
    gl_FragColor = mix(vec4(depth, 1.0), surface, seam);
    if (uOpening < .0001) gl_FragColor = sceneAt(p);
    #include <colorspace_fragment>
}
`;
