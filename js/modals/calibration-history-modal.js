'use strict';

import { FinetuneHistory } from '../finetune-history.js';
import { formatLocalizedDate } from '../utils.js';

export class CalibrationHistoryModal {
  static modalElement = null;
  static bootstrapModal = null;
  static currentFinetuneData = null;
  static currentControllerSerialNumber = null;

  static init() {
    this.modalElement = document.getElementById('calibrationHistoryModal');
    if (this.modalElement) {
      this.bootstrapModal = new bootstrap.Modal(this.modalElement);
    }
  }

  static async show(currentFinetuneData = null, controllerSerialNumber = null) {
    if (!this.bootstrapModal) {
      this.init();
    }
    this.currentFinetuneData = currentFinetuneData;
    this.currentControllerSerialNumber = controllerSerialNumber;
    await this._populateHistory();
    this.bootstrapModal.show();
  }

  static hide() {
    if (this.bootstrapModal) {
      this.bootstrapModal.hide();
    }
  }

  /**
   * Populate the history list
   * @private
   */
  static async _populateHistory() {
    const history = FinetuneHistory.getAll(this.currentControllerSerialNumber);
    const container = document.getElementById('historyListContainer');

    if (!history || history.length === 0) {
      container.innerHTML = '<p class="text-muted ds-i18n">No saved calibration settings found.</p>';
      document.getElementById('clearAllBtn').style.display = 'none';
      return;
    }

    document.getElementById('clearAllBtn').style.display = 'block';

    let html = '<div class="list-group">';

    history.forEach(entry => {
      const date = formatLocalizedDate(entry.timestamp);
      const isCurrent = this.currentFinetuneData && this._dataEquals(entry.data, this.currentFinetuneData);

      html += `
        <div class="list-group-item">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <h6 class="mb-1">${date}</h6>
              <p class="mb-0 small">Values: ${entry.data.join(', ')}</p>
            </div>
            <div class="btn-group-sm" role="group">
              ${isCurrent ?
                `<button type="button" class="btn btn-sm btn-success ds-i18n" disabled>Current</button>` :
                `<button type="button" class="btn btn-sm btn-primary ds-i18n" onclick="calibration_history_revert('${entry.id}')">Revert</button>
                 <button type="button" class="btn btn-sm btn-outline-danger ds-i18n" onclick="calibration_history_delete('${entry.id}')">Delete</button>`
              }
            </div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  /**
   * Compare two data arrays for equality
   * @private
   */
  static _dataEquals(data1, data2) {
    if (!Array.isArray(data1) || !Array.isArray(data2)) {
      return false;
    }
    if (data1.length !== data2.length) {
      return false;
    }
    return data1.every((val, idx) => val === data2[idx]);
  }

  /**
   * Escape HTML special characters
   * @private
   */
  static _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Revert to a saved calibration
   * @param {string} entryId - The ID of the entry to revert to
   */
  static revertTo(entryId) {
    const entry = FinetuneHistory.getById(entryId, this.currentControllerSerialNumber);
    if (!entry) {
      alert('Calibration settings not found.');
      return;
    }

    // Export revert function to window for onclick handlers
    window.calibration_history_pending_revert_id = entryId;
    window.calibration_history_pending_revert_data = entry.data;

    // Show confirmation dialog
    const confirmMsg = `Revert to this version?\n\nThis will restore the stored finetune settings.`;
    if (confirm(confirmMsg)) {
      this._executeRevert(entryId, entry.data);
    }
  }

  /**
   * Execute the revert operation
   * @private
   */
  static _executeRevert(entryId, finetuneData) {
    // Call the revert function exposed in core.js
    if (typeof window.apply_finetune_revert === 'function') {
      window.apply_finetune_revert(finetuneData).then(() => {
        this.hide();
        alert('Calibration reverted successfully. Remember to save changes permanently.');
      }).catch(err => {
        alert('Failed to revert calibration: ' + err.message);
      });
    } else {
      alert('Controller not ready. Please try again.');
    }
  }

  /**
   * Delete a saved entry
   * @param {string} entryId - The ID of the entry to delete
   */
  static async delete(entryId) {
    const entry = FinetuneHistory.getById(entryId, this.currentControllerSerialNumber);
    if (!entry) {
      return;
    }

    if (confirm(`Delete this calibration entry?`)) {
      FinetuneHistory.delete(entryId, this.currentControllerSerialNumber);
      await this._populateHistory();
    }
  }

  /**
   * Clear all saved entries
   */
  static async clearAll() {
    if (confirm('Delete all calibration history for this controller? This cannot be undone.')) {
      FinetuneHistory.clearAll(this.currentControllerSerialNumber);
      await this._populateHistory();
    }
  }
}

// Export functions to window for onclick handlers
window.calibration_history_revert = (entryId) => CalibrationHistoryModal.revertTo(entryId);
window.calibration_history_delete = (entryId) => CalibrationHistoryModal.delete(entryId);
window.calibration_history_clear_all = () => CalibrationHistoryModal.clearAll();
window.show_calibration_history_modal = (currentFinetuneData = null, controllerSerialNumber = null) => CalibrationHistoryModal.show(currentFinetuneData, controllerSerialNumber);