/**
 * AngelicStaffGenerator.js
 * Generates the SVG string paths for the curvy music staff and motifs.
 */

export const AngelicStaffGenerator = {
    generatePaths(w, h, staffLineGap, yCenter, amp, phase) {
        let staffPaths = '';
        let motifPaths = '';
        
        // 5 staff lines - vẽ sẵn full, clip-path trong CSS sẽ tiết lộ dần từ trái sang phải
        for (let i = 0; i < 5; i++) {
            const y = yCenter + (i - 2) * staffLineGap;
            // Dùng chính xác w/3 và w*2/3 để x(t) = t*w tuyệt đối, giúp gốc hoa khớp 100% với dây
            staffPaths += `<path class="staff-line" data-y="${y}" d="M 0,${y} C ${w / 3},${y - amp * phase} ${w * 2 / 3},${y + amp * phase} ${w},${y}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        }


        // Music note motifs — Tinh tế, vừa phải (2-3 nốt mỗi vệt), không làm rác hay lag màn hình
        const musicMotifs = [
            // Phrase 1: Accent Arpeggio
            [
                { s: '♪', l: 1 },
                { s: '♯', l: -0.5 },
                { s: '♫', l: -1.5 }
            ],
            // Phrase 2: Harmonic Duo
            [
                { s: '♭', l: 0.5 },
                { s: '♬', l: -1 }
            ],
            // Phrase 3: Romantic Staccato
            [
                { s: '♩', l: 1.5 },
                { s: '♮', l: -0.5 },
                { s: '♪', l: -1.5 }
            ],
            // Phrase 4: Graceful Notes
            [
                { s: '♫', l: 0.5 },
                { s: '♭', l: -1 },
                { s: '♬', l: 0 }
            ]
        ];

        const renderMotif = (motif, isLeft) => {
            const sFontSize  = Math.max(38, Math.min(65, staffLineGap * 1.4));
            const gapX       = sFontSize * 2.2; // Khoảng cách rộng thoáng, thanh thoát
            
            const motifWidth = (motif.length - 1) * gapX;
            let startX = isLeft
                ? 180 + Math.random() * Math.max(0, (w * 0.32 - 180) - motifWidth)
                : w * 0.68 + Math.random() * Math.max(0, (w - 60 - w * 0.68) - motifWidth);

            motif.forEach((note, idx) => {
                const sx        = startX + idx * gapX;
                const t         = sx / w;
                const curveY    = yCenter + 3 * (1 - t) * t * amp * phase * (2 * t - 1);
                const sy        = curveY + (note.l * staffLineGap);
                motifPaths += `<text class="staff-symbol staff-motif-anim" data-t="${t}" data-l="${note.l}" data-font="${sFontSize}" x="${sx}" y="${sy + sFontSize * 0.3}" font-family="serif" font-size="${sFontSize}" fill="rgba(255,255,255,0.38)" text-anchor="middle" text-rendering="geometricPrecision" style="transition-delay: ${t * 0.5}s;">${note.s}</text>`;
            });
        };

        renderMotif(musicMotifs[Math.floor(Math.random() * musicMotifs.length)], true);
        renderMotif(musicMotifs[Math.floor(Math.random() * musicMotifs.length)], false);

        return { staffPaths, motifPaths };
    }
};
