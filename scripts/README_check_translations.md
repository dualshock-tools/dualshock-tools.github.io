# Translation String Checker

This script analyzes the DualShock Tools codebase to find translation strings and compares them with the language files to identify discrepancies.

## Features

### 1. **Source Code Analysis**

- Scans HTML files for elements with the `ds-i18n` class
- Scans JavaScript files for strings passed to the `l()` function
- Handles both `l()` and `this.l()` function calls
- Strips simple HTML formatting tags (`<b>`, `<i>`, `<em>`, `<strong>`, `<span>`)
- Decodes HTML entities and normalizes whitespace
- **Automatically ignores commented-out code:**
  - HTML comments (`<!-- ... -->`)
  - JavaScript single-line comments (`// ...`)
  - JavaScript multi-line comments (`/* ... */`)

### 2. **Smart Filtering**

Automatically excludes non-translatable strings:

- CSS class selectors (e.g., `.alert`, `.hide`)
- CSS ID selectors (e.g., `#id`)
- Compound selectors (e.g., `circle.ds-touch`)
- SVG element lists (e.g., `path,rect,circle`)
- Hex escape sequences (e.g., `\x1B`)
- CSS display values (`hide`, `show`)

### 3. **Whitelist for Unused Strings**

The script includes a whitelist (`WHITELIST_UNUSED`) for strings that are in language files but should be ignored by the unused check. These strings may be:

- Used dynamically (e.g., controller model names, color variants)
- Reserved for future use
- Used in comments or documentation
- Part of error messages that are rarely triggered

The whitelist is defined in the script and can be updated as needed. Whitelisted strings are excluded from the "unused translations" report but are still included in the JSON output for reference.

### 4. **Comparison & Reporting**

Identifies two types of issues:

- **Missing translations**: Strings used in code but not in translation files
- **Unused translations**: Strings in translation files but no longer used in code (excluding whitelisted strings)

### 5. **Clickable File References & Language Tracking**

Each missing translation shows:

- The exact file location in `file:line:col` format (clickable in VS Code)
- A note if the string appears in multiple locations
- Which language files are missing this translation

Example output:

```
  - Don't show again
    → templates/edge-modal.html:33:11
    Missing from: ALL languages (22)
  - Connected invalid device:
    → js/core.js:224:11
    (and 1 more location)
    Missing from: ALL languages (22)
  - Some partial translation
    → index.html:123:45
    Missing from: ar_ar, de_de, es_es, fr_fr, it_it (and 5 more)
```

### 6. **Multiple Output Modes**

#### Normal Mode (default)

Human-readable output with sections for missing and unused translations:

```bash
python3 scripts/check_translations.py
```

#### Verbose Mode

Shows excluded strings for debugging:

```bash
python3 scripts/check_translations.py --verbose
# or
python3 scripts/check_translations.py -v
```

#### JSON Mode

Machine-readable output for integration with other tools:

```bash
python3 scripts/check_translations.py --json
```

JSON output includes location and language information:

```json
{
  "summary": {
    "total_strings_used": 223,
    "total_translation_keys": 268,
    "total_languages": 22,
    "missing_count": 28,
    "unused_count": 0,
    "excluded_count": 5,
    "whitelisted_count": 57
  },
  "missing_translations": [
    {
      "string": "Don't show again",
      "missing_from_languages": [
        "ar_ar", "bg_bg", "cz_cz", "da_dk", "de_de", "es_es",
        "fa_fa", "fr_fr", "hu_hu", "it_it", "jp_jp", "ko_kr",
        "nl_nl", "pl_pl", "pt_br", "pt_pt", "rs_rs", "ru_ru",
        "tr_tr", "ua_ua", "zh_cn", "zh_tw"
      ],
      "locations": [
        {
          "file": "templates/edge-modal.html",
          "line": 33,
          "col": 11
        }
      ]
    }
  ],
  "unused_translations": [...],
  "excluded_strings": [...],
  "whitelisted_strings": [...]
}
```

## Exit Codes

- **0**: All translations are in sync
- **1**: There are missing or unused translations (suitable for CI/CD)

## Usage Examples

### Check translations and see results

```bash
python3 scripts/check_translations.py
```

### Debug excluded strings

```bash
python3 scripts/check_translations.py --verbose
```

### Generate JSON report

```bash
python3 scripts/check_translations.py --json > translation_report.json
```

### Use in CI/CD pipeline

```bash
# This will fail (exit code 1) if there are discrepancies
python3 scripts/check_translations.py
```

## How It Works

1. **Scan Phase**: The script scans all HTML and JavaScript files to extract translation strings
   - Comments are automatically removed before extraction to avoid false positives
2. **Filter Phase**: Non-translatable strings (CSS selectors, etc.) are filtered out
3. **Load Phase**: Translation keys are loaded from all language files in `lang/`
4. **Compare Phase**: Set operations identify missing and unused translations
5. **Report Phase**: Results are displayed with clickable file references

## Special Keys

The following keys are excluded from comparison as they are metadata:

- `.authorMsg` - Author information in language files
- `.title` - Language name in language files

## Managing the Whitelist

The `WHITELIST_UNUSED` set in the script contains strings that should be ignored by the unused translations check. To update the whitelist:

1. Open `scripts/check_translations.py`
2. Find the `WHITELIST_UNUSED` set (near the top of the file)
3. Add or remove strings as needed
4. Run the script to verify the changes

**When to add strings to the whitelist:**

- Controller model names (e.g., "Sony DualSense", "DualShock 4 V2")
- Color variants (e.g., "Midnight Black", "Cosmic Red")
- Special edition names (e.g., "30th Anniversary", "God of War Ragnarok")
- Error messages that are rarely shown (e.g., "Error 2", "Error 3")
- Strings used dynamically or conditionally
- Strings reserved for future features

**When NOT to add strings to the whitelist:**

- Strings that are truly unused and should be removed from language files
- Strings that should be used in code but aren't yet (fix the code instead)

## File Structure

The script expects the following directory structure:

```
.
├── lang/           # Translation JSON files
├── js/             # JavaScript files
├── templates/      # HTML template files
└── *.html          # Root HTML files
```

## Notes

- The script uses regex patterns to extract strings, so it may not catch dynamically generated translation keys
- HTML content with complex nested tags is skipped to avoid false positives
- The script normalizes whitespace to match how the translation system processes strings
- All language files should ideally have the same keys (the script takes a union of all keys)
- **Commented-out code is automatically ignored**, so translation strings in comments won't be detected as "used"
