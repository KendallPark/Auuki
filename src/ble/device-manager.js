import { controllable, heartRateMonitor, powerMeter, speedCadenceSensor, moxy, coreTemp } from './devices.js';
import { Device } from './enums.js';

// An array containing all singleton device instances
const allDevices = [
    controllable,
    heartRateMonitor,
    powerMeter,
    speedCadenceSensor,
    moxy,
    coreTemp,
];

/**
 * Comprehensive Android PWA Bluetooth reset to resolve "ghost pairing" issues.
 * This attempts multiple strategies to clear problematic BLE connections
 * without requiring a full phone restart.
 *
 * @param {Device | null} deviceType - The type of device to clear (e.g., Device.heartRateMonitor).
 * If null or undefined, all devices will be cleared.
 */
async function clearBluetoothCacheForDevice(deviceType = null) {
    const typeName = deviceType || 'ALL';
    console.log(`Starting comprehensive Bluetooth reset for: ${typeName}`);

    const devicesToClear = deviceType
        ? allDevices.filter(instance => instance.getDeviceType() === deviceType)
        : allDevices;

    if (devicesToClear.length === 0) {
        console.warn(`No managed device instances found for type: ${typeName}`);
        return;
    }

    // Step 1: Force disconnect all active connections
    console.log('Step 1: Force disconnecting all active connections...');
    const disconnectPromises = devicesToClear.map(async (deviceInstance) => {
        try {
            if (deviceInstance.isConnected()) {
                await deviceInstance.disconnect();
                // Wait a bit for disconnect to fully process
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            console.error(`Failed to disconnect: ${deviceInstance.getName()}`, error);
        }
    });
    await Promise.all(disconnectPromises);

    // Step 2: Clear all cached device references
    console.log('Step 2: Clearing cached device references...');
    const forgetPromises = devicesToClear.map(async (deviceInstance) => {
        try {
            await deviceInstance.forgetDevice();
        } catch (error) {
            console.error(`Failed to forget device: ${deviceInstance.getName()}`, error);
        }
    });
    await Promise.all(forgetPromises);

    // Step 3: Clear Web Bluetooth API cache (Android PWA specific)
    console.log('Step 3: Attempting to clear Web Bluetooth API cache...');
    try {
        if ('bluetooth' in navigator && navigator.bluetooth.getDevices) {
            const devices = await navigator.bluetooth.getDevices();
            console.log(`Found ${devices.length} cached Bluetooth devices`);

            for (const device of devices) {
                try {
                    if (device.gatt && device.gatt.connected) {
                        console.log(`Force disconnecting cached device: ${device.name || device.id}`);
                        await device.gatt.disconnect();
                    }

                    // Try to forget the device at browser level (if supported)
                    if (device.forget && typeof device.forget === 'function') {
                        console.log(`Forgetting cached device: ${device.name || device.id}`);
                        await device.forget();
                    }
                } catch (error) {
                    console.error(`Failed to clear cached device: ${device.name || device.id}`, error);
                }
            }
        }
    } catch (error) {
        console.warn('Could not access bluetooth.getDevices():', error);
    }

    // Step 4: Force garbage collection of BLE references (if possible)
    console.log('Step 4: Attempting to force cleanup...');
    try {
        // Clear any pending timeouts or intervals that might hold references
        for (let i = 1; i < 10000; i++) {
            clearTimeout(i);
            clearInterval(i);
        }

        // Trigger garbage collection if available (mainly for debugging)
        if (window.gc && typeof window.gc === 'function') {
            window.gc();
        }
    } catch (error) {
        console.warn('Cleanup step had issues:', error);
    }

    // Step 5: Wait and log completion
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`Comprehensive Bluetooth reset completed for: ${typeName}`);
    console.log('If issues persist, the PWA may need to be closed and reopened, or Chrome restarted.');
}

export { clearBluetoothCacheForDevice };