import { Storage } from './storage.js';


(function () {
  let colorMode = document.getElementById('colorModeSwitch');
  if (!colorMode) {
    return;
  }

  /**
   * @function darkmode
   * @summary: changes the theme to 'dark mode' and save settings to local stroage.
   * Basically, replaces/toggles every CSS class that has '-light' class with '-dark'
   */
  function darkMode() {
    document.documentElement.setAttribute('data-bs-theme', 'dark')
    // set light switch input to true
    if (!colorMode.checked) {
      colorMode.checked = true;
    }
    Storage.preferredTheme.set('dark');
  }

  /**
   * @function lightmode
   * @summary: changes the theme to 'light mode' and save settings to local stroage.
   */
  function lightMode() {
    document.documentElement.setAttribute('data-bs-theme', 'light')

    if (colorMode.checked) {
      colorMode.checked = false;
    }
    Storage.preferredTheme.set('light');
  }

  /**
   * @function onToggleMode
   * @summary: the event handler attached to the switch. calling @darkMode or @lightMode depending on the checked state.
   */
  function onToggleMode() {
    if (!colorMode.checked) {
      lightMode();
    } else {
      darkMode();
    }
  }

  /**
   * @function getSystemDefaultTheme
   * @summary: get system default theme by media query
   */
  function getSystemDefaultTheme() {
    const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');
    if (darkThemeMq.matches) {
      return 'dark';
    }
    return 'light';
  }

  function setup() {
    var settings = Storage.preferredTheme.get();
    if (settings == null) {
      settings = getSystemDefaultTheme();
    }

    if (settings == 'dark') {
      colorMode.checked = true;
    }

    colorMode.addEventListener('change', onToggleMode);
    onToggleMode();
  }

  setup();
})();
