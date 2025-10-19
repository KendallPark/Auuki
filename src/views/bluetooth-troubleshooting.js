import { xf } from '../functions.js';
import { clearBluetoothCacheForDevice } from '../ble/device-manager.js';
import { Device } from '../ble/enums.js';

/**
 * Bluetooth Troubleshooting Component
 * Provides buttons to reset problematic Bluetooth device connections
 */
class BluetoothTroubleshooting extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        this.abortController = new AbortController();
        this.signal = { signal: this.abortController.signal };

        this.render();
        this.setupEventListeners();
    }

    disconnectedCallback() {
        this.abortController.abort();
    }

    render() {
        this.innerHTML = `
            <div class="list--row--outer">
                <div class="list--row--inner option">
                    <div class="option--name">Reset HRM</div>
                    <span id="reset-hrm-btn" class="option--value">reset</span>
                </div>
            </div>
            <div class="list--row--outer">
                <div class="list--row--inner option">
                    <div class="option--name">Reset All Devices</div>
                    <span id="reset-all-btn" class="option--value">reset</span>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const hrmResetButton = this.querySelector('#reset-hrm-btn');
        const allResetButton = this.querySelector('#reset-all-btn');

        hrmResetButton.addEventListener('click', this.onResetHRM.bind(this), this.signal);
        allResetButton.addEventListener('click', this.onResetAll.bind(this), this.signal);
    }

    async onResetHRM() {
        if (confirm('This will attempt to resolve Android PWA "ghost pairing" issues with Heart Rate Monitors. Continue?')) {
            try {
                await clearBluetoothCacheForDevice(Device.heartRateMonitor);

                // Dispatch notification
                xf.dispatch('ui:notification', {
                    type: 'success',
                    message: 'HRM reset complete. If issues persist, try closing and reopening the app.',
                    duration: 7000
                });
            } catch (error) {
                console.error('Failed to reset HRM:', error);
                xf.dispatch('ui:notification', {
                    type: 'error',
                    message: 'Reset failed. For persistent ghost pairing, restart Chrome or reboot phone.',
                    duration: 5000
                });
            }
        }
    }

    async onResetAll() {
        if (confirm('This will remove ALL paired Bluetooth devices, which may resolve connection issues. You will need to re-pair them. Continue?')) {
            try {
                await clearBluetoothCacheForDevice(); // Pass no argument to clear all

                // Dispatch notification
                xf.dispatch('ui:notification', {
                    type: 'success',
                    message: 'All Bluetooth connections reset. Please re-pair your sensors.',
                    duration: 5000
                });
            } catch (error) {
                console.error('Failed to reset all devices:', error);
                xf.dispatch('ui:notification', {
                    type: 'error',
                    message: 'Failed to reset Bluetooth connections.',
                    duration: 3000
                });
            }
        }
    }
}

// Register the custom element
customElements.define('bluetooth-troubleshooting', BluetoothTroubleshooting);

export default BluetoothTroubleshooting;