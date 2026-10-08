import test from 'node:test';
import assert from 'node:assert/strict';
import { QueueManager } from '../js/core/QueueManager.js';
import { getQueueSnapshot, getUpcomingEntries } from '../js/core/PlaybackQueueEdits.js';
import { createPlayerViewNavigation } from '../js/features/player/PlayerViewNavigation.js';

const tracks = ['a', 'b', 'c', 'd'].map(id => ({ id, title: id, url: `https://media.test/${id}.wav` }));
const upcoming = queue => getUpcomingEntries(getQueueSnapshot(queue)).map(entry => entry.track.id);

test('an untouched session has no selected track; queue edits never mutate the library', () => {
    const queue = new QueueManager();
    queue.setPlaylist(tracks);
    assert.equal(queue.currentTrackIndex, -1);
    assert.deepEqual(queue.getPlaybackSource(), []);
    queue.startQueue(tracks, 0);
    queue.editQueue({ type: 'remove', index: 1 });
    assert.deepEqual(upcoming(queue), ['c', 'd']);
    assert.equal(queue.playlist, tracks);
    assert.deepEqual(tracks.map(track => track.id), ['a', 'b', 'c', 'd']);
});

test('reorder, remove and clear preserve the current occurrence and publish one coherent edit', () => {
    const queue = new QueueManager();
    queue.startQueue(tracks, 1);
    let edits = 0;
    queue.addEventListener('queuechange', event => {
        edits++;
        assert.equal(event.detail.source[event.detail.index], tracks[1]);
    });
    assert.equal(queue.editQueue({ type: 'move', index: 3, delta: -1 }), true);
    assert.deepEqual(upcoming(queue), ['d', 'c']);
    assert.equal(queue.editQueue({ type: 'move', index: 2, delta: -1 }), false);
    assert.equal(queue.editQueue({ type: 'remove', index: 1 }), false);
    assert.equal(queue.editQueue({ type: 'remove', index: 0 }), false);
    assert.equal(queue.editQueue({ type: 'remove', index: 2 }), true);
    assert.deepEqual(upcoming(queue), ['c']);
    queue.editQueue({ type: 'clear' });
    assert.deepEqual(queue.getPlaybackSource(), [tracks[1]]);
    assert.equal(queue.currentTrackIndex, 0);
    assert.equal(edits, 3);
});

test('shuffle shows the transport order and stays inside the selected box across repeat changes', () => {
    const queue = new QueueManager();
    queue.setPlaylist(tracks);
    queue.setShuffle(true);
    queue.startQueue([tracks[1], tracks[2], tracks[3]], 2, 'box');
    queue.setShuffledQueue([2, 0, 1]);
    assert.deepEqual(upcoming(queue), ['b', 'c']);
    queue.editQueue({ type: 'move', index: 1, delta: -1 });
    assert.deepEqual(queue.shuffledQueue, [2, 1, 0]);
    assert.deepEqual(upcoming(queue), ['c', 'b']);
    queue.editQueue({ type: 'remove', index: 0 });
    assert.equal(queue.currentTrackIndex, 1);
    assert.equal(queue.getPlaybackSource()[1], tracks[3]);
    assert.deepEqual(queue.shuffledQueue, [1, 0]);
    assert.deepEqual(upcoming(queue), ['c']);
    queue.setRepeatMode(1); queue.setRepeatMode(2); queue.setRepeatMode(0);
    assert.deepEqual(queue.getPlaybackSource(), [tracks[2], tracks[3]]);
    assert.deepEqual(queue.shuffledQueue, [1, 0]);
});

test('Play next and Add to queue handle duplicates without changing the current occurrence', () => {
    for (const shuffle of [false, true]) {
        const queue = new QueueManager();
        queue.setShuffle(shuffle);
        queue.startQueue([tracks[0], tracks[1]], 0);
        queue.editQueue({ type: 'add', track: tracks[0], next: true });
        queue.editQueue({ type: 'add', track: tracks[2] });
        assert.deepEqual(upcoming(queue), ['a', 'b', 'c']);
        const duplicate = getUpcomingEntries(getQueueSnapshot(queue))[0].index;
        queue.editQueue({ type: 'remove', index: duplicate });
        assert.deepEqual(upcoming(queue), ['b', 'c']);
        assert.equal(queue.getPlaybackSource()[queue.currentTrackIndex], tracks[0]);
    }
    const queue = new QueueManager();
    queue.startQueue([tracks[0], tracks[0], tracks[1]], 1);
    queue.toggleShuffle(); queue.toggleShuffle();
    assert.equal(queue.currentTrackIndex, 1);
});

test('adding before playback does not select a song; clear removes the pending queue', () => {
    const queue = new QueueManager();
    queue.editQueue({ type: 'add', track: tracks[1], next: true });
    queue.editQueue({ type: 'add', track: tracks[2] });
    assert.equal(queue.currentTrackIndex, -1);
    assert.deepEqual(upcoming(queue), ['b', 'c']);
    queue.editQueue({ type: 'clear' });
    assert.deepEqual(queue.getPlaybackSource(), []);
    assert.equal(queue.currentTrackIndex, -1);
    assert.equal(queue.editQueue({ type: 'add', track: {} }), false);
});

function navigationFixture() {
    const node = (...initial) => {
        const classes = new Set(initial);
        return { offsetHeight: 100, classList: {
            contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name),
            toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }
        } };
    };
    const homeView = node(), playerView = node('hidden'), miniPlayer = node('hidden');
    let selected = false, nextId = 0, resumed = 0;
    const scheduled = new Map(), idle = [];
    const navigation = createPlayerViewNavigation({
        homeView, playerView, miniPlayer, hasTrack: () => selected,
        prepareLyrics: () => resumed++, setPlayerOpen: open => idle.push(open),
        schedule: callback => { scheduled.set(++nextId, callback); return nextId; },
        cancel: id => scheduled.delete(id)
    });
    return { navigation, homeView, playerView, miniPlayer, idle,
        select() { selected = true; navigation.selectTrack(); },
        finish() { for (const callback of [...scheduled.values()]) callback(); scheduled.clear(); },
        resumed: () => resumed, scheduled: () => scheduled.size };
}

test('library removal matches identity in reordered queues, prunes duplicates and selects the actual successor', () => {
    const queue = new QueueManager();
    queue.startQueue([tracks[2], tracks[0], tracks[2], tracks[1]], 0);
    queue.setShuffle(true);
    queue.setShuffledQueue([0, 3, 1, 2]);
    queue.editQueue({ type: 'remove-track', id: 'c' });
    assert.deepEqual(queue.getPlaybackSource(), [tracks[0], tracks[1]]);
    assert.equal(queue.currentTrackIndex, 1);
    assert.deepEqual(queue.shuffledQueue, [1, 0]);
    queue.editQueue({ type: 'remove-track', id: 'a' });
    assert.equal(queue.getPlaybackSource()[queue.currentTrackIndex], tracks[1]);
    queue.editQueue({ type: 'remove-track', id: 'b' });
    assert.equal(queue.currentTrackIndex, -1);
    assert.deepEqual(queue.getPlaybackSource(), []);
});

test('library removal leaves an unstarted queue unselected', () => {
    const queue = new QueueManager();
    queue.setActiveQueue(tracks);
    queue.editQueue({ type: 'remove-track', id: 'a' });
    assert.equal(queue.currentTrackIndex, -1);
    assert.deepEqual(upcoming(queue), ['b', 'c', 'd']);
});

test('first selection opens full player; selections from mini preserve mini, including paused playback', () => {
    const f = navigationFixture();
    f.select(); f.finish();
    assert.equal(f.playerView.classList.contains('player-active'), true);
    assert.equal(f.homeView.classList.contains('hidden'), true);
    assert.equal(f.miniPlayer.classList.contains('hidden'), true);
    f.select(); assert.equal(f.resumed(), 1);
    f.navigation.minimize(); f.finish(); f.select();
    assert.equal(f.playerView.classList.contains('hidden'), true);
    assert.equal(f.homeView.classList.contains('hidden'), false);
    assert.equal(f.miniPlayer.classList.contains('hidden'), false);
    f.navigation.expand(); f.finish(); f.select();
    assert.equal(f.playerView.classList.contains('player-active'), true);
    assert.equal(f.miniPlayer.classList.contains('hidden'), true);
    assert.deepEqual(f.idle, [true, false, true]);
});

test('rapid minimize/expand cancels stale transitions; selections during minimize keep mini', () => {
    const f = navigationFixture();
    f.select(); f.navigation.minimize(); f.select(); f.finish();
    assert.equal(f.playerView.classList.contains('hidden'), true);
    assert.equal(f.miniPlayer.classList.contains('hidden'), false);
    f.navigation.expand(); f.navigation.minimize(); f.navigation.expand(); f.finish();
    assert.equal(f.playerView.classList.contains('hidden'), false);
    assert.equal(f.homeView.classList.contains('hidden'), true);
    assert.equal(f.miniPlayer.classList.contains('hidden'), true);
    f.navigation.minimize(); f.navigation.dispose();
    assert.equal(f.scheduled(), 0);
});
