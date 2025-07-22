#!/usr/bin/env python3

# (C) 2025 dualshock-tools
#
# This script can be used to add or remove a sentence from all the language
# files. It's really simple and hacking: just edit this files adding lines
# In the corresponsing fields (add, remove) and run it.
#
# Quick note: run it from the "root" directory of the project: it searches for
# ./lang/ so the correct command should be `python3 scripts/process_lang.py`.

data = {
    "remove": [
        # Add here lines to remove from each language file
    ],
    "add": [
        # Add here lines to add to each language file
    ],
}

## ---

import os, json

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
    print("%s: writing changes" % (i, ))

    open("lang/" + i, "w").write(new_file)
