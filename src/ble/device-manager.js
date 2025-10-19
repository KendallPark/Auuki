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

    // Step 3: Attempt to clear Chrome WebBluetooth cache (limited options)
    console.log('Step 3: Attempting to clear Chrome WebBluetooth cache...');
    try {
        if ('bluetooth' in navigator && navigator.bluetooth.getDevices) {
            const devices = await navigator.bluetooth.getDevices();
            console.log(`Found ${devices.length} cached Bluetooth devices in Chrome`);

            for (const device of devices) {
                try {
                    if (device.gatt && device.gatt.connected) {
                        console.log(`Force disconnecting cached device: ${device.name || device.id}`);
                        await device.gatt.disconnect();
                    }

                    // Try to forget the device at browser level (experimental)
                    if (device.forget && typeof device.forget === 'function') {
                        console.log(`Forgetting cached device: ${device.name || device.id}`);
                        await device.forget();
                    }
                } catch (error) {
                    console.error(`Failed to clear cached device: ${device.name || device.id}`, error);
                }
            }
        }

        // Attempt to clear service worker caches (may help with some BLE state)
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            console.log(`Clearing ${cacheNames.length} service worker caches...`);
            await Promise.all(cacheNames.map(name => caches.delete(name)));
        }

        // Try to clear IndexedDB (where Chrome might store BLE state)
        if ('indexedDB' in window) {
            try {
                // This is a hack - Chrome sometimes stores BLE state in IndexedDB
                const databases = await indexedDB.databases();
                console.log(`Found ${databases.length} IndexedDB databases`);
                for (const db of databases) {
                    if (db.name && (db.name.includes('bluetooth') || db.name.includes('ble'))) {
                        console.log(`Attempting to delete BLE-related database: ${db.name}`);
                        indexedDB.deleteDatabase(db.name);
                    }
                }
            } catch (error) {
                console.warn('Could not access IndexedDB databases:', error);
            }
        }

        // Clear localStorage and sessionStorage (may contain BLE references)
        try {
            const localStorageKeys = Object.keys(localStorage);
            const bleKeys = localStorageKeys.filter(key =>
                key.toLowerCase().includes('bluetooth') ||
                key.toLowerCase().includes('ble') ||
                key.toLowerCase().includes('device')
            );
            console.log(`Clearing ${bleKeys.length} BLE-related localStorage entries`);
            bleKeys.forEach(key => localStorage.removeItem(key));

            const sessionStorageKeys = Object.keys(sessionStorage);
            const sessionBleKeys = sessionStorageKeys.filter(key =>
                key.toLowerCase().includes('bluetooth') ||
                key.toLowerCase().includes('ble') ||
                key.toLowerCase().includes('device')
            );
            console.log(`Clearing ${sessionBleKeys.length} BLE-related sessionStorage entries`);
            sessionBleKeys.forEach(key => sessionStorage.removeItem(key));
        } catch (error) {
            console.warn('Could not clear storage:', error);
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