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
    switchSvgColors();
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
    switchSvgColors();
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
   * @function switchSvgColors
   * @summary: switch the colors of the SVG elements based on the current theme.
   */
  function switchSvgColors() {
    const defaultColor = Storage.preferredTheme.get() === 'dark' ? '#2b3035' : '#ffffff';
    ['Controller_infills', 'Button_infills', 'L3_infill', 'R3_infill', 'Trackpad_infill'].forEach(id => {
        const group = document.getElementById(id);
          if (group) {
            const elements = group.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon');
            elements.forEach(el => {
              // Set up a smooth transition for fill and stroke if not already set
              if (!el.style.transition) {
                el.style.transition = 'fill 0.10s, stroke 0.10s';
              }
              el.setAttribute('fill', defaultColor);
              el.setAttribute('stroke', defaultColor);
            });
          }
      });
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
