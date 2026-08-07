/**
 * AngelicStaffAnimator.js
 * Runs a requestAnimationFrame loop to animate the Bezier curves of the active staff,
 * mimicking a propagating sine wave graph (Canvas effect) with 0 lag.
 */

export const AngelicStaffAnimator = {
    rAFId: null,
    activeWrapper: null,
    baseData: null,
    
    start() {
        if (!this.rAFId) {
            this.loop();
        }
    },
    
    stop() {
        if (this.rAFId) cancelAnimationFrame(this.rAFId);
        this.rAFId = null;
    },
    
    loop() {
        const wrappers = document.querySelectorAll('.angelic-line-wrapper:not(.angelic-prebuilt), .global-angelic-staff-wrapper');
        if (wrappers.length === 0) {
            this.stop();
            return;
        }
        const elapsed = Date.now() / 1000;
        const timeFactor = elapsed * Math.PI * 0.15;
        const depthDelay = 0.3;
        
        for (let idx = 0; idx < wrappers.length; idx++) {
            const wrapper = wrappers[idx];
            if (!wrapper._cachedParams) {
                wrapper._cachedParams = {
                    w: parseFloat(wrapper.getAttribute('data-w')),
                    staffLineGap: parseFloat(wrapper.getAttribute('data-staff-gap')),
                    yCenter: parseFloat(wrapper.getAttribute('data-y-center')),
                    amp: parseFloat(wrapper.getAttribute('data-amp'))
                };
            }
            const { w, staffLineGap, yCenter, amp } = wrapper._cachedParams;

            // 1. Update 5 staff lines
            const paths = wrapper.children ? wrapper.querySelectorAll('.staff-line') : [];
            for (let i = 0; i < paths.length; i++) {
                const p = paths[i];
                if (p._y === undefined) {
                    p._y = parseFloat(p.getAttribute('data-y'));
                    p._lineIndex = Math.round((p._y - yCenter) / staffLineGap) + 2;
                }
                const y = p._y;
                const angle = timeFactor + p._lineIndex * depthDelay;
                const linePhase = Math.sin(angle);
                
                p.setAttribute('d', `M 0,${y} C ${w / 3},${y - amp * linePhase} ${w * 2 / 3},${y + amp * linePhase} ${w},${y}`);
                const zDepth = Math.cos(angle);
                p.style.opacity = (0.2 + ((zDepth + 1) / 2) * 0.4).toFixed(3);
            }
            
            // 2. Update motifs & florals
            const isExiting = wrapper.classList.contains('angelic-exit') || wrapper.classList.contains('ink-wash-exit');
            if (isExiting) continue;

            const motifs = wrapper.querySelectorAll('.staff-motif-anim');
            for (let i = 0; i < motifs.length; i++) {
                const m = motifs[i];
                if (m._t === undefined) {
                    m._t = parseFloat(m.getAttribute('data-t'));
                    m._l = parseFloat(m.getAttribute('data-l'));
                    m._font = parseFloat(m.getAttribute('data-font'));
                    m._lineIndex = m._l + 2;
                    m._fontOffset = (m._l === 0 && m.textContent === '𝄞') ? 0.25 : 0.3;
                }
                const angle = timeFactor + m._lineIndex * depthDelay;
                const linePhase = Math.sin(angle);
                
                const curveY = yCenter + 3 * (1 - m._t) * m._t * (amp * linePhase) * (2 * m._t - 1);
                const sy = curveY + (m._l * staffLineGap);
                m.setAttribute('y', sy + m._font * m._fontOffset);
            }
            
            // 3. Update floral groups
            const florals = wrapper.querySelectorAll('.floral-root-anim');
            for (let i = 0; i < florals.length; i++) {
                const f = florals[i];
                if (f._fx === undefined) {
                    f._fx = parseFloat(f.getAttribute('data-x'));
                    f._offset = parseFloat(f.getAttribute('data-offset'));
                    f._isGrowingUp = f.getAttribute('data-up') === 'true';
                    f._jitter = parseFloat(f.getAttribute('data-jitter'));
                    f._lineIndex = Math.round(f._offset / staffLineGap) + 2;
                    f._t = f._fx / w;
                    f._baseCenter = yCenter + f._offset;
                }
                const angle = timeFactor + f._lineIndex * depthDelay;
                const linePhase = Math.sin(angle);
                const zDepth = Math.cos(angle);
                
                const t = f._t;
                const fy = f._baseCenter + 3 * (1 - t) * t * (amp * linePhase) * (2 * t - 1);
                
                const dBx = w;
                const dBy = 3 * amp * linePhase * (-1 + 6 * t - 6 * t * t);
                
                const tangentAngleDeg = Math.atan2(dBy, dBx) * (180 / Math.PI);
                const rawLean = Math.max(-35, Math.min(35, tangentAngleDeg + f._jitter));
                const baseAngle = f._isGrowingUp ? (-90 - rawLean) : (90 + rawLean);
                
                const scale = (0.85 + ((zDepth + 1) / 2) * 0.3).toFixed(3);
                f.setAttribute('transform', `translate(${f._fx}, ${fy}) rotate(${baseAngle}) scale(${scale})`);
                f.style.opacity = (0.4 + ((zDepth + 1) / 2) * 0.6).toFixed(3);
            }
        }
        
        // 4. Update Global Clef
        if (wrappers.length > 0) {
            const firstWrapper = wrappers[0];
            if (firstWrapper._cachedParams) {
                const { yCenter, amp, staffLineGap } = firstWrapper._cachedParams;
                const globalClefs = document.querySelectorAll('.global-angelic-clef-svg .angelic-clef-symbol');
                for (let i = 0; i < globalClefs.length; i++) {
                    const m = globalClefs[i];
                    if (m._t === undefined) {
                        m._t = parseFloat(m.getAttribute('data-t'));
                        m._l = parseFloat(m.getAttribute('data-l'));
                        m._font = parseFloat(m.getAttribute('data-font'));
                        m._lineIndex = m._l + 2;
                    }
                    const angle = timeFactor + m._lineIndex * depthDelay;
                    const linePhase = Math.sin(angle);
                    
                    const curveY = yCenter + 3 * (1 - m._t) * m._t * (amp * linePhase) * (2 * m._t - 1);
                    const sy = curveY + (m._l * staffLineGap);
                    m.setAttribute('y', sy + m._font * 0.25);
                }
            }
        }
        
        this.rAFId = requestAnimationFrame(() => this.loop());
    }
};
