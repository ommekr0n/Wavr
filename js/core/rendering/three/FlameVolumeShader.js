import { flameJetProfile } from './FlameJetProfile.js';

/** Emissive 3D combustion field: advected curls, narrow hot jet and cooling tips. */
export const flameVolumeFragmentShader = `
    varying vec3 vLocalPosition;
    uniform mat4 uWorldToLocal;
    uniform sampler3D uNoise;
    uniform float uTime, uBurst, uAge, uSeed;

    float field(vec3 p) { return texture(uNoise, p).r; }

    vec2 combustion(vec3 p) {
        float y = p.y;
        float front = smoothstep(y - 0.08, y + 0.12, uAge * ${flameJetProfile.ignitionSpeed.toFixed(1)});
        float fuel = 1.0 - smoothstep(1.05 + y * 0.65, 1.65 + y * 0.65, uAge);
        if (front * fuel < 0.001) return vec2(0.0);

        if (length(p.xz) > 0.38) return vec2(0.0);
        vec3 flow = p * vec3(2.4, ${flameJetProfile.flowScaleY.toFixed(1)}, 2.4) + vec3(uSeed, -uTime * ${flameJetProfile.flowSpeed.toFixed(1)}, uSeed * 0.37);
        vec2 curl = vec2(field(flow * 0.55), field(flow * 0.55 + vec3(0.31, 0.67, 0.19))) - 0.5;
        vec2 centre = curl * (0.025 + y * 0.36);
        float radius = length(p.xz - centre);
        float width = (0.042 + 0.29 * pow(max(y, 0.0), 0.65)) * (1.0 - y * 0.8);
        if (radius > width + 0.11) return vec2(0.0);

        flow.xz -= centre * 2.4;
        float billow = field(flow);
        float wisps = field(flow * 2.7 + vec3(0.2, -uTime * 0.25, 0.4));
        float shape = width - radius + (billow - 0.5) * (0.1 + y * 0.42) + (wisps - 0.5) * 0.075;
        float body = smoothstep(-0.025, 0.065, shape);
        float mixture = billow * 0.72 + wisps * 0.28;
        float breakup = smoothstep(0.32 + y * 0.16, 0.6, mixture);
        // Combustion concentrates in curled sheets instead of filling a solid tube.
        float reaction = 1.0 - smoothstep(0.02, 0.1, abs(mixture - (0.46 + y * 0.05)));
        float tip = 1.0 - smoothstep(0.65 + (billow - 0.5) * 0.4, 0.99, y);
        float core = exp(-radius * radius / max(0.0004, width * width * 0.1)) * exp(-y * 3.0);
        float density = (body * breakup * (0.18 + reaction * 0.82) + core * 0.35) * tip * front * fuel;
        float heat = clamp(core * 0.9 + reaction * 0.65 + density * 0.15 - y * 0.28 + min(0.05, max(0.0, uBurst - 0.8) * 0.08) * (1.0 - y * 0.8), 0.0, 1.0);
        return vec2(density, heat);
    }

    void main() {
        vec3 origin = (uWorldToLocal * vec4(cameraPosition, 1.0)).xyz;
        vec3 direction = normalize(vLocalPosition - origin) + vec3(0.00001);
        vec3 lo = (vec3(-0.5, 0.0, -0.5) - origin) / direction;
        vec3 hi = (vec3(0.5, 1.0, 0.5) - origin) / direction;
        vec3 nearPlane = min(lo, hi), farPlane = max(lo, hi);
        float start = max(0.0, max(max(nearPlane.x, nearPlane.y), nearPlane.z));
        float end = min(min(farPlane.x, farPlane.y), farPlane.z);
        if (end <= start || uBurst < 0.01) discard;

        float stepSize = (end - start) / 28.0;
        vec3 radiance = vec3(0.0);
        float transmission = 1.0;
        for (int i = 0; i < 28; i++) {
            vec3 p = origin + direction * (start + (float(i) + 0.5) * stepSize);
            vec2 flame = combustion(p);
            float amount = flame.x * stepSize * uBurst * ${flameJetProfile.opticalDensity.toFixed(1)};
            vec3 colour = mix(vec3(2.6, 0.12, 0.008), vec3(5.0, 1.7, 0.08), smoothstep(0.08, 0.65, flame.y));
            colour = mix(colour, vec3(8.0, 6.0, 2.6), smoothstep(0.65, 0.98, flame.y));
            radiance += transmission * amount * colour;
            transmission *= exp(-amount * 1.8);
            if (transmission < 0.02) break;
        }
        if (dot(radiance, vec3(1.0)) < 0.008) discard;
        // Hot layers emit light while their extinction attenuates the stage behind.
        float opacity = 1.0 - transmission;
        gl_FragColor = vec4(vec3(1.0) - exp(-radiance / max(opacity, 0.001) * 1.4), opacity);
        #include <colorspace_fragment>
    }
`;
