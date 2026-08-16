'use strict';

/**
 * Build a controller diagram without depending on a model-specific SVG asset.
 * The IDs intentionally mirror the PlayStation diagrams so the shared input
 * renderer and quick-test workflow can drive both layouts.
 */
export function createXboxControllerMarkup(prefix = '') {
  const id = (name) => `${prefix}${name}`;

  return `
    <div class="xbox-controller-diagram" id="${id('Controller')}" aria-label="Xbox controller input diagram">
      <div class="xbox-controller-shoulders" aria-hidden="true">
        <div class="xbox-control xbox-shoulder" id="${id('L2_infill')}">
          <span>LT</span><small id="${id('L2_percentage')}"></small>
        </div>
        <div class="xbox-control xbox-shoulder" id="${id('L1_infill')}">LB</div>
        <div class="xbox-controller-spacer"></div>
        <div class="xbox-control xbox-shoulder" id="${id('R1_infill')}">RB</div>
        <div class="xbox-control xbox-shoulder" id="${id('R2_infill')}">
          <span>RT</span><small id="${id('R2_percentage')}"></small>
        </div>
      </div>

      <div class="xbox-controller-body">
        <div class="xbox-control xbox-system xbox-view" id="${id('Create_infill')}" title="View">⧉</div>
        <div
          class="xbox-control xbox-system xbox-logo xbox-control-unavailable"
          id="${id('PS_infill')}"
          title="Xbox/Guide button: reserved by the operating system and not exposed by most browsers"
          aria-label="Xbox button unavailable to browser"
        >XBOX</div>
        <div class="xbox-control xbox-system xbox-menu" id="${id('Options_infill')}" title="Menu">☰</div>

        <div class="xbox-control xbox-stick xbox-left-stick" id="${id('L3_infill')}" title="Left stick">L</div>
        <div class="xbox-control xbox-stick xbox-right-stick" id="${id('R3_infill')}" title="Right stick">R</div>

        <div class="xbox-dpad" aria-label="D-pad">
          <div class="xbox-control xbox-dpad-button xbox-dpad-up" id="${id('Up_infill')}">▲</div>
          <div class="xbox-control xbox-dpad-button xbox-dpad-right" id="${id('Right_infill')}">▶</div>
          <div class="xbox-control xbox-dpad-button xbox-dpad-down" id="${id('Down_infill')}">▼</div>
          <div class="xbox-control xbox-dpad-button xbox-dpad-left" id="${id('Left_infill')}">◀</div>
        </div>

        <div class="xbox-face-buttons" aria-label="Face buttons">
          <div class="xbox-control xbox-face xbox-y" id="${id('Triangle_infill')}">Y</div>
          <div class="xbox-control xbox-face xbox-b" id="${id('Circle_infill')}">B</div>
          <div class="xbox-control xbox-face xbox-a" id="${id('Cross_infill')}">A</div>
          <div class="xbox-control xbox-face xbox-x" id="${id('Square_infill')}">X</div>
        </div>
      </div>
    </div>
  `;
}
