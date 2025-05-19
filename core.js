var device = null;
var devname = "";
var mode = 0;

// bitmask: 1: clone, 2: update ds5 firmware, 4: battery low, 8: ds-edge not supported
var disable_btn = 0;
var last_disable_btn = 0;

// 1 if there is any change that can be stored permanently
var has_changes_to_write = 0;

var lang_orig_text = {};
var lang_cur = {};
var lang_disabled = true;
var lang_cur_direction = "ltr";
var gj = 0;
var gu = 0;

// DS5 finetuning
var finetune_original_data = []
var last_written_finetune_data = []
var finetune_visible = false
var on_finetune_updating = false


// Alphabetical order
var available_langs = {
    "ar_ar": { "name": "العربية", "file": "ar_ar.json", "direction": "rtl"},
    "bg_bg": { "name": "Български", "file": "bg_bg.json", "direction": "ltr"},
    "cz_cz": { "name": "Čeština", "file": "cz_cz.json", "direction": "ltr"},
    "de_de": { "name": "Deutsch", "file": "de_de.json", "direction": "ltr"},
    "es_es": { "name": "Español", "file": "es_es.json", "direction": "ltr"},
    "fr_fr": { "name": "Français", "file": "fr_fr.json", "direction": "ltr"},
    "hu_hu": { "name": "Magyar", "file": "hu_hu.json", "direction": "ltr"},
    "it_it": { "name": "Italiano", "file": "it_it.json", "direction": "ltr"},
    "jp_jp": { "name": "日本語", "file": "jp_jp.json", "direction": "ltr"},
    "ko_kr": { "name": "한국어", "file": "ko_kr.json", "direction": "ltr"},
    "nl_nl": { "name": "Nederlands", "file": "nl_nl.json", "direction": "ltr"},
    "pl_pl": { "name": "Polski", "file": "pl_pl.json", "direction": "ltr"},
    "pt_br": { "name": "Português do Brasil", "file": "pt_br.json", "direction": "ltr"},
    "pt_pt": { "name": "Português", "file": "pt_pt.json", "direction": "ltr"},
    "rs_rs": { "name": "Srpski", "file": "rs_rs.json", "direction": "ltr"},
    "ru_ru": { "name": "Русский", "file": "ru_ru.json", "direction": "ltr"},
    "tr_tr": { "name": "Türkçe", "file": "tr_tr.json", "direction": "ltr"},
    "ua_ua": { "name": "Українська", "file": "ua_ua.json", "direction": "ltr"},
    "zh_cn": { "name": "中文", "file": "zh_cn.json", "direction": "ltr"},
    "zh_tw": { "name": "中文(繁)", "file": "zh_tw.json", "direction": "ltr"}
};

function buf2hex(buffer) {
  return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')) .join('');
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
    } else if(a == 0x07 || a == 0x08) {
        return "BDM-050";
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
    } else if(a >= 0x64 && a <= 0x74) {
        return "JDM-040";
    } else if((a > 0x80 && a < 0x84) || a == 0x93) {
        return "JDM-020";
    } else if(a == 0xa4 || a == 0x90 || a == 0xa0) {
        return "JDM-050";
    } else if(a == 0xb0) {
        return "JDM-055 (Scuf?)";
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
    b = a >> 4;
    return ((b == 7 && a > 0x74) || (b == 9 && a != 0x93 && a != 0x90));
}

async function ds4_info() {
    try {
        var ooc = l("unknown");
        var is_clone = false;

        const view = lf("ds4_info", await device.receiveFeatureReport(0xa3));

        var cmd = view.getUint8(0, true);

        if(cmd != 0xa3 || view.buffer.byteLength < 49) {
            if(view.buffer.byteLength != 49) {
                ooc = l("clone");
                is_clone = true;
            }
        }

        var k1 = new TextDecoder().decode(view.buffer.slice(1, 0x10));
        var k2 = new TextDecoder().decode(view.buffer.slice(0x10, 0x20));
        k1=k1.replace(/\0/g, '');
        k2=k2.replace(/\0/g, '');

        var hw_ver_major= view.getUint16(0x21, true)
        var hw_ver_minor= view.getUint16(0x23, true)
        var sw_ver_major= view.getUint32(0x25, true)
        var sw_ver_minor= view.getUint16(0x25+4, true)
        try {
            if(!is_clone) {
                const view = await device.receiveFeatureReport(0x81);
                ooc = l("original");
            }
        } catch(e) {
            la("clone");
            is_clone = true;
            ooc = "<font color='red'><b>" + l("clone") + "</b></font>";
            disable_btn |= 1;
        }

        clear_info();
        append_info(l("Build Date"), k1 + " " + k2);
        append_info(l("HW Version"), "" + dec2hex(hw_ver_major) + ":" + dec2hex(hw_ver_minor));
        append_info(l("SW Version"), dec2hex32(sw_ver_major) + ":" + dec2hex(sw_ver_minor));
        append_info(l("Device Type"), ooc);
        if(!is_clone) {
            b_info = '&nbsp;<a class="link-body-emphasis" href="#" onclick="board_model_info()">' + 
                    '<svg class="bi" width="1.3em" height="1.3em"><use xlink:href="#info"/></svg></a>';
            append_info(l("Board Model"), ds4_hw_to_bm(hw_ver_minor) + b_info);

            // All ok, safe to lock NVS, query it and get BD Addr
            nvstatus = await ds4_nvstatus();

            if(nvstatus == 0)
                await ds4_nvlock();
            bd_addr = await ds4_getbdaddr();
            append_info(l("Bluetooth Address"), bd_addr);

            if(is_rare(hw_ver_minor)) {
                show_popup("Wow, this is a rare/weird controller! Please write me an email at ds4@the.al or contact me on Discord (the_al)");
            }
        }
    } catch(e) {
        ooc = "<font color='red'><b>" + l("clone") + "</b></font>";
        disable_btn |= 1;
    }
    return true;
}

async function ds4_flash() {
    la("ds4_flash");
    try {
        await ds4_nvunlock();
        await ds4_nvlock();

        show_popup(l("Changes saved successfully"));

    } catch(error) {
        show_popup(l("Error while saving changes:") + " " + str(error));
    }
}

async function ds5_flash() {
    la("ds5_flash");
    try {
        await ds5_nvunlock();
        await ds5_nvlock();

        show_popup(l("Changes saved successfully"));
    } catch(error) {
        show_popup(l("Error while saving changes: ") + toString(error));
    }
}

async function ds5_edge_flash() {
    la("ds5_edge_flash");
    try {
        ret = await ds5_edge_flash_modules();
        if(ret) {
            show_popup("<b>" + l("Changes saved successfully") + "</b>.<br><br>" + l("If the calibration is not stored permanently, please double-check the wirings of the hardware mod."), true);
        }
    } catch(error) {
        show_popup(l("Error while saving changes: ") + toString(error));
    }
}

async function ds4_reset() {
    la("ds4_reset");
    try {
        await device.sendFeatureReport(0xa0, alloc_req(0xa0, [4,1,0]))
    } catch(error) {
    }
}

async function ds5_reset() {
    la("ds5_reset");
    try {
        await device.sendFeatureReport(0x80, alloc_req(0x80, [1,1]))
    } catch(error) {
    }
}

async function ds4_calibrate_range_begin() {
    la("ds4_calibrate_range_begin");
    var err = l("Range calibration failed: ");
    try {
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

async function ds4_calibrate_range_end() {
    la("ds4_calibrate_range_end");
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
    
        update_nvs_changes_status(1);
        close_calibrate_window();
        show_popup(l("Range calibration completed"));
    } catch(e) {
        la("ds4_calibrate_range_end_failed", {"r": e});
        await new Promise(r => setTimeout(r, 500));
        close_calibrate_window();
        return show_popup(err + e);
    }
}

async function ds4_calibrate_sticks_begin() {
    la("ds4_calibrate_sticks_begin");
    var err = l("Stick calibration failed: ");
    try {
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

async function ds4_calibrate_sticks_end() {
    la("ds4_calibrate_sticks_end");
    var err = l("Stick calibration failed: ");
    try {
        // Write
        await device.sendFeatureReport(0x90, alloc_req(0x90, [2,1,1]))

        data = await device.receiveFeatureReport(0x91);
        data2 = await device.receiveFeatureReport(0x92);
        if(data.getUint32(0, false) != 0x91010102 || data2.getUint32(0, false) != 0x92010101) {
            d1 = dec2hex32(data.getUint32(0, false));
            d2 = dec2hex32(data2.getUint32(0, false));
            la("ds4_calibrate_sticks_end_failed", {"d1": d1, "d2": d2});
            show_popup(err + l("Error 3") + " (" + d1 + ", " + d2 + " at i=" + i + ")");
            return false;
        }

        update_nvs_changes_status(1);
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
    try {
        await device.sendFeatureReport(0x08, alloc_req(0x08, [0xff,0, 12]))
        data = lf("ds4_nvstatus", await device.receiveFeatureReport(0x11))
        // 1: temporary, 0: permanent
        ret = data.getUint8(1, false);
        if(ret == 1) {
            $("#d-nvstatus").html("<font color='green'>" + l("locked") + "</font>");
            return 1;
        } else if(ret == 0) {
            $("#d-nvstatus").html("<font color='red'>" + l("unlocked") + "</font>");
            return 0;
        } else {
            $("#d-nvstatus").html("<font color='purple'>unk " + ret + "</font>");
            if(ret == 0 || ret == 1)
                return 2;
            return ret;
        }
        return ret;
    } catch(e) {
        $("#d-nvstatus").html("<font color='red'>" + l("error") + "</font>");
        return 2; // error
    }
}

async function ds5_nvstatus() {
    try {
        await device.sendFeatureReport(0x80, alloc_req(0x80, [3,3]))
        data = lf("ds5_nvstatus", await device.receiveFeatureReport(0x81))
        ret = data.getUint32(1, false);
        if(ret == 0x15010100) {
            return 4;
        }
        if(ret == 0x03030201) {
            $("#d-nvstatus").html("<font color='green'>" + l("locked") + "</font>");
            return 1; // temporary
        } else if(ret == 0x03030200) {
            $("#d-nvstatus").html("<font color='red'>" + l("unlocked") + "</font>");
            return 0; // permanent
        } else {
            $("#d-nvstatus").html("<font color='purple'>unk " + dec2hex32(ret) + "</font>");
            if(ret == 0 || ret == 1)
                return 2;
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
            out += dec2hex8(data.getUint8(6-i, false));
        }
        return out;
    } catch(e) {
        return "error";
    }
}

async function ds5_edge_get_barcode() {
    try {
        await device.sendFeatureReport(0x80, alloc_req(0x80, [21,34]));
        await new Promise(r => setTimeout(r, 100));

        data = lf("ds5_edge_get_barcode", await device.receiveFeatureReport(0x81));
        td = new TextDecoder()

        r_bc = td.decode(data.buffer.slice(21, 21+17));
        l_bc = td.decode(data.buffer.slice(40, 40+17));
        return [r_bc, l_bc];
    } catch(e) {
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
        return out;
    } catch(e) {
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

async function ds5_system_info(base, num, length, decode = true) {
    await device.sendFeatureReport(128, alloc_req(128, [base,num]))
    var pcba_id = lf("ds5_pcba_id", await device.receiveFeatureReport(129));
    if(pcba_id.getUint8(1) != base || pcba_id.getUint8(2) != num || pcba_id.getUint8(3) != 2) {
        return l("error");
    } else {
        if(decode)
            return new TextDecoder().decode(pcba_id.buffer.slice(4, 4+length));
        else
            return buf2hex(pcba_id.buffer.slice(4, 4+length));
    }
    return l("Unknown");
}

function ds5_edge_color(x) {
    const colorMap = {
        '00' : 'White',
        '01' : 'Black',
        '02' : 'Cosmic Red',
        '03' : 'Nova Pink',
        '04' : 'Galactic Purple',
        '05' : 'Starlight Blue',
        '06' : 'Gray Camo',
        '07' : 'Volcanic Red',
        '08' : 'Sterling Silver',
        '09' : 'Chroma Indigo',
        '30' : '30Th Anniversary',
        'Z1' : 'God of War Ragnarok',
        'Z3' : 'Astro Bot'
    };

    const colorCode = x.slice(4, 6);
    const colorName = colorMap[colorCode] || 'Unknown';
    return colorName;
}


async function ds5_info(is_edge) {
    try {
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
        var unk        = view.getUint8(46, true);

        var fwversion1 = view.getUint32(48, true);
        var fwversion2 = view.getUint32(52, true);
        var fwversion3 = view.getUint32(56, true);

        clear_info();

        b_info = '&nbsp;<a class="link-body-emphasis" href="#" onclick="board_model_info()">' + 
                '<svg class="bi" width="1.3em" height="1.3em"><use xlink:href="#info"/></svg></a>';
        c_info = '&nbsp;<a class="link-body-emphasis" href="#" onclick="edge_color_info()">' + 
                 '<svg class="bi" width="1.3em" height="1.3em"><use xlink:href="#info"/></svg></a>';

        serial_number = await ds5_system_info(1, 19, 17);
        append_info(l("Serial Number"), serial_number, "hw");
        append_info_extra(l("MCU Unique ID"), await ds5_system_info(1, 9, 9, false), "hw");
        append_info_extra(l("PCBA ID"), await ds5_system_info(1, 17, 14), "hw");
        append_info_extra(l("Battery Barcode"), await ds5_system_info(1, 24, 23), "hw");
        append_info_extra(l("VCM Left Barcode"), await ds5_system_info(1, 26, 16), "hw");
        append_info_extra(l("VCM Right Barcode"), await ds5_system_info(1, 28, 16), "hw");

        if(is_edge) {
            color = ds5_edge_color(serial_number);
            append_info(l("Color"), color + c_info, "hw");
        } else {
            append_info(l("Board Model"), ds5_hw_to_bm(hwinfo) + b_info, "hw");
        }

        append_info(l("FW Build Date"), build_date + " " + build_time, "fw");
        append_info_extra(l("FW Type"), "0x" + dec2hex(fwtype), "fw");
        append_info_extra(l("FW Series"), "0x" + dec2hex(swseries), "fw");
        append_info_extra(l("HW Model"), "0x" + dec2hex32(hwinfo), "hw");
        append_info(l("FW Version"), "0x" + dec2hex32(fwversion), "fw");
        append_info(l("FW Update"), "0x" + dec2hex(updversion), "fw");
        append_info_extra(l("FW Update Info"), "0x" + dec2hex8(unk), "fw");
        append_info_extra(l("SBL FW Version"), "0x" + dec2hex32(fwversion1), "fw");
        append_info_extra(l("Venom FW Version"), "0x" + dec2hex32(fwversion2), "fw");
        append_info_extra(l("Spider FW Version"), "0x" + dec2hex32(fwversion3), "fw");

        append_info_extra(l("Touchpad ID"), await ds5_system_info(5, 2, 8, false), "hw");
        append_info_extra(l("Touchpad FW Version"), await ds5_system_info(5, 4, 8, false), "fw");

        old_controller = build_date.search(/ 2020| 2021/);
        if(old_controller != -1) {
            la("ds5_info_error", {"r": "old"})
            disable_btn |= 2;
            return true;
        }

        nvstatus = await ds5_nvstatus();
        if(nvstatus == 0)
            await ds5_nvlock();

        bd_addr = await ds5_getbdaddr();
        append_info(l("Bluetooth Address"), bd_addr, "hw");
    } catch(e) {
        la("ds5_info_error", {"r": e})
        show_popup(l("Cannot read controller information"));
        return false;
    }
    return true;
}

async function ds5_load_modules_info() {
    empty = '\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
    // DS Edge
    sticks_barcode = await ds5_edge_get_barcode();
    for(i=0;i<2;i++) {
        if(sticks_barcode[i] == empty)
            sticks_barcode[i] = l("Unknown")
    }
    append_info(l("Left Module Barcode"), sticks_barcode[1], "fw");
    append_info(l("Right Module Barcode"), sticks_barcode[0], "fw");
}

async function ds5_calibrate_sticks_begin() {
    la("ds5_calibrate_sticks_begin");
    var err = l("Range calibration failed: ");
    try {
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

async function ds5_calibrate_sticks_end() {
    la("ds5_calibrate_sticks_end");
    var err = l("Stick calibration failed: ");
    try {
        // Write
        await device.sendFeatureReport(0x82, alloc_req(0x82, [2,1,1]))

        data = await device.receiveFeatureReport(0x83)
        
        if(mode == 2) {
            if(data.getUint32(0, false) != 0x83010102) {
                d1 = dec2hex32(data.getUint32(0, false));
                la("ds5_calibrate_sticks_failed", {"s": 3, "d1": d1});
                close_calibrate_window();
                return show_popup(err + l("Error 3") + " (" + d1 + ").");
            }
        } else if(mode == 3) {
            if(data.getUint32(0, false) != 0x83010101) {
                d1 = dec2hex32(data.getUint32(0, false));
                la("ds5_calibrate_sticks_failed", {"s": 3, "d1": d1});
                close_calibrate_window();
                return show_popup(err + l("Error 4") + " (" + d1 + ").");
            }

            await device.sendFeatureReport(0x82, alloc_req(0x82, [2,1,1]))
            data = await device.receiveFeatureReport(0x83)
            if(data.getUint32(0, false) != 0x83010103 && data.getUint32(0, false) != 0x83010312) {
                d1 = dec2hex32(data.getUint32(0, false));
                la("ds5_calibrate_sticks_failed", {"s": 3, "d1": d1});
                close_calibrate_window();
                return show_popup(err + l("Error 5") + " (" + d1 + ").");
            }
        }

        update_nvs_changes_status(1);
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

        if(mode == 2) {
            if(data.getUint32(0, false) != 0x83010102) {
                d1 = dec2hex32(data.getUint32(0, false));
                la("ds5_calibrate_sticks_failed", {"s": 3, "d1": d1});
                close_calibrate_window();
                return show_popup(err + l("Error 3") + " (" + d1 + ").");
            }
        } else if(mode == 3) {
            if(data.getUint32(0, false) != 0x83010101) {
                d1 = dec2hex32(data.getUint32(0, false));
                la("ds5_calibrate_sticks_failed", {"s": 3, "d1": d1});
                close_calibrate_window();
                return show_popup(err + l("Error 4") + " (" + d1 + ").");
            }

            await device.sendFeatureReport(0x82, alloc_req(0x82, [2,1,1]))
            data = await device.receiveFeatureReport(0x83)
            if(data.getUint32(0, false) != 0x83010103) {
                d1 = dec2hex32(data.getUint32(0, false));
                la("ds5_calibrate_sticks_failed", {"s": 3, "d1": d1});
                close_calibrate_window();
                return show_popup(err + l("Error 5") + " (" + d1 + ").");
            }

        }
    
        set_progress(100);
        update_nvs_changes_status(1);
        
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

async function ds5_calibrate_range_begin() {
    la("ds5_calibrate_range_begin");
    var err = l("Range calibration failed: ");
    try {
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

async function ds5_calibrate_range_end() {
    la("ds5_calibrate_range_end");
    var err = l("Range calibration failed: ");
    try {
        // Write
        await device.sendFeatureReport(0x82, alloc_req(0x82, [2,1,2]))
    
        // Assert
        data = await device.receiveFeatureReport(0x83)

        if(mode == 2) {
            if(data.getUint32(0, false) != 0x83010202) {
                d1 = dec2hex32(data.getUint32(0, false));
                la("ds5_calibrate_range_end_failed", {"d1": d1});
                close_calibrate_window();
                return show_popup(err + l("Error 3") + " (" + d1 + ").");
            }
        } else {
            if(data.getUint32(0, false) != 0x83010201) {
                d1 = dec2hex32(data.getUint32(0, false));
                la("ds5_calibrate_range_end_failed", {"d1": d1});
                close_calibrate_window();
                return show_popup(err + l("Error 4") + " (" + d1 + ").");
            }

            await device.sendFeatureReport(0x82, alloc_req(0x82, [2,1,2]))
            data = await device.receiveFeatureReport(0x83)
            if(data.getUint32(0, false) != 0x83010203) {
                d1 = dec2hex32(data.getUint32(0, false));
                la("ds5_calibrate_range_end_failed", {"d1": d1});
                close_calibrate_window();
                return show_popup(err + l("Error 5") + " (" + d1 + ").");
            }
        }
    
        update_nvs_changes_status(1);
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
        data = await device.receiveFeatureReport(0x81)
    } catch(e) {
        await new Promise(r => setTimeout(r, 500));
        close_calibrate_window();
        return show_popup(l("NVS Lock failed: ") + e);
    }
}

async function wait_until_written(expected) {
    for(it=0;it<10;it++) {
        data = await device.receiveFeatureReport(0x81)

        again = false
        for(i=0;i<expected.length;i++) {
            if(data.getUint8(1+i, true) != expected[i]) {
                again = true;
                break;
            }
        }
        if(!again) {
            return true;
        }
        await new Promise(r => setTimeout(r, 50));
    }
    return false;
}

function set_edge_progress(score) {
    $("#dsedge-progress").css({ "width": score + "%" })
}

async function ds5_edge_unlock_module(i) {
    m_name = i == 0 ? "left module" : "right module";

    await device.sendFeatureReport(0x80, alloc_req(0x80, [21, 6, i, 11]))
    await new Promise(r => setTimeout(r, 200));
    ret = await wait_until_written([21, 6, 2])
    if(!ret) {
        throw new Error(l("Cannot unlock") + " " + l(m_name));
    }
}

async function ds5_edge_lock_module(i) {
    m_name = i == 0 ? "left module" : "right module";

    await device.sendFeatureReport(0x80, alloc_req(0x80, [21, 4, i, 8]))
    await new Promise(r => setTimeout(r, 200));
    ret = await wait_until_written([21, 4, 2])
    if(!ret) {
        throw new Error(l("Cannot lock") + " " + l(m_name));
    }
}

async function ds5_edge_store_data_into(i) {
    m_name = i == 0 ? "left module" : "right module";

    await device.sendFeatureReport(0x80, alloc_req(0x80, [21, 5, i]))
    await new Promise(r => setTimeout(r, 200));
    ret = await wait_until_written([21, 5, 2])
    if(!ret) {
        throw new Error(l("Cannot store data into") + " " + l(m_name));
    }
}


async function ds5_edge_flash_modules() {
    la("ds5_edge_flash_modules");
    var modal = null;

    if (device == null)
        return;

    try {
        modal = new bootstrap.Modal(document.getElementById('edgeProgressModal'), {})
        modal.show();
        set_edge_progress(0);

        // Reload data, this ensures correctly writing data in the controller
        await new Promise(r => setTimeout(r, 100));
        set_edge_progress(10);

        // Unlock modules
        await ds5_edge_unlock_module(0);
        set_edge_progress(15);
        await ds5_edge_unlock_module(1);
        set_edge_progress(30);

        // Unlock NVS
        await ds5_nvunlock()
        await new Promise(r => setTimeout(r, 50));
        set_edge_progress(45);

        // This should trigger write into modules
        data = await ds5_get_inmemory_module_data()
        await new Promise(r => setTimeout(r, 50));
        set_edge_progress(60);
        await write_finetune_data(data)

        // Extra delay
        await new Promise(r => setTimeout(r, 100));

        // Lock back modules
        await ds5_edge_lock_module(0);
        set_edge_progress(80);
        await ds5_edge_lock_module(1);
        set_edge_progress(100);

        // Lock back NVS
        await new Promise(r => setTimeout(r, 100));
        await ds5_nvlock()

        await new Promise(r => setTimeout(r, 250));
        modal.hide();
        modal = null;
        await new Promise(r => setTimeout(r, 300));

        return true;
    } catch(e) {
        modal.hide();
        modal = null;
        await new Promise(r => setTimeout(r, 500));
        show_popup("Error: " + e);
        return false;
    }
}

async function ds5_nvunlock() {
    la("ds5_nvunlock");
    try {
        await device.sendFeatureReport(0x80, alloc_req(0x80, [3,2, 101, 50, 64, 12]))
        data = await device.receiveFeatureReport(0x81)
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
    update_nvs_changes_status(0);
    mode = 0;
    device.close();
    device = null;
    disable_btn = 0;
    reset_circularity();
    $("#offlinebar").show();
    $("#onlinebar").hide();
    $("#mainmenu").hide();
    $("#d-nvstatus").text = l("Unknown");
    $("#d-bdaddr").text = l("Unknown");
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
    $("#infoshowall").hide();
    window.addEventListener('DOMContentLoaded', function() {
        lang_init();
        welcome_modal();
        $("#checkCircularity").on('change', on_circ_check_change);
        on_circ_check_change();
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

async function on_finetune_change(x) {
    list = ["LL", "LT", "RL", "RT", "LR", "LB", "RR", "RB", "LX", "LY", "RX", "RY"]
    
    out=[]
    for(i=0;i<12;i++) {
        v = $("#finetune" + list[i]).val()
        out.push(parseInt(v))
    }
    await write_finetune_data(out)
}

async function ds5_finetune() {
    // Lock NVS before
    nvs = await ds5_nvstatus();
    if(nvs == 0) {
        await ds5_nvlock();
        nvs = await ds5_nvstatus();
        if(nvs != 1) {
            show_popup("ERROR: Cannot lock NVS (" + nvs + ")");
            return;
        }
    } else if(nvs != 1) {
        show_popup("ERROR: Cannot read NVS status. Finetuning is not safe on this device.");
    }

    data = await read_finetune_data();
    if (data == null)
        return;

    curModal = new bootstrap.Modal(document.getElementById('finetuneModal'), {})
    curModal.show();

    list = ["LL", "LT", "RL", "RT", "LR", "LB", "RR", "RB", "LX", "LY", "RX", "RY"]
    for(i=0;i<12;i++) {
        $("#finetune" + list[i]).attr("value", data[i])
        $("#finetune" + list[i]).on('change', on_finetune_change)
    }

    finetune_original_data = data
    finetune_visible = true

    refresh_finetune()
}

async function ds5_get_inmemory_module_data() {
    if (mode == 2) {
        // DualSense
        await device.sendFeatureReport(0x80, alloc_req(0x80, [12, 2]))
    } else if(mode == 3) {
        // DualSense Edge
        await device.sendFeatureReport(0x80, alloc_req(0x80, [12, 4]))

    }
    await new Promise(r => setTimeout(r, 100));
    var data = await device.receiveFeatureReport(0x81)
    var cmd = data.getUint8(0, true);
    var p1 = data.getUint8(1, true);
    var p2 = data.getUint8(2, true);
    var p3 = data.getUint8(3, true);

    if(cmd != 129 || p1 != 12 || (p2 != 2 && p2 != 4) || p3 != 2)
        return null;

    var out = []
    for(i=0;i<12;i++)
        out.push(data.getUint16(4+i*2, true))
    return out;
}

async function read_finetune_data() {
    data = ds5_get_inmemory_module_data();
    if(data == null) {
        finetune_close();
        show_popup("ERROR: Cannot read calibration data");
        return null;
    }

    last_written_finetune_data = data;
    return data;
}

async function write_finetune_data(data) {
    if (data.length != 12) {
        return;
    }

    if (data == last_written_finetune_data) {
        return;
    }

    last_written_finetune_data = data
    pkg = [12,1]
    for(i=0;i<data.length;i++) {
        x = data[i]
        pkg.push(x & 0xff)
        pkg.push(x >> 8)
    }
    await device.sendFeatureReport(0x80, alloc_req(0x80, pkg))
}

function refresh_finetune() {
    if (!finetune_visible)
        return;
    if (on_finetune_updating)
        return;

    on_finetune_updating = true
    setTimeout(ds5_finetune_update_all, 10);
}

function ds5_finetune_update_all() {
    ds5_finetune_update("finetuneStickCanvasL", last_lx, last_ly)
    ds5_finetune_update("finetuneStickCanvasR", last_rx, last_ry)
}

function ds5_finetune_update(name, plx, ply) {
    on_finetune_updating = false
    var c = document.getElementById(name);
    var ctx = c.getContext("2d");
    var sz = 60;
    var hb = 20 + sz;
    var yb = 15 + sz;
    var w = c.width;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 1;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';

    // Left circle
    ctx.beginPath();
    ctx.arc(hb, yb, sz, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#aaaaaa';
    ctx.beginPath();
    ctx.moveTo(hb-sz, yb);
    ctx.lineTo(hb+sz, yb);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hb, yb-sz);
    ctx.lineTo(hb, yb+sz);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.arc(hb+plx*sz,yb+ply*sz,4, 0, 2*Math.PI);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(hb, yb);
    ctx.lineTo(hb+plx*sz, yb+ply*sz);
    ctx.stroke();

    $("#"+ name + "x-lbl").text(float_to_str(plx));
    $("#"+ name + "y-lbl").text(float_to_str(ply));
}

function finetune_close() {
    $("#finetuneModal").modal("hide");
    finetune_visible = false

    finetune_original_data = []
}

function finetune_save() {
    finetune_close();

    // Unlock button
    update_nvs_changes_status(1);
}

async function finetune_cancel() {
    if(finetune_original_data.length == 12)
        await write_finetune_data(finetune_original_data)

    finetune_close();
}

var last_lx = 0, last_ly = 0, last_rx = 0, last_ry = 0;
var ll_updated = false;

var ll_data=new Array(48);
var rr_data=new Array(48);
var enable_circ_test = false;

function reset_circularity() {
    for(i=0;i<ll_data.length;i++) ll_data[i] = 0;
    for(i=0;i<rr_data.length;i++) rr_data[i] = 0;
    enable_circ_test = false;
    ll_updated = false;
    $("#checkCircularity").prop('checked', false);
    refresh_stick_pos();
}

function refresh_stick_pos() {
    var c = document.getElementById("stickCanvas");
    var ctx = c.getContext("2d");
    var sz = 60;
    var hb = 20 + sz;
    var yb = 15 + sz;
    var w = c.width;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 1;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';

    // Left circle
    ctx.beginPath();
    ctx.arc(hb, yb, sz, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right circle
    ctx.beginPath();
    ctx.arc(w - hb, yb, sz, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    function cc_to_color(cc) {
        var dd = Math.sqrt(Math.pow((1.0 - cc), 2));
        if(cc <= 1.0)
            hh = 220 - 220 * Math.min(1.0, Math.max(0, (dd - 0.05)) / 0.1);
        else
            hh = (245 + (360-245) * Math.min(1.0, Math.max(0, (dd - 0.05)) / 0.15)) % 360;
        return hh;
    }

    if(enable_circ_test) {
        var MAX_N = ll_data.length;

        for(i=0;i<MAX_N;i++) {
            var kd = ll_data[i];
            var kd1 = ll_data[(i+1) % ll_data.length];
            if (kd === undefined || kd1 === undefined) continue;
            var ka = i * Math.PI * 2 / MAX_N;
            var ka1 = ((i+1)%MAX_N) * 2 * Math.PI / MAX_N;

            var kx = Math.cos(ka) * kd;
            var ky = Math.sin(ka) * kd;
            var kx1 = Math.cos(ka1) * kd1;
            var ky1 = Math.sin(ka1) * kd1;

            ctx.beginPath();
            ctx.moveTo(hb, yb);
            ctx.lineTo(hb+kx*sz, yb+ky*sz);
            ctx.lineTo(hb+kx1*sz, yb+ky1*sz);
            ctx.lineTo(hb, yb);
            ctx.closePath();

            var cc = (kd + kd1) / 2;
            var hh = cc_to_color(cc);
            ctx.fillStyle = 'hsla(' + parseInt(hh) + ', 100%, 50%, 0.5)';
            ctx.fill();
        }

        for(i=0;i<MAX_N;i++) {
            var kd = rr_data[i];
            var kd1 = rr_data[(i+1) % rr_data.length];
            if (kd === undefined || kd1 === undefined) continue;
            var ka = i * Math.PI * 2 / MAX_N;
            var ka1 = ((i+1)%MAX_N) * 2 * Math.PI / MAX_N;

            var kx = Math.cos(ka) * kd;
            var ky = Math.sin(ka) * kd;
            var kx1 = Math.cos(ka1) * kd1;
            var ky1 = Math.sin(ka1) * kd1;

            ctx.beginPath();
            ctx.moveTo(w-hb, yb);
            ctx.lineTo(w-hb+kx*sz, yb+ky*sz);
            ctx.lineTo(w-hb+kx1*sz, yb+ky1*sz);
            ctx.lineTo(w-hb, yb);
            ctx.closePath();

            var cc = (kd + kd1) / 2;
            var hh = cc_to_color(cc);
            ctx.fillStyle = 'hsla(' + parseInt(hh) + ', 100%, 50%, 0.5)';
            ctx.fill();
        }
    }

    ctx.strokeStyle = '#aaaaaa';
    ctx.beginPath();
    ctx.moveTo(hb-sz, yb);
    ctx.lineTo(hb+sz, yb);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w-hb-sz, yb);
    ctx.lineTo(w-hb+sz, yb);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hb, yb-sz);
    ctx.lineTo(hb, yb+sz);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w-hb, yb-sz);
    ctx.lineTo(w-hb, yb+sz);
    ctx.closePath();
    ctx.stroke();

    var plx = last_lx;
    var ply = last_ly;
    var prx = last_rx;
    var pry = last_ry;

    if(enable_circ_test) {
        var pld = Math.sqrt(plx*plx + ply*ply);
        var pla = (parseInt(Math.round(Math.atan2(ply, plx) * MAX_N / 2.0 / Math.PI)) + MAX_N) % MAX_N;
        var old = ll_data[pla];
        if(old === undefined) old = 0;
        ll_data[pla] = Math.max(old, pld);

        var prd = Math.sqrt(prx*prx + pry*pry);
        var pra = (parseInt(Math.round(Math.atan2(pry, prx) * MAX_N / 2.0 / Math.PI)) + MAX_N) % MAX_N;
        var old = rr_data[pra];
        if(old === undefined) old = 0;
        rr_data[pra] = Math.max(old, prd);
    }

    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.arc(hb+plx*sz,yb+ply*sz,4, 0, 2*Math.PI);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(hb, yb);
    ctx.lineTo(hb+plx*sz, yb+ply*sz);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w-hb+prx*sz, yb+pry*sz,4, 0, 2*Math.PI);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(w-hb, yb);
    ctx.lineTo(w-hb+prx*sz, yb+pry*sz);
    ctx.stroke();

    var lbl = "", lbx = "";
    $("#lx-lbl").text(float_to_str(plx));
    $("#ly-lbl").text(float_to_str(ply));
    $("#rx-lbl").text(float_to_str(prx));
    $("#ry-lbl").text(float_to_str(pry));

    if(enable_circ_test) {
        var ofl = 0, ofr = 0, lcounter = 0, rcounter = 0;
        ofl = 0; ofr = 0;
        for (i=0;i<ll_data.length;i++) 
            if(ll_data[i] > 0.2) {
                lcounter += 1;
                ofl += Math.pow(ll_data[i] - 1, 2);
            }
        for (i=0;i<rr_data.length;i++) {
            if(rr_data[i] > 0.2) {
                rcounter += 1;
                ofr += Math.pow(rr_data[i] - 1, 2);
            }
        }
        if(lcounter > 0)
            ofl = Math.sqrt(ofl / lcounter) * 100;
        if(rcounter > 0)
            ofr = Math.sqrt(ofr / rcounter) * 100;

        el = ofl.toFixed(2) + "%";
        er = ofr.toFixed(2) + "%";
        $("#el-lbl").text(el);
        $("#er-lbl").text(er);
    }
}

function circ_checked() { return $("#checkCircularity").is(':checked') }

function on_circ_check_change() {
    enable_circ_test = circ_checked();
    for(i=0;i<ll_data.length;i++) ll_data[i] = 0;
    for(i=0;i<rr_data.length;i++) rr_data[i] = 0;

    if(enable_circ_test) {
        $("#circ-data").show();
    } else {
        $("#circ-data").hide();
    }
    refresh_stick_pos();
}

function float_to_str(f) {
    if(f < 0.004 && f >= -0.004) return "+0.00";
    return (f<0?"":"+") + f.toFixed(2);
}

var on_delay = false;

function timeout_ok() {
    on_delay = false;
    if(ll_updated)
        refresh_stick_pos();
}

function refresh_sticks() {
    if(on_delay)
        return;

    refresh_stick_pos();
    on_delay = true;
    setTimeout(timeout_ok, 20);
}

var last_bat_txt = "";
var last_bat_disable = null;

function bat_percent_to_text(bat_charge, is_charging, is_error) {
    var icon_txt = "";

    if(bat_charge < 20) {
        icon_txt = 'fa-battery-empty';
    } else if(bat_charge < 40) {
        icon_txt = 'fa-battery-quarter';
    } else if(bat_charge < 60) {
        icon_txt = 'fa-battery-half';
    } else if(bat_charge < 80) {
        icon_txt = 'fa-battery-three-quarters';
    } else {
        icon_txt = 'fa-battery-full';
    }

    var icon_full = '<i class="fa-solid ' + icon_txt + '"></i>';
    var bolt_txt = '';
    if(is_charging)
        bolt_txt = '<i class="fa-solid fa-bolt"></i>';
    bat_txt = bat_charge + "%" + ' ' + bolt_txt + ' ' + icon_full;

    if(is_error) {
        bat_txt = '<font color="red">' + l("error") + '</font>';
    }
    return bat_txt;
}

function update_nvs_changes_status(new_value) {
    if (new_value == has_changes_to_write)
        return;

    if (new_value == 1) {
        $("#savechanges").prop("disabled", false);
        $("#savechanges").addClass("btn-success").removeClass("btn-outline-secondary");
    } else {
        $("#savechanges").prop("disabled", true);
        $("#savechanges").removeClass("btn-success").addClass("btn-outline-secondary");
    }

    has_changes_to_write = new_value;
}

function update_battery_status(bat_capacity, cable_connected, is_charging, is_error) {
    var bat_txt = bat_percent_to_text(bat_capacity, is_charging);
    var can_use_tool = (bat_capacity >= 30 && cable_connected && !is_error); // is this even being used?

    if(bat_txt != last_bat_txt) {
        $("#d-bat").html(bat_txt);
        last_bat_txt = bat_txt;
    }
}

function process_ds4_input(data) {
    var lx = data.data.getUint8(0);
    var ly = data.data.getUint8(1);
    var rx = data.data.getUint8(2);
    var ry = data.data.getUint8(3);

    var new_lx = Math.round((lx - 127.5) / 128 * 100) / 100;
    var new_ly = Math.round((ly - 127.5) / 128 * 100) / 100;
    var new_rx = Math.round((rx - 127.5) / 128 * 100) / 100;
    var new_ry = Math.round((ry - 127.5) / 128 * 100) / 100;

    if(last_lx != new_lx || last_ly != new_ly || last_rx != new_rx || last_ry != new_ry) {
        last_lx = new_lx;
        last_ly = new_ly;
        last_rx = new_rx;
        last_ry = new_ry;
        ll_updated = true;
        refresh_sticks();
    }

    // Read battery
    var bat = data.data.getUint8(29);
    var bat_data = bat & 0x0f;
    var bat_status = (bat >> 4) & 1;

    var bat_capacity = 0;
    var cable_connected = false;
    var is_charging = false;
    var is_error = false;

    if(bat_status == 1) {
        cable_connected = true;
        if(bat_data < 10) {
            bat_capacity = Math.min(bat_data * 10 + 5, 100);
            is_charging = true;
        } else if(bat_data == 10) {
            bat_capacity = 100;
            is_charging = true;
        } else if(bat_data == 11) {
            bat_capacity = 100;
            // charged
        } else {
            // error
            bat_capacity = 0;
            is_error = true;
        }
    } else {
        cable_connected = false;
        if(bat_data < 10) {
            bat_capacity = bat_data * 10 + 5;
        } else {
            bat_capacity = 100;
        }
    }

    update_battery_status(bat_capacity, cable_connected, is_charging, is_error);
}

function process_ds_input(data) {
    var lx = data.data.getUint8(0);
    var ly = data.data.getUint8(1);
    var rx = data.data.getUint8(2);
    var ry = data.data.getUint8(3);

    var new_lx = Math.round((lx - 127.5) / 128 * 100) / 100;
    var new_ly = Math.round((ly - 127.5) / 128 * 100) / 100;
    var new_rx = Math.round((rx - 127.5) / 128 * 100) / 100;
    var new_ry = Math.round((ry - 127.5) / 128 * 100) / 100;

    if(last_lx != new_lx || last_ly != new_ly || last_rx != new_rx || last_ry != new_ry) {
        last_lx = new_lx;
        last_ly = new_ly;
        last_rx = new_rx;
        last_ry = new_ry;
        ll_updated = true;
        refresh_sticks();
        refresh_finetune();
    }

    var bat = data.data.getUint8(52);
    var bat_charge = bat & 0x0f;
    var bat_status = bat >> 4;

    var bat_capacity = 0;
    var cable_connected = false;
    var is_charging = false;
    var is_error = false;

    if(bat_status == 0) {
        bat_capacity = Math.min(bat_charge * 10 + 5, 100);
    } else if(bat_status == 1) {
        bat_capacity = Math.min(bat_charge * 10 + 5, 100);
        is_charging = true;
        cable_connected = true;
    } else if(bat_status == 2) {
        bat_capacity = 100;
        cable_connected = true;
    } else {
        is_error = true;
    }

    update_battery_status(bat_capacity, cable_connected, is_charging, is_error);
}

async function continue_connection(report) {
    try {
        device.oninputreport = null;
        var reportLen = report.data.byteLength;

        var connected = false;

        // Detect if the controller is connected via USB
        if(reportLen != 63) {
            $("#btnconnect").prop("disabled", false);
            $("#connectspinner").hide();
            disconnect();
            show_popup(l("Please connect the device using a USB cable."))
            return;
        }

        if(device.productId == 0x05c4) {
            $("#infoshowall").hide()
            $("#ds5finetune").hide()
            if(await ds4_info()) {
                connected = true;
                mode = 1;
                devname = l("Sony DualShock 4 V1");
                device.oninputreport = process_ds4_input;
            }
        } else if(device.productId == 0x09cc) {
            $("#infoshowall").hide()
            $("#ds5finetune").hide()
            if(await ds4_info()) {
                connected = true;
                mode = 1;
                devname = l("Sony DualShock 4 V2");
                device.oninputreport = process_ds4_input;
            }
        } else if(device.productId == 0x0ce6) {
            $("#infoshowall").show()
            $("#ds5finetune").show()
            if(await ds5_info(false)) {
                connected = true;
                mode = 2;
                devname = l("Sony DualSense");
                device.oninputreport = process_ds_input;
            }
        } else if(device.productId == 0x0df2) {
            $("#infoshowall").show()
            $("#ds5finetune").show()
            if(await ds5_info(true)) {
                connected = true;
                mode = 3;
                devname = l("Sony DualSense Edge");
                device.oninputreport = process_ds_input;
                await ds5_load_modules_info();
            }


            n = await ds5_nvstatus();
            if(n == 4) {
                // dualsense edge with pending reboot
                $("#btnconnect").prop("disabled", false);
                $("#connectspinner").hide();
                disconnect();
                show_popup(l("A reboot is needed to continue using this DualSense Edge. Please disconnect and reconnect your controller."));
                return;
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
        } else {
            show_popup(l("Connected invalid device: ") + l("Error 1"));
            $("#btnconnect").prop("disabled", false);
            $("#connectspinner").hide();
            disconnect();
            return;
        }

        if(mode == 3) {
            show_edge_modal();
        }

        if(disable_btn != 0)
            update_disable_btn();

        $("#btnconnect").prop("disabled", false);
        $("#connectspinner").hide();
    } catch(error) {
        $("#btnconnect").prop("disabled", false);
        $("#connectspinner").hide();
        show_popup(l("Error: ") + error);
        return;
    }
}

function update_disable_btn() {
    if(disable_btn == last_disable_btn)
        return;

    if(disable_btn == 0) {
        $(".ds-btn").prop("disabled", false);
        last_disable_btn = 0;
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
    last_disable_btn = disable_btn;
}

async function connect() {
    gj = crypto.randomUUID();

    // This trigger default disable
    has_changes_to_write = -1;
    update_nvs_changes_status(0);

    reset_circularity();
    la("begin");
    last_bat_txt = "";
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

        device.oninputreport = continue_connection

    } catch(error) {
        $("#btnconnect").prop("disabled", false);
        $("#connectspinner").hide();
        show_popup(l("Error: ") + error);
        return;
    }
}

var curModal = null

async function multi_flash() {
    if(mode == 1) 
        ds4_flash();
    else if(mode == 2)
        ds5_flash();
    else if(mode == 3)
        ds5_edge_flash();
    update_nvs_changes_status(0);
}

async function multi_reset() {
    if(mode == 1) 
        ds4_reset();
    else
        ds5_reset();
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
    } else if (mode == 2) {
        await ds5_nvlock();
        await ds5_nvstatus();
    }
}

async function multi_calib_sticks_begin() {
    if(mode == 1) 
        return ds4_calibrate_sticks_begin();
    else
        return ds5_calibrate_sticks_begin();
}

async function multi_calib_sticks_end() {
    if(mode == 1) 
        await ds4_calibrate_sticks_end();
    else
        await ds5_calibrate_sticks_end();
    on_circ_check_change();
}

async function multi_calib_sticks_sample() {
    if(mode == 1) 
        return ds4_calibrate_sticks_sample();
    else
        return ds5_calibrate_sticks_sample();
}

async function multi_calibrate_range() {
    if(mode == 0) 
        return;

    set_progress(0);
    curModal = new bootstrap.Modal(document.getElementById('rangeModal'), {})
    curModal.show();

    await new Promise(r => setTimeout(r, 1000));

    if(mode == 1) 
        ds4_calibrate_range_begin();
    else
        ds5_calibrate_range_begin();
}

async function multi_calibrate_range_on_close() {
    if(mode == 1) 
        await ds4_calibrate_range_end();
    else
        await ds5_calibrate_range_end();
    on_circ_check_change();
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
    $("#fwinfoextra-hw").html("");
    $("#fwinfoextra-fw").html("");
}

function append_info_extra(key, value, cat) {
    // TODO escape html
    var s = '<dt class="text-muted col-sm-4 col-md-6 col-xl-5">' + key + '</dt><dd class="col-sm-8 col-md-6 col-xl-7" style="text-align: right;">' + value + '</dd>';
    $("#fwinfoextra-" + cat).html($("#fwinfoextra-" + cat).html() + s);
}


function append_info(key, value, cat) {
    // TODO escape html
    var s = '<dt class="text-muted col-6">' + key + '</dt><dd class="col-6" style="text-align: right;">' + value + '</dd>';
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

function show_info_modal() {
    la("info_modal");
    new bootstrap.Modal(document.getElementById('infoModal'), {}).show()
}

function discord_popup() { 
    la("discord_popup");
    show_popup(l("My handle on discord is: the_al"));
}

function edge_color_info() {
    la("cm_info");
    text = l("Color detection thanks to") + ' romek77 from Poland.';
    show_popup(text, true);
}

function board_model_info() {
    la("bm_info");
    l1 = l("This feature is experimental.");
    l2 = l("Please let me know if the board model of your controller is not detected correctly.");
    l3 = l("Board model detection thanks to") + ' <a href="https://battlebeavercustoms.com/">Battle Beaver Customs</a>.';
    show_popup(l3 + "<br><br>" + l1 + " " + l2, true);
}

function close_new_calib() {
    $("#calibCenterModal").modal("hide");
    cur_calib = 0;
}

async function calib_step(i) {
    la("calib_step", {"i": i})
    if(i < 1 || i > 7) return;

    var ret = true;
    if(i >= 2 && i <= 6) {
        $("#btnSpinner").show();
        $("#calibNext").prop("disabled", true);
    }

    if(i == 2) {
        $("#calibNextText").text(l("Initializing..."));
        await new Promise(r => setTimeout(r, 100));
        ret = await multi_calib_sticks_begin();
    } else if(i == 6) {
        $("#calibNextText").text(l("Sampling..."));
        await new Promise(r => setTimeout(r, 100));
        ret = await multi_calib_sticks_sample();
        await new Promise(r => setTimeout(r, 100));
        $("#calibNextText").text(l("Storing calibration..."));
        await new Promise(r => setTimeout(r, 100));
        ret = await multi_calib_sticks_end();
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
            lang_translate(ljson["file"], nlang, ljson["direction"]);
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
        var direction = available_langs[l]["direction"];
        lang_translate(file, l, direction);
    }

    createCookie("force_lang", l);
    if(!skip_modal) {
        createCookie("welcome_accepted", "0");
        welcome_modal();
    }
}

function lang_reset_page() {
    lang_set_direction("ltr", "en_us");
    var items = document.getElementsByClassName('ds-i18n');
    for(i=0; i<items.length; i++) { 
        var item = items[i];
        $(item).html(lang_orig_text[item.id]);
    }
    $("#authorMsg").html("");
    $("#curLang").html("English");
    document.title = lang_orig_text[".title"];
}

function lang_set_direction(new_direction, lang_name) {
    var lang_prefix = lang_name.split("_")[0]
    $("html").attr("lang", lang_prefix);

    if(new_direction == lang_cur_direction)
        return;

    if(new_direction == "rtl") {
        $('#bootstrap-css').attr('integrity', 'sha384-dpuaG1suU0eT09tx5plTaGMLBsfDLzUCCUXOY2j/LSvXYuG6Bqs43ALlhIqAJVRb');
        $('#bootstrap-css').attr('href', 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css');
    } else {
        $('#bootstrap-css').attr('integrity', 'sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH');
        $('#bootstrap-css').attr('href', 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css');
    }
    $("html").attr("dir", new_direction);
    lang_cur_direction = new_direction;
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

function lang_translate(target_file, target_lang, target_direction) {
    lang_cur = {}
    $.getJSON("lang/" + target_file, function(data) {
        lang_set_direction(target_direction, target_lang);
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
