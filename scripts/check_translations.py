#!/usr/bin/env python3

# (C) 2025 dualshock-tools
#
# This script analyzes the source files to find translation strings and compares
# them with the language files to identify:
# - Strings that are used in code but missing from translation files
# - Strings that are in translation files but no longer used in code
#
# The script extracts translation strings from:
# - HTML files: elements with ds-i18n class
# - JavaScript files: l() function calls
# - JavaScript files: HTML embedded in strings with ds-i18n class
#
# The script automatically ignores commented-out code:
# - HTML comments (<!-- ... -->)
# - JavaScript single-line comments (// ...)
# - JavaScript multi-line comments (/* ... */)
#
# Usage:
#   python3 scripts/check_translations.py           # Normal output
#   python3 scripts/check_translations.py --verbose # Show excluded strings
#   python3 scripts/check_translations.py --compact # Compact output (no language details)
#   python3 scripts/check_translations.py --json    # Output in JSON format

import os
import re
import json
import sys
from pathlib import Path

# Check for flags
VERBOSE = '--verbose' in sys.argv or '-v' in sys.argv
JSON_OUTPUT = '--json' in sys.argv
COMPACT = '--compact' in sys.argv

# Directories to scan
ROOT_DIR = Path(".")
LANG_DIR = ROOT_DIR / "lang"
JS_DIR = ROOT_DIR / "js"
TEMPLATES_DIR = ROOT_DIR / "templates"

# Special keys that are not in source code
SPECIAL_KEYS = {".authorMsg", ".title"}

# Patterns to exclude from translation checks (CSS selectors, technical strings, etc.)
EXCLUDE_PATTERNS = [
    r'^\.[\w-]+$',  # CSS class selectors like .alert, .hide
    r'^#[\w-]+$',  # CSS ID selectors
    r'^[\w-]+\.[\w-]+$',  # CSS compound selectors like circle.ds-touch
    r'^path,rect,circle',  # SVG element lists
    r'^\\x[0-9a-fA-F]+$',  # Hex escape sequences
]

# Whitelist of strings that are in language files but should be ignored by unused check
# These strings may be used dynamically, in comments, or reserved for future use
WHITELIST_UNUSED = {
    "(beta)",
    "30th Anniversary",
    "Astro Bot",
    "Chroma Indigo",
    "Chroma Pearl",
    "Chroma Teal",
    "Cobalt Blue",
    "Cosmic Red",
    "Fortnite",
    "Galactic Purple",
    "God of War Ragnarok",
    "Grey Camouflage",
    "Midnight Black",
    "Nova Pink",
    "Spider-Man 2",
    "Starlight Blue",
    "Sterling Silver",
    "The Last of Us",
    "Volcanic Red",
    "White",

    "Sony DualSense",
    "Sony DualSense Edge",
    "Sony DualShock 4 V1",
    "Sony DualShock 4 V2",

    "Calibration in progress",
    "Continue",
    "Start",
    "Initializing...",
    "Sampling...",
    "left module",
    "right module",
    "Your device might not be a genuine Sony controller. If it is not a clone then please report this issue.",

    "Adaptive Trigger",
    "Buttons",
    "Haptic Vibration",
    "Headphone Jack",
    "Lights",
    "Microphone",
    "Speaker",
    "USB Connector",
}


def should_exclude_string(text):
    """Check if a string should be excluded from translation checks."""
    for pattern in EXCLUDE_PATTERNS:
        if re.match(pattern, text):
            return True
    return False

def find_html_files():
    """Find all HTML files in the project."""
    html_files = []
    # Root HTML files
    html_files.extend(ROOT_DIR.glob("*.html"))
    # Template HTML files
    html_files.extend(TEMPLATES_DIR.glob("*.html"))
    return html_files

def find_js_files():
    """Find all JavaScript files in the js directory."""
    js_files = []
    js_files.extend(JS_DIR.glob("**/*.js"))
    return js_files

def extract_ds_i18n_strings(html_files):
    """Extract strings from elements with ds-i18n class in HTML files.

    Automatically ignores HTML comments (<!-- ... -->) before extraction.
    """
    strings = {}  # Changed to dict to track locations

    # Pattern to match elements with ds-i18n class and extract their content
    # This handles various HTML structures including multi-line content
    # Match opening tag with ds-i18n class, then capture content until closing tag
    pattern = r'<(\w+)[^>]*class="[^"]*ds-i18n[^"]*"[^>]*>(.*?)</\1>'

    for html_file in html_files:
        try:
            with open(html_file, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.split('\n')

                # Remove HTML comments before processing
                # This regex handles both single-line and multi-line comments
                content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)

                # Find all matches (DOTALL flag allows . to match newlines)
                matches = re.finditer(pattern, content, re.DOTALL)
                for match in matches:
                    text = match.group(2)

                    # Skip if contains complex nested HTML tags
                    # Allow simple formatting tags like <b>, <i>, <em>, <strong>, <span>
                    if '<' in text and '>' in text:
                        # Check if it contains only simple formatting tags
                        # Remove simple formatting tags temporarily to check for other HTML
                        text_without_simple_tags = re.sub(r'</?(?:b|i|em|strong|span)>', '', text)
                        if '<' in text_without_simple_tags:
                            # Contains other HTML elements (complex content), skip it
                            continue
                        # Otherwise, keep the original text with simple formatting tags

                    if text:
                        # Calculate line and column number
                        line_num = content[:match.start()].count('\n') + 1
                        col_num = match.start() - content[:match.start()].rfind('\n')

                        # Store location info
                        if text not in strings:
                            strings[text] = []
                        strings[text].append({
                            'file': str(html_file),
                            'line': line_num,
                            'col': col_num
                        })

        except Exception as e:
            print(f"Error reading {html_file}: {e}")

    return strings

def extract_l_function_strings(js_files):
    """Extract strings passed to l() function in JavaScript files.

    Automatically ignores JavaScript comments (// and /* ... */) before extraction.
    """
    strings = {}  # Changed to dict to track locations

    # Pattern to match l("string") or l('string') or this.l("string") or this.l('string')
    # Handles both single and double quotes
    # Use word boundary \b to ensure 'l' is not part of a larger word (e.g., .html)
    pattern = r'(?:this\.)?\bl\s*\(\s*["\'`]([^"\'`]+)["\'`]\s*\)'

    for js_file in js_files:
        try:
            with open(js_file, 'r', encoding='utf-8') as f:
                content = f.read()

                # Remove JavaScript comments before processing
                # Remove single-line comments (// ...)
                content = re.sub(r'//.*?$', '', content, flags=re.MULTILINE)
                # Remove multi-line comments (/* ... */)
                content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)

                # Find all matches
                matches = re.finditer(pattern, content)
                for match in matches:
                    text = match.group(1)
                    if text:
                        # Calculate line and column number
                        line_num = content[:match.start()].count('\n') + 1
                        col_num = match.start() - content[:match.start()].rfind('\n')

                        # Store location info
                        if text not in strings:
                            strings[text] = []
                        strings[text].append({
                            'file': str(js_file),
                            'line': line_num,
                            'col': col_num
                        })

        except Exception as e:
            print(f"Error reading {js_file}: {e}")

    return strings

def extract_html_strings_from_js(js_files):
    """Extract strings from HTML embedded in JavaScript files.

    This function looks for HTML strings in JavaScript that contain elements with ds-i18n class.
    Automatically ignores JavaScript comments (// and /* ... */) before extraction.
    """
    strings = {}  # Dict to track locations

    # Pattern to match elements with ds-i18n class in HTML strings
    # This handles HTML within JavaScript strings (both single and double quotes)
    pattern = r'<(\w+)[^>]*class=["\'`][^"\'`]*ds-i18n[^"\'`]*["\'`][^>]*>(.*?)</\1>'

    # Pattern to match template literal function calls like ${l('string')} or ${l("string")}
    template_literal_pattern = r'\$\{l\s*\(\s*["\'`]([^"\'`]+)["\'`]\s*\)\}'

    for js_file in js_files:
        try:
            with open(js_file, 'r', encoding='utf-8') as f:
                content = f.read()
                original_content = content  # Keep original for line number calculation

                # Remove JavaScript comments before processing
                # Remove single-line comments (// ...)
                content = re.sub(r'//.*?$', '', content, flags=re.MULTILINE)
                # Remove multi-line comments (/* ... */)
                content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)

                # Find all matches (DOTALL flag allows . to match newlines)
                matches = re.finditer(pattern, content, re.DOTALL)
                for match in matches:
                    text = match.group(2)

                    # Skip if contains complex nested HTML tags
                    # Allow simple formatting tags like <b>, <i>, <em>, <strong>, <span>
                    if '<' in text and '>' in text:
                        # Check if it contains only simple formatting tags
                        # Remove simple formatting tags temporarily to check for other HTML
                        text_without_simple_tags = re.sub(r'</?(?:b|i|em|strong|span)>', '', text)
                        if '<' in text_without_simple_tags:
                            # Contains other HTML elements (complex content), skip it
                            continue
                        # Otherwise, keep the original text with simple formatting tags

                    if text:
                        # Extract any template literal function calls like ${l('string')}
                        template_matches = re.finditer(template_literal_pattern, text)
                        for template_match in template_matches:
                            extracted_string = template_match.group(1)
                            if extracted_string:
                                # Calculate line and column number using original content
                                line_num = original_content[:match.start()].count('\n') + 1
                                col_num = match.start() - original_content[:match.start()].rfind('\n')

                                # Store location info
                                if extracted_string not in strings:
                                    strings[extracted_string] = []
                                strings[extracted_string].append({
                                    'file': str(js_file),
                                    'line': line_num,
                                    'col': col_num
                                })

                        # Also handle text that doesn't contain template literal patterns
                        # (for backwards compatibility with non-template literal strings)
                        if not re.search(template_literal_pattern, text):
                            # Calculate line and column number using original content
                            line_num = original_content[:match.start()].count('\n') + 1
                            col_num = match.start() - original_content[:match.start()].rfind('\n')

                            # Store location info
                            if text not in strings:
                                strings[text] = []
                            strings[text].append({
                                'file': str(js_file),
                                'line': line_num,
                                'col': col_num
                            })

        except Exception as e:
            print(f"Error reading {js_file}: {e}")

    return strings

def load_translation_keys():
    """Load all translation keys from language files.

    Returns:
        tuple: (all_keys, keys_by_language)
            - all_keys: set of all unique keys across all language files
            - keys_by_language: dict mapping language code to set of keys in that language
    """
    all_keys = set()
    keys_by_language = {}

    lang_files = list(LANG_DIR.glob("*.json"))

    if not lang_files:
        print(f"Warning: No language files found in {LANG_DIR}")
        return all_keys, keys_by_language

    # Load keys from all language files
    for lang_file in lang_files:
        try:
            # Extract language code from filename (e.g., "en_us" from "en_us.json")
            lang_code = lang_file.stem

            with open(lang_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                keys = set(data.keys())
                keys.discard("")  # Remove empty string key if present

                keys_by_language[lang_code] = keys
                all_keys.update(keys)
        except Exception as e:
            print(f"Error reading {lang_file}: {e}")

    # Remove empty string key if present
    all_keys.discard("")

    return all_keys, keys_by_language

def main():
    if not JSON_OUTPUT:
        print("=" * 80)
        print("Translation String Checker")
        print("=" * 80)
        print()

    # Find all source files
    if not JSON_OUTPUT:
        print("Scanning source files...")
    html_files = find_html_files()
    js_files = find_js_files()

    if not JSON_OUTPUT:
        print(f"Found {len(html_files)} HTML files")
        print(f"Found {len(js_files)} JavaScript files")
        print()

    # Extract strings from source files
    if not JSON_OUTPUT:
        print("Extracting translation strings from source files...")
    ds_i18n_strings = extract_ds_i18n_strings(html_files)
    l_function_strings = extract_l_function_strings(js_files)
    html_in_js_strings = extract_html_strings_from_js(js_files)

    if not JSON_OUTPUT:
        print(f"Found {len(ds_i18n_strings)} strings with ds-i18n class in HTML files")
        print(f"Found {len(l_function_strings)} strings in l() function calls")
        print(f"Found {len(html_in_js_strings)} strings with ds-i18n class in JavaScript files")
        print()

    # Combine all used strings and filter out excluded patterns
    # Merge the three dictionaries, combining location lists for duplicate strings
    all_used_strings_with_locations = {}
    for text, locations in ds_i18n_strings.items():
        all_used_strings_with_locations[text] = locations.copy()
    for text, locations in l_function_strings.items():
        if text in all_used_strings_with_locations:
            all_used_strings_with_locations[text].extend(locations)
        else:
            all_used_strings_with_locations[text] = locations.copy()
    for text, locations in html_in_js_strings.items():
        if text in all_used_strings_with_locations:
            all_used_strings_with_locations[text].extend(locations)
        else:
            all_used_strings_with_locations[text] = locations.copy()

    excluded_strings = {s for s in all_used_strings_with_locations.keys() if should_exclude_string(s)}
    used_strings_with_locations = {k: v for k, v in all_used_strings_with_locations.items() if k not in excluded_strings}
    used_strings = set(used_strings_with_locations.keys())

    if not JSON_OUTPUT and excluded_strings:
        print(f"Excluded {len(excluded_strings)} non-translatable strings (CSS selectors, etc.)")
        if VERBOSE:
            for s in sorted(excluded_strings):
                print(f"  - \"{s}\"")
        print()

    # Load translation keys
    if not JSON_OUTPUT:
        print("Loading translation keys from language files...")
    translation_keys, keys_by_language = load_translation_keys()
    if not JSON_OUTPUT:
        print(f"Found {len(translation_keys)} keys in translation files")
        print(f"Found {len(keys_by_language)} language files")
        print()

    # Remove special keys from comparison
    translation_keys_for_comparison = translation_keys - SPECIAL_KEYS

    # Remove special keys from each language's key set
    keys_by_language_filtered = {}
    for lang_code, keys in keys_by_language.items():
        keys_by_language_filtered[lang_code] = keys - SPECIAL_KEYS

    # Find missing translations (used in code but not in translation files)
    missing_translations = used_strings - translation_keys_for_comparison

    # For each missing translation, find which languages are missing it
    missing_by_language = {}
    for string in missing_translations:
        missing_langs = []
        for lang_code, keys in keys_by_language_filtered.items():
            if string not in keys:
                missing_langs.append(lang_code)
        missing_by_language[string] = sorted(missing_langs)

    # Find unused translations (in translation files but not used in code)
    # Exclude whitelisted strings from unused check
    unused_translations = (translation_keys_for_comparison - used_strings) - WHITELIST_UNUSED

    # Output results
    if JSON_OUTPUT:
        # Build missing translations with locations and missing languages
        missing_with_locations = []
        for string in sorted(missing_translations):
            entry = {
                "string": string,
                "missing_from_languages": missing_by_language.get(string, [])
            }
            if string in used_strings_with_locations:
                entry["locations"] = used_strings_with_locations[string]
            missing_with_locations.append(entry)

        result = {
            "summary": {
                "total_strings_used": len(used_strings),
                "total_translation_keys": len(translation_keys_for_comparison),
                "total_languages": len(keys_by_language),
                "missing_count": len(missing_translations),
                "unused_count": len(unused_translations),
                "excluded_count": len(excluded_strings),
                "whitelisted_count": len(WHITELIST_UNUSED)
            },
            "missing_translations": missing_with_locations,
            "unused_translations": sorted(unused_translations),
            "excluded_strings": sorted(excluded_strings),
            "whitelisted_strings": sorted(WHITELIST_UNUSED)
        }
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 1 if (missing_translations or unused_translations) else 0

    # Print results (text format)
    print("=" * 80)
    print("RESULTS")
    print("=" * 80)
    print()

    if missing_translations:
        print(f"⚠️  MISSING TRANSLATIONS ({len(missing_translations)} strings)")
        print("These strings are used in code but not found in translation files:")
        print("-" * 80)
        for string in sorted(missing_translations):
            print(f"  - \"{string}\"")
            # Show first location where this string was found (skip in compact mode)
            if not COMPACT and string in used_strings_with_locations:
                locations = used_strings_with_locations[string]
                if locations:
                    loc = locations[0]
                    print(f"    → {loc['file']}:{loc['line']}:{loc['col']}")
                    if len(locations) > 1:
                        print(f"    (and {len(locations) - 1} more location{'s' if len(locations) > 2 else ''})")
            # Show which languages are missing this translation (skip in compact mode)
            if not COMPACT and string in missing_by_language:
                missing_langs = missing_by_language[string]
                if len(missing_langs) == len(keys_by_language):
                    print(f"    Missing from: ALL languages ({len(missing_langs)})")
                else:
                    # Show first few languages, then count
                    if len(missing_langs) <= 5:
                        print(f"    Missing from: {', '.join(missing_langs)}")
                    else:
                        print(f"    Missing from: {', '.join(missing_langs[:5])} (and {len(missing_langs) - 5} more)")
        print()
    else:
        print("✅ No missing translations found!")
        print()

    if unused_translations:
        print(f"ℹ️  UNUSED TRANSLATIONS ({len(unused_translations)} strings)")
        print("These strings are in translation files but not used in code:")
        print("-" * 80)
        for string in sorted(unused_translations):
            print(f"  - \"{string}\"")
        print()
    else:
        print("✅ No unused translations found!")
        print()

    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total strings used in code: {len(used_strings)}")
    print(f"Total keys in translation files: {len(translation_keys_for_comparison)}")
    print(f"Missing translations: {len(missing_translations)}")
    print(f"Unused translations: {len(unused_translations)}")
    print(f"Whitelisted strings: {len(WHITELIST_UNUSED)}")
    print()

    if missing_translations or unused_translations:
        print("⚠️  Translation files need updates!")
        return 1
    else:
        print("✅ All translations are in sync!")
        return 0

if __name__ == "__main__":
    exit(main())