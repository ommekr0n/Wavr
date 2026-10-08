/** Index-based edits preserve individual occurrences, including duplicate songs. */
export function getPlaybackOrder({ source, shuffle, order }) {
    if (shuffle && order.length === source.length && new Set(order).size === source.length &&
        order.every(index => Number.isInteger(index) && index >= 0 && index < source.length)) {
        return [...order];
    }
    return source.map((_, index) => index);
}

export function getQueueSnapshot(manager) {
    const source = manager.getPlaybackSource();
    const index = manager.currentTrackIndex;
    const shuffle = manager.isShuffle;
    const order = getPlaybackOrder({ source, shuffle, order: manager.shuffledQueue });
    return { source, index, shuffle, order };
}

export function getUpcomingEntries(state) {
    const order = getPlaybackOrder(state);
    const position = order.indexOf(state.index);
    return order.slice(position + 1).map(index => ({ index, track: state.source[index] }));
}

export function planQueueEdit(state, action) {
    let source = [...state.source], index = state.index;
    let order = getPlaybackOrder(state);
    const upcoming = getUpcomingEntries({ ...state, order });
    const position = order.indexOf(action.index);

    if (action.type === 'remove') {
        if (!upcoming.some(entry => entry.index === action.index)) return null;
        source.splice(action.index, 1);
        if (index > action.index) index--;
        order = order.filter(value => value !== action.index).map(value => value > action.index ? value - 1 : value);
    } else if (action.type === 'move') {
        const nextPosition = position + action.delta;
        if (![-1, 1].includes(action.delta) || !upcoming.some(entry => entry.index === action.index) ||
            nextPosition <= order.indexOf(index) || nextPosition >= order.length) return null;
        [order[position], order[nextPosition]] = [order[nextPosition], order[position]];
        if (!state.shuffle) {
            source = order.map(value => source[value]);
            index = order.indexOf(index);
            order = source.map((_, value) => value);
        }
    } else if (action.type === 'remove-track') {
        const remaining = source.map((track, oldIndex) => ({ track, oldIndex })).filter(entry => entry.track.id !== action.id);
        if (remaining.length === source.length) return null;
        const indices = new Map(remaining.map((entry, newIndex) => [entry.oldIndex, newIndex]));
        const next = order.slice(order.indexOf(index) + 1).find(value => indices.has(value));
        index = index === -1 ? -1 : indices.get(index) ?? indices.get(next) ?? (remaining.length ? 0 : -1);
        source = remaining.map(entry => entry.track);
        order = order.filter(value => indices.has(value)).map(value => indices.get(value));
    } else if (action.type === 'clear') {
        source = source[index] ? [source[index]] : [];
        index = source.length ? 0 : -1;
        order = source.map((_, value) => value);
    } else if (action.type === 'add') {
        if (!action.track?.url) return null;
        if (state.shuffle) {
            const added = source.length;
            source.push(action.track);
            order.splice(action.next ? order.indexOf(index) + 1 : order.length, 0, added);
        } else {
            source.splice(action.next ? Math.max(0, index + 1) : source.length, 0, action.track);
            order = source.map((_, value) => value);
        }
    } else return null;

    return { source, index, order };
}
