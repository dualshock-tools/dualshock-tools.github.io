#!/usr/bin/env python3

# (C) 2025 dualshock-tools
#
# This script lists paired Bluetooth devices on macOS and allows you to
# select which ones to forget (unpair).
#
# Usage: python3 scripts/forget_bluetooth.py
#
# Requirements: macOS with blueutil installed
# Install blueutil: brew install blueutil

import subprocess
import sys
import re

def check_blueutil():
    """Check if blueutil is installed."""
    try:
        subprocess.run(['blueutil', '--version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def get_paired_devices():
    """Get list of paired Bluetooth devices."""
    try:
        result = subprocess.run(
            ['blueutil', '--paired'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Error getting paired devices: {e}")
        return None

def parse_devices(output):
    """Parse blueutil output into a list of devices."""
    devices = []
    # Pattern: address: xx-xx-xx-xx-xx-xx, name: "Device Name", ...
    pattern = r'address: ([0-9a-f-]+).*?name: "([^"]*)"'
    matches = re.finditer(pattern, output, re.IGNORECASE | re.DOTALL)

    for match in matches:
        address = match.group(1)
        name = match.group(2)
        devices.append({
            'address': address,
            'name': name
        })

    return devices

def forget_device(address):
    """Forget (unpair) a Bluetooth device by its address."""
    try:
        subprocess.run(
            ['blueutil', '--unpair', address],
            capture_output=True,
            text=True,
            check=True
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error forgetting device {address}: {e}")
        return False

def main():
    print("=" * 60)
    print("Bluetooth Controller Manager for macOS")
    print("=" * 60)
    print()

    # Check if blueutil is installed
    if not check_blueutil():
        print("ERROR: blueutil is not installed.")
        print()
        print("Please install it using Homebrew:")
        print("  brew install blueutil")
        print()
        print("If you don't have Homebrew, install it from:")
        print("  https://brew.sh")
        sys.exit(1)

    # Get paired devices
    print("Fetching paired Bluetooth controllers...")
    output = get_paired_devices()

    if output is None:
        print("Failed to get paired devices.")
        sys.exit(1)

    devices = parse_devices(output)

    if not devices:
        print("No paired Bluetooth devices found.")
        sys.exit(0)

    # Filter devices to only show controllers
    devices = [d for d in devices if 'controller' in d['name'].lower()]

    if not devices:
        print("No paired Bluetooth controllers found.")
        sys.exit(0)

    # Display devices
    print(f"\nFound {len(devices)} paired device(s):\n")
    for idx, device in enumerate(devices, 1):
        print(f"  {idx}. {device['name']}")
        print(f"     Address: {device['address']}")
        print()

    # Ask user which devices to forget
    print("=" * 60)
    print("Enter the numbers of devices to forget (comma-separated),")
    print("or 'all' to forget all devices, or 'q' to quit:")
    print("=" * 60)

    user_input = input("> ").strip().lower()

    if user_input == 'q':
        print("Cancelled.")
        sys.exit(0)

    # Parse selection
    selected_indices = []
    if user_input == 'all':
        selected_indices = list(range(len(devices)))
    else:
        try:
            parts = [p.strip() for p in user_input.split(',')]
            for part in parts:
                idx = int(part) - 1
                if 0 <= idx < len(devices):
                    selected_indices.append(idx)
                else:
                    print(f"Warning: Invalid number {part}, skipping.")
        except ValueError:
            print("Invalid input. Please enter numbers separated by commas.")
            sys.exit(1)

    if not selected_indices:
        print("No devices selected.")
        sys.exit(0)

    # Confirm
    print("\nDevices to forget:")
    for idx in selected_indices:
        device = devices[idx]
        print(f"  - {device['name']} ({device['address']})")

    confirm = input("\nAre you sure? (yes/no): ").strip().lower()
    if confirm not in ['yes', 'y']:
        print("Cancelled.")
        sys.exit(0)

    # Forget devices
    print("\nForgetting devices...")
    success_count = 0
    for idx in selected_indices:
        device = devices[idx]
        print(f"  Forgetting {device['name']}...", end=' ')
        if forget_device(device['address']):
            print("✓ Done")
            success_count += 1
        else:
            print("✗ Failed")

    print(f"\nSuccessfully forgot {success_count} of {len(selected_indices)} device(s).")

if __name__ == '__main__':
    main()