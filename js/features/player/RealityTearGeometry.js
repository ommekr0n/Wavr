/** The same continuous cut is used for the live GPU scene and DOM clipping. */
export function tearCurve(t, amplitude = 1) {
    return .035 * t + amplitude * (18 * (Math.sin(t * .007 + .5) - Math.sin(.5))
        + 7 * (Math.sin(t * .023 + 1.4) - Math.sin(1.4)) + 2 * Math.sin(t * .085));
}
export function tearDistance(x, y, field) {
    const t = field.horizontal ? x - field.cx : y - field.cy;
    return (field.horizontal ? y - field.cy : x - field.cx) - tearCurve(t, field.amplitude);
}
export function tearPose(field, side, opening) {
    const across = side * field.gap * opening, along = side * 6 * opening;
    return { x: field.horizontal ? along : across, y: field.horizontal ? across : along,
        angle: side * field.angle * opening, scale: 1 + .012 * opening };
}
export function tearClip(rect, field, side) {
    const points = [], length = field.horizontal ? field.width : field.height;
    const point = (x, y) => `${(x - rect.left).toFixed(2)}px ${(y - rect.top).toFixed(2)}px`;
    for (let i = 0; i <= 64; i++) {
        const along = -80 + (length + 160) * i / 64;
        const edge = tearCurve(along - (field.horizontal ? field.cx : field.cy), field.amplitude);
        points.push(field.horizontal ? point(along, field.cy + edge) : point(field.cx + edge, along));
    }
    const outside = side < 0 ? -field.width - field.height : field.width + field.height;
    if (field.horizontal) points.push(point(length + 80, outside), point(-80, outside));
    else points.push(point(outside, length + 80), point(outside, -80));
    return `polygon(${points.join(',')})`;
}
