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
 * Disconnects and "forgets" all BLE devices of a specific type, or all types.
 * This is a powerful recovery mechanism for "ghost" connections on Android
 * without requiring a full phone restart.
 *
 * @param {Device | null} deviceType - The type of device to clear (e.g., Device.heartRateMonitor).
 * If null or undefined, all devices will be cleared.
 */
async function clearBluetoothCacheForDevice(deviceType = null) {
    const typeName = deviceType || 'ALL';
    console.log(`Attempting to clear Bluetooth cache for device type: ${typeName}`);

    const devicesToClear = deviceType
        ? allDevices.filter(instance => instance.getDeviceType() === deviceType)
        : allDevices;

    if (devicesToClear.length === 0) {
        console.warn(`No managed device instances found for type: ${typeName}`);
        return;
    }

    const cleanupPromises = devicesToClear.map(async (deviceInstance) => {
        try {
            if (deviceInstance.isConnected()) {
                await deviceInstance.disconnect();
            }
            // This is the key function from your connectable.js
            await deviceInstance.forgetDevice();
        } catch (error) {
            console.error(`Failed to clear device: ${deviceInstance.getName()}`, error);
        }
    });

    await Promise.all(cleanupPromises);

    console.log(`Bluetooth cache cleared for: ${typeName}.`);
}

export { clearBluetoothCacheForDevice };