/**
 * AngelicFloralPlacer.js
 * Calculates positions and generates SVG strings for floral branches on the staff.
 */

export const AngelicFloralPlacer = {
    /**
     * Generates the SVG strings for the floral branches placed on the bezier curve.
     * @param {number} w - Window width
     * @param {number} staffLineGap - Gap between staff lines
     * @param {number} yCenter - Y center of the staff
     * @param {number} amp - Curve amplitude
     * @param {number} phase - Curve phase (1 or -1)
     * @returns {string} SVG paths string for floral branches
     */
    generateBranches(w, staffLineGap, yCenter, amp, phase) {
        if (!window.WavrFloral || !window.WavrFloral.templates) {
            console.warn("WavrFloral templates not loaded.");
            return '';
        }

        let paths = '';
        const placedRoots = [];
        const lightTemplateIndices = [1, 2, 3, 7];
        const targetCount = Math.max(2, Math.floor(w / 320));

        const usableLeft  = w * 0.06;
        const usableWidth = w * 0.88;
        const slotWidth   = usableWidth / targetCount;

        // Alternating line pattern: outer-top -> outer-bottom -> inner-top -> inner-bottom
        const linePattern = [0, 4, 1, 3];

        for (let i = 0; i < targetCount; i++) {
            const slotCenter = usableLeft + (i + 0.5) * slotWidth;
            const xJitter    = (Math.random() - 0.5) * slotWidth * 0.6;
            const fx = Math.max(usableLeft, Math.min(usableLeft + usableWidth, slotCenter + xJitter));

            let chosenLineIndex = linePattern[i % linePattern.length];
            if (Math.random() < 0.1) {
                const swapMap = { 0: 4, 4: 0, 1: 3, 3: 1 };
                chosenLineIndex = swapMap[chosenLineIndex];
            }

            const offset     = (chosenLineIndex - 2) * staffLineGap;
            const baseCenter = yCenter + offset;

            // Cubic bezier position & exact tangent — normalized t = fx / w
            const t  = fx / w;
            const fy = baseCenter + 3 * (1 - t) * t * (amp * phase) * (2 * t - 1);

            const dBx = w;
            const dBy = 3 * amp * phase * (-1 + 6 * t - 6 * t * t);
            const tangentAngleDeg = Math.atan2(dBy, dBx) * (180 / Math.PI);
            const jitter   = (Math.random() - 0.5) * 10;
            const rawLean  = Math.max(-35, Math.min(35, tangentAngleDeg + jitter));

            placedRoots.push({ x: fx, y: fy, chosenLineIndex, leanAngle: rawLean, offset });
        }

        for (const root of placedRoots) {
            const { x: fx, y: fy, chosenLineIndex, leanAngle = 0, offset } = root;

            const isGrowingUp   = chosenLineIndex < 2;
            const baseAngle     = isGrowingUp ? (-90 - leanAngle) : (90 + leanAngle);
            // Fixed scale range: 48=min readable, 78=max before overlapping lyrics
            const treeBaseScale = 48 + Math.random() * 30;

            const templates     = window.WavrFloral.templates;
            const useLightTemplate = targetCount > 3;
            const templatePool  = useLightTemplate
                ? lightTemplateIndices.map(i => templates[i] || templates[0])
                : templates;
            
            // Ensure selectedTemplate is valid
            const selectedTemplate = templatePool[Math.floor(Math.random() * templatePool.length)];
            if (!selectedTemplate || !selectedTemplate.branches) continue;

            const t = fx / w; // normalized position passed into createBranch
            let templateHTML = '';
            selectedTemplate.branches.forEach((branch, idx) => {
                templateHTML += window.WavrFloral.createBranch(branch, idx, treeBaseScale, t);
            });

            const jitter = leanAngle - (isGrowingUp ? (-90 - baseAngle) : (baseAngle - 90)); // Reverse engineer jitter or we can just pass leanAngle
            
            // Added class and data attributes for Animator
            const rootPaths = `<g class="floral-root-anim" data-x="${fx}" data-offset="${offset}" data-up="${isGrowingUp}" data-jitter="${leanAngle}" transform="translate(${fx}, ${fy}) rotate(${baseAngle})">${templateHTML}</g>`;
            paths += rootPaths;
        }

        return paths;
    }
};
