var device = null;
var devname = "";
var mode = 0;
var disable_btn = false;

var lang_orig_text = {};
var lang_cur = {};
var lang_disabled = true;
var gj = 0;
var gu = 0;

var available_langs = {
    "bg_bg": { "name": "Български", "file": "bg_bg.json"},
    "de_de": { "name": "Deutsch", "file": "de_de.json"},
    "es_es": { "name": "Español", "file": "es_es.json"},
    "fr_fr": { "name": "Français", "file": "fr_fr.json"},
    "hu_hu": { "name": "Magyar", "file": "hu_hu.json"},
    "it_it": { "name": "Italiano", "file": "it_it.json"},
    "jp_jp": { "name": "日本語", "file": "jp_jp.json"},
    "ru_ru": { "name": "Русский", "file": "ru_ru.json"},
    "tr_tr": { "name": "Türkçe", "file": "tr_tr.json"},
    "zh_cn": { "name": "中文", "file": "zh_cn.json"},
};

function buf2hex(buffer) {
  return [...new Uint8Array(buffer)] .map(x => x.toString(16).padStart(2, '0')) .join('');
}

function dec2hex(i) {
   return (i+0x10000).toString(16).substr(-4).toUpperCase();
}

function dec2hex32(i) {
   return (i+0x100000000).toString(16).substr(-8).toUpperCase();
}

function dec2hex8(i) {
   return (i+0x100).toString(16).substr(-2).toUpperCase();
}

function ds5_hw_to_bm(hw_ver) {
    a = (hw_ver >> 8) & 0xff;
    if(a == 0x03) {
        return "BDM-010";
    } else if(a == 0x04) {
        return "BDM-020";
    } else if(a == 0x05) {
        return "BDM-030";
    } else if(a == 0x06) {
        return "BDM-040";
    } else {
        return l("Unknown");
    }
}

function ds4_hw_to_bm(hw_ver) {
    a = hw_ver >> 8;
    if(a == 0x31) {
        return "JDM-001";
    } else if(a == 0x43) {
        return "JDM-011";
    } else if(a == 0x54) {
        return "JDM-030";
    } else if(a == 0x64) {
        return "JDM-040";
    } else if(a > 0x80 && a < 0x84) {
        return "JDM-020";
    } else if(a == 0xa4) {
        return "JDM-050";
    } else if(a == 0xb4) {
        return "JDM-055";
    } else {
        if(is_rare(hw_ver))
            return "WOW!";
        return l("Unknown");
    }
}

function is_rare(hw_ver) {
    a = hw_ver >> 8;
    return (a == 0x74 || a == 0x93 || a == 0xb0 || a == 0xa0);
}

async function ds4_info() {
    try {
        const view = lf("ds4_info", await device.receiveFeatureReport(0xa3));

        var cmd = view.getUint8(0, true);
        if(cmd != 0xa3 || view.buffer.byteLength != 49) {
            return false;
        }

        var k1 = new TextDecoder().decode(view.buffer.slice(1, 0x10));
        var k2 = new TextDecoder().decode(view.buffer.slice(0x10, 0x20));
        k1=k1.replace(/\0/g, '');
        k2=k2.replace(/\0/g, '');

        var hw_ver_major= view.getUint16(0x21, true)
        var hw_ver_minor= view.getUint16(0x23, true)
        var sw_ver_major= view.getUint32(0x25, true)
        var sw_ver_minor= view.getUint16(0x25+4, true)
        var ooc = l("unknown");

        ooc = l("original");

        var is_clone = false;
        try {
            const view = await device.receiveFeatureReport(0x81);
            ooc = l("original");
        } catch(e) {
            la("clone");
            is_clone = true;
            ooc = "<font color='red'><b>" + l("clone") + "</b></font>";
            disable_btn = true;
        }

        clear_info();
        append_info(l("Build Date:"), k1 + " " + k2);
        append_info(l("HW Version:"), "" + dec2hex(hw_ver_major) + ":" + dec2hex(hw_ver_minor));
        append_info(l("SW Version:"), dec2hex32(sw_ver_major) + ":" + dec2hex(sw_ver_minor));
        append_info(l("Device Type:"), ooc);
        if(!is_clone) {
            b_info = '&nbsp;<a class="link-body-emphasis" href="#" onclick="board_model_info()">' + 
                    '<svg class="bi" width="1.3em" height="1.3em"><use xlink:href="#info"/></svg></a>';
            append_info(l("Board Model:"), ds4_hw_to_bm(hw_ver_minor) + b_info);

            // All ok, safe to query NVS Status and BD Addr
            await ds4_nvstatus();
            await ds4_getbdaddr();

            if(is_rare(hw_ver_minor)) {
                show_popup("Wow, this is a rare/weird controller! Please write me an email at ds4@the.al or contact me on Discord (the_al)");
            }
        }
    } catch(e) {
        ooc = "<font color='red'><b>" + l("clone") + "</b></font>";
        disable_btn = true;
    }
    return true;
}

async function ds4_reset() {
    la("ds4_reset");
    try {
        await device.sendFeatureReport(0xa0, alloc_req(0x80, [4,1,0]))
    } catch(error) {
    }
}

async function ds5_reset() {
    la("ds5_reset");
    try {
        await device.sendFeatureReport(0x80, alloc_req(0x80, [1,1,0]))
    } catch(error) {
    }
}

async function ds4_calibrate_range_begin(perm_ch) {
    la("ds4_calibrate_range_begin", {"p": perm_ch});
    var err = l("Range calibration failed: ");
    try {
        if(perm_ch) {
            await ds4_nvunlock();
            if(await ds4_nvstatus() != 0) {
                la("ds4_calibrate_range_begin_failed", {"r": "nvunlock"});
                close_calibrate_window();
                return show_popup(err + l("Cannot unlock NVS"));
            }
        }
    
        // Begin
        await device.sendFeatureReport(0x90, alloc_req(0x90, [1,1,2]))
    
        // Assert
        data = await device.receiveFeatureReport(0x91)
        data2 = await device.receiveFeatureReport(0x92)
        d1 = data.getUint32(0, false);
        d2 = data2.getUint32(0, false);
        if(d1 != 0x91010201 || d2 != 0x920102ff) {
            la("ds4_calibrate_range_begin_failed", {"d1": d1, "d2": d2});
            close_calibrate_window();
            return show_popup(err + l("Error 1"));
        }
    } catch(e) {
        la("ds4_calibrate_range_begin_failed", {"r": e});
        await new Promise(r => setTimeout(r, 500));
        close_calibrate_window();
        return show_popup(err + e);
    }
}

async function ds4_calibrate_range_end(perm_ch) {
    la("ds4_calibrate_range_end", {"p": perm_ch});
    var err = l("Range calibration failed: ");
    try {
        // Write
        await device.sendFeatureReport(0x90, alloc_req(0x90, [2,1,2]))
    
        data = await device.receiveFeatureReport(0x91)
        data2 = await device.receiveFeatureReport(0x92)
        d1 = data.getUint32(0, false);
        d2 = data2.getUint32(0, false);
        if(d1 != 0x91010202 || d2 != 0x92010201) {
            la("ds4_calibrate_range_end_failed", {"d1": d1, "d2": d2});
            close_calibrate_window();
            return show_popup(err + l("Error 3"));
        }
    
        if(perm_ch) {
            await ds4_nvlock();
            if(await ds4_nvstatus() != 1) {
                la("ds4_calibrate_range_end_failed", {"r": "nvlock"});
                close_calibrate_window();
                return show_popup(err + l("Cannot relock NVS"));
            }
        }
    
        close_calibrate_window();
        show_popup(l("Range calibration completed"));
    } catch(e) {
        la("ds4_calibrate_range_end_failed", {"r": e});
        await new Promise(r => setTimeout(r, 500));
        close_calibrate_window();
        return show_popup(err + e);
    }
}

async function ds4_calibrate_sticks_begin(has_perm_changes) {
    la("ds4_calibrate_sticks_begin", {"p": has_perm_changes});
    var err = l("Stick calibration failed: ");
    try {
        if(has_perm_changes) {
            await ds4_nvunlock();
            if(await ds4_nvstatus() != 0) {
                la("ds4_calibrate_sticks_begin_failed", {"r": "nvunlock"});
                show_popup(err + l("Cannot unlock NVS"));
                return false;
            }
        }

        // Begin
        await device.sendFeatureReport(0x90, alloc_req(0x90, [1,1,1]))

        // Assert
        data = await device.receiveFeatureReport(0x91);
        data2 = await device.receiveFeatureReport(0x92);
        d1 = data.getUint32(0, false);
        d2 = data2.getUint32(0, false);
        if(d1 != 0x91010101 || d2 != 0x920101ff) {
            la("ds4_calibrate_sticks_begin_failed", {"d1": d1, "d2": d2});
            show_popup(err + l("Error 1"));
            return false;
        }

        return true;
    } catch(e) {
        la("ds4_calibrate_sticks_begin_failed", {"r": e});
        await new Promise(r => setTimeout(r, 500));
        show_popup(err + e);
        return false;
    }
}

async function ds4_calibrate_sticks_sample() {
    la("ds4_calibrate_sticks_sample");
    var err = l("Stick calibration failed: ");
    try {
        // Sample
        await device.sendFeatureReport(0x90, alloc_req(0x90, [3,1,1]))

        // Assert
        data = await device.receiveFeatureReport(0x91);
        data2 = await device.receiveFeatureReport(0x92);
        if(data.getUint32(0, false) != 0x91010101 || data2.getUint32(0, false) != 0x920101ff) {
            close_calibrate_window();
            d1 = dec2hex32(data.getUint32(0, false));
            d2 = dec2hex32(data2.getUint32(0, false));
            la("ds4_calibrate_sticks_sample_failed", {"d1": d1, "d2": d2});
            show_popup(err + l("Error 2") + " (" + d1 + ", " + d2 + " at i=" + i + ")");
            return false;
        }
        return true;
    } catch(e) {
        await new Promise(r => setTimeout(r, 500));
        show_popup(err + e);
        return false;
    }
}

async function ds4_calibrate_sticks_end(has_perm_changes) {
    la("ds4_calibrate_sticks_end", {"p": has_perm_changes});
    var err = l("Stick calibration failed: ");
    try {
        // Write
        await device.sendFeatureReport(0x90, alloc_req(0x90, [2,1,1]))
        if(data.getUint32(0, false) != 0x91010101 || data2.getUint32(0, false) != 0x920101FF) {
            d1 = dec2hex32(data.getUint32(0, false));
            d2 = dec2hex32(data2.getUint32(0, false));
            la("ds4_calibrate_sticks_end_failed", {"d1": d1, "d2": d2});
            show_popup(err + l("Error 3") + " (" + d1 + ", " + d2 + " at i=" + i + ")");
            return false;
        }

        if(has_perm_changes) {
            await ds4_nvlock();
            if(await ds4_nvstatus() != 1) {
                la("ds4_calibrate_sticks_end_failed", {"r": "nvlock"});
                show_popup(err + l("Cannot relock NVS"));
                return false;
            }
        }

        return true;
    } catch(e) {
        la("ds4_calibrate_sticks_end_failed", {"r": e});
        await new Promise(r => setTimeout(r, 500));
        show_popup(err + e);
        return false;
    }
}

async function ds4_calibrate_sticks() {
    la("ds4_calibrate_sticks");
    var err = l("Stick calibration failed: ");
    try {
        set_progress(0);
    
        // Begin
        await device.sendFeatureReport(0x90, alloc_req(0x90, [1,1,1]))
    
        // Assert
        data = await device.receiveFeatureReport(0x91);
        data2 = await device.receiveFeatureReport(0x92);
        d1 = data.getUint32(0, false);
        d2 = data2.getUint32(0, false);
        if(d1 != 0x91010101 || d2 != 0x920101ff) {
            la("ds4_calibrate_sticks_failed", {"s": 1, "d1": d1, "d2": d2});
            close_calibrate_window();
            return show_popup(err + l("Error 1"));
        }
    
        set_progress(10);
        await new Promise(r => setTimeout(r, 100));
    
        for(var i=0;i<3;i++) {
            // Sample
            await device.sendFeatureReport(0x90, alloc_req(0x90, [3,1,1]))
    
            // Assert
            data = await device.receiveFeatureReport(0x91);
            data2 = await device.receiveFeatureReport(0x92);
            if(data.getUint32(0, false) != 0x91010101 || data2.getUint32(0, false) != 0x920101ff) {
                d1 = dec2hex32(data.getUint32(0, false));
                d2 = dec2hex32(data2.getUint32(0, false));
                la("ds4_calibrate_sticks_failed", {"s": 2, "i": i, "d1": d1, "d2": d2});
                close_calibrate_window();
                return show_popup(err + l("Error 2") + " (" + d1 + ", " + d2 + " at i=" + i + ")");
            }
    
            await new Promise(r => setTimeout(r, 500));
            set_progress(20 + i * 30);
        }
    
        // Write
        await device.sendFeatureReport(0x90, alloc_req(0x90, [2,1,1]))
        if(data.getUint32(0, false) != 0x91010101 || data2.getUint32(0, false) != 0x920101FF) {
            d1 = dec2hex32(data.getUint32(0, false));
            d2 = dec2hex32(data2.getUint32(0, false));
            la("ds4_calibrate_sticks_failed", {"s": 3, "d1": d1, "d2": d2});
            close_calibrate_window();
            return show_popup(err + l("Error 3") + " (" + d1 + ", " + d2 + " at i=" + i + ")");
        }
    
        set_progress(100);
        await new Promise(r => setTimeout(r, 500));
        close_calibrate_window()
        show_popup(l("Stick calibration completed"));
    } catch(e) {
        la("ds4_calibrate_sticks_failed", {"r": e});
        await new Promise(r => setTimeout(r, 500));
        close_calibrate_window();
        return show_popup(err + e);
    }
}

async function ds4_nvstatus() {
    await device.sendFeatureReport(0x08, alloc_req(0x08, [0xff,0, 12]))
    data = lf("ds4_nvstatus", await device.receiveFeatureReport(0x11))
    // 1: temporary, 0: permanent
    ret = data.getUint8(1, false);
    if(ret == 1) {
        $("#d-nvstatus").html("<font color='green'>" + l("locked") + "</font>");
    } else if(ret == 0) {
        $("#d-nvstatus").html("<font color='red'>" + l("unlocked") + "</font>");
    } else {
        $("#d-nvstatus").html("<font color='purple'>unk " + ret + "</font>");
    }
    return ret;
}

async function ds5_nvstatus() {
    try {
        await device.sendFeatureReport(0x80, alloc_req(0x80, [3,3]))
        data = lf("ds5_nvstatus", await device.receiveFeatureReport(0x81))
        ret = data.getUint32(1, false);
        if(ret == 0x03030201) {
            $("#d-nvstatus").html("<font color='green'>" + l("locked") + "</font>");
            return 1; // temporary
        } else if(ret == 0x03030200) {
            $("#d-nvstatus").html("<font color='red'>" + l("unlocked") + "</font>");
            return 0; // permanent
        } else {
            $("#d-nvstatus").html("<font color='purple'>unk " + dec2hex32(ret) + "</font>");
            return ret; // unknown
        }
    } catch(e) {
        $("#d-nvstatus").html("<font color='red'>" + l("error") + "</font>");
        return 2; // error
    }
}

async function ds4_getbdaddr() {
    try {
        data = lf("ds4_getbdaddr", await device.receiveFeatureReport(0x12));
        out = ""
        for(i=0;i<6;i++) {
            if(i >= 1) out += ":";
            out += dec2hex8(data.getUint8(i, false));
        }
        $("#d-bdaddr").text(out);
        return out;
    } catch(e) {
        $("#d-bdaddr").html("<font color='red'>" + l("error") + "</font>");
        return "error";
    }
}

async function ds5_getbdaddr() {
    try {
        await device.sendFeatureReport(0x80, alloc_req(0x80, [9,2]));
        data = lf("ds5_getbdaddr", await device.receiveFeatureReport(0x81));
        out = ""
        for(i=0;i<6;i++) {
            if(i >= 1) out += ":";
            out += dec2hex8(data.getUint8(4 + 5 - i, false));
        }
        $("#d-bdaddr").text(out);
        return out;
    } catch(e) {
        $("#d-bdaddr").html("<font color='red'>" + l("error") + "</font>");
        return "error";
    }
}

async function ds4_nvlock() {
    la("ds4_nvlock");
    await device.sendFeatureReport(0xa0, alloc_req(0xa0, [10,1,0]))
}

async function ds4_nvunlock() {
    la("ds4_nvunlock");
    await device.sendFeatureReport(0xa0, alloc_req(0xa0, [10,2,0x3e,0x71,0x7f,0x89]))
}

async function ds5_info() {
    const view = lf("ds5_info", await device.receiveFeatureReport(0x20));

    var cmd = view.getUint8(0, true);
    if(cmd != 0x20 || view.buffer.byteLength != 64)
        return false;

    var build_date = new TextDecoder().decode(view.buffer.slice(1, 1+11));
    var build_time = new TextDecoder().decode(view.buffer.slice(12, 20));

    var fwtype     = view.getUint16(20, true);
    var swseries   = view.getUint16(22, true);
    var hwinfo     = view.getUint32(24, true);
    var fwversion  = view.getUint32(28, true);

    var deviceinfo = new TextDecoder().decode(view.buffer.slice(32, 32+12));
    var updversion = view.getUint16(44, true);
    var unk        = view.getUint16(46, true);

    var fwversion1 = view.getUint32(50, true);
    var fwversion2 = view.getUint32(54, true);
    var fwversion3 = view.getUint32(58, true);

    clear_info();

    append_info(l("Build Date:"), build_date + " " + build_time);
    append_info(l("Firmware Type:"), "0x" + dec2hex(fwtype));
    append_info(l("SW Series:"), "0x" + dec2hex(swseries));
    append_info(l("HW Info:"), "0x" + dec2hex32(hwinfo));
    append_info(l("SW Version:"), "0x" + dec2hex32(fwversion));
    append_info(l("UPD Version:"), "0x" + dec2hex(updversion));
    append_info(l("FW Version1:"), "0x" + dec2hex32(fwversion1));
    append_info(l("FW Version2:"), "0x" + dec2hex32(fwversion2));
    append_info(l("FW Version3:"), "0x" + dec2hex32(fwversion3));

    b_info = '&nbsp;<a class="link-body-emphasis" href="#" onclick="board_model_info()">' + 
            '<svg class="bi" width="1.3em" height="1.3em"><use xlink:href="#info"/></svg></a>';
    append_info(l("Board Model:"), ds5_hw_to_bm(hwinfo) + b_info);

    await ds5_nvstatus();
    await ds5_getbdaddr();
    return true;
}

async function ds5_calibrate_sticks_begin(has_perm_changes) {
    la("ds5_calibrate_sticks_begin", {"p": has_perm_changes});
    var err = l("Range calibration failed: ");
    try {
        if(has_perm_changes) {
            await ds5_nvunlock();
            if(await ds5_nvstatus() != 0) {
                la("ds5_calibrate_sticks_begin_failed", {"r": "nvunlock"});
                show_popup(err + l("Cannot unlock NVS"));
                return false;
            }
        }
        // Begin
        await device.sendFeatureReport(0x82, alloc_req(0x82, [1,1,1]))
    
        // Assert
        data = await device.receiveFeatureReport(0x83)
        if(data.getUint32(0, false) != 0x83010101) {
            d1 = dec2hex32(data.getUint32(0, false));
            la("ds5_calibrate_sticks_begin_failed", {"d1": d1});
            show_popup(err + l("Error 1") + " (" + d1 + ").");
            return false;
        }
        return true;
    } catch(e) {
        la("ds5_calibrate_sticks_begin_failed", {"r": e});
        await new Promise(r => setTimeout(r, 500));
        show_popup(err + e);
        return false;
    }
}

async function ds5_calibrate_sticks_sample() {
    la("ds5_calibrate_sticks_sample");
    var err = l("Stick calibration failed: ");
    try {
        // Sample
        await device.sendFeatureReport(0x82, alloc_req(0x82, [3,1,1]))
        
        // Assert
        data = await device.receiveFeatureReport(0x83)
        if(data.getUint32(0, false) != 0x83010101) {
            d1 = dec2hex32(data.getUint32(0, false));
            la("ds5_calibrate_sticks_sample_failed", {"d1": d1});
            show_popup(err + l("Error 2") + " (" + d1 + ").");
            return false;
        }
        return true;
    } catch(e) {
        la("ds5_calibrate_sticks_sample_failed", {"r": e});
        await new Promise(r => setTimeout(r, 500));
        show_popup(err + e);
        return false;
    }
}

async function ds5_calibrate_sticks_end(has_perm_changes) {
    la("ds5_calibrate_sticks_end", {"p": has_perm_changes});
    var err = l("Stick calibration failed: ");
    try {
        // Write
        await device.sendFeatureReport(0x82, alloc_req(0x82, [2,1,1]))

        data = await device.receiveFeatureReport(0x83)
        if(data.getUint32(0, false) != 0x83010102) {
            d1 = dec2hex32(data.getUint32(0, false));
            la("ds5_calibrate_sticks_end_failed", {"d1": d1});
            show_popup(err + l("Error 3") + " (" + d1 + ").");
            return false;
        }

        if(has_perm_changes) {
            await ds5_nvlock();
            if(await ds5_nvstatus() != 1) {
                la("ds5_calibrate_sticks_end_failed", {"r": "nvlock"});
                show_popup(err + l("Cannot relock NVS"));
                return false;
            }
        }
        return true;
    } catch(e) {
        la("ds5_calibrate_sticks_end_failed", {"r": e});
        await new Promise(r => setTimeout(r, 500));
        show_popup(err + e);
        return false;
    }
}

async function ds5_calibrate_sticks() {
    la("ds5_fast_calibrate_sticks");
    var err = l("Stick calibration failed: ");
    try {
        set_progress(0);
    
        // Begin
        await device.sendFeatureReport(0x82, alloc_req(0x82, [1,1,1]))
    
        // Assert
        data = await device.receiveFeatureReport(0x83)
        if(data.getUint32(0, false) != 0x83010101) {
            d1 = dec2hex32(data.getUint32(0, false));
            la("ds5_calibrate_sticks_failed", {"s": 1, "d1": d1});
            close_calibrate_window();
            return show_popup(err + l("Error 1") + " (" + d1 + ").");
        }
    
        set_progress(10);
    
        await new Promise(r => setTimeout(r, 100));
    
        for(var i=0;i<3;i++) {
            // Sample
            await device.sendFeatureReport(0x82, alloc_req(0x82, [3,1,1]))
    
            // Assert
            data = await device.receiveFeatureReport(0x83)
            if(data.getUint32(0, false) != 0x83010101) {
                d1 = dec2hex32(data.getUint32(0, false));
                la("ds5_calibrate_sticks_failed", {"s": 2, "i": i, "d1": d1});
                close_calibrate_window();
                return show_popup(err + l("Error 2") + " (" + d1 + ").");
            }
    
            await new Promise(r => setTimeout(r, 500));
            set_progress(20 + i * 20);
        }
    
        await new Promise(r => setTimeout(r, 200));
        set_progress(80);
    
        // Write
        await device.sendFeatureReport(0x82, alloc_req(0x82, [2,1,1]))
    
        data = await device.receiveFeatureReport(0x83)
        if(data.getUint32(0, false) != 0x83010102) {
            d1 = dec2hex32(data.getUint32(0, false));
            la("ds5_calibrate_sticks_failed", {"s": 3, "d1": d1});
            close_calibrate_window();
            return show_popup(err + l("Error 3") + " (" + d1 + ").");
        }
    
        set_progress(100);
        
        await new Promise(r => setTimeout(r, 500));
        close_calibrate_window()
    
        show_popup(l("Stick calibration completed"));
    } catch(e) {
        la("ds5_calibrate_sticks_failed", {"r": e});
        await new Promise(r => setTimeout(r, 500));
        close_calibrate_window();
        return show_popup(err + e);
    }
}

async function ds5_calibrate_range_begin(perm_ch) {
    la("ds5_calibrate_range_begin", {"p": perm_ch});
    var err = l("Range calibration failed: ");
    try {
        if(perm_ch) {
            await ds5_nvunlock();
            if(await ds5_nvstatus() != 0) {
                la("ds5_calibrate_range_begin_failed", {"r": "nvunlock"});
                close_calibrate_window();
                return show_popup(err + l("Cannot unlock NVS"));
            }
        }
    
        // Begin
        await device.sendFeatureReport(0x82, alloc_req(0x82, [1,1,2]))
    
        // Assert
        data = await device.receiveFeatureReport(0x83)
        if(data.getUint32(0, false) != 0x83010201) {
            d1 = dec2hex32(data.getUint32(0, false));
            la("ds5_calibrate_range_begin_failed", {"d1": d1});
            close_calibrate_window();
            return show_popup(err + l("Error 1") + " (" + d1 + ").");
        }
    } catch(e) {
        la("ds5_calibrate_range_begin_failed", {"r": e});
        await new Promise(r => setTimeout(r, 500));
        close_calibrate_window();
        return show_popup(err + e);
    }
}

async function ds5_calibrate_range_end(perm_ch) {
    la("ds5_calibrate_range_end", {"p": perm_ch});
    var err = l("Range calibration failed: ");
    try {
        // Write
        await device.sendFeatureReport(0x82, alloc_req(0x82, [2,1,2]))
    
        // Assert
        data = await device.receiveFeatureReport(0x83)
        if(data.getUint32(0, false) != 0x83010202) {
            d1 = dec2hex32(data.getUint32(0, false));
            la("ds5_calibrate_range_end_failed", {"d1": d1});
            close_calibrate_window();
            return show_popup(err + l("Error 1") + " (" + d1 + ").");
        }
    
        if(perm_ch) {
            await ds5_nvlock();
            if(await ds5_nvstatus() != 1) {
                la("ds5_calibrate_range_end_failed", {"r": "nvlock"});
                close_calibrate_window();
                return show_popup(err + l("Cannot relock NVS"));
            }
        }
    
        close_calibrate_window();
        show_popup(l("Range calibration completed"));
    } catch(e) {
        la("ds5_calibrate_range_end_failed", {"r": e});
        await new Promise(r => setTimeout(r, 500));
        close_calibrate_window();
        return show_popup(err + e);
    }
}

async function ds5_nvlock() {
    la("ds5_nvlock");
    try {
        await device.sendFeatureReport(0x80, alloc_req(0x80, [3,1]))
        data = await device.receiveFeatureReport(0x83)
    } catch(e) {
        await new Promise(r => setTimeout(r, 500));
        close_calibrate_window();
        return show_popup(l("NVS Lock failed: ") + e);
    }
}

async function ds5_nvunlock() {
    la("ds5_nvunlock");
    try {
        await device.sendFeatureReport(0x80, alloc_req(0x80, [3,2, 101, 50, 64, 12]))
        data = await device.receiveFeatureReport(0x83)
    } catch(e) {
        await new Promise(r => setTimeout(r, 500));
        close_calibrate_window();
        return show_popup(l("NVS Unlock failed: ") + e);
    }
}

async function disconnect() {
    la("disconnect");
    if(device == null)
        return;
    gj = 0;
    mode = 0;
    device.close();
    device = null;
    disable_btn = false;

    $("#offlinebar").show();
    $("#onlinebar").hide();
    $("#mainmenu").hide();
    close_calibrate_window();
}

function handleDisconnectedDevice(e) {
    la("disconnected");
    console.log("Disconnected: " + e.device.productName)
    disconnect();
}

function createCookie(name, value, days) {
    var expires;

    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toGMTString();
    } else {
        expires = "";
    }
    document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) + expires + "; path=/";
}

function readCookie(name) {
    var nameEQ = encodeURIComponent(name) + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) === ' ')
            c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0)
            return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
    return null;
}

function eraseCookie(name) {
    createCookie(name, "", -1);
}

function welcome_modal() {
    var already_accepted = readCookie("welcome_accepted");
    if(already_accepted == "1")
        return;

    curModal = new bootstrap.Modal(document.getElementById('welcomeModal'), {})
    curModal.show();
}

function welcome_accepted() {
    la("welcome_accepted");
    createCookie("welcome_accepted", "1");
    $("#welcomeModal").modal("hide");
}

function gboot() {
    gu = crypto.randomUUID();
    window.addEventListener('DOMContentLoaded', function() {
        lang_init();
        welcome_modal();
    });

    if (!("hid" in navigator)) {
        $("#offlinebar").hide();
        $("#onlinebar").hide();
        $("#missinghid").show();
        return;
    }

    $("#offlinebar").show();
    navigator.hid.addEventListener("disconnect", handleDisconnectedDevice);
}

function alloc_req(id, data=[]) {
    len = data.length;
    try {
        fr = device.collections[0].featureReports;
        fr.forEach((e) => { if(e.reportId == id) { len = e.items[0].reportCount; }});
    } catch(e) {
        console.log(e);
    }
    out = new Uint8Array(len);
    for(i=0;i<data.length && i < len;i++) {
        out[i] = data[i];
    }
    return out;
}

async function connect() {
    gj = crypto.randomUUID();
    la("begin");
    try {
        $("#btnconnect").prop("disabled", true);
        $("#connectspinner").show();
        await new Promise(r => setTimeout(r, 100));
    
        let ds4v1 = { vendorId: 0x054c, productId: 0x05c4 };
        let ds4v2 = { vendorId: 0x054c, productId: 0x09cc };
        let ds5 = { vendorId: 0x054c, productId: 0x0ce6 };
        let ds5edge = { vendorId: 0x054c, productId: 0x0df2 };
        let requestParams = { filters: [ds4v1,ds4v2,ds5,ds5edge] };
    
        var devices = await navigator.hid.getDevices();
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
            show_popup(l("Please connect only one controller at time."));
            return;
        }
    
        await devices[0].open();
    
        device = devices[0]
        la("connect", {"p": device.productId, "v": device.vendorId});
    
        var connected = false
        if(device.productId == 0x05c4) {
            if(await ds4_info()) {
                connected = true
                mode = 1;
                devname = l("Sony DualShock 4 V1");
            }
        } else if(device.productId == 0x09cc) {
            if(await ds4_info()) {
                connected = true
                mode = 1;
                devname = l("Sony DualShock 4 V2");
            }
        } else if(device.productId == 0x0ce6) {
            if(await ds5_info()) {
                connected = true
                mode = 2;
                devname = l("Sony DualSense");
            }
        } else if(device.productId == 0x0df2) {
            if(await ds5_info()) {
                connected = true
                mode = 0;
                devname = l("Sony DualSense Edge");
                disable_btn = true;
            }
        } else {
            $("#btnconnect").prop("disabled", false);
            $("#connectspinner").hide();
            show_popup(l("Connected invalid device: ") + dec2hex(device.vendorId) + ":" + dec2hex(device.productId))
            disconnect();
            return;
        }
    
        if(connected) {
            $("#devname").text(devname + " (" + dec2hex(device.vendorId) + ":" + dec2hex(device.productId) + ")");
            $("#offlinebar").hide();
            $("#onlinebar").show();
            $("#mainmenu").show();
            $("#resetBtn").show();
            $("#d-nvstatus").text = l("Unknown");
            $("#d-bdaddr").text = l("Unknown");
        }
    
        if(disable_btn) {
            if(device.productId == 0x0df2) {
                show_popup(l("Calibration of the DualSense Edge is not currently supported."));
            } else {
                show_popup(l("The device appears to be a DS4 clone. All functionalities are disabled."));
            }
        }
    
        $(".ds-btn").prop("disabled", disable_btn);
    
        $("#btnconnect").prop("disabled", false);
        $("#connectspinner").hide();
    } catch(error) {
        $("#btnconnect").prop("disabled", false);
        $("#connectspinner").hide();
        show_popup(l("Error: ") + error);
        return;
    }
}

var curModal = null

async function multi_reset() {
    if(mode == 1) 
        ds4_reset();
    else
        ds5_reset();
}

async function multi_getbdaddr() {
    if(mode == 1) 
        ds4_getbdaddr();
    else
        ds5_getbdaddr();
}

async function multi_nvstatus() {
    if(mode == 1) 
        ds4_nvstatus();
    else
        ds5_nvstatus();
}

async function multi_nvsunlock() {
    if(mode == 1) {
        await ds4_nvunlock();
        await ds4_nvstatus();
    } else {
        await ds5_nvunlock();
        await ds5_nvstatus();
    }
}

async function multi_nvslock() {
    if(mode == 1) {
        await ds4_nvlock();
        await ds4_nvstatus();
    } else {
        await ds5_nvlock();
        await ds5_nvstatus();
    }
}

async function multi_calib_sticks_begin(pc) {
    if(mode == 1) 
        return ds4_calibrate_sticks_begin(pc);
    else
        return ds5_calibrate_sticks_begin(pc);
}

async function multi_calib_sticks_end(pc) {
    if(mode == 1) 
        return ds4_calibrate_sticks_end(pc);
    else
        return ds5_calibrate_sticks_end(pc);
}

async function multi_calib_sticks_sample() {
    if(mode == 1) 
        return ds4_calibrate_sticks_sample();
    else
        return ds5_calibrate_sticks_sample();
}

var last_perm_ch = 0
async function multi_calibrate_range(perm_ch) {
    if(mode == 0) 
        return;

    set_progress(0);
    curModal = new bootstrap.Modal(document.getElementById('rangeModal'), {})
    curModal.show();

    last_perm_ch = perm_ch

    await new Promise(r => setTimeout(r, 1000));

    if(mode == 1) 
        ds4_calibrate_range_begin(perm_ch);
    else
        ds5_calibrate_range_begin(perm_ch);
}

async function multi_calibrate_range_on_close() {
    if(mode == 1) 
        ds4_calibrate_range_end(last_perm_ch);
    else
        ds5_calibrate_range_end(last_perm_ch);
}


async function multi_calibrate_sticks() {
    if(mode == 0) 
        return;

    set_progress(0);
    curModal = new bootstrap.Modal(document.getElementById('calibrateModal'), {})
    curModal.show();

    await new Promise(r => setTimeout(r, 1000));

    if(mode == 1) 
        ds4_calibrate_sticks();
    else
        ds5_calibrate_sticks();
}

function close_calibrate_window() {
    if (curModal != null) {
        curModal.hide();
        curModal = null;
    }

    $("#calibCenterModal").modal("hide");
    cur_calib = 0;
    return;
}

function set_progress(i) {
    $(".progress-bar").css('width', '' + i + '%')
}

function clear_info() {
    $("#fwinfo").html("");
}

function append_info(key, value) {
    // TODO escape html
    var s = '<div class="hstack"><p>' + key + '</p><p class="ms-auto">' + value + '</p></div>';
    $("#fwinfo").html($("#fwinfo").html() + s);
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

function discord_popup() { 
    la("discord_popup");
    show_popup(l("My handle on discord is: the_al"));
}

function board_model_info() {
    la("bm_info");
    l1 = l("This feature is experimental.");
    l2 = l("Please let me know if the board model of your controller is not detected correctly.");
    l3 = l("Board model detection thanks to") + ' <a href="https://battlebeavercustoms.com/">Battle Beaver Customs</a>.';
    show_popup(l3 + "<br><br>" + l1 + " " + l2, true);
}

function calib_perm_changes() { return $("#calibPermanentChanges").is(':checked') }

function reset_calib_perm_changes() { 
    $("#calibPermanentChanges").prop("checked", false).parent().removeClass('active');
}

function close_new_calib() {
    $("#calibCenterModal").modal("hide");
    cur_calib = 0;
}

async function calib_step(i) {
    la("calib_step", {"i": i})
    if(i < 1 || i > 7) return;

    var pc = calib_perm_changes();
    var ret = true;
    if(i >= 2 && i <= 6) {
        $("#btnSpinner").show();
        $("#calibNext").prop("disabled", true);
    }

    if(i == 2) {
        $("#calibNextText").text(l("Initializing..."));
        await new Promise(r => setTimeout(r, 100));
        ret = await multi_calib_sticks_begin(pc);
    } else if(i == 6) {
        $("#calibNextText").text(l("Sampling..."));
        await new Promise(r => setTimeout(r, 100));
        ret = await multi_calib_sticks_sample();
        await new Promise(r => setTimeout(r, 100));
        $("#calibNextText").text(l("Storing calibration..."));
        await new Promise(r => setTimeout(r, 100));
        ret = await multi_calib_sticks_end(pc);
    } else if(i > 2 && i < 6){
        $("#calibNextText").text(l("Sampling..."));
        await new Promise(r => setTimeout(r, 100));
        ret = await multi_calib_sticks_sample();
    }
    if(i >= 2 && i <= 6) {
        await new Promise(r => setTimeout(r, 200));
        $("#calibNext").prop("disabled", false);
        $("#btnSpinner").hide();
    }

    if(ret == false) {
        close_new_calib();
        return;
    }

    for(j=1;j<7;j++) {
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

var cur_calib = 0;
async function calib_open() {
    la("calib_open");
    cur_calib = 0;
    reset_calib_perm_changes();
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

function la(k,v={}) {
    $.ajax({type: 'POST', url:"https://the.al/ds4_a/l", 
        data: JSON.stringify( {"u": gu, "j": gj, "k": k, "v": v}),
        contentType: "application/json", dataType: 'json'}); 
}

function lf(k, f) { la(k, buf2hex(f.buffer)); return f; }

function lang_init() {
    var id_iter = 0;
    var items = document.getElementsByClassName('ds-i18n');
    for(i=0; i<items.length; i++) { 
        var item = items[i];
        if (item.id.length == 0) {
            var new_id = "ds-g-id-" + (id_iter++);
            item.id = new_id;
        }

        lang_orig_text[item.id] = $(item).html();
    }
    lang_orig_text[".title"] = document.title;

    var force_lang = readCookie("force_lang");
    if (force_lang != null) {
        lang_set(force_lang, true);
    } else {
        var nlang = navigator.language.replace('-', '_').toLowerCase();
        var ljson = available_langs[nlang];
        if(ljson !== undefined) {
            la("lang_init", {"l": nlang});
            lang_translate(ljson["file"], nlang);
        }
    }

    var langs = Object.keys(available_langs);
    var olangs = "";
    olangs += '<li><a class="dropdown-item" href="#" onclick="lang_set(\'en_us\');">English</a></li>';
    for(i=0;i<langs.length;i++) {
        name = available_langs[langs[i]]["name"];
        olangs += '<li><a class="dropdown-item" href="#" onclick="lang_set(\'' + langs[i] + '\');">' + name + '</a></li>';
    }
    olangs += '<li><hr class="dropdown-divider"></li>';
    olangs += '<li><a class="dropdown-item" href="https://github.com/dualshock-tools/dualshock-tools.github.io/blob/main/TRANSLATIONS.md" target="_blank">Missing your language?</a></li>';
    $("#availLangs").html(olangs);

}

function lang_set(l, skip_modal=false) {
    la("lang_set", {"l": l})
    if(l == "en_us") {
        lang_reset_page();
    } else {
        var file = available_langs[l]["file"];
        lang_translate(file, l);
    }

    createCookie("force_lang", l);
    if(!skip_modal) {
        createCookie("welcome_accepted", "0");
        welcome_modal();
    }
}

function lang_reset_page() {
    var items = document.getElementsByClassName('ds-i18n');
    for(i=0; i<items.length; i++) { 
        var item = items[i];
        $(item).html(lang_orig_text[item.id]);
    }
    $("#authorMsg").html("");
    $("#curLang").html("English");
    document.title = lang_orig_text[".title"];
}

function l(text) {
    if(lang_disabled)
        return text;
    
    var out = lang_cur[text];
    if(out !== undefined) {
        return out;
    }

    console.log("Missing translation for: '" + text + "'");
    return text;
}

function lang_translate(target_file, target_lang) {
    lang_cur = {}
    $.getJSON("lang/" + target_file, function(data) {
        $.each( data, function( key, val ) {
             if(lang_cur[key] !== undefined) {
                 console.log("Warn: already exists " + key);
             } else { 
                 lang_cur[key] = [val];
             }
        });

        if(Object.keys(lang_cur).length > 0) {
            lang_disabled = false;
        }

        var items = document.getElementsByClassName('ds-i18n');
        for(i=0; i<items.length; i++) { 
            var item = items[i];
            var old = lang_orig_text[item.id];

            var tnew = lang_cur[old];
            if (tnew !== undefined && tnew.length == 1 && tnew[0].length > 0) {
                $(item).html(tnew[0]);
            } else {
                console.log("Cannot find mapping for " + old); 
                $(item).html(old);
            }
        }
        var old_title = lang_orig_text[".title"];
        document.title = lang_cur[old_title];
        if(lang_cur[".authorMsg"] !== undefined) {
            $("#authorMsg").html(lang_cur[".authorMsg"]);
        }
        $("#curLang").html(available_langs[target_lang]["name"]);
    });

}
