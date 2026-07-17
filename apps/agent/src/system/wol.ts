import { createSocket } from 'node:dgram';

/** Send a Wake-on-LAN magic packet to a MAC address. */
export async function sendWakeOnLan(mac: string, broadcast = '255.255.255.255', port = 9): Promise<void> {
  const cleaned = mac.replace(/[^a-fA-F0-9]/g, '');
  if (cleaned.length !== 12) {
    throw new Error(`Invalid MAC address: ${mac}`);
  }

  const macBytes = Buffer.from(cleaned, 'hex');
  const packet = Buffer.alloc(6 + 16 * 6, 0xff);
  for (let i = 0; i < 16; i += 1) {
    macBytes.copy(packet, 6 + i * 6);
  }

  await new Promise<void>((resolve, reject) => {
    const socket = createSocket('udp4');
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, port, broadcast, (err) => {
        socket.close();
        if (err) reject(err);
        else resolve();
      });
    });
  });
}
