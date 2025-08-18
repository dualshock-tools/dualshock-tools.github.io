'use strict';

// Constants
export const CIRCULARITY_DATA_SIZE = 48; // Number of angular positions to sample

/**
 * Draws analog stick position on a canvas with various visualization options.
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {number} center_x - X coordinate of stick center
 * @param {number} center_y - Y coordinate of stick center
 * @param {number} sz - Size/radius of the stick area
 * @param {number} stick_x - Current stick X position (-1 to 1)
 * @param {number} stick_y - Current stick Y position (-1 to 1)
 * @param {Object} opts - Options object
 * @param {number[]|null} opts.circularity_data - Array of circularity test data
 * @param {boolean} opts.enable_zoom_center - Whether to apply center zoom transformation
 * @param {boolean} opts.highlight - Whether to highlight the stick position
 */
export function draw_stick_position(ctx, center_x, center_y, sz, stick_x, stick_y, opts = {}) {
    const { circularity_data = null, enable_zoom_center = false, highlight } = opts;

    // Draw base circle
    ctx.lineWidth = 1;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.arc(center_x, center_y, sz, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Helper function for circularity visualization color
    function cc_to_color(cc) {
        const dd = Math.sqrt(Math.pow((1.0 - cc), 2));
        let hh;
        if(cc <= 1.0)
            hh = 220 - 220 * Math.min(1.0, Math.max(0, (dd - 0.05)) / 0.1);
        else
            hh = (245 + (360-245) * Math.min(1.0, Math.max(0, (dd - 0.05)) / 0.15)) % 360;
        return hh;
    }

    // Draw circularity visualization if data provided
    if (circularity_data?.length > 0) {
        const MAX_N = CIRCULARITY_DATA_SIZE;

        for(let i = 0; i < MAX_N; i++) {
            const kd = circularity_data[i];
            const kd1 = circularity_data[(i+1) % CIRCULARITY_DATA_SIZE];
            if (kd === undefined || kd1 === undefined) continue;
            const ka = i * Math.PI * 2 / MAX_N;
            const ka1 = ((i+1)%MAX_N) * 2 * Math.PI / MAX_N;

            const kx = Math.cos(ka) * kd;
            const ky = Math.sin(ka) * kd;
            const kx1 = Math.cos(ka1) * kd1;
            const ky1 = Math.sin(ka1) * kd1;

            ctx.beginPath();
            ctx.moveTo(center_x, center_y);
            ctx.lineTo(center_x+kx*sz, center_y+ky*sz);
            ctx.lineTo(center_x+kx1*sz, center_y+ky1*sz);
            ctx.lineTo(center_x, center_y);
            ctx.closePath();

            const cc = (kd + kd1) / 2;
            const hh = cc_to_color(cc);
            ctx.fillStyle = 'hsla(' + parseInt(hh) + ', 100%, 50%, 0.5)';
            ctx.fill();
        }
    }

    // Draw circularity error text if enough data provided
    if (circularity_data?.filter(n => n > 0.3).length > 10) {
        const circularityError = calculateCircularityError(circularity_data);

        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = '24px Arial';
        const text_y = center_y + sz * 0.5;
        const text = `${circularityError.toFixed(1)} %`;

        ctx.strokeText(text, center_x, text_y);
        ctx.fillText(text, center_x, text_y);
    }

    // Draw crosshairs
    ctx.strokeStyle = '#aaaaaa';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(center_x-sz, center_y);
    ctx.lineTo(center_x+sz, center_y);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(center_x, center_y-sz);
    ctx.lineTo(center_x, center_y+sz);
    ctx.closePath();
    ctx.stroke();

    // Apply center zoom transformation if enabled
    let display_x = stick_x;
    let display_y = stick_y;
    if (enable_zoom_center) {
        const transformed = apply_center_zoom(stick_x, stick_y);
        display_x = transformed.x;
        display_y = transformed.y;

        // Draw light gray circle at 50% radius to show border of zoomed center
        ctx.strokeStyle = '#d3d3d3'; // light gray
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(center_x, center_y, sz * 0.5, 0, 2 * Math.PI);
        ctx.stroke();
    }

    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';

    // Draw stick line with variable thickness
    // Calculate distance from center
    const stick_distance = Math.sqrt(display_x*display_x + display_y*display_y);
    const boundary_radius = 0.5; // 50% radius

    // Determine if we need to draw a two-segment line
    const use_two_segments = enable_zoom_center && stick_distance > boundary_radius;
    if (use_two_segments) {
        // Calculate boundary point
        const boundary_x = (display_x / stick_distance) * boundary_radius;
        const boundary_y = (display_y / stick_distance) * boundary_radius;

        // First segment: thicker line from center to boundary
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(center_x, center_y);
        ctx.lineTo(center_x + boundary_x*sz, center_y + boundary_y*sz);
        ctx.stroke();

        // Second segment: thinner line from boundary to stick position
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(center_x + boundary_x*sz, center_y + boundary_y*sz);
        ctx.lineTo(center_x + display_x*sz, center_y + display_y*sz);
        ctx.stroke();
    } else {
        // Single line from center to stick position
        ctx.lineWidth = enable_zoom_center ? 3 : 1;
        ctx.beginPath();
        ctx.moveTo(center_x, center_y);
        ctx.lineTo(center_x + display_x*sz, center_y + display_y*sz);
        ctx.stroke();
    }

    // Draw filled circle at stick position
    ctx.beginPath();
    ctx.arc(center_x+display_x*sz, center_y+display_y*sz, 3, 0, 2*Math.PI);

    if (typeof highlight === 'boolean') {
        ctx.fillStyle = highlight ? '#2989f7ff' : '#030b84ff';
    }
    ctx.fill();
}

/**
 * Calculates circularity error for stick movement data.
 * @param {number[]} data - Array of distance values at different angular positions
 * @returns {number} RMS deviation as percentage
 */
function calculateCircularityError(data) {
    // Sum of squared deviations from ideal distance of 1.0, only for values > 0.2
    const sumSquaredDeviations = data.reduce((acc, val) =>
        val > 0.2 ? acc + Math.pow(val - 1, 2) : acc, 0);

    // Calculate RMS deviation as percentage
    const validDataCount = data.filter(val => val > 0.2).length;
    return validDataCount > 0 ? Math.sqrt(sumSquaredDeviations / validDataCount) * 100 : 0;
}

/**
 * Applies center zoom transformation to stick coordinates.
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Object} Transformed coordinates {x, y}
 */
function apply_center_zoom(x, y) {
    // Calculate distance from center
    const distance = Math.sqrt(x * x + y * y);

    // If distance is 0, return original values
    if (distance === 0) {
        return { x, y};
    }

    // Calculate angle
    const angle = Math.atan2(y, x);

    // Apply center zoom transformation
    const new_distance =
        distance <= 0.05
        ? (distance / 0.05) * 0.5 // 0 to 0.05 maps to 0 to 0.5 (half the radius)
        : 0.5 + ((distance - 0.05) / 0.95) * 0.5 // 0.05 to 1.0 maps to 0.5 to 1.0 (other half)

    // Convert back to x, y coordinates
    return {
        x: Math.cos(angle) * new_distance,
        y: Math.sin(angle) * new_distance
    };
}
