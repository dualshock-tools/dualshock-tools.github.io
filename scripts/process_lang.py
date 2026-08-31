#!/usr/bin/env python3

# (C) 2025 dualshock-tools
#
# This script can be used to add or remove a sentence from all the language
# files. It's really simple and hacking: just edit this files adding lines
# In the corresponsing fields (add, remove) and run it.
#
# Quick note: run it from the "root" directory of the project: it searches for
# ./lang/ so the correct command should be `python3 scripts/process_lang.py`.
#
# Run with --auto to skip the manual lists: the strings reported by
# check_translations.py are used instead (missing strings are added, unused
# strings are removed; whitelisted strings are left alone). Combine with
# --dry-run to only print what would change.
#
# Lines can be pasted straight from the JavaScript source, e.g.
#   'This test checks the trackpad\'s touch tracking.'
# Surrounding quotes are stripped and JavaScript escapes (\', \", \\, \n, \xNN, ...)
# are decoded, so the key stored in the language files is the runtime value of
# the string, which is what l() looks up and what check_translations.py reports.

data = {
    "remove": [
        # Add here lines to remove from each language file
    ],
    "add": [
        # Add here lines to add to each language file
    ],
}

## ---

import os, sys, json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_translations import unescape_js_string

def normalize_entry(text):
    """Turn a pasted string (optionally quoted like a JS literal) into the runtime key."""
    text = text.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'`":
        text = text[1:-1]
    return unescape_js_string(text)

data["remove"] = [normalize_entry(i) for i in data["remove"]]
data["add"] = [normalize_entry(i) for i in data["add"]]

AUTO = "--auto" in sys.argv
DRY_RUN = "--dry-run" in sys.argv

if AUTO:
    from check_translations import analyze
    result = analyze()
    data["add"] += sorted(result["missing_translations"])
    data["remove"] += sorted(result["unused_translations"])
    print("[AUTO] %d missing string(s) to add, %d unused string(s) to remove" % (len(data["add"]), len(data["remove"])))
    for i in data["add"]:
        print("[AUTO]   + '%s'" % (i, ))
    for i in data["remove"]:
        print("[AUTO]   - '%s'" % (i, ))

def process_file(filename):
    x = json.loads(open(filename, "r").read())

    modified = False
    for i in data["remove"]:
        if i in x:
            del x[i]
            modified = True
        else:
            print("[REMOVE] %s: Cannot find '%s'" % (filename, i))
    for i in data["add"]:
        if i in x:
            print("[ADD] %s: '%s' already present" % (filename, i))
        else:
            x[i] = ""
            modified = True

    if "" in x:
        del x[""]
    empties = []
    for i in x:
        if len(x[i].strip()) == 0:
            empties += [i]

    empties = sorted(empties)

    for i in empties:
        del x[i]

    for i in empties:
        x[i] = ""

    x[""] = ""

    return (modified, json.dumps(x, indent=4, ensure_ascii=False))


files = list(os.listdir("lang"))

for i in files:
    modified, new_file = process_file("lang/" + i)
    if not modified:
        print("%s: not modified" % (i, ))
        continue
    if len(new_file) < 100:
        print("%s: invalid content" % (i, ))
        continue
    if DRY_RUN:
        print("%s: would write changes (dry run)" % (i, ))
        continue
    print("%s: writing changes" % (i, ))

    open("lang/" + i, "w").write(new_file)
