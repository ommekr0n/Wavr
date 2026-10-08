/** Low-resolution signal diffusion confined to the cut, with softly reconstructed pixel cells. */
export const tearAnalogShader = `
float analogHash(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}
float analogNoise(vec2 p) {
    vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(analogHash(cell), analogHash(cell + vec2(1.0, 0.0)), f.x),
        mix(analogHash(cell + vec2(0.0, 1.0)), analogHash(cell + 1.0), f.x), f.y);
}
vec4 analogTap(vec2 source) {
    return sceneAt(clamp(source, vec2(.5), uResolution - .5));
}
vec4 analogPixels(vec2 source, float size) {
    vec2 grid = source / size - .5, cell = floor(grid);
    // Short flat cell centers with broad, soft borders retain the pixel impression.
    vec2 f = smoothstep(vec2(.15), vec2(.85), fract(grid));
    return mix(mix(analogTap((cell + .5) * size), analogTap((cell + vec2(1.5, .5)) * size), f.x),
        mix(analogTap((cell + vec2(.5, 1.5)) * size), analogTap((cell + 1.5) * size), f.x), f.y);
}
vec4 tearAnalogSurface(vec4 surface, vec2 source, float edgeDistance, vec2 normal, vec2 along) {
    float size = mix(16.0, 12.0, uHorizontal);
    float flow = analogNoise(vec2(dot(source, along) / 70.0, uPixelTime * .24));
    float width = mix(100.0, 72.0, uHorizontal) * (.8 + flow * .35);
    float band = 1.0 - smoothstep(width * .1, width, abs(edgeDistance));
    float weight = band * smoothstep(.06, .65, uOpening);
    if (weight < .002) return surface;
    vec2 drift = normal * sin(dot(source, along) * .013 - uPixelTime * 1.2) * 3.0;
    vec4 pixel = analogPixels(source + drift, size);
    vec4 smearA = analogTap(source + along * 13.0 + normal * 3.0);
    vec4 smearB = analogTap(source - along * 11.0 - normal * 3.0);
    // Directional diffusion and restrained chroma lag belong to the source colors.
    pixel = mix(pixel, (smearA + smearB) * .5, .24);
    pixel.rgb = mix(pixel.rgb, vec3(smearA.r, pixel.g, smearB.b), .16);
    vec3 perceptual = pow(max(pixel.rgb, vec3(0.0)), vec3(1.0 / 2.2));
    vec3 compressed = floor(perceptual * 23.0 + .5) / 23.0;
    pixel.rgb = mix(pixel.rgb, pow(compressed, vec3(2.2)), .22);
    float scan = .99 + .01 * sin(source.y * 3.14159);
    pixel.rgb *= scan;
    return mix(surface, pixel, weight * .94);
}
float tearAnalogVeil(vec2 source, float edgeDistance) {
    vec2 along = mix(vec2(0.0, 1.0), vec2(1.0, 0.0), uHorizontal);
    vec2 flow = vec2(dot(source, along) / 21.0 + uPixelTime * .16, edgeDistance / 18.0);
    float coarse = analogNoise(flow);
    float mist = analogNoise(flow * .47 + vec2(-uPixelTime * .11, uPixelTime * .06));
    // Softly reconstructed, irregular cell density avoids a repeated checkerboard lip.
    float vapor = smoothstep(.25, .78, coarse * .62 + mist * .38);
    float reach = max(0.0, -edgeDistance);
    float depth = exp(-reach / 17.0) * (1.0 - smoothstep(24.0, 44.0, reach));
    return vapor * depth * .38 * (1.0 - smoothstep(-1.0, 1.0, edgeDistance));
}
`;
