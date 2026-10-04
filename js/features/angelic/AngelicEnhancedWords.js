import { escapeLyricText as escape } from '../lyrics/EnhancedLrcText.js';

/** One animated/highlighted element per tagged unit; preserve phrase and backing-vocal timestamps. */
export function buildAngelicEnhancedWords(lyric) {
    const groups = [];
    for (const word of lyric.words) {
        const backing = !!word.isBackingVocal;
        if (groups.at(-1)?.backing !== backing) groups.push({ backing, words: [] });
        groups.at(-1).words.push(word);
    }
    return groups.map(group => {
        const length = group.words.map(word => word.word).join(' ').length;
        const row = group.backing
            ? `class="angelic-parenthesis" style="font-size:${length > 35 ? .55 : length > 25 ? .65 : .75}em;opacity:.65;white-space:nowrap;display:block;margin-top:6px;line-height:1;transform-origin:center center"`
            : 'style="display:block;line-height:1.1"';
        const words = group.words.map((word, index) => {
            const delay = .15 + Math.max(0, word.time - lyric.time);
            const butterfly = Math.random() < (lyric.text.length > 60 ? .15 : .3)
                ? `<div class="sprite-butterfly" style="animation-delay:var(--word-delay),0s;animation-duration:${Math.random() < .1 ? '.5s' : '1s'},.3s;background-color:var(--blob-${Math.random() < .1 ? 3 : 1}-color)"></div>` : '';
            const pairStart = group.words.length > 3 && index === group.words.length - 2;
            const pairEnd = group.words.length > 3 && index === group.words.length - 1;
            return `${pairStart ? '<span class="no-orphan-pair" style="white-space:nowrap;display:inline-block">' : ''}<span class="angelic-word-sway" data-word-start="${word.time}" style="--word-delay:${delay}s;animation-delay:var(--word-delay)"><span class="angelic-word-pop has-enhanced-word" data-start="${word.time}" data-end="${word.endTime}">${escape(word.word)}</span>${butterfly}</span> ${pairEnd ? '</span>' : ''}`;
        }).join('');
        return `<div ${row}>${words}</div>`;
    }).join('');
}
