'use strict';

// Shared helpers for the quick test modules

/**
 * Replace [triangle]/[square]/[circle]/[cross] placeholders with inline
 * PlayStation button icons
 */
export function addIcons(string) {
  return string
    .replace('[triangle]', '<svg width="20" height="20" style="vertical-align: -4px;"><use xlink:href="#ps-triangle"/></svg>')
    .replace('[square]', '<svg width="20" height="20" style="vertical-align: -4px;"><use xlink:href="#ps-square"/></svg>')
    .replace('[circle]', '<svg width="20" height="20" style="vertical-align: -4px;"><use xlink:href="#ps-circle"/></svg>')
    .replace('[cross]', '<svg width="20" height="20" style="vertical-align: -4px;"><use xlink:href="#ps-cross"/></svg>')
}

/**
 * Toggle one check/pending indicator badge. Only touches the color and the
 * icon, so each test's markup keeps its own layout classes.
 */
export function setCheckBadge(id, passed) {
  const check = document.getElementById(id);
  if (!check) return;
  if (check.classList.contains('bg-success') === passed) return;
  check.classList.toggle('bg-success', passed);
  check.classList.toggle('bg-secondary', !passed);
  check.innerHTML = passed ? '<i class="fas fa-check"></i>' : '<i class="far fa-circle"></i>';
}
