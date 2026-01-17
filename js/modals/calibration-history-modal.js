'use strict';

import { FinetuneHistory } from '../finetune-history.js';
import { formatLocalizedDate, la } from '../utils.js';
import { l } from '../translations.js';

export class CalibrationHistoryModal {
  constructor(controllerInstance = null, doneCallback = null) {
    this.modalElement = null;
    this.bootstrapModal = null;
    this.currentFinetuneData = null;
    this.currentControllerSerialNumber = null;
    this.controller = controllerInstance;
    this.doneCallback = doneCallback;

    this._boundModalHidden = () => {
      destroyCurrentInstance();
    };

    this._initEventListeners();
  }

  _initEventListeners() {
    this.modalElement = document.getElementById('calibrationHistoryModal');
    if (this.modalElement) {
      this.bootstrapModal = new bootstrap.Modal(this.modalElement);
      this.modalElement.addEventListener('hidden.bs.modal', this._boundModalHidden);
    }
  }

  removeEventListeners() {
    if (this.modalElement) {
      this.modalElement.removeEventListener('hidden.bs.modal', this._boundModalHidden);
    }
  }

  async open(currentFinetuneData = null, controllerSerialNumber = null) {
    this.currentFinetuneData = currentFinetuneData;
    this.currentControllerSerialNumber = controllerSerialNumber;
    await this._populateHistory();
    this.bootstrapModal.show();
  }

  close() {
    if (this.bootstrapModal) {
      this.bootstrapModal.hide();
    }
  }

  /**
   * Populate the history list
   * @private
   */
  async _populateHistory() {
    const history = FinetuneHistory.getAll(this.currentControllerSerialNumber);
    const container = document.getElementById('historyListContainer');

    if (!history || history.length === 0) {
      container.innerHTML = `<p class="text-muted ds-i18n">${l('No saved calibrations found.')}</p>`;
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
              <p class="mb-0 small">${l('Values')}: ${entry.data.join(', ')}</p>
            </div>
            <div class="btn-group-sm" role="group">
              ${isCurrent ?
                `<button type="button" class="btn btn-sm btn-success ds-i18n" disabled>${l('Current')}</button>` :
                `<button type="button" class="btn btn-sm btn-primary ds-i18n" onclick="calibration_history_restore('${entry.id}')">${l('Restore')}</button>
                 <button type="button" class="btn btn-sm btn-outline-danger ds-i18n" onclick="calibration_history_delete('${entry.id}')">${l('Delete')}</button>`
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
  _dataEquals(data1, data2) {
    if (!Array.isArray(data1) || !Array.isArray(data2)) {
      return false;
    }
    if (data1.length !== data2.length) {
      return false;
    }
    return data1.every((val, idx) => val === data2[idx]);
  }

  /**
   * Apply finetune calibration to the controller
   * @param {Array} finetuneData - The finetune data to apply
   * @private
   */
  async _applyCalibration(finetuneData) {
    if (!this.controller || !this.controller.isConnected()) {
      throw new Error('Controller not connected');
    }
    if (!Array.isArray(finetuneData) || finetuneData.length !== 12) {
      throw new Error('Invalid finetune data');
    }
    await this.controller.writeFinetuneData(finetuneData);
    this.controller.setHasChangesToWrite(true);
  }

  /**
   * Restore a saved calibration
   * @param {string} entryId - The ID of the entry to revert to
   */
  async restoreCalibration(entryId) {
    const entry = FinetuneHistory.getById(entryId, this.currentControllerSerialNumber);
    if (!entry) throw new Error('Calibration settings not found.');

    await this._applyCalibration(entry.data);
    this.close();
    this.doneCallback(true, l('The calibration was restored successfully! Remember to save the changes in order not to loose them when the controller is rebooted.'));
    la("calibration_history_restored");
  }

  /**
   * Delete a saved entry
   * @param {string} entryId - The ID of the entry to delete
   */
  async delete(entryId) {
    const entry = FinetuneHistory.getById(entryId, this.currentControllerSerialNumber);
    if (!entry) {
      return;
    }

    if (confirm(l(`Delete this calibration entry?`))) {
      FinetuneHistory.delete(entryId, this.currentControllerSerialNumber);
      await this._populateHistory();
    }
  }

  /**
   * Clear all saved entries
   */
  async clearAll() {
    if (confirm(l('Delete all calibration history for this controller? This cannot be undone.'))) {
      FinetuneHistory.clearAll(this.currentControllerSerialNumber);
      await this._populateHistory();
    }
  }
}

let currentCalibrationHistoryInstance = null;

function destroyCurrentInstance() {
  if (currentCalibrationHistoryInstance) {
    currentCalibrationHistoryInstance.removeEventListeners();
    currentCalibrationHistoryInstance = null;
  }
}

export async function show_calibration_history_modal(controllerInstance = null, currentFinetuneData = null, controllerSerialNumber = null, doneCallback = null) {
  destroyCurrentInstance();

  currentCalibrationHistoryInstance = new CalibrationHistoryModal(controllerInstance, doneCallback);
  await currentCalibrationHistoryInstance.open(currentFinetuneData, controllerSerialNumber);
}

window.calibration_history_restore = (entryId) => {
  if (currentCalibrationHistoryInstance) {
    currentCalibrationHistoryInstance.restoreCalibration(entryId);
  }
};

window.calibration_history_delete = (entryId) => {
  if (currentCalibrationHistoryInstance) {
    currentCalibrationHistoryInstance.delete(entryId);
  }
};

window.calibration_history_clear_all = () => {
  if (currentCalibrationHistoryInstance) {
    currentCalibrationHistoryInstance.clearAll();
  }
};

window.show_calibration_history_modal = show_calibration_history_modal;