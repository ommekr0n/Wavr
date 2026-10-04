import { flameJetProfile } from './FlameJetProfile.js';

function smooth(value) {
    const x = Math.max(0, Math.min(1, value));
    return x * x * (3 - 2 * x);
}

/** Beat-driven ignition, release and ember tail, without timers or allocations. */
export class FlameBurstEnvelope {
    constructor() {
        this.output = { level: 0, strength: 0, age: 10, sparks: false };
        this.reset();
    }

    reset() {
        this.started = -10; this.lastTrigger = -10; this.strength = 0;
        Object.assign(this.output, { level: 0, strength: 0, age: 10, sparks: false });
    }

    update(time, state) {
        if (!state.playing) { this.reset(); return this.output; }
        const onset = state.analysis?.climaxSpike || (state.analysis?.subBassOnset && state.intensity > 0.62);
        if ((onset || state.intensity > 0.84) && time - this.lastTrigger >= 3.6) {
            this.started = time; this.lastTrigger = time;
            this.strength = Math.min(1, Math.max(0.7, state.intensity * 0.8 + state.energy * 0.2));
        }
        const age = time - this.started;
        this.output.age = age;
        this.output.strength = this.strength;
        this.output.level = smooth(age / flameJetProfile.attack) * (1 - smooth((age - 1.15) / 0.85)) * this.strength;
        this.output.sparks = this.strength > 0 && age >= 0 && age < 3.2;
        return this.output;
    }
}
