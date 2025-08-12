'use strict';

import { sleep, float_to_str, dec2hex, dec2hex32, lerp_color, la, createCookie, readCookie } from './utils.js';
import { initControllerManager } from './controllers/controller-manager.js';
import ControllerFactory from './controllers/controller-factory.js';
import { lang_init, l } from './translations.js';

// Application State - manages app-wide state and UI
const app = {
    // Button disable state management
    disable_btn: 0,
    last_disable_btn: 0,

    // Language and UI state
    lang_orig_text: {},
    lang_orig_text: {},
    lang_cur: {},
    lang_disabled: true,
    lang_cur_direction: "ltr",

    // Session tracking
    gj: 0,
    gu: 0
};

const CIRCULARITY_DATA_SIZE = 48; // Number of angular positions to sample
const ll_data = new Array(CIRCULARITY_DATA_SIZE);
const rr_data = new Array(CIRCULARITY_DATA_SIZE);

let controller = null;

function calculateCircularityError(data) {
    // Sum of squared deviations from ideal distance of 1.0, only for values > 0.2
    const sumSquaredDeviations = data.reduce((acc, val) =>
        val > 0.2 ? acc + Math.pow(val - 1, 2) : acc, 0);

    // Calculate RMS deviation as percentage
    const validDataCount = data.filter(val => val > 0.2).length;
    return validDataCount > 0 ? Math.sqrt(sumSquaredDeviations / validDataCount) * 100 : 0;
}

function render_nvstatus_to_dom(nv) {
    if (!nv) return;

    switch (nv.status) {
        case 'locked':
            $("#d-nvstatus").html("<font color='green'>" + l("locked") + "</font>");
            break;
        case 'unlocked':
            $("#d-nvstatus").html("<font color='red'>" + l("unlocked") + "</font>");
            break;
        case 'pending_reboot':
            // Keep consistent styling with unknown/purple, but indicate reboot pending if possible
            const pendingTxt = nv.raw !== undefined ? ("0x" + dec2hex32(nv.raw)) : String(nv.code ?? '');
            $("#d-nvstatus").html("<font color='purple'>unk " + pendingTxt + "</font>");
            break;
        case 'unknown':
            const unknownTxt = nv.device === 'ds5' && nv.raw !== undefined ? ("0x" + dec2hex32(nv.raw)) : String(nv.code ?? '');
            $("#d-nvstatus").html("<font color='purple'>unk " + unknownTxt + "</font>");
            break;
        case 'error':
            $("#d-nvstatus").html("<font color='red'>" + l("error") + "</font>");
            break;
    }
}

async function refresh_nvstatus() {
    if (!controller.isConnected()) {
        return null;
    }

    const nv = await controller.queryNvStatus();
    render_nvstatus_to_dom(nv);
    return nv;
}

function set_edge_progress(score) {
    $("#dsedge-progress").css({ "width": score + "%" })
}

async function disconnect() {
    la("disconnect");
    if(!controller?.isConnected()) {
        controller = null;
        return;
    }
    app.gj = 0;
    app.disable_btn = 0;
    await controller.disconnect();
    controller = null; // Tear everything down
    close_calibrate_window();
    $("#offlinebar").show();
    $("#onlinebar").hide();
    $("#mainmenu").hide();
    $("#d-nvstatus").text = l("Unknown");
    $("#d-bdaddr").text = l("Unknown");
}

// Wrapper function for HTML onclick handlers
function disconnectSync() {
    disconnect().catch(error => {
        console.error("Error during disconnect:", error);
        show_popup("Error during disconnect: " + error.message);
    });
}

async function handleDisconnectedDevice(e) {
    la("disconnected");
    console.log("Disconnected: " + e.device.productName)
    await disconnect();
}

function welcome_modal() {
    const already_accepted = readCookie("welcome_accepted");
    if(already_accepted == "1")
        return;

    curModal = new bootstrap.Modal(document.getElementById('welcomeModal'), {});
    curModal.show();
}

function welcome_accepted() {
    la("welcome_accepted");
    createCookie("welcome_accepted", "1");
    $("#welcomeModal").modal("hide");
}

function init_svg_colors() {
    const lightBlue = '#7ecbff';
    const midBlue = '#3399cc';
    const dualshock = document.getElementById('Controller');
    set_svg_group_color(dualshock, lightBlue);

    ['Button_outlines', 'L3_outline', 'R3_outline', 'Trackpad_outline'].forEach(id => {
        const group = document.getElementById(id);
        set_svg_group_color(group, midBlue);
    });

    ['Button_infills', 'L3_infill', 'R3_infill', 'Trackpad_infill'].forEach(id => {
        const group = document.getElementById(id);
        set_svg_group_color(group, 'white');
    });
}

function gboot() {
    app.gu = crypto.randomUUID();
    $("#infoshowall").hide();

    function initializeApp() {
        lang_init(app, handleLanguageChange, welcome_modal, la);
        welcome_modal();
        init_svg_colors();
        clear_circularity();
        init_finetune_event_listeners();
        restore_show_raw_numbers_checkbox();
        $("input[name='displayMode']").on('change', on_stick_mode_change);

        window.addEventListener("error", (event) => {
            console.error(event.error?.stack || event.message);
            show_popup((event.error?.message || event.message));
        });

        window.addEventListener("unhandledrejection", (event) => {
            console.error("Unhandled rejection:", event.reason?.stack || event.reason);
            close_calibrate_window();
            show_popup((event.reason?.message || event.reason));
            // Prevent the default browser behavior (logging to console, again)
            event.preventDefault();
        });
    }

    // Since modules are deferred, DOM might already be loaded
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        // DOM is already loaded, run immediately
        initializeApp();
    }

    if (!("hid" in navigator)) {
        $("#offlinebar").hide();
        $("#onlinebar").hide();
        $("#missinghid").show();
        return;
    }

    $("#offlinebar").show();
    navigator.hid.addEventListener("disconnect", handleDisconnectedDevice);
}

async function on_finetune_change() {
    const list = ["LL", "LT", "RL", "RT", "LR", "LB", "RR", "RB", "LX", "LY", "RX", "RY"]
    const out = list.map((suffix) => {
        const el = $("#finetune" + suffix);
        const v = parseInt(el.val());
        return isNaN(v) ? 0 : v;
    });
    await write_finetune_data(out);
}

// DS5 finetuning
const finetune = {
    _mode: 'center', // 'center' or 'circularity'
    original_data: [],
    last_written_data: [],
    visible: false,
    active_stick: null, // 'left', 'right', or null

    get mode() {
        return this._mode;
    },

    set mode(mode) {
        if (mode !== 'center' && mode !== 'circularity') {
            throw new Error(`Invalid finetune mode: ${mode}. Must be 'center' or 'circularity'`);
        }
        this._mode = mode;
        this._updateUI();
    },

    _updateUI() {
        clear_circularity();

        const modal = $('#finetuneModal');
        if (this._mode === 'center') {
            $("#finetuneModeCenter").prop('checked', true);
            modal.removeClass('circularity-mode');
        } else if (this._mode === 'circularity') {
            $("#finetuneModeCircularity").prop('checked', true);
            modal.addClass('circularity-mode');
        }
    }
};

async function ds5_finetune() {
    // Lock NVS before
    const nv = await controller.queryNvStatus();
    render_nvstatus_to_dom(nv);
    if(nv.locked === false) {
        const res = await multi_nvslock();
        if(!res.ok) {
            return;
        }
        const nv2 = await controller.queryNvStatus();
        render_nvstatus_to_dom(nv2);
        if(!nv2.locked) {
            const errTxt = "0x" + dec2hex32(nv2.raw);
            throw new Error("ERROR: Cannot lock NVS (" + errTxt + ")");
        }
    } else if(nv.status !== 'locked') {
        throw new Error("ERROR: Cannot read NVS status. Finetuning is not safe on this device.");
    }

    const data = await read_finetune_data();

    curModal = new bootstrap.Modal(document.getElementById('finetuneModal'), {})
    curModal.show();

    const maxValue = mode === 3 ? 4095 : 65535; // 12-bit max value for DS5 Edge, 16-bit for DS5
    const list = ["LL", "LT", "RL", "RT", "LR", "LB", "RR", "RB", "LX", "LY", "RX", "RY"];
    list.forEach((suffix, i) => {
        const el = $("#finetune" + suffix);
        el.attr('max', maxValue);
        el.val(data[i]);
    });

    // Initialize in center mode
    set_finetune_mode('center');
    set_stick_to_finetune('left');

    // Initialize the raw numbers display state
    show_raw_numbers_changed();

    finetune.original_data = data;
    finetune.visible = true;

    refresh_finetune_sticks();
}

function init_finetune_event_listeners() {
    const list = ["LL", "LT", "RL", "RT", "LR", "LB", "RR", "RB", "LX", "LY", "RX", "RY"];
    list.forEach((suffix) => {
        $("#finetune" + suffix).on('change', on_finetune_change);
    });

    // Set up mode toggle event listeners
    $("#finetuneModeCenter").on('change', function() {
        if (this.checked) {
            set_finetune_mode('center');
        }
    });

    $("#finetuneModeCircularity").on('change', function() {
        if (this.checked) {
            set_finetune_mode('circularity');
        }
    });

    $("#showRawNumbersCheckbox").on('change', function() {
        show_raw_numbers_changed();
    });

    $("#left-stick-card").on('click', function() {
        set_stick_to_finetune('left');
    });

    $("#right-stick-card").on('click', function() {
        set_stick_to_finetune('right');
    });
}

async function read_finetune_data() {
    const data = await ds5_get_inmemory_module_data(); //mm there's also a missing await here
    if(!data) {
        throw new error("ERROR: Cannot read calibration data");
    }

    finetune.last_written_data = data;
    return data;
}

async function write_finetune_data(data) {
    if (data.length != 12) {
        return;
    }

    // const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // if (deepEqual(data, finetune.last_written_data)) {
    // if (data == finetune.last_written_data) {   //mm this will never be true, but fixing it (per above) breaks Edge writes
    //     return;
    // }

    finetune.last_written_data = data
    if (controller.isConnected()) {
        await controller.writeFinetuneData(data);
    }
}

const refresh_finetune_sticks = (() => {
    let timeout = null;

    return function() {
        if (timeout) return;

        timeout = setTimeout(() => {
            const { left, right } = controller.button_states.sticks;
            ds5_finetune_update("finetuneStickCanvasL", left.x, left.y);
            ds5_finetune_update("finetuneStickCanvasR", right.x, right.y);

            update_finetune_warning_messages();
            highlight_active_finetune_axis();

            timeout = null;
        }, 10);
    };
})();

const update_finetune_warning_messages = (() => {
    let timeout = null; // to stop unnecessary flicker in center mode

    return function() {
        if(!finetune.active_stick) return;

        const currentStick = controller.button_states.sticks[finetune.active_stick];
        if (finetune.mode === 'center') {
            const isNearCenter = Math.abs(currentStick.x) <= 0.5 && Math.abs(currentStick.y) <= 0.5;
            if(!isNearCenter && timeout) return;

            clearTimeout(timeout);
            timeout = setTimeout(() => {
                if(finetune.mode !== 'center') return; // in case it changed during timeout
                $(`#finetuneCenter${isNearCenter? 'Warning' : 'Success'}`).hide();
                $(`#finetuneCenter${isNearCenter? 'Success' : 'Warning'}`).show();
                timeout = null;
            }, isNearCenter ? 0 : 200);
        }

        if (finetune.mode === 'circularity') {
            // Check if stick is in extreme position (close to edges)
            const primeAxis = Math.max(Math.abs(currentStick.x), Math.abs(currentStick.y));
            const otherAxis = Math.min(Math.abs(currentStick.x), Math.abs(currentStick.y));
            const isInExtremePosition = primeAxis >= 0.7 && otherAxis < 0.2;
            $(`#finetuneCircularity${isInExtremePosition? 'Warning' : 'Success'}`).hide();
            $(`#finetuneCircularity${isInExtremePosition? 'Success' : 'Warning'}`).show();
        }
    };
})();

function clear_finetune_axis_highlights(to_clear = {center: true, circularity: true}) {
    const { center, circularity } = to_clear;

    if(finetune.mode === 'center' && center || finetune.mode === 'circularity' && circularity) {
        // Clear label highlights
        const labelIds = ["Lx-lbl", "Ly-lbl", "Rx-lbl", "Ry-lbl"];
        labelIds.forEach(suffix => {
            $(`#finetuneStickCanvas${suffix}`).removeClass("text-primary");
        });
    }
}

function highlight_active_finetune_axis(opts = {}) {
    if(!finetune.active_stick) return;

    if (finetune.mode === 'center') {
        const { axis } = opts;
        if(!axis) return;

        clear_finetune_axis_highlights({center: true});

        const labelSuffix = `${finetune.active_stick === 'left' ? "L" : "R"}${axis.toLowerCase()}`;
        $(`#finetuneStickCanvas${labelSuffix}-lbl`).addClass("text-primary");
    } else {
        clear_finetune_axis_highlights({circularity: true});

        const sticks = controller.button_states.sticks;
        const currentStick = sticks[finetune.active_stick];

        // Only highlight if stick is moved significantly from center
        const deadzone = 0.5;
        if (Math.abs(currentStick.x) >= deadzone || Math.abs(currentStick.y) >= deadzone) {
            const quadrant = get_stick_quadrant(currentStick.x, currentStick.y);
            const inputSuffix = get_finetune_input_suffix_for_quadrant(finetune.active_stick, quadrant);
            if (inputSuffix) {
                // Highlight the corresponding LX/LY label to observe
                const labelId = `finetuneStickCanvas${
                    finetune.active_stick === 'left' ? 'L' : 'R'}${
                    quadrant === 'left' || quadrant === 'right' ? 'x' : 'y'}-lbl`;
                $(`#${labelId}`).addClass("text-primary");
            }
        }
    }
}

function ds5_finetune_update(name, plx, ply) {
    const showRawNumbers = $("#showRawNumbersCheckbox").is(":checked");
    const c = document.getElementById(`${name}${showRawNumbers ? '' : '_large'}`);
    const ctx = c.getContext("2d");

    const margins = showRawNumbers ? 15 : 5;
    const radius = c.width / 2 - margins;
    const sz = c.width/2 - margins;
    const hb = radius + margins;
    const yb = radius + margins;
    ctx.clearRect(0, 0, c.width, c.height);

    const isLeftStick = name === "finetuneStickCanvasL";
    const highlight = finetune.active_stick == (isLeftStick ? 'left' : 'right') && is_dpad_adjustment_active();
    if (finetune.mode === 'circularity') {
        // Draw stick position with circle
        draw_stick_position(ctx, hb, yb, sz, plx, ply, {
            circularity_data: isLeftStick ? ll_data : rr_data,
            highlight
        });
    } else {
        // Draw stick position with crosshair
        draw_stick_position(ctx, hb, yb, sz, plx, ply, {
            enable_zoom_center: true,
            highlight
        });
    }

    $("#"+ name + "x-lbl").text(float_to_str(plx, 3));
    $("#"+ name + "y-lbl").text(float_to_str(ply, 3));
}

function show_raw_numbers_changed() {
    const showRawNumbers = $("#showRawNumbersCheckbox").is(":checked");
    const modal = $("#finetuneModal");
    modal.toggleClass("hide-raw-numbers", !showRawNumbers);
    localStorage.setItem('showRawNumbersCheckbox', showRawNumbers);

    refresh_finetune_sticks();
}

function restore_show_raw_numbers_checkbox() {
    // Restore the checkbox state from localStorage
    const savedState = localStorage.getItem('showRawNumbersCheckbox');
    if (savedState !== null) {
        const isChecked = savedState === 'true';
        $("#showRawNumbersCheckbox").prop('checked', isChecked);
    }
}

function finetune_close() {
    $("#finetuneModal").modal("hide");
    finetune.visible = false;

    clear_active_stick();
    stop_continuous_dpad_adjustment();
    finetune.original_data = [];
}

function set_stick_to_finetune(stick) {
    if(finetune.active_stick === stick) {
        return;
    }

    // Stop any continuous adjustments when switching sticks
    stop_continuous_dpad_adjustment();
    clear_finetune_axis_highlights();

    finetune.active_stick = stick;

    const other_stick = stick === 'left' ? 'right' : 'left';
    $(`#${finetune.active_stick}-stick-card`).addClass("stick-card-active");
    $(`#${other_stick}-stick-card`).removeClass("stick-card-active");
}

function handle_finetune_mode_switching(changes) {
    // Handle automatic stick switching based on movement
    if (changes.l1) {
        set_finetune_mode('center');
        clear_finetune_axis_highlights();
    } else if (changes.r1) {
        set_finetune_mode('circularity');
        clear_finetune_axis_highlights();
    }
}

function handle_finetune_stick_switching(changes) {
    // Handle automatic stick switching based on movement
    if (changes.sticks) {
        update_active_stick_based_on_movement();
    }
}

function is_stick_away_from_center(stick_pos, deadzone = 0.2) {
    return Math.abs(stick_pos.x) >= deadzone || Math.abs(stick_pos.y) >= deadzone;
}

function update_active_stick_based_on_movement() {
    const sticks = controller.button_states.sticks;
    const deadzone = 0.2;

    const left_is_away = is_stick_away_from_center(sticks.left, deadzone);
    const right_is_away = is_stick_away_from_center(sticks.right, deadzone);

    if (left_is_away && right_is_away) {
        // Both sticks are away from center - clear highlighting
        clear_active_stick();
    } else if (left_is_away && !right_is_away) {
        // Only left stick is away from center
        set_stick_to_finetune('left');
    } else if (right_is_away && !left_is_away) {
        // Only right stick is away from center
        set_stick_to_finetune('right');
    }
    // If both sticks are centered, keep current active stick (no change)
}

function clear_active_stick() {
    // Remove active class from both cards
    $("#left-stick-card").removeClass("stick-card-active");
    $("#right-stick-card").removeClass("stick-card-active");

    finetune.active_stick = null; // Clear active stick
    clear_finetune_axis_highlights();
}

function get_stick_quadrant(x, y) {
    // Determine which quadrant the stick is in based on x,y coordinates
    // x and y are normalized values between -1 and 1
    if (Math.abs(x) > Math.abs(y)) {
        return x > 0 ? 'right' : 'left';
    } else {
        return y > 0 ? 'down' : 'up';
    }
}

function get_finetune_input_suffix_for_quadrant(stick, quadrant) {
    // This function should only be used in circularity mode
    // In center mode, we don't care about quadrants - use direct axis mapping instead
    if (finetune.mode === 'center') {
        // This function shouldn't be called in center mode
        console.warn('get_finetune_input_suffix_for_quadrant called in center mode - this should not happen');
        return null;
    }

    // Circularity mode: map quadrants to specific calibration points
    if (stick === 'left') {
        switch (quadrant) {
            case 'left': return "LL";
            case 'up': return "LT";
            case 'right': return "LR";
            case 'down': return "LB";
        }
    } else if (stick === 'right') {
        switch (quadrant) {
            case 'left': return "RL";
            case 'up': return "RT";
            case 'right': return "RR";
            case 'down': return "RB";
        }
    }
    return null; // Invalid
}

function handle_finetune_dpad_adjustment(changes) {
    if(!finetune.active_stick) return;

    if (finetune.mode === 'center') {
        handle_center_mode_adjustment(changes);
    } else {
        handle_circularity_mode_adjustment(changes);
    }
}

function handle_center_mode_adjustment(changes) {
    const adjustmentStep = 5; // Use consistent step size for center mode

    // Define button mappings for center mode
    const buttonMappings = [
        { buttons: ['left', 'square'], adjustment: adjustmentStep, axis: 'X' },
        { buttons: ['right', 'circle'], adjustment: -adjustmentStep, axis: 'X' },
        { buttons: ['up', 'triangle'], adjustment: adjustmentStep, axis: 'Y' },
        { buttons: ['down', 'cross'], adjustment: -adjustmentStep, axis: 'Y' }
    ];

    // Check if any relevant button was released
    const relevantButtons = ['left', 'right', 'square', 'circle', 'up', 'down', 'triangle', 'cross'];
    if (relevantButtons.some(button => changes[button] === false)) {
        stop_continuous_dpad_adjustment();
        return;
    }

    // Check for button presses
    for (const mapping of buttonMappings) {
        // Check if active stick is away from center (> 0.5)
        const sticks = controller.button_states.sticks;
        const currentStick = sticks[finetune.active_stick];
        const stickAwayFromCenter = Math.abs(currentStick.x) > 0.5 || Math.abs(currentStick.y) > 0.5;
        if (stickAwayFromCenter && is_navigation_key_pressed()) {
            flash_finetune_warning();
            return;
        }

        if (mapping.buttons.some(button => changes[button])) {
            highlight_active_finetune_axis({axis: mapping.axis});
            start_continuous_dpad_adjustment_center_mode(finetune.active_stick, mapping.axis, mapping.adjustment);
            return;
        }
    }
}

function is_navigation_key_pressed() {
    const nav_buttons = ['left', 'right', 'up', 'down', 'square', 'circle', 'triangle', 'cross'];
    return nav_buttons.some(button => controller.button_states[button] === true);
}

const flash_finetune_warning = (() => {
    let timeout = null;

    return function() {
        function toggle() {
            $("#finetuneCenterWarning").toggleClass(['alert-warning', 'alert-danger']);
            $("#finetuneCircularityWarning").toggleClass(['alert-warning', 'alert-danger']);
        }

        if(timeout) return;

        toggle();   // on
        timeout = setTimeout(() => {
            toggle();   // off
            timeout = null;
        }, 300);
    };
})();

function handle_circularity_mode_adjustment({sticks: _, ...changes}) {
    const sticks = controller.button_states.sticks;
    const currentStick = sticks[finetune.active_stick];

    // Only adjust if stick is moved significantly from center
    const primeAxis = Math.max(Math.abs(currentStick.x), Math.abs(currentStick.y));
    const otherAxis = Math.min(Math.abs(currentStick.x), Math.abs(currentStick.y));
    const isInExtremePosition = primeAxis >= 0.5 && otherAxis < 0.2;
    if (!isInExtremePosition) {
        stop_continuous_dpad_adjustment();
        if(is_navigation_key_pressed()) {
            flash_finetune_warning();
        }
        return;
    }

    const quadrant = get_stick_quadrant(currentStick.x, currentStick.y);

    // Use different step sizes based on quadrant - right/down values are much larger
    const adjustmentStep = (quadrant === 'right' || quadrant === 'down') ? 15 : 3;

    // Define button mappings for each quadrant type
    const horizontalButtons = ['left', 'right', 'square', 'circle'];
    const verticalButtons = ['up', 'down', 'triangle', 'cross'];

    let adjustment = 0;
    let relevantButtons = [];

    if (quadrant === 'left' || quadrant === 'right') {
        // Horizontal quadrants: left increases, right decreases
        relevantButtons = horizontalButtons;
        if (changes.left || changes.square) {
            adjustment = adjustmentStep;
        } else if (changes.right || changes.circle) {
            adjustment = -adjustmentStep;
        }
    } else if (quadrant === 'up' || quadrant === 'down') {
        // Vertical quadrants: up increases, down decreases
        relevantButtons = verticalButtons;
        if (changes.up || changes.triangle) {
            adjustment = adjustmentStep;
        } else if (changes.down || changes.cross) {
            adjustment = -adjustmentStep;
        }
    }

    // Check if any relevant button was released
    if (relevantButtons.some(button => changes[button] === false)) {
        stop_continuous_dpad_adjustment();
        return;
    }

    // Start continuous adjustment on button press
    if (adjustment !== 0) {
        start_continuous_dpad_adjustment(finetune.active_stick, quadrant, adjustment);
    }
}

function start_continuous_dpad_adjustment(stick, quadrant, adjustment) {
    const inputSuffix = get_finetune_input_suffix_for_quadrant(stick, quadrant);
    start_continuous_adjustment_with_suffix(inputSuffix, adjustment);
}

function start_continuous_dpad_adjustment_center_mode(stick, targetAxis, adjustment) {
    // In center mode, directly map to X/Y axes
    const inputSuffix = stick === 'left' ?
        (targetAxis === 'X' ? 'LX' : 'LY') :
        (targetAxis === 'X' ? 'RX' : 'RY');
    start_continuous_adjustment_with_suffix(inputSuffix, adjustment);
}

const { start_continuous_adjustment_with_suffix, stop_continuous_dpad_adjustment, is_dpad_adjustment_active } = (() => {
    let repeat_delay = null;
    let initial_delay = null;

    function start_continuous_adjustment_with_suffix(inputSuffix, adjustment) {
        stop_continuous_dpad_adjustment();

        const element = $(`#finetune${inputSuffix}`);
        if (!element.length) return;

        // Perform initial adjustment immediately...
        perform_dpad_adjustment(element, adjustment);
        clear_circularity();

        // ...then prime continuous adjustment
        initial_delay = setTimeout(() => {
            repeat_delay = setInterval(() => {
                perform_dpad_adjustment(element, adjustment);
                clear_circularity();
            }, 150);
        }, 400); // Initial delay before continuous adjustment starts (400ms)
    }

    function stop_continuous_dpad_adjustment() {
        clearInterval(repeat_delay);
        repeat_delay = null;

        clearTimeout(initial_delay);
        initial_delay = null;
    }

    function is_dpad_adjustment_active() {
        return !!initial_delay;
    }

    return { start_continuous_adjustment_with_suffix, stop_continuous_dpad_adjustment, is_dpad_adjustment_active };
})();

async function perform_dpad_adjustment(element, adjustment) {
    const currentValue = parseInt(element.val()) || 0;
    const maxAdjustment = mode == 3 ? 4095 : 65535; // 12-bit max value for DS5 Edge, 16-bit for DS5
    const newValue = Math.max(0, Math.min(maxAdjustment, currentValue + adjustment));
    element.val(newValue);

    // Trigger the change event to update the finetune data
    await on_finetune_change();
}

function finetune_save() {
    finetune_close();

    // Unlock save button
    controller.setHasChangesToWrite(true);
}

async function finetune_cancel() {
    if(finetune.original_data.length == 12)
        await write_finetune_data(finetune.original_data)

    finetune_close();
}

function set_finetune_mode(mode) {
    finetune.mode = mode;
}

/**
 * Collects circularity data for both analog sticks during testing mode.
 * This function tracks the maximum distance reached at each angular position
 * around the stick's circular range, creating a polar coordinate map of
 * stick movement capabilities.
 */
function collectCircularityData(stickStates, leftData, rightData) {
    const { left, right  } = stickStates || {};
    const MAX_N = CIRCULARITY_DATA_SIZE;

    [[left, leftData], [right, rightData]].forEach(([stick, data]) => {
        if (!stick) return; // Skip if no stick changed position

        const { x, y } = stick;
        // Calculate distance from center (magnitude of stick position vector)
        const distance = Math.sqrt(x * x + y * y);
        // Convert cartesian coordinates to angular index (0 to MAX_N-1)
        // atan2 gives angle in radians, convert to array index with proper wrapping
        const angleIndex = (parseInt(Math.round(Math.atan2(y, x) * MAX_N / 2.0 / Math.PI)) + MAX_N) % MAX_N;
        // Store maximum distance reached at this angle (for circularity analysis)
        const oldValue = data[angleIndex] ?? 0;
        data[angleIndex] = Math.max(oldValue, distance);
    });
}

function clear_circularity() {
    ll_data.fill(0);
    rr_data.fill(0);
}

function reset_circularity() {
    clear_circularity();
    $("#normalMode").prop('checked', true);
    refresh_stick_pos();
}

function draw_stick_position(ctx, center_x, center_y, sz, stick_x, stick_y, opts = {}) {
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
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

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

function refresh_stick_pos() {
    if(!controller) return;

    const c = document.getElementById("stickCanvas");
    const ctx = c.getContext("2d");
    const sz = 60;
    const hb = 20 + sz;
    const yb = 15 + sz;
    const w = c.width;
    ctx.clearRect(0, 0, c.width, c.height);

    const { left: { x: plx, y: ply }, right: { x: prx, y: pry } } = controller.button_states.sticks;

    const enable_zoom_center = center_zoom_checked();
    const enable_circ_test = circ_checked();
    // Draw left stick
    draw_stick_position(ctx, hb, yb, sz, plx, ply, {
        circularity_data: enable_circ_test ? ll_data : null,
        enable_zoom_center,
    });

    // Draw right stick
    draw_stick_position(ctx, w-hb, yb, sz, prx, pry, {
        circularity_data: enable_circ_test ? rr_data : null,
        enable_zoom_center,
    });

    const precision = enable_zoom_center ? 3 : 2;
    $("#lx-lbl").text(float_to_str(plx, precision));
    $("#ly-lbl").text(float_to_str(ply, precision));
    $("#rx-lbl").text(float_to_str(prx, precision));
    $("#ry-lbl").text(float_to_str(pry, precision));

    // Move L3 and R3 SVG elements according to stick position
    try {
        // These values are tuned for the SVG's coordinate system and visual effect
        const max_stick_offset = 25;
        // L3 center in SVG coordinates (from path: cx=295.63, cy=461.03)
        const l3_cx = 295.63, l3_cy = 461.03;
        // R3 center in SVG coordinates (from path: cx=662.06, cy=419.78)
        const r3_cx = 662.06, r3_cy = 419.78;

        const l3_x = l3_cx + plx * max_stick_offset;
        const l3_y = l3_cy + ply * max_stick_offset;
        const l3_group = document.querySelector('g#L3');
        l3_group?.setAttribute('transform', `translate(${l3_x - l3_cx},${l3_y - l3_cy}) scale(0.70)`);

        const r3_x = r3_cx + prx * max_stick_offset;
        const r3_y = r3_cy + pry * max_stick_offset;
        const r3_group = document.querySelector('g#R3');
        r3_group?.setAttribute('transform', `translate(${r3_x - r3_cx},${r3_y - r3_cy}) scale(0.70)`);
    } catch (e) {
        // Fail silently if SVG not present
    }
}

function circ_checked() { return $("#checkCircularityMode").is(':checked') }
function center_zoom_checked() { return $("#centerZoomMode").is(':checked') }

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

function resetStickDiagrams() {
    clear_circularity();
    refresh_stick_pos();
}

function on_stick_mode_change() {
    resetStickDiagrams();
}

const throttled_refresh_sticks = (() => {
    let delay = null;
    return function(changes) {
        if (!changes.sticks) return;
        if (delay) return;

        refresh_stick_pos();
        delay = setTimeout(() => {
            delay = null;
            refresh_stick_pos();
        }, 20);
    };
})();

function update_stick_graphics(changes) {
    throttled_refresh_sticks(changes);
}

function update_battery_status({/* bat_capacity, cable_connected, is_charging, is_error, */ bat_txt, changed}) {
    // const can_use_tool = (bat_capacity >= 30 && cable_connected && !is_error); // is this even being used?
    if(changed) {
        $("#d-bat").html(bat_txt);
    }
}

function update_ds_button_svg(changes, BUTTON_MAP) {
    if (!changes || Object.keys(changes).length === 0) return;

    const pressedColor = '#1a237e'; // pleasing dark blue

    // Update L2/R2 analog infill
    ['l2', 'r2'].forEach(name => {
        const key = name + '_analog';
        if (changes.hasOwnProperty(key)) {
            const val = changes[key];
            const t = val / 255;
            const color = lerp_color('#ffffff', pressedColor, t);
            const svg = name.toUpperCase() + '_infill';
            const infill = document.getElementById(svg);
            set_svg_group_color(infill, color);
        }
    });

    // Update dpad buttons
    for (const dir of ['up', 'right', 'down', 'left']) {
        if (changes.hasOwnProperty(dir)) {
            const pressed = changes[dir];
            const group = document.getElementById(dir.charAt(0).toUpperCase() + dir.slice(1) + '_infill');
            set_svg_group_color(group, pressed ? pressedColor : 'white');
        }
    }

    // Update other buttons
    for (const btn of BUTTON_MAP) {
        if (['up', 'right', 'down', 'left'].includes(btn.name)) continue; // Dpad handled above
        if (changes.hasOwnProperty(btn.name) && btn.svg) {
            const pressed = changes[btn.name];
            const group = document.getElementById(btn.svg + '_infill');
            set_svg_group_color(group, pressed ? pressedColor : 'white');
        }
    }
}

function set_svg_group_color(group, color) {
    if (group) {
        const elements = group.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon');
        elements.forEach(el => {
            // Set up a smooth transition for fill and stroke if not already set
            if (!el.style.transition) {
                el.style.transition = 'fill 0.10s, stroke 0.10s';
            }
            el.setAttribute('fill', color);
            el.setAttribute('stroke', color);
        });
    }
}

let hasActiveTouchPoints = false;
let trackpadBbox = undefined;

function update_touchpad_circles(points) {
    const hasActivePointsNow = points.some(pt => pt.active);
    if(!hasActivePointsNow && !hasActiveTouchPoints) return;

    // Find the Trackpad_infill group in the SVG
    const svg = document.getElementById('controller-svg');
    const trackpad = svg?.querySelector('g#Trackpad_infill');
    if (!trackpad) return;

    // Remove the previous touch points, if any
    trackpad.querySelectorAll('circle.ds-touch').forEach(c => c.remove());
    hasActiveTouchPoints = hasActivePointsNow;
    trackpadBbox = trackpadBbox ?? trackpad.querySelector('path')?.getBBox();

    // Draw up to 2 circles
    points.forEach((pt, idx) => {
        if (!pt.active) return;
        // Map raw x/y to SVG
        // DS4/DS5 touchpad is 1920x943 units (raw values)
        const RAW_W = 1920, RAW_H = 943;
        const pointRadius = trackpadBbox.width * 0.05;
        const cx = trackpadBbox.x + pointRadius + (pt.x / RAW_W) * (trackpadBbox.width - pointRadius*2);
        const cy = trackpadBbox.y + pointRadius + (pt.y / RAW_H) * (trackpadBbox.height - pointRadius*2);
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', 'ds-touch');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', pointRadius);
        circle.setAttribute('fill', idx === 0 ? '#2196f3' : '#e91e63');
        circle.setAttribute('fill-opacity', '0.5');
        circle.setAttribute('stroke', '#3399cc');
        circle.setAttribute('stroke-width', '4');
        trackpad.appendChild(circle);
    });
}

function get_current_main_tab() {
    const mainTabs = document.getElementById('mainTabs');
    const activeBtn = mainTabs?.querySelector('.nav-link.active');
    return activeBtn?.id || 'controller-tab';
}

function get_current_test_tab() {
    const testsList = document.getElementById('tests-list');
    const activeBtn = testsList?.querySelector('.list-group-item.active');
    return activeBtn?.id || 'haptic-test-tab';
}



// Callback function to handle UI updates after controller input processing
function handleControllerInput({ changes, inputConfig, touchPoints, batteryStatus }) {
    const { buttonMap } = inputConfig;

    const current_active_tab = get_current_main_tab();
    if(current_active_tab === 'controller-tab') {
        collectCircularityData(changes.sticks, ll_data, rr_data);
        if(finetune.visible) {
            refresh_finetune_sticks();
            handle_finetune_mode_switching(changes);
            handle_finetune_stick_switching(changes);
            handle_finetune_dpad_adjustment(changes);
        } else {
            update_stick_graphics(changes);
            update_ds_button_svg(changes, buttonMap);
            update_touchpad_circles(touchPoints);
        }
    }

    if(current_active_tab === 'tests-tab') {
        handle_test_input(changes);
    }

    update_battery_status(batteryStatus);
}

function handle_test_input(/* changes */) {
    const current_test_tab = get_current_test_tab();

    // Handle different test tabs
    switch (current_test_tab) {
        case 'haptic-test-tab':
            // Handle L2/R2 for haptic feedback
            const l2 = controller.button_states.l2_analog || 0;
            const r2 = controller.button_states.r2_analog || 0;
            if (l2 || r2) {
                trigger_haptic_motors(l2, r2);
            }
            break;

        // Add more test tabs here as needed
        default:
            console.log("Unknown test tab:", current_test_tab);
            break;
    }
}

function set_mute_visibility(show) {
    const muteOutline = document.getElementById('Mute_outline');
    const muteInfill = document.getElementById('Mute_infill');
    if (muteOutline) muteOutline.style.display = show ? '' : 'none';
    if (muteInfill) muteInfill.style.display = show ? '' : 'none';
}

async function continue_connection({data, device}) {
    try {
        if (!controller || controller.isConnected()) {
            controller?.setInputReportHandler(null);
            return;
        }

        let connected = false;

        // Detect if the controller is connected via USB
        const reportLen = data.byteLength;
        if(reportLen != 63) {
            $("#btnconnect").prop("disabled", false);
            $("#connectspinner").hide();
            await disconnect();
            throw new Error(l("Please connect the device using a USB cable."));
        }

        // Helper to apply basic UI visibility based on device type
        function applyDeviceUI({ showInfo, showFinetune, showMute, showInfoTab }) {
            if (showInfo) { $("#infoshowall").show(); } else { $("#infoshowall").hide(); }
            if (showFinetune) { $("#ds5finetune").show(); } else { $("#ds5finetune").hide(); }
            set_mute_visibility(!!showMute);
            if (showInfoTab) { $("#info-tab").show(); } else { $("#info-tab").hide(); }
        }

        let controllerInstance = null;
        let info = null;

        try {
            // Create controller instance using factory
            controllerInstance = ControllerFactory.createControllerInstance(device, { l });
            controller.setControllerInstance(controllerInstance);
            info = await controllerInstance.getInfo();
        } catch (error) {
            $("#btnconnect").prop("disabled", false);
            $("#connectspinner").hide();
            await disconnect();
            if (device) {
                throw new Error(l("Connected invalid device: ") + dec2hex(device.vendorId) + ":" + dec2hex(device.productId));
            } else {
                throw new Error(l("Failed to connect to device"));
            }
        }

        if(info?.ok) {
            connected = true;
            // Get UI configuration and device name
            const ui = ControllerFactory.getUIConfig(device.productId);
            applyDeviceUI(ui);

            // Assign input processor for stream
            device.oninputreport = controller.getInputHandler();

            const deviceName = ControllerFactory.getDeviceName(device.productId);
            $("#devname").text(deviceName + " (" + dec2hex(device.vendorId) + ":" + dec2hex(device.productId) + ")");

            $("#offlinebar").hide();
            $("#onlinebar").show();
            $("#mainmenu").show();
            $("#resetBtn").show();
            $("#d-nvstatus").text = l("Unknown");
            $("#d-bdaddr").text = l("Unknown");

            // Always default to the Calibration tab
            const calibTab = document.getElementById('controller-tab');
            if (calibTab) {
                new bootstrap.Tab(calibTab).show();
            }

            const type = controllerInstance.getType();

            // Edge-specific: pending reboot check (from nv)
            if (type === "DS5Edge" && info?.pending_reboot) {
                $("#btnconnect").prop("disabled", false);
                $("#connectspinner").hide();
                await disconnect();
                throw new Error(l("A reboot is needed to continue using this DualSense Edge. Please disconnect and reconnect your controller."));
            }

            // Render info collected from device
            render_info_to_dom(info.infoItems);

            // Render NV status
            if (info.nv) {
                render_nvstatus_to_dom(info.nv);
                // Optionally try to lock NVS if unlocked
                if (info.nv.locked === false) {
                    await multi_nvslock();
                }
            }

            // Apply disable button flags
            if (typeof info.disable_bits === 'number' && info.disable_bits) {
                app.disable_btn |= info.disable_bits;
            }
            if(app.disable_btn != 0) update_disable_btn();

            // DS4 rare notice
            if (type === "DS4" && info?.rare) {
                show_popup("Wow, this is a rare/weird controller! Please write me an email at ds4@the.al or contact me on Discord (the_al)");
            }

            // Edge onboarding modal
            if(type == "DS5Edge") {
                show_edge_modal();
            }

            $("#btnconnect").prop("disabled", false);
            $("#connectspinner").hide();
        } else {
            // Not connected/failed to fetch info
            $("#btnconnect").prop("disabled", false);
            $("#connectspinner").hide();
            await disconnect();
            if(info) console.error(info.error);
            throw new Error(l("Connected invalid device: ") + l("Error 1"));
        }
    } catch(error) {
        $("#btnconnect").prop("disabled", false);
        $("#connectspinner").hide();
        throw error;
    }
}

function update_disable_btn() {
    const { disable_btn, last_disable_btn } = app;
    if(disable_btn == last_disable_btn)
        return;

    if(disable_btn == 0) {
        $(".ds-btn").prop("disabled", false);
        app.last_disable_btn = 0;
        return;
    }

    $(".ds-btn").prop("disabled", true);

    // show only one popup
    if(disable_btn & 1 && !(last_disable_btn & 1)) {
        show_popup(l("The device appears to be a DS4 clone. All functionalities are disabled."));
    } else if(disable_btn & 2 && !(last_disable_btn & 2)) {
        show_popup(l("This DualSense controller has outdated firmware.") + "<br>" + l("Please update the firmware and try again."), true);
    } else if(disable_btn & 4 && !(last_disable_btn & 4)) {
        show_popup(l("Please charge controller battery over 30% to use this tool."));
    }
    app.last_disable_btn = disable_btn;
}

async function connect() {
    app.gj = crypto.randomUUID();
    // Initialize controller manager with translation function
    controller = initControllerManager({ l });
    controller.setInputHandler(handleControllerInput);

    la("begin");
    reset_circularity();
    try {
        $("#btnconnect").prop("disabled", true);
        $("#connectspinner").show();
        await sleep(100);

        const supportedModels = ControllerFactory.getSupportedModels();
        const requestParams = { filters: supportedModels };
        let devices = await navigator.hid.getDevices();
        if (devices.length == 0) {
            devices = await navigator.hid.requestDevice(requestParams);
        }
        if (devices.length == 0) {
            $("#btnconnect").prop("disabled", false);
            $("#connectspinner").hide();
            return;
        }

        if (devices.length > 1) {
            $("#btnconnect").prop("disabled", false);
            $("#connectspinner").hide();
            throw new Error(l("Please connect only one controller at time."));
        }

        const device = devices[0];
        if(device.opened) await device.close();
        await device.open();

        la("connect", {"p": device.productId, "v": device.vendorId});
        device.oninputreport = continue_connection
    } catch(error) {
        $("#btnconnect").prop("disabled", false);
        $("#connectspinner").hide();
        throw new Error(l("Error: ") + error);
    }
}

async function handleLanguageChange() {
    // Reinitialize controller manager with new translation function
    // Re-render info items with updated translations
    if(!controller) return;

    const { infoItems } = await controller.getDeviceInfo();
    render_info_to_dom(infoItems);
}

let curModal = null

async function multi_flash() {
    // For DS5 Edge controllers, pass the progress callback
    const progressCallback = controller.controllerType() === "DS5Edge" ? set_edge_progress : null;
    const result = await controller.flash(progressCallback);
    if (result?.success) {
        show_popup(result.message, result.isHtml);
    }
}

async function multi_reset() {
    await controller.reset();
}

async function multi_nvsunlock() {
    await controller.nvsUnlock();
    await refresh_nvstatus();
}

async function multi_nvslock() {
    const result = await controller.nvsLock();
    await refresh_nvstatus();
    return result;
}

// Helper functions for step-by-step manual calibration UI (used by calib_step function)
async function multi_calib_sticks_begin() {
    return await controller.calibrateSticksBegin();
}

async function multi_calib_sticks_end() {
    return await controller.calibrateSticksEnd();
}

async function multi_calib_sticks_sample() {
    return await controller.calibrateSticksSample();
}

async function multi_calibrate_range() {
    if(!controller.isConnected())
        return;

    set_progress(0);
    curModal = new bootstrap.Modal(document.getElementById('rangeModal'), {});
    curModal.show();

    await sleep(1000);
    await controller.calibrateRangeBegin();
}

async function multi_calibrate_range_on_close() {
    const result = await controller.calibrateRangeOnClose();
    close_calibrate_window();
    resetStickDiagrams();

    if (result?.message) {
        show_popup(result.message);
    }
}


// "Old" fully automatic stick center calibration
async function multi_calibrate_sticks() {
    if(!controller.isConnected())
        return;

    set_progress(0);
    curModal = new bootstrap.Modal(document.getElementById('calibrateModal'), {})
    curModal.show();

    await sleep(1000);

    // Use the controller manager's calibrateSticks method with UI progress updates
    set_progress(10);

    const result = await controller.calibrateSticks((progress) => {
        set_progress(progress);
    });

    await sleep(500);
    close_calibrate_window();
    resetStickDiagrams();

    if (result?.success) {
        show_popup(result.message);
    } else if (result?.message) {
        show_popup(result.message);
    }
}

function close_calibrate_window() {
    if (curModal) {
        curModal.hide();
        curModal = null;
    }

    $("#calibCenterModal").modal("hide");
    reset_calib();
    return;
}

function set_progress(i) {
    $(".progress-bar").css('width', '' + i + '%')
}

function render_info_to_dom(infoItems) {
    // Clear all info sections
    $("#fwinfo").html("");
    $("#fwinfoextra-hw").html("");
    $("#fwinfoextra-fw").html("");

    // Add new info items
    if (Array.isArray(infoItems)) {
        infoItems.forEach(({key, value, addInfoIcon, severity, isExtra, cat}) => {
            if (!key) return;

            // Compose value with optional info icon
            let valueHtml = String(value ?? "");
            if (addInfoIcon === 'board') {
                const icon = '&nbsp;<a class="link-body-emphasis" href="#" onclick="board_model_info()">' +
                    '<svg class="bi" width="1.3em" height="1.3em"><use xlink:href="#info"/></svg></a>';
                valueHtml += icon;
            } else if (addInfoIcon === 'color') {
                const icon = '&nbsp;<a class="link-body-emphasis" href="#" onclick="edge_color_info()">' +
                    '<svg class="bi" width="1.3em" height="1.3em"><use xlink:href="#info"/></svg></a>';
                valueHtml += icon;
            }

            // Apply severity formatting if requested
            if (severity === 'danger') {
                valueHtml = "<font color='red'><b>" + valueHtml + "</b></font>";
            } else if (severity === 'success') {
                valueHtml = "<font color='green'><b>" + valueHtml + "</b></font>";
            }

            if (isExtra) {
                append_info_extra(key, valueHtml, cat || "hw");
            } else {
                append_info(key, valueHtml, cat || "hw");
            }
        });
    }
}

function append_info_extra(key, value, cat) {
    // TODO escape html
    const s = '<dt class="text-muted col-sm-4 col-md-6 col-xl-5">' + key + '</dt><dd class="col-sm-8 col-md-6 col-xl-7" style="text-align: right;">' + value + '</dd>';
    $("#fwinfoextra-" + cat).html($("#fwinfoextra-" + cat).html() + s);
}


function append_info(key, value, cat) {
    // TODO escape html
    const s = '<dt class="text-muted col-6">' + key + '</dt><dd class="col-6" style="text-align: right;">' + value + '</dd>';
    $("#fwinfo").html($("#fwinfo").html() + s);
    append_info_extra(key, value, cat);
}

function show_popup(text, is_html = false) {
    if(is_html) {
        $("#popupBody").html(text);
    } else {
        $("#popupBody").text(text);
    }
    new bootstrap.Modal(document.getElementById('popupModal'), {}).show()
}

function show_faq_modal() {
    la("faq_modal");
    new bootstrap.Modal(document.getElementById('faqModal'), {}).show()
}

function show_donate_modal() {
    la("donate_modal");
    new bootstrap.Modal(document.getElementById('donateModal'), {}).show()
}

function show_edge_modal() {
    la("edge_modal");
    new bootstrap.Modal(document.getElementById('edgeModal'), {}).show()
}

function show_info_tab() {
    la("info_modal");
    const infoTab = document.getElementById('info-tab');
    if (infoTab) {
        new bootstrap.Tab(infoTab).show();
    }
}

function discord_popup() {
    la("discord_popup");
    show_popup(l("My handle on discord is: the_al"));
}

function edge_color_info() {
    la("cm_info");
    const text = l("Color detection thanks to") + ' romek77 from Poland.';
    show_popup(text, true);
}

function board_model_info() {
    la("bm_info");
    const l1 = l("This feature is experimental.");
    const l2 = l("Please let me know if the board model of your controller is not detected correctly.");
    const l3 = l("Board model detection thanks to") + ' <a href="https://battlebeavercustoms.com/">Battle Beaver Customs</a>.';
    show_popup(l3 + "<br><br>" + l1 + " " + l2, true);
}

function close_new_calib() {
    $("#calibCenterModal").modal("hide");
    reset_calib();
}

async function calib_step(i) {
    la("calib_step", {"i": i})
    if(i < 1 || i > 7) return;

    let ret = true;
    if(i >= 2 && i <= 6) {
        $("#btnSpinner").show();
        $("#calibNext").prop("disabled", true);
    }

    if(i == 2) {
        $("#calibNextText").text(l("Initializing..."));
        await sleep(100);
        ret = await multi_calib_sticks_begin();
    } else if(i == 6) {
        $("#calibNextText").text(l("Sampling..."));
        await sleep(100);
        ret = await multi_calib_sticks_sample();
        await sleep(100);
        $("#calibNextText").text(l("Storing calibration..."));
        await sleep(100);
        ret = await multi_calib_sticks_end();
    } else if(i > 2 && i < 6){
        $("#calibNextText").text(l("Sampling..."));
        await sleep(100);
        ret = await multi_calib_sticks_sample();
    }
    if(i >= 2 && i <= 6) {
        await sleep(200);
        $("#calibNext").prop("disabled", false);
        $("#btnSpinner").hide();
    }

    if(ret?.ok === false) {
        close_new_calib();
        return;
    }

    for (let j = 1; j < 7; j++) {
        $("#list-" + j).hide();
        $("#list-" + j + "-calib").removeClass("active");
    }

    $("#list-" + i).show();
    $("#list-" + i + "-calib").addClass("active");

    if(i == 1) {
        $("#calibTitle").text(l("Stick center calibration"));
        $("#calibNextText").text(l("Start"));
    }
    else if(i == 6) {
        $("#calibTitle").text(l("Stick center calibration"));
        $("#calibNextText").text(l("Done"));
    }
    else {
        $("#calibTitle").html(l("Calibration in progress"));
        $("#calibNextText").text(l("Continue"));
    }
    if(i == 1 || i == 6)
        $("#calibCross").show();
    else
        $("#calibCross").hide();

}

const { calib_open, calib_next, reset_calib } = (() => {
    let cur_calib = 0;

    async function calib_open() {
        la("calib_open");
        cur_calib = 0;
        await calib_next();
        new bootstrap.Modal(document.getElementById('calibCenterModal'), {}).show()
    }

    async function calib_next() {
        la("calib_next");
        if(cur_calib == 6) {
            close_new_calib()
            return;
        }
        if(cur_calib < 6) {
            cur_calib += 1;
            await calib_step(cur_calib);
        }
    }

    function reset_calib() {
        cur_calib = 0;
    }

    return { calib_open, calib_next, reset_calib };
})();

const trigger_haptic_motors = (() => {
    let haptic_timeout = undefined;
    let haptic_last_trigger = 0;

    // [DEVICE_AND_DOM]
    return async function(strong_motor /*left*/, weak_motor /*right*/) {
        // The DS4 contoller has a strong (left) and a weak (right) motor.
        // The DS5 emulates the same behavior, but the left and right motors are the same.

        const now = Date.now();
        if (now - haptic_last_trigger < 200) {
            return; // Rate limited - ignore calls within 200ms
        }

        haptic_last_trigger = now;

        try {
            if (!controller.isConnected()) return;

            const type = controller.controllerType();
            const device = controller.getDevice();
            if (type == "DS4") {
                const data = new Uint8Array([0x05, 0x00, 0, weak_motor, strong_motor]);
                await device.sendReport(0x05, data);
            } else if (type.startsWith("DS5")) {
                const data = new Uint8Array([0x02, 0x00, weak_motor, strong_motor]);
                await device.sendReport(0x02, data);
            }

            // Stop rumble after duration
            clearTimeout(haptic_timeout);
            haptic_timeout = setTimeout(stop_haptic_motors, 250);
        } catch(e) {
            throw new Error(l("Error triggering rumble: ") + e);
        }
    };
})();

async function stop_haptic_motors() {
    if (!controller.isConnected()) return;

    const type = controller.controllerType();
    const device = controller.getDevice();
    if (type == "DS4") {
        const data = new Uint8Array([0x05, 0x00, 0, 0, 0]);
        await device.sendReport(0x05, data);
    } else if (type.startsWith("DS5")) {
        const data = new Uint8Array([0x02, 0x00, 0, 0]);
        await device.sendReport(0x02, data);
    }
}



// Export functions to global scope for HTML onclick handlers
window.gboot = gboot;
window.connect = connect;
window.disconnect = disconnectSync;
window.show_faq_modal = show_faq_modal;
window.show_info_tab = show_info_tab;
window.calib_open = calib_open;
window.multi_calibrate_range = multi_calibrate_range;
window.ds5_finetune = ds5_finetune;
window.multi_calibrate_sticks = multi_calibrate_sticks;
window.multi_flash = multi_flash;
window.multi_reset = multi_reset;
window.refresh_nvstatus = refresh_nvstatus;
window.multi_nvsunlock = multi_nvsunlock;
window.multi_nvslock = multi_nvslock;
window.finetune_cancel = finetune_cancel;
window.finetune_save = finetune_save;
window.welcome_accepted = welcome_accepted;
window.calib_next = calib_next;
window.multi_calibrate_range_on_close = multi_calibrate_range_on_close;
window.show_donate_modal = show_donate_modal;
window.board_model_info = board_model_info;
window.edge_color_info = edge_color_info;
