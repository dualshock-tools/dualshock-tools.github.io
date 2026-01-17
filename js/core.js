'use strict';

import { sleep, float_to_str, dec2hex, dec2hex32, lerp_color, initAnalyticsApi, la } from './utils.js';
import { Storage } from './storage.js';
import { initControllerManager } from './controller-manager.js';
import ControllerFactory from './controllers/controller-factory.js';
import { lang_init, l } from './translations.js';
import { loadAllTemplates } from './template-loader.js';
import { draw_stick_dial, CIRCULARITY_DATA_SIZE, calculateCircularityError } from './stick-renderer.js';
import { ds5_finetune, isFinetuneVisible, finetune_handle_controller_input } from './modals/finetune-modal.js';
import { calibrate_stick_centers, auto_calibrate_stick_centers } from './modals/calib-center-modal.js';
import { calibrate_range, rangeCalibHandleControllerInput } from './modals/calib-range-modal.js';
import { 
  show_quick_test_modal,
  isQuickTestVisible,
  quicktest_handle_controller_input
} from './modals/quick-test-modal.js';
import { show_calibration_history_modal } from './modals/calibration-history-modal.js';
import { FinetuneHistory } from './finetune-history.js';

// Application State - manages app-wide state and UI
const app = {
  // Button disable state management
  disable_btn: 0,
  last_disable_btn: 0,

  shownRangeCalibrationWarning: false,
  failedCalibrationDetectionsCount: 0,
  failedCalibrationModalShownCount: 0,

  // Calibration method preference
  centerCalibrationMethod: 'four-step', // 'quick' or 'four-step'
  rangeCalibrationMethod: 'normal', // 'normal' or 'expert'

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

const ll_data = new Array(CIRCULARITY_DATA_SIZE);
const rr_data = new Array(CIRCULARITY_DATA_SIZE);

let controller = null;

function gboot() {
  app.gu = crypto.randomUUID();

  async function initializeApp() {
    window.addEventListener("error", (event) => {
      console.error(event.error?.stack || event.message);
      show_popup(event.error?.message || event.message);
    });

    window.addEventListener("unhandledrejection", async (event) => {
      console.error("Unhandled rejection:", event.reason?.stack || event.reason);
      close_all_modals();
      // show_popup(event.reason?.message || event.reason);

      // Format the error message for better readability
      let errorMessage = "An unexpected error occurred";
      if (event.reason) {
        if (event.reason.message) {
          errorMessage = `<strong>Error:</strong> ${event.reason.message}`;
        } else if (typeof event.reason === 'string') {
          errorMessage = `<strong>Error:</strong> ${event.reason}`;
        }

        // Collect all stack traces (main error and causes) for a single expandable section
        let allStackTraces = '';
        if (event.reason.stack) {
          const stackTrace = event.reason.stack.replace(/\n/g, '<br>').replace(/ /g, '&nbsp;');
          allStackTraces += `<strong>Main Error Stack:</strong><br>${stackTrace}`;
        }

        // Add error chain information if available (ES2022 error chaining)
        let currentError = event.reason;
        let chainLevel = 0;
        while (currentError?.cause && chainLevel < 5) {
          chainLevel++;
          currentError = currentError.cause;
          if (currentError.stack) {
            const causeStackTrace = currentError.stack.replace(/\n/g, '<br>').replace(/ /g, '&nbsp;');
            if (allStackTraces) allStackTraces += '<br><br>';
            allStackTraces += `<strong>Cause ${chainLevel} Stack:</strong><br>${causeStackTrace}`;
          }
        }

        // Add single expandable section if we have any stack traces
        if (allStackTraces) {
          errorMessage += `
            <br>
            <details style="margin-top: 0px;">
              <summary style="cursor: pointer; color: #666;">Details</summary>
              <div style="font-family: monospace; font-size: 0.85em; margin-top: 8px; padding: 8px; background-color: #f8f9fa; border-radius: 4px; overflow-x: auto;">
                ${allStackTraces}
              </div>
            </details>
          `;
        }
      }

      errorAlert(errorMessage);
      // Prevent the default browser behavior (logging to console, again)
      event.preventDefault();
    });

    await loadAllTemplates();

    initAnalyticsApi(app); // init just with gu for now
    lang_init(app, handleLanguageChange, show_welcome_modal);
    show_welcome_modal();
    initCalibrationMethod();

    $("input[name='displayMode']").on('change', on_stick_mode_change);

    $('#edgeModalDontShowAgain').on('change', function() {
      Storage.edgeModalDontShowAgain.set(this.checked);
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
  $("#aboutdrift").show();
  updateLastConnectedInfo();
  navigator.hid.addEventListener("disconnect", handleDisconnectedDevice);
}

async function connect() {
  app.gj = crypto.randomUUID();
  initAnalyticsApi(app); // init with gu and jg

  // Initialize controller manager with translation function
  controller = initControllerManager({ handleNvStatusUpdate });
  controller.setInputHandler(handleControllerInput);

  la("begin");
  reset_circularity_mode();
  clearAllAlerts();
  await sleep(200);

  try {
    $("#btnconnect").prop("disabled", true);
    $("#connectspinner").show();
    await sleep(100);

    const supportedModels = ControllerFactory.getSupportedModels();
    const requestParams = { filters: supportedModels };
    let devices = await navigator.hid.getDevices(); // Already connected?
    if (devices.length == 0) {
      devices = await navigator.hid.requestDevice(requestParams);
    }
    if (devices.length == 0) {
      $("#btnconnect").prop("disabled", false);
      $("#connectspinner").hide();
      await disconnect();
      return;
    }

    if (devices.length > 1) { //mm: this should never happen
      infoAlert(l("Please connect only one controller at time."));
      $("#btnconnect").prop("disabled", false);
      $("#connectspinner").hide();
      await disconnect();
      return;
    }

    const [device] = devices;
    if(device.opened) {
      console.log("Device already opened, closing it before re-opening.");
      await device.close();
      await sleep(500);
    }
    await device.open();

    la("connect", {"p": device.productId, "v": device.vendorId});
    device.oninputreport = continue_connection; // continue below
  } catch(error) {
    $("#btnconnect").prop("disabled", false);
    $("#connectspinner").hide();
    await disconnect();
    throw error;
  }
}

async function continue_connection({data, device}) {
  try {
    if (!controller || controller.isConnected()) {
      device.oninputreport = null;  // this function is called repeatedly if not cleared
      return;
    }

    // Detect if the controller is connected via USB
    const reportLen = data.byteLength;
    if(reportLen != 63) {
      // throw new Error(l("Please connect the device using a USB cable."));
      infoAlert(l("The device is connected via Bluetooth. Disconnect and reconnect using a USB cable instead."));
      await disconnect();
      return;
    }

    // Helper to apply basic UI visibility based on device type
    function applyDeviceUI({ showInfo, showFinetune, showInfoTab, showQuickTests, showFourStepCalib, showQuickCalib, showCalibrationHistory }) {
      $("#infoshowall").toggle(!!showInfo);
      $("#ds5finetune").toggle(!!showFinetune);
      $("#info-tab").toggle(!!showInfoTab);
      $("#quick-tests-div").css("visibility", showQuickTests ? "visible" : "hidden");
      $("#four-step-center-calib").toggle(!!showFourStepCalib);
      $("#quick-center-calib").toggle(!!showQuickCalib);
      $("#quick-center-calib-group").toggle(!!showQuickCalib);
      $("#restore-calibration-btn").toggle(!!showCalibrationHistory);
    }

    let controllerInstance = null;
    let info = null;

    try {
      // Create controller instance using factory
      controllerInstance = ControllerFactory.createControllerInstance(device);
      controller.setControllerInstance(controllerInstance);

      info = await controllerInstance.getInfo();

      // Initialize output state for DS5 controllers
      if (controllerInstance.initializeCurrentOutputState) {
        await controllerInstance.initializeCurrentOutputState();
      }
    } catch (error) {
      const contextMessage = device 
        ? `${l("Connected invalid device")}: ${dec2hex(device.vendorId)}:${dec2hex(device.productId)}`
        : l("Failed to connect to device");
        throw new Error(contextMessage, { cause: error });
    }

    if(!info?.ok) {
      // Not connected/failed to fetch info
      if(info) console.error(JSON.stringify(info, null, 2));
      throw new Error(`${l("Connected invalid device")}: ${l("Error")}  1`, { cause: info?.error });
    }

    // Get UI configuration and device name
    const ui = ControllerFactory.getUIConfig(device.productId);
    applyDeviceUI(ui);

    // Assign input processor for stream
    console.log("Setting input report handler.");
    device.oninputreport = controller.getInputHandler();

    const deviceName = ControllerFactory.getDeviceName(device.productId);
    $("#devname").text(deviceName + " (" + dec2hex(device.vendorId) + ":" + dec2hex(device.productId) + ")");

    $("#offlinebar").hide();
    $("#onlinebar").show();
    $("#mainmenu").show();
    $("#resetBtn").show();
    $("#aboutdrift").hide();

    $("#d-nvstatus").text = l("Unknown");
    $("#d-bdaddr").text = l("Unknown");

    $('#controller-tab').tab('show');

    const numOfSticks = controllerInstance.getNumberOfSticks();
    if(numOfSticks == 2) {
      $("#stick-item-rx").show();
      $("#stick-item-ry").show();
    } else if(numOfSticks == 1) {
      $("#stick-item-rx").hide();
      $("#stick-item-ry").hide();
    } else {
      throw new Error(`Invalid number of sticks: ${numOfSticks}`);
    }

    const model = controllerInstance.getModel();

    // Save controller info to local storage
    const lastConnectedInfo = {
      deviceName: deviceName,
      timestamp: new Date().toISOString(),
      serialNumber: await controllerInstance.getSerialNumber(),
    };

    // Extract info from infoItems
    if (info.infoItems && Array.isArray(info.infoItems)) {
      for (const item of info.infoItems) {
        if (item.key === l("Board Model")) {
          lastConnectedInfo.boardModel = item.value;
        } else if (item.key === l("Color")) {
          lastConnectedInfo.color = item.value;
        }
      }
    }

    Storage.lastConnectedController.set(lastConnectedInfo);
    updateLastConnectedInfo();

    // Initialize SVG controller based on model
    await init_svg_controller(model);

    // Edge-specific: pending reboot check (from nv)
    if (model == "DS5_Edge" && info?.pending_reboot) {
      infoAlert(l("A reboot is needed to continue using this DualSense Edge. Please disconnect and reconnect your controller."));
      await disconnect();
      return;
    }

    // Render info collected from device
    render_info_to_dom(info.infoItems);

    // Render NV status
    if (info.nv) {
      render_nvstatus_to_dom(info.nv);
      // Optionally try to lock NVS if unlocked
      if (info.nv.locked === false) {
        await nvslock();
      }
    }

    // Apply disable button flags
    if (typeof info.disable_bits === 'number' && info.disable_bits) {
      app.disable_btn |= info.disable_bits;
    }
    if(app.disable_btn != 0) update_disable_btn();

    // DS4 rare notice
    if (model == "DS4" && info?.rare) {
      show_popup("Wow, this is a rare/weird controller! Please write me an email at ds4@the.al or contact me on Discord (the_al)");
    }

    // Edge onboarding modal
    if(model == "DS5_Edge") {
      show_edge_modal();
    }

    if(model == "VR2") {
      show_popup(l("<p>Support for PS VR2 controllers is <b>minimal and highly experimental</b>.</p><p>I currently don't own these controllers, so I cannot verify the calibration process myself.</p><p>If you'd like to help improve full support, you can contribute with a donation or even send the controllers for testing.</p><p>Feel free to contact me on Discord (the_al) or by email at ds4@the.al .</p><br><p>Thank you for your support!</p>"), true)
    }

    // Check for unsaved calibration changes
    if (controller.has_changes_to_write) {
      show_popup(`<p>${
        l("It appears the latest joystick calibration has not been saved.")
      }</p><p>${
        l("You should save your changes, or reboot the controller to revert back to the previous state.")
      }</p>`, true);
    }

    // Save finetune parameters for DS5 and Edge controllers
    if (model === "DS5" || model === "DS5_Edge") {
      if (!controller.has_changes_to_write) {
        const finetuneData = await controllerInstance.getInMemoryModuleData();
        const serialNumber = await controllerInstance.getSerialNumber();
        FinetuneHistory.save(finetuneData, serialNumber);
      }
    }
  } catch(err) {
    await disconnect();
    throw err;
  } finally {
    $("#btnconnect").prop("disabled", false);
    $("#connectspinner").hide();
  }
}

async function disconnect() {
  la("disconnect");
  if(!controller?.isConnected()) {
    controller = null;
    return;
  }
  app.gj = 0;
  app.disable_btn = 0;
  app.shownRangeCalibrationWarning = false;
  app.failedCalibrationDetectionsCount = 0;
  update_disable_btn();

  await controller.disconnect();
  controller = null; // Tear everything down
  close_all_modals();
  $("#offlinebar").show();
  $("#onlinebar").hide();
  $("#mainmenu").hide();
  $("#aboutdrift").show();
  updateLastConnectedInfo();
}

function updateLastConnectedInfo() {
  const $lastConnected = $("#lastConnected");
  const $infoDiv = $("#lastConnectedInfo");
  const info = Storage.lastConnectedController.get();

  if (!info) {
    console.log("No last connected info found.", $lastConnected);
    $lastConnected.hide();
    return;
  }

  try {
    const parts = [];
    if (info.color) parts.push(l(info.color));
    if (info.boardModel) parts.push(info.boardModel);
    if (info.deviceName) parts.push(info.deviceName);

    let text = parts.join(" ");
    if (info.serialNumber) {
      text += ", " + l("serial number") + " " + info.serialNumber;
    }

    $infoDiv.text(text);

    if (info.serialNumber) {
      const hasChanges = Storage.hasChangesState.get(info.serialNumber);
      const $warning = $("#lastConnectedWarning");
      $warning.toggle(hasChanges);
    }

    $lastConnected.show();
  } catch (error) {
    console.error("Error parsing last connected info:", error);
    $lastConnected.hide();
  }
}

// Wrapper function for HTML onclick handlers
function disconnectSync() {
  disconnect().catch(error => {
    throw new Error("Failed to disconnect", { cause: error });
  });
}

async function handleDisconnectedDevice(e) {
  la("disconnected");
  console.log("Disconnected: " + e.device.productName)
  await disconnect();
}

function render_nvstatus_to_dom(nv) {
  if(!nv?.status) {
    throw new Error("Invalid NVS status data", { cause: nv?.error });
  }

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

  return await controller.queryNvStatus();
}

function set_edge_progress(score) {
  $("#dsedge-progress").css({ "width": score + "%" })
}

function show_welcome_modal() {
  const already_accepted = Storage.getString("welcome_accepted");
  if(already_accepted == "1")
    return;

  bootstrap.Modal.getOrCreateInstance('#welcomeModal').show();
}

function welcome_accepted() {
  la("welcome_accepted");
  Storage.setString("welcome_accepted", "1");
  $("#welcomeModal").modal("hide");
}

async function init_svg_controller(model) {
  const svgContainer = document.getElementById('controller-svg-placeholder');

  // Determine which SVG to load based on controller model
  let svgFileName;
  if (model === 'DS4') {
    svgFileName = 'dualshock-controller.svg';
  } else if (model === 'DS5' || model === 'DS5_Edge') {
    svgFileName = 'dualsense-controller.svg';
  } else if (model === 'VR2') {
    // Disable SVG controller for VR2
    svgContainer.innerHTML = '';
    return;
  } else {
    throw new Error(`Unknown controller model: ${model}`);
  }

  let svgContent;

  // Check if we have bundled assets (production mode)
  if (window.BUNDLED_ASSETS && window.BUNDLED_ASSETS.svg && window.BUNDLED_ASSETS.svg[svgFileName]) {
    svgContent = window.BUNDLED_ASSETS.svg[svgFileName];
  } else {
    // Fallback to fetching from server (development mode)
    const response = await fetch(`assets/${svgFileName}`);
    if (!response.ok) {
      throw new Error(`Failed to load controller SVG: ${svgFileName}`);
    }
    svgContent = await response.text();
  }

  svgContainer.innerHTML = svgContent;

  // Reset trackpad bounding box so it's recalculated for the new SVG
  trackpadBbox = undefined;

  const lightBlue = '#7ecbff';
  const midBlue = '#3399cc';
  const dualshock = document.getElementById('Controller');
  set_svg_group_color(dualshock, lightBlue);

  ['Button_outlines', 'Button_outlines_behind', 'L3_outline', 'R3_outline', 'Trackpad_outline'].forEach(id => {
    const group = document.getElementById(id);
    set_svg_group_color(group, midBlue);
  });

  ['Controller_infills', 'Button_infills', 'L3_infill', 'R3_infill', 'Trackpad_infill'].forEach(id => {
    const group = document.getElementById(id);
    set_svg_group_color(group, 'white');
  });
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

  for(const [stick, data] of [[left, leftData], [right, rightData]]) {
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
  }
}

function clear_circularity(leftOrRight = 'both') {
  if(['left', 'both'].includes(leftOrRight)) ll_data.fill(0);
  if(['right', 'both'].includes(leftOrRight)) rr_data.fill(0);
}

function reset_circularity_mode() {
  clear_circularity();
  $("#normalMode").prop('checked', true);
  refresh_stick_pos();
}

function refresh_stick_pos() {
  if(!controller) return;

  const hasSingleStick = (controller.currentController?.getNumberOfSticks() == 1);

  const c = document.getElementById("stickCanvas");
  const ctx = c.getContext("2d");
  const sz = 60;
  const yb = 15 + sz;
  const w = c.width;
  const hb = hasSingleStick ? w / 2 : 20 + sz;
  ctx.clearRect(0, 0, c.width, c.height);

  const { left: { x: plx, y: ply }, right: { x: prx, y: pry } } = controller.button_states.sticks;

  const enable_zoom_center = center_zoom_checked();
  const enable_circ_test = circ_checked();

  // Draw left stick
  draw_stick_dial(ctx, hb, yb, sz, plx, ply, {
    circularity_data: enable_circ_test ? ll_data : null,
    enable_zoom_center,
  });

  if(!hasSingleStick) {
    // Draw right stick
    draw_stick_dial(ctx, w-hb, yb, sz, prx, pry, {
      circularity_data: enable_circ_test ? rr_data : null,
      enable_zoom_center,
    });
  }

  const precision = enable_zoom_center ? 3 : 2;
  $("#lx-lbl").text(float_to_str(plx, precision));
  $("#ly-lbl").text(float_to_str(ply, precision));
  if(!hasSingleStick) {
    $("#rx-lbl").text(float_to_str(prx, precision));
    $("#ry-lbl").text(float_to_str(pry, precision));
  }

  // Move L3 and R3 SVG elements according to stick position
  try {
    switch(controller.getModel()) {
      case "DS4":
        // These values are tuned for the SVG's coordinate system and visual effect
        const ds4_max_stick_offset = 25;
        // L3 center in SVG coordinates (from path: cx=295.63, cy=461.03)
        const ds4_l3_cx = 295.63, ds4_l3_cy = 461.03;
        // R3 center in SVG coordinates (from path: cx=662.06, cy=419.78)
        const ds4_r3_cx = 662.06, ds4_r3_cy = 419.78;

        const ds4_l3_x = ds4_l3_cx + plx * ds4_max_stick_offset;
        const ds4_l3_y = ds4_l3_cy + ply * ds4_max_stick_offset;
        const ds4_l3_group = document.querySelector('g#L3');
        ds4_l3_group?.setAttribute('transform', `translate(${ds4_l3_x - ds4_l3_cx},${ds4_l3_y - ds4_l3_cy})`);

        const ds4_r3_x = ds4_r3_cx + prx * ds4_max_stick_offset;
        const ds4_r3_y = ds4_r3_cy + pry * ds4_max_stick_offset;
        const ds4_r3_group = document.querySelector('g#R3');
        ds4_r3_group?.setAttribute('transform', `translate(${ds4_r3_x - ds4_r3_cx},${ds4_r3_y - ds4_r3_cy})`);
        break;
      case "DS5":
      case "DS5_Edge":
        // These values are tuned for the SVG's coordinate system and visual effect
        const ds5_max_stick_offset = 25;
        // L3 center in SVG coordinates (from path: cx=295.63, cy=461.03)
        const ds5_l3_cx = 295.63, ds5_l3_cy = 461.03;
        // R3 center in SVG coordinates (from path: cx=662.06, cy=419.78)
        const ds5_r3_cx = 662.06, ds5_r3_cy = 419.78;

        const ds5_l3_x = ds5_l3_cx + plx * ds5_max_stick_offset;
        const ds5_l3_y = ds5_l3_cy + ply * ds5_max_stick_offset;
        const ds5_l3_group = document.querySelector('g#L3');
        ds5_l3_group?.setAttribute('transform', `translate(${ds5_l3_x - ds5_l3_cx},${ds5_l3_y - ds5_l3_cy}) scale(0.70)`);

        const ds5_r3_x = ds5_r3_cx + prx * ds5_max_stick_offset;
        const ds5_r3_y = ds5_r3_cy + pry * ds5_max_stick_offset;
        const ds5_r3_group = document.querySelector('g#R3');
        ds5_r3_group?.setAttribute('transform', `translate(${ds5_r3_x - ds5_r3_cx},${ds5_r3_y - ds5_r3_cy}) scale(0.70)`);
        break;
      default:
        return; // Unsupported model, skip
    }
  } catch (e) {
    // Fail silently if SVG not present
  }

  const circularityCheckIcon = document.getElementById('circularityCheckIcon');
  if (!enable_circ_test) {
    circularityCheckIcon.style.display = 'none';
    return;
  }

  const ll_error = calculateCircularityError(ll_data);
  const rr_error = calculateCircularityError(rr_data);
  const isTooSmall = (ll_error && ll_error < 5 || rr_error && rr_error < 5);
  circularityCheckIcon.style.display = isTooSmall ? 'block' : 'none';
}

const circ_checked = () => $("#checkCircularityMode").is(':checked');
const center_zoom_checked = () => $("#centerZoomMode").is(':checked');

function resetStickDiagrams() {
  clear_circularity();
  refresh_stick_pos();
}

// Helper functions to switch display modes
function switchTo10xZoomMode() {
  $("#centerZoomMode").prop('checked', true);
  resetStickDiagrams();
}

function switchToRangeMode() {
  $("#checkCircularityMode").prop('checked', true);
  resetStickDiagrams();
}

const on_stick_mode_change = () => resetStickDiagrams();

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

const update_stick_graphics = (changes) => throttled_refresh_sticks(changes);

function update_battery_status({/* charge_level, cable_connected, is_charging, is_error, */ bat_txt, changed}) {
  if(changed) {
    $("#d-bat").html(bat_txt);
  }
}

function update_ds_button_svg(changes, BUTTON_MAP) {
  if (!changes || Object.keys(changes).length === 0) return;

  const pressedColor = '#1a237e'; // pleasing dark blue

  // Update L2/R2 analog infill
  for (const trigger of ['l2', 'r2']) {
    const key = trigger + '_analog';
    if (changes.hasOwnProperty(key)) {
      const val = changes[key];
      const t = val / 255;
      const color = lerp_color('#ffffff', pressedColor, t);
      const svg = trigger.toUpperCase() + '_infill';
      const infill = document.getElementById(svg);
      set_svg_group_color(infill, color);

      // Update percentage text
      const percentage = Math.round((val / 255) * 100);
      const percentageText = document.getElementById(trigger.toUpperCase() + '_percentage');
      if (percentageText) {
        percentageText.textContent = `${percentage} %`;
        percentageText.setAttribute('opacity', percentage > 0 ? '1' : '0');
        percentageText.setAttribute('fill', percentage < 35 ? pressedColor : 'white');
      }
    }
  }

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

function detectFailedRangeCalibration(changes) {
  if (!changes.sticks || app.shownRangeCalibrationWarning) return;

  const { left, right } = changes.sticks;
  const failedCalibration = [left, right].some(({x, y}) => Math.abs(x) + Math.abs(y) == 2);
  const hasOpenModals = document.querySelectorAll('.modal.show').length > 0;

  if (failedCalibration && !app.shownRangeCalibrationWarning && !hasOpenModals) {
    app.failedCalibrationDetectionsCount++;
    if (app.failedCalibrationDetectionsCount < 5) {
      return; // require 5 consecutive detections
    }

    app.failedCalibrationModalShownCount++;
    Storage.failedCalibrationCount.set(app.failedCalibrationModalShownCount);

    app.shownRangeCalibrationWarning = true;
    if (app.failedCalibrationCount <= 6) {  // keep it from getting annoying
      show_popup(l("Range calibration appears to have failed. Please try again and make sure you rotate the sticks."));
    }
  }
}

function isRangeCalibrationVisible() {
  const modal = document.getElementById('rangeModal');
  if (!modal) return false;
  return modal.classList.contains('show');
}

// Callback function to handle UI updates after controller input processing
function handleControllerInput({ changes, inputConfig, touchPoints, batteryStatus }) {
  const { buttonMap } = inputConfig;

  // Open Quick Test modal if options button is pressed while L1 is held down
  if (changes.options && controller.button_states.l1) {
    update_ds_button_svg({ l1: false }, buttonMap); // Clear L1
    show_quick_test_modal(controller);
    return;
  }

  // Update range calibration modal stick visualization if visible
  if (isRangeCalibrationVisible() && changes.sticks) {
    collectCircularityData(changes.sticks, ll_data, rr_data);
    rangeCalibHandleControllerInput(changes);
    return;
  }

  // Handle Quick Test Modal input (can be open from any tab)
  if (isQuickTestVisible()) {
    quicktest_handle_controller_input(changes, batteryStatus);
    return;
  }

  const current_active_tab = get_current_main_tab();
  switch (current_active_tab) {
    case 'controller-tab': // Main controller tab
      collectCircularityData(changes.sticks, ll_data, rr_data);
      if(isFinetuneVisible()) {
        finetune_handle_controller_input(changes);
      } else {
        update_stick_graphics(changes);
        update_ds_button_svg(changes, buttonMap);
        update_touchpad_circles(touchPoints);
        detectFailedRangeCalibration(changes);
      }
      break;

    case 'tests-tab':
      handle_test_input(changes);
      break;
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
        // trigger_haptic_motors(l2, r2);
      }
      break;

    // Add more test tabs here as needed
    default:
      console.log("Unknown test tab:", current_test_tab);
      break;
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

  // Disable all buttons except Quick Test
  $(".ds-btn").not("#quick-test-btn").prop("disabled", true);

  // show only one popup
  if(disable_btn & 1 && !(last_disable_btn & 1)) {
    show_popup(l("The device appears to be a clone. All calibration functionality is disabled."));
  } else if(disable_btn & 2 && !(last_disable_btn & 2)) {
    show_popup(l("This DualSense controller has outdated firmware.") + "<br>" + l("Please update the firmware and try again."), true);
  }
  app.last_disable_btn = disable_btn;
}

async function handleLanguageChange() {
  if(!controller) return;

  const { infoItems } = await controller.getDeviceInfo();
  render_info_to_dom(infoItems);
}

function handleNvStatusUpdate(nv) {
  // Refresh NVS status display when it changes
  render_nvstatus_to_dom(nv);
}

async function flash_all_changes() {
  const isEdge = controller.getModel() == "DS5_Edge";
  const progressCallback = isEdge ? set_edge_progress : null;
  const edgeProgressModal = isEdge ? bootstrap.Modal.getOrCreateInstance('#edgeProgressModal') : null;
  edgeProgressModal?.show();

  const result = await controller.flash(progressCallback);
  edgeProgressModal?.hide();

  if (result?.success) {
    if(result.isHtml) {
      show_popup(result.message, result.isHtml);
    } else {
      successAlert(result.message);
    }
  }
}

async function reboot_controller() {
  await controller.reset();
}

async function nvsunlock() {
  await controller.nvsUnlock();
}

async function nvslock() {
  return await controller.nvsLock();
}

function close_all_modals() {
  $('.modal.show').modal('hide'); // Close any open modals
}

function render_info_to_dom(infoItems) {
  // Clear all info sections
  $("#fwinfo").html("");
  $("#fwinfoextra-hw").html("");
  $("#fwinfoextra-fw").html("");

  if (!Array.isArray(infoItems)) return;

  // Add new info items
  infoItems.forEach(({key, value, addInfoIcon, severity, isExtra, cat, copyable}) => {
    if (!key) return;

    // Compose value with optional info icon
    let valueHtml = String(value ?? "");

    // Apply severity formatting if requested
    if (severity) {
      const colors = { danger: 'red', success: 'green' }
      const color = colors[severity] || 'black';
      valueHtml = `<font color='${color}'><b>${valueHtml}</b></font>`;
    }

    if (isExtra) {
      appendInfoExtra(key, valueHtml, cat || "hw", copyable ?? false);
    } else {
      appendInfo(key, valueHtml, cat || "hw", copyable ?? false);
    }
  });
}

function copyValueToClipboard(text) {
  navigator.clipboard.writeText(text).then(function() {
    infoAlert(l("The item has been copied to the clipboard."), 2000);
  }).catch(function(err) {
    errorAlert(l("Cannot copy text to the clipboard:") + " " + str(err));
  });
}

function genCopyString(value, copyable) {
  if(!copyable)
    return '';

  const cleanStringRegex = value.match(/^[A-Za-z0-9_.-]+/);
  const escapedValue = cleanStringRegex ? cleanStringRegex[0] : "";

  return '&nbsp;<i style="cursor:pointer;" class="fa-regular fa-copy" onclick=\'copyValueToClipboard("' + escapedValue + '")\'></i>';
}

function appendInfoExtra(key, value, cat, copyable) {
  // TODO escape html
  const s = '<dt class="text-muted col-sm-4 col-md-6 col-xl-5">' + key + '</dt><dd class="col-sm-8 col-md-6 col-xl-7" style="text-align: right;">' + value + genCopyString(value, copyable) + '</dd>';
  $("#fwinfoextra-" + cat).html($("#fwinfoextra-" + cat).html() + s);
}


function appendInfo(key, value, cat, copyable) {
  // TODO escape html
  const s = '<dt class="text-muted col-6">' + key + '</dt><dd class="col-6" style="text-align: right;">' + value + genCopyString(value, copyable) + '</dd>';
  $("#fwinfo").html($("#fwinfo").html() + s);
  appendInfoExtra(key, value, cat, copyable);
}

function show_popup(text, is_html = false) {
  if(is_html) {
    $("#popupBody").html(text);
  } else {
    $("#popupBody").text(text);
  }
  bootstrap.Modal.getOrCreateInstance('#popupModal').show();
}

function show_faq_modal() {
  la("faq_modal");
  bootstrap.Modal.getOrCreateInstance('#faqModal').show();
}

function show_donate_modal() {
  la("donate_modal");
  bootstrap.Modal.getOrCreateInstance('#donateModal').show();
}

function show_edge_modal() {
  // Check if user has chosen not to show the modal again
  if (Storage.edgeModalDontShowAgain.get()) {
    return;
  }

  la("edge_modal");
  bootstrap.Modal.getOrCreateInstance('#edgeModal').show();
}

function show_info_tab() {
  la("info_modal");
  $('#info-tab').tab('show');
}

function show_circularity_warning() {
  const message = `<p>
  ${l("Sony controllers come from the factory calibrated to have an average circularity error of nearly 10 %, and this is now what games expect. Too perfect circularity can make movements and aim feel stiff and unresponsive in some games.")
  }</p><p>
  ${l("Aim for a circularity error of around 7-9 % for the best playing experience.")}`;
  
  show_popup(message, true);
}

// Alert Management Functions
let alertCounter = 0;

/**
 * Push a new alert message to the bottom of the screen
 * @param {string} message - The message to display
 * @param {string} type - Bootstrap alert type: 'primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark'
 * @param {number} duration - Auto-dismiss duration in milliseconds (0 = no auto-dismiss)
 * @param {boolean} dismissible - Whether the alert can be manually dismissed
 * @returns {string} - The ID of the created alert element
 */
function pushAlert(message, type = 'info', duration = 0, dismissible = true) {
  const alertContainer = document.getElementById('alert-container');
  if (!alertContainer) {
  console.error('Alert container not found');
  return null;
  }

  const alertId = `alert-${++alertCounter}`;
  const alertDiv = document.createElement('div');
  alertDiv.id = alertId;
  alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
  alertDiv.setAttribute('role', 'alert');
  alertDiv.innerHTML = `
    ${message}
    ${dismissible ? '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>' : ''}
  `;

  alertContainer.appendChild(alertDiv);

  if (duration > 0) {
    setTimeout(() => {
      dismissAlert(alertId);
    }, duration);
  }

  return alertId;
}

function dismissAlert(alertId) {
  const alertElement = document.getElementById(alertId);
  if (alertElement) {
    const bsAlert = new bootstrap.Alert(alertElement);
    bsAlert.close();
  }
}

function clearAllAlerts() {
  const alertContainer = document.getElementById('alert-container');
  if (alertContainer) {
    const alerts = alertContainer.querySelectorAll('.alert');
    alerts.forEach(alert => {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    });
  }
}

function successAlert(message, duration = 1_500) {
  return pushAlert(message, 'success', duration, false);
}

function errorAlert(message, duration = 15_000) {
  return pushAlert(message, 'danger', /* duration */);
}

function warningAlert(message, duration = 8_000) {
  return pushAlert(message, 'warning', duration);
}

function infoAlert(message, duration = 5_000) {
  return pushAlert(message, 'info', duration, false);
}






// Export functions to global scope for HTML onclick handlers
window.gboot = gboot;
window.connect = connect;
window.disconnect = disconnectSync;
window.show_faq_modal = show_faq_modal;
window.show_info_tab = show_info_tab;
window.copyValueToClipboard = copyValueToClipboard;

window.calibrate_stick_centers = () => calibrate_stick_centers(
  controller,
  (success, message) => {
    if (success) {
      resetStickDiagrams();
      infoAlert(message, 2_000);
      switchTo10xZoomMode();
    }
  }
);

window.ds5_finetune = () => ds5_finetune(
  controller,
  { ll_data, rr_data, clear_circularity },
  (success) => success && switchToRangeMode()
);

window.openCalibrationHistoryModal = async () => {
  let currentFinetuneData = null;
  let controllerSerialNumber = null;
  try {
    if (controller && typeof controller.getInMemoryModuleData === 'function') {
      currentFinetuneData = await controller.getInMemoryModuleData('finetune');
    }
    if (controller && typeof controller.getDeviceInfo === 'function') {
      const info = await controller.getDeviceInfo();
      const serialNumberItem = info?.infoItems?.find(item => item.key === l("Serial Number"));
      controllerSerialNumber = serialNumberItem?.value;
    }
  } catch (error) {
    console.warn('Could not retrieve current finetune data or serial number:', error);
  }
  la("calibration_history_modal_open");
  await show_calibration_history_modal(controller, currentFinetuneData, controllerSerialNumber, (success, message) => {
    if(!message) return;
    success ? infoAlert(message) : errorAlert(message);
  });
};

window.flash_all_changes = flash_all_changes;
window.reboot_controller = reboot_controller;
window.refresh_nvstatus = refresh_nvstatus;
window.nvsunlock = nvsunlock;

// Calibration method selection
window.setCenterCalibrationMethod = (method, event) => {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  app.centerCalibrationMethod = method;
  Storage.centerCalibrationMethod.set(method);
  updateCalibrationMethodUI();
  // Close the dropdown
  const dropdownButton = event?.target?.closest('.dropdown-menu')?.previousElementSibling;
  if (dropdownButton) {
    const dropdown = bootstrap.Dropdown.getInstance(dropdownButton);
    if (dropdown) dropdown.hide();
  }
};

window.executeSelectedCenterCalibration = () => {
  if (app.centerCalibrationMethod === 'quick') {
    auto_calibrate_stick_centers(
      controller,
      (success, message) => {
        if (success) {
          resetStickDiagrams();
          infoAlert(message, 2_000);
          switchTo10xZoomMode();
        }
      }
    );
  } else {
    calibrate_stick_centers(
      controller,
      (success, message) => {
        if (success) {
          resetStickDiagrams();
          infoAlert(message, 2_000);
          switchTo10xZoomMode();
        }
      }
    );
  }
};

window.setRangeCalibrationMethod = (method, event) => {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  app.rangeCalibrationMethod = method;
  Storage.rangeCalibrationMethod.set(method);
  updateCalibrationMethodUI();
  // Close the dropdown
  const dropdownButton = event?.target?.closest('.dropdown-menu')?.previousElementSibling;
  if (dropdownButton) {
    const dropdown = bootstrap.Dropdown.getInstance(dropdownButton);
    if (dropdown) dropdown.hide();
  }
};

window.executeSelectedRangeCalibration = () => {
  calibrate_range(
    controller,
    { ll_data, rr_data },
    (success, message) => {
      resetStickDiagrams();
      if(message) {
        infoAlert(message, 2_000);
      }
      switchToRangeMode();
    },
    app.rangeCalibrationMethod === 'expert'
  );
};

function updateCalibrationMethodUI() {
  $('#check-quick').toggle(app.centerCalibrationMethod === 'quick');
  $('#check-four-step').toggle(app.centerCalibrationMethod === 'four-step');
  $('#check-range-normal').toggle(app.rangeCalibrationMethod === 'normal');
  $('#check-range-expert').toggle(app.rangeCalibrationMethod === 'expert');
}

function initCalibrationMethod() {
  const savedCenterMethod = Storage.centerCalibrationMethod.get();
  if (savedCenterMethod && (savedCenterMethod === 'quick' || savedCenterMethod === 'four-step')) {
    app.centerCalibrationMethod = savedCenterMethod;
  }

  const savedRangeMethod = Storage.rangeCalibrationMethod.get();
  if (savedRangeMethod && (savedRangeMethod === 'normal' || savedRangeMethod === 'expert')) {
    app.rangeCalibrationMethod = savedRangeMethod;
  }

  const savedFailedCalibrationCount = Storage.failedCalibrationCount.get();
  if (savedFailedCalibrationCount > 0) {
    app.failedCalibrationModalShownCount = savedFailedCalibrationCount;
  }

  updateCalibrationMethodUI();
}
window.nvslock = nvslock;
window.welcome_accepted = welcome_accepted;
window.show_donate_modal = show_donate_modal;
window.show_circularity_warning = show_circularity_warning;
window.show_quick_test_modal = () => {
  show_quick_test_modal(controller).catch(error => {
    throw new Error("Failed to show quick test modal", { cause: error });
  });
};

// Auto-initialize the application when the module loads
gboot();
