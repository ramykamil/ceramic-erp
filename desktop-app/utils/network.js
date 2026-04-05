/**
 * Network Utilities for LAN Access
 */
const os = require('os');

/**
 * Get the local IP address for LAN access
 * Prioritizes IPv4 addresses from network interfaces
 */
function getLocalIP() {
    const interfaces = os.networkInterfaces();

    // Check common interface names first
    const priorityNames = ['eth0', 'en0', 'wlan0', 'Wi-Fi', 'Ethernet'];

    for (const name of priorityNames) {
        if (interfaces[name]) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
    }

    // Fallback: check all interfaces
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }

    return '127.0.0.1';
}

/**
 * Get all available local IP addresses
 */
function getAllLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push({
                    name: name,
                    address: iface.address
                });
            }
        }
    }

    return ips;
}

/**
 * Format the server URL for display
 */
function getServerURL(port = 3000) {
    const ip = getLocalIP();
    return `http://${ip}:${port}`;
}

module.exports = {
    getLocalIP,
    getAllLocalIPs,
    getServerURL
};
