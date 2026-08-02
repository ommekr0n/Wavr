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
        // Sử dụng mốc thời gian chung (global) cho TẤT CẢ các staff, thay vì startTime riêng của từng cái.
        // Điều này đảm bảo toàn bộ các staff khi sinh ra đều chồng khít lên nhau tạo thành một dải lụa dài vô tận.
        const elapsed = Date.now() / 1000;
        
        // Base time progression (Slower & graceful)
        const timeFactor = elapsed * Math.PI * 0.15;
        // The phase delay between lines to create the 3D intertwined ribbon (DNA helix) effect
        const depthDelay = 0.3;
        
        wrappers.forEach(wrapper => {
            const w = parseFloat(wrapper.getAttribute('data-w'));
            const staffLineGap = parseFloat(wrapper.getAttribute('data-staff-gap'));
            const yCenter = parseFloat(wrapper.getAttribute('data-y-center'));
            const amp = parseFloat(wrapper.getAttribute('data-amp'));

            // 1. Update 5 staff lines
            const paths = wrapper.querySelectorAll('.staff-line');
            paths.forEach(p => {
                const y = parseFloat(p.getAttribute('data-y'));
                const lineIndex = Math.round((y - yCenter) / staffLineGap) + 2;
                const angle = timeFactor + lineIndex * depthDelay;
                const linePhase = Math.sin(angle);
                
                p.setAttribute('d', `M 0,${y} C ${w / 3},${y - amp * linePhase} ${w * 2 / 3},${y + amp * linePhase} ${w},${y}`);
                const zDepth = Math.cos(angle);
                p.style.opacity = (0.2 + ((zDepth + 1) / 2) * 0.4).toFixed(3);
            });
            
            // 2. Update motifs
            // 2. Update motifs & florals (Skip inline updates if wrapper is exiting so CSS ink-wash animation runs freely)
            const isExiting = wrapper.classList.contains('angelic-exit') || wrapper.classList.contains('ink-wash-exit');
            if (isExiting) return;

            const motifs = wrapper.querySelectorAll('.staff-motif-anim');
            motifs.forEach(m => {
                const t = parseFloat(m.getAttribute('data-t'));
                const l = parseFloat(m.getAttribute('data-l'));
                const fontSize = parseFloat(m.getAttribute('data-font'));
                
                const lineIndex = l + 2;
                const angle = timeFactor + lineIndex * depthDelay;
                const linePhase = Math.sin(angle);
                
                const curveY = yCenter + 3 * (1 - t) * t * (amp * linePhase) * (2 * t - 1);
                const sy = curveY + (l * staffLineGap);
                const fontOffset = (l === 0 && m.textContent === '𝄞') ? 0.25 : 0.3;
                m.setAttribute('y', sy + fontSize * fontOffset);
            });
            
            // 3. Update floral groups
            const florals = wrapper.querySelectorAll('.floral-root-anim');
            florals.forEach(f => {
                const fx = parseFloat(f.getAttribute('data-x'));
                const offset = parseFloat(f.getAttribute('data-offset'));
                const isGrowingUp = f.getAttribute('data-up') === 'true';
                const jitter = parseFloat(f.getAttribute('data-jitter'));
                
                const lineIndex = Math.round(offset / staffLineGap) + 2;
                const angle = timeFactor + lineIndex * depthDelay;
                const linePhase = Math.sin(angle);
                const zDepth = Math.cos(angle);
                
                const t = fx / w;
                const baseCenter = yCenter + offset;
                const fy = baseCenter + 3 * (1 - t) * t * (amp * linePhase) * (2 * t - 1);
                
                const dBx = w;
                const dBy = 3 * amp * linePhase * (-1 + 6 * t - 6 * t * t);
                
                const tangentAngleDeg = Math.atan2(dBy, dBx) * (180 / Math.PI);
                const rawLean = Math.max(-35, Math.min(35, tangentAngleDeg + jitter));
                const baseAngle = isGrowingUp ? (-90 - rawLean) : (90 + rawLean);
                
                const scale = (0.85 + ((zDepth + 1) / 2) * 0.3).toFixed(3);
                f.setAttribute('transform', `translate(${fx}, ${fy}) rotate(${baseAngle}) scale(${scale})`);
                f.style.opacity = (0.4 + ((zDepth + 1) / 2) * 0.6).toFixed(3);
            });
        });
        
        // 4. Update Global Clef
        if (wrappers.length > 0) {
            const firstWrapper = wrappers[0];
            const yCenter = parseFloat(firstWrapper.getAttribute('data-y-center'));
            const amp = parseFloat(firstWrapper.getAttribute('data-amp'));
            const staffLineGap = parseFloat(firstWrapper.getAttribute('data-staff-gap'));
            
            const globalClefs = document.querySelectorAll('.global-angelic-clef-svg .angelic-clef-symbol');
            globalClefs.forEach(m => {
                const t = parseFloat(m.getAttribute('data-t'));
                const l = parseFloat(m.getAttribute('data-l'));
                const fontSize = parseFloat(m.getAttribute('data-font'));
                
                const lineIndex = l + 2;
                const angle = timeFactor + lineIndex * depthDelay;
                const linePhase = Math.sin(angle);
                
                const curveY = yCenter + 3 * (1 - t) * t * (amp * linePhase) * (2 * t - 1);
                const sy = curveY + (l * staffLineGap);
                m.setAttribute('y', sy + fontSize * 0.25);
            });
        }
        
        this.rAFId = requestAnimationFrame(() => this.loop());
    }
};
