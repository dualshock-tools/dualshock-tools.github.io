# Translations Guidelines

## Overview
Translations for the "DualShock Calibration GUI" project are managed through
JSON files located in the [lang/ directory](https://github.com/dualshock-tools/dualshock-tools.github.io/tree/main/lang). 

This document provides guidelines on how to contribute translations for new languages.

## Getting Started
To translate the project into a new language, follow these steps:

1. **Duplicate an Existing File**: Start by duplicating an existing language file located in the `lang/` directory. For example, if you're translating into Spanish, duplicate `lang/it_it.json` and rename it to `lang/es_es.json`.

2. **Edit the File**: Open the duplicated JSON file and replace the translations of strings with the corresponding translations in the target language. The first entry `.authorMsg` is customizable, write there your name and, if you want, your website!

3. **Save the File**: Save the changes to the JSON file.

4. **Update `core.js`**: Add the new language to the list of available languages (`available_langs`) in [core.js](https://github.com/dualshock-tools/dualshock-tools.github.io/blob/main/core.js). The languages are inserted in alphabetical order with respect to the locale (es_es, fr_fr, ..). For example:
   
```javascript
var available_langs = {
    "es_es": { "name": "Español", "file": "es_es.json"},
    "fr_fr": { "name": "Français", "file": "fr_fr.json"},
    "hu_hu": { "name": "Magyar", "file": "hu_hu.json"},
    "it_it": { "name": "Italiano", "file": "it_it.json"},
    "zh_cn": { "name": "中文", "file": "zh_cn.json"},
};
```

## Submitting Translations
Once you have completed the translation, you can contribute it in one of the following ways:

- **Pull Request (PR)**: Open a Pull Request with the changes.
- **Discord**: Send the translated file to `the_al` on Discord.
- **Email**: Send the translated file to `ds4@the.al` via email.

Feel free to adjust any details or formatting according to your preferences!

## Thank you

We extend our heartfelt gratitude to everyone who contributes translations to
make this project accessible to a wider audience. Thank you!
