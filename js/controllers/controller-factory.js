'use strict';

import DS4Controller from './ds4-controller.js';
import DS5Controller from './ds5-controller.js';
import DS5EdgeController from './ds5-edge-controller.js';
import { dec2hex } from '../utils.js';

/**
* Controller Factory - Creates the appropriate controller instance based on device type
*/
class ControllerFactory {
  static getSupportedModels() {
    const ds4v1 = { vendorId: 0x054c, productId: 0x05c4 };
    const ds4v2 = { vendorId: 0x054c, productId: 0x09cc };
    const ds5 = { vendorId: 0x054c, productId: 0x0ce6 };
    const ds5edge = { vendorId: 0x054c, productId: 0x0df2 };
    return [ds4v1, ds4v2, ds5, ds5edge];
  }


  /**
  * Create a controller instance based on the HID device product ID
  * @param {HIDDevice} device The HID device
  * @param {Object} uiDependencies Optional UI dependencies (l function, etc.)
  * @returns {BaseController} The appropriate controller instance
  */
  static createControllerInstance(device, uiDependencies = {}) {
    switch (device.productId) {
      case 0x05c4: // DS4 v1
      case 0x09cc: // DS4 v2
        return new DS4Controller(device, uiDependencies);

      case 0x0ce6: // DS5
        return new DS5Controller(device, uiDependencies);

      case 0x0df2: // DS5 Edge
        return new DS5EdgeController(device, uiDependencies);

      default:
        throw new Error(`Unsupported device: ${dec2hex(device.vendorId)}:${dec2hex(device.productId)}`);
    }
  }

  /**
  * Get device name based on product ID
  * @param {number} productId Product ID
  * @returns {string} Device name
  */
  static getDeviceName(productId) {
    switch (productId) {
      case 0x05c4:
        return "Sony DualShock 4 V1";
      case 0x09cc:
        return "Sony DualShock 4 V2";
      case 0x0ce6:
        return "Sony DualSense";
      case 0x0df2:
        return "Sony DualSense Edge";
      default:
        return "Unknown Device";
    }
  }

  /**
  * Get UI configuration based on product ID
  * @param {number} productId Product ID
  * @returns {Object} UI configuration
  */
  static getUIConfig(productId) {
    switch (productId) {
      case 0x05c4: // DS4 v1
      case 0x09cc: // DS4 v2
        return { 
          showInfo: false, 
          showFinetune: false, 
          showMute: false, 
          showInfoTab: false 
        };

      case 0x0ce6: // DS5
      case 0x0df2: // DS5 Edge
        return { 
          showInfo: true, 
          showFinetune: true, 
          showMute: true, 
          showInfoTab: true 
        };

      default:
        return { 
          showInfo: false, 
          showFinetune: false, 
          showMute: false, 
          showInfoTab: false 
        };
    }
  }
}

// Export for use in other modules
export default ControllerFactory;
