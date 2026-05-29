# Linux Setup Guide for DualShock / DualSense Tools

This .md resolving problem of `Main Error Stack: NotAllowedError: Failed to open the device` on Linux.

Under Linux (specifically Debian and Debian based distros, web browsers are restricted from accessing raw hardware devices (`hidraw`) by default. You may encounter a `NotAllowedError: Failed to open the device` error.

Follow these steps to configure your system permissions properly and safe.

We're going to simply add a rules in `udev` ( Linux kernel device manager )

---

## 1. Browser Requirements (Avoid Snaps/Flatpaks)

Modern distributions like Ubuntu 24.04 LTS install browsers (Firefox, Chromium) as **Snap** or **Flatpak** packages by default. These versions run in a strict sandbox that blocks WebHID completely.

* **Firefox** does not support WebHID at all on Linux.
* **Recommended:** Use **Google Chrome** or **Brave**, but ensure they are installed via a native system package (**`.deb`** or **`.rpm`**) downloaded directly from their official websites, **not** from the Ubuntu App Center / Software Store.

---

## 2. Add udev Rules for PlayStation Controllers

You need to grant your user session permission to read and write to Sony controllers. 

Open your terminal and run the following command to create a persistent rule file for both DualShock 4 (PS4) and DualSense (PS5) controllers:

create file in /etc/udev/rules.d/99-sony-controllers.rules

here is two rules to resolve the problem.

*simply add it with your favorite text editor*

# DualSense
`SUBSYSTEM=="hidraw", ATTRS{idVendor}=="054c", ATTRS{idProduct}=="0ce6", GROUP="plugdev", MODE="0660"`

# DualShock 4
`SUBSYSTEM=="hidraw", ATTRS{idVendor}=="054c", ATTRS{idProduct}=="09cc", GROUP="plugdev", MODE="0660"`

## 3. Reload rules

after that reload rules with theses commands to apply changes

`sudo udevadm control --reload-rules && sudo udevadm trigger`

## 4. Final

Unplug, refresh (F5), plug it back in and enjoy ! :) 
