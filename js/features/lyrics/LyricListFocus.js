/** Touch only the changed rows, and measure/scroll the lyric panel only while it is shown. */
export class LyricListFocus {
    constructor() { this.reset(); }
    reset() { this.root = null; this.index = null; this.scrollIndex = null; }
    update(root, container, index, scroll) {
        if (!root) return;
        if (this.root !== root) {
            this.root = root; this.lines = Array.from(root.querySelectorAll('.am-lyric-line'));
            this.view = root.closest('.view-container'); this.index = null;
        }
        if (this.index !== index) {
            if (this.index !== null) {
                this.lines[this.index]?.classList.remove('active');
                this.lines[this.index + 1]?.classList.remove('next-line');
            }
            this.lines[index]?.classList.add('active');
            this.lines[index + 1]?.classList.add('next-line');
            this.index = index;
        }
        if (!container || this.view?.classList.contains('hidden')) { this.scrollIndex = null; return; }
        if (this.scrollIndex === index) return;
        this.scrollIndex = index;
        const line = this.lines[index];
        if (line) scroll(container, line.offsetTop - container.clientHeight * .4 + line.clientHeight / 2, 520);
        else scroll(container, 0, 350);
    }
}
