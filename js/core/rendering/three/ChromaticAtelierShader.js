/** Analytic silk folds: no raymarch, particle allocation or fullscreen blur. */
export const atelierVertex = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
export const atelierFragment = `
uniform float uTime, uEnergy, uAspect;
uniform vec3 uColors[4];
varying vec2 vUv;
void main() {
    vec2 uv = vUv;
    vec2 p = vec2((uv.x - .35) * uAspect, uv.y - .5);
    float t = uTime * .11;
    p += .12 * vec2(sin(p.y * 3.2 + t), cos(p.x * 2.4 - t * .8));
    float flow = p.y + p.x * .32 + sin(p.x * 2.8 + t) * .17;
    vec3 color = vec3(.008, .011, .017);
    for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float ridge = flow - (fi - 1.5) * .23 - sin(p.x * 1.8 - t + fi) * .09;
        float width = .13 + uEnergy * .035;
        float body = exp(-ridge * ridge / (width * width));
        float rim = exp(-pow((ridge - width * .53) / .018, 2.0));
        float streak = .72 + .28 * sin(ridge * 24.0 + p.x * 1.6 + fi);
        color += uColors[i] * body * streak * (.19 + uEnergy * .045);
        color += mix(uColors[i], vec3(.7), .2) * rim * .08;
    }
    // A quiet reading region, with the color visible at its outer edges.
    float reading = smoothstep(.36, .76, uv.x) * (1.0 - pow(abs(uv.y - .5) * 2.0, 2.0));
    color *= mix(1.0, .32, reading);
    float vignette = 1.0 - smoothstep(.18, .95, length((uv - .5) * vec2(.9, 1.0)));
    color *= .45 + vignette * .55;
    float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    gl_FragColor = vec4(max(color + (grain - .5) * .002, vec3(0.0)), 1.0);
}
`;
