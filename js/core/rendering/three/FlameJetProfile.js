/** Stage pyro tuning; the volume deliberately extends beyond the camera's top edge. */
export const flameJetProfile = Object.freeze({
    height: 1.65, spread: 0.66, portraitSpread: 0.66, depth: 0.28,
    attack: 0.075, ignitionSpeed: 6.0, flowScaleY: 2.7, flowSpeed: 2.8,
    opticalDensity: 22.0, illumination: 75,
    sustainedPressure: 1.25, launchPressure: 0.55, launchDecay: 9,
    sparkCount: 192, sparkEmission: 1.25, sparkLife: 1.35, sparkLifeVariation: 0.55
});

/** A fast pressure punch followed by sustained thrust, without a separate timer. */
export function flameJetPressure(age, reducedMotion) {
    return flameJetProfile.sustainedPressure + (reducedMotion ? 0 : flameJetProfile.launchPressure * Math.exp(-Math.max(0, age) * flameJetProfile.launchDecay));
}
