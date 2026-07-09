window.WavrFloral = {
    // 10 Default Templates
    templates: [
        {
            name: "Symmetrical Triple Lotus",
            branches: [
                { angle: 0, scale: 1.1, cy: 1, flower: true },
                { angle: -45, scale: 0.9, cy: -1, flower: false },
                { angle: 45, scale: 0.9, cy: 1, flower: false }
            ]
        },
        {
            name: "Elegant Twin Swirl",
            branches: [
                { angle: -30, scale: 1.1, cy: -1, flower: true },
                { angle: 40, scale: 1.0, cy: 1, flower: true }
            ]
        },
        {
            name: "Majestic Single Stem",
            branches: [
                { angle: 10, scale: 1.2, cy: 1, flower: true },
                { angle: -60, scale: 0.7, cy: -1, flower: false },
                { angle: 60, scale: 0.7, cy: 1, flower: false }
            ]
        },
        {
            name: "Heart Swirl",
            branches: [
                { angle: -20, scale: 1.0, cy: 1, flower: true },
                { angle: 20, scale: 1.0, cy: -1, flower: true }
            ]
        },
        {
            name: "Tangled Vines",
            branches: [
                { angle: -15, scale: 1.0, cy: -1, flower: false },
                { angle: 15, scale: 1.0, cy: 1, flower: false },
                { angle: -10, scale: 1.1, cy: 1, flower: true },
                { angle: 10, scale: 1.1, cy: -1, flower: true }
            ]
        },
        {
            name: "Whirlpool Right",
            branches: [
                { angle: 0, scale: 1.2, cy: 1, flower: true },
                { angle: 30, scale: 1.0, cy: 1, flower: false },
                { angle: 60, scale: 0.8, cy: 1, flower: false },
                { angle: 90, scale: 0.7, cy: 1, flower: true }
            ]
        },
        {
            name: "Whirlpool Left",
            branches: [
                { angle: 0, scale: 1.2, cy: -1, flower: true },
                { angle: -30, scale: 1.0, cy: -1, flower: false },
                { angle: -60, scale: 0.8, cy: -1, flower: false },
                { angle: -90, scale: 0.7, cy: -1, flower: true }
            ]
        },
        {
            name: "Asymmetrical Reach",
            branches: [
                { angle: 10, scale: 1.3, cy: -1, flower: true },
                { angle: -30, scale: 0.7, cy: 1, flower: false },
                { angle: -50, scale: 0.6, cy: 1, flower: false }
            ]
        },
        {
            name: "Lotus Crown",
            branches: [
                { angle: 0, scale: 1.1, cy: 1, flower: true },
                { angle: -25, scale: 0.9, cy: -1, flower: true },
                { angle: 25, scale: 0.9, cy: 1, flower: true },
                { angle: -50, scale: 0.7, cy: -1, flower: false },
                { angle: 50, scale: 0.7, cy: 1, flower: false }
            ]
        },
        {
            name: "Drooping Willow",
            branches: [
                { angle: 60, scale: 1.2, cy: 1, flower: false },
                { angle: 90, scale: 1.0, cy: -1, flower: true },
                { angle: -60, scale: 1.2, cy: -1, flower: false },
                { angle: -90, scale: 1.0, cy: 1, flower: true }
            ]
        }
    ],

    // Draw a single branch
    createBranch: function(config, orderIdx, treeBaseScale, t) {
        const angleOffset = config.angle || 0;
        const scaleMult = config.scale || 1.0;
        const cy = config.cy || 1;
        const forceFlower = config.flower !== undefined ? config.flower : (Math.random() > 0.6);
        
        // Use the centralized treeBaseScale so all branches in a tree scale uniformly
        const scale = treeBaseScale * scaleMult;
        const r = () => (0.7 + Math.random() * 0.6); 
        
        const p1x = scale * 1.0 * r(), p1y = scale * 0.2 * cy * r();
        const p2x = scale * 1.5 * r(), p2y = scale * 1.0 * cy * r();
        const p3x = scale * 0.8 * r(), p3y = scale * 1.2 * cy * r(); 
        
        const dx = p3x, dy = p3y;
        const localEndAngle = Math.atan2(p3y - p2y, p3x - p2x) * (180 / Math.PI);
        
        const branchDelay = t * 1.5 + orderIdx * 0.08; 
        const branchDuration = 0.3 + Math.random() * 0.3; 
        const bloomDelay = branchDelay + branchDuration - 0.1;
        const branchLen = scale * 3.5; 
        const branchWidth = 1.5 + Math.random();
        
        const branchStr = `<path d="M 0,0 C ${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="${branchWidth}" stroke-linecap="round" class="angelic-branch" style="--blen: ${branchLen}; animation-delay: ${branchDelay}s; animation-duration: ${branchDuration}s;" />`;
        
        const isFlower = forceFlower;
        // Base size scales proportionally with the branch scale
        const baseSize = scale * 0.45;
        // Flowers are slightly larger, leaves/buds are slightly smaller and highly consistent
        const size = isFlower ? baseSize * (1.0 + Math.random() * 0.25) : baseSize * (0.8 + Math.random() * 0.15);
        const rot = isFlower ? (localEndAngle + (Math.random() - 0.5)*40) : localEndAngle;
        const color = `var(--blob-${Math.floor(Math.random()*4)+1}-color)`;
        
        let shape = '';
        if (isFlower) {
            const pathStr = `M0,-${size/4} C${size/2},-${size} ${size},-${size/4} ${size/4},0 C${size},${size/4} ${size/2},${size} 0,${size/4} C-${size/2},${size} -${size},${size/4} -${size/4},0 C-${size},-${size/4} -${size/2},-${size} 0,-${size/4} Z`;
            shape = `<path d="${pathStr}" fill="${color}"/><path d="${pathStr}" fill="url(#glossyGrad)"/><circle cx="0" cy="0" r="${size/6}" fill="#fff"/>`;
        } else {
            const pathStr = `M0,0 C${size/2},-${size/2} ${size},-${size/4} ${size*1.2},0 C${size},${size/4} ${size/2},${size/2} 0,0`;
            shape = `<path d="${pathStr}" fill="${color}"/><path d="${pathStr}" fill="url(#glossyGrad)"/>`;
        }
        
        return `<g transform="rotate(${angleOffset})">
                    ${branchStr}
                    <g transform="translate(${dx}, ${dy}) rotate(${rot})">
                        <g class="angelic-bloom" style="animation-delay: ${bloomDelay}s">
                            ${shape}
                        </g>
                    </g>
                </g>`;
    }
};
