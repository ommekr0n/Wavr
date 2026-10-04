import { flameJetProfile } from './FlameJetProfile.js';

/** Nozzle-centred emission with balanced spreading and lingering ember tails. */
export const flameEmberVertexShader = `
    attribute vec4 aSeed;
    uniform float uAge, uStrength, uWidth, uHeight, uColumnWidth, uPixelScale;
    varying float vAlpha, vProgress;
    void main() {
        float age = uAge - aSeed.z * ${flameJetProfile.sparkEmission.toFixed(2)};
        float life = ${flameJetProfile.sparkLife.toFixed(2)} + aSeed.w * ${flameJetProfile.sparkLifeVariation.toFixed(2)};
        float progress = age / life;
        float p = clamp(progress, 0.0, 1.0);
        float elapsed = max(0.0, age);
        vProgress = p;
        vAlpha = step(0.0, progress) * (1.0 - smoothstep(0.6, 1.0, p)) * smoothstep(0.0, 0.07, age) * uStrength;

        // Both sides share the jet's centre and depth; spread grows only during flight.
        float direction = aSeed.y * 2.0 - 1.0;
        float rim = direction * uColumnWidth * 0.025;
        float drift = direction * uColumnWidth * (0.12 + aSeed.w * 0.05) * (1.0 - exp(-elapsed * 1.3));
        float rise = (0.26 + aSeed.w * 0.2) * elapsed - 0.065 * elapsed * elapsed;
        float birthHeight = 0.025 + aSeed.z * 0.025;
        vec3 point = vec3(aSeed.x * uWidth * 0.35 + rim + drift,
            uHeight * (-0.47 + birthHeight + rise),
            1.0 + sin(aSeed.y * 20.0 + elapsed * 2.0) * uHeight * 0.015);
        point.x += sin(aSeed.y * 25.0 + elapsed * 3.0) * p * uColumnWidth * 0.018;
        vec4 viewPosition = modelViewMatrix * vec4(point, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(uHeight * (0.006 + aSeed.w * 0.005) * uPixelScale / max(1.0, -viewPosition.z), 4.0, 10.0);
    }
`;

export const flameEmberFragmentShader = `
    varying float vAlpha, vProgress;
    void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        float edge = 1.0 - smoothstep(0.65, 1.0, radius);
        float glow = exp(-radius * radius * 3.5) * 0.65;
        float core = exp(-radius * radius * 12.0);
        float alpha = (glow + core) * edge * vAlpha;
        if (alpha < 0.01) discard;
        vec3 colour = mix(vec3(1.0, 0.75, 0.18), vec3(1.0, 0.18, 0.004), vProgress);
        colour = mix(colour, vec3(1.0, 0.95, 0.7), core * (1.0 - vProgress * 0.65));
        gl_FragColor = vec4(colour * (1.5 + core * 0.9), alpha);
        #include <colorspace_fragment>
    }
`;
