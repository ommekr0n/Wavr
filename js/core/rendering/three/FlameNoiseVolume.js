import * as THREE from 'three';

function lattice(x, y, z, period) {
    let value = Math.imul(x & (period - 1), 73856093) ^ Math.imul(y & (period - 1), 19349663) ^ Math.imul(z & (period - 1), 83492791);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return (value >>> 0) / 4294967295;
}

function noise(x, y, z, period) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const mix = (a, b, t) => a + (b - a) * t;
    return mix(
        mix(mix(lattice(ix, iy, iz, period), lattice(ix + 1, iy, iz, period), fx),
            mix(lattice(ix, iy + 1, iz, period), lattice(ix + 1, iy + 1, iz, period), fx), fy),
        mix(mix(lattice(ix, iy, iz + 1, period), lattice(ix + 1, iy, iz + 1, period), fx),
            mix(lattice(ix, iy + 1, iz + 1, period), lattice(ix + 1, iy + 1, iz + 1, period), fx), fy), fz);
}

/** A small, seamless 3D turbulence field, generated once and shared by both jets. */
export function createFlameNoiseVolume() {
    const size = 64, data = new Uint8Array(size ** 3);
    for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        let value = 0, weight = 0.57;
        for (let period = 4; period <= 32; period *= 2) {
            value += noise(x * period / size, y * period / size, z * period / size, period) * weight;
            weight *= 0.5;
        }
        data[x + size * (y + size * z)] = Math.round(Math.min(1, value / 1.06875) * 255);
    }
    const texture = new THREE.Data3DTexture(data, size, size, size);
    texture.format = THREE.RedFormat; texture.type = THREE.UnsignedByteType;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
}
