import { Bonjour } from 'bonjour-service';

export interface DiscoveredShield {
  name: string;
  host: string; // first IPv4 address
}

/**
 * Browses ALL mDNS services and filters client-side for _androidtvremote2._tcp
 * — querying with a type filter directly (`find({ type: 'androidtvremote2' })`)
 * returned nothing in testing even though the service is genuinely being
 * broadcast; browsing everything and filtering after works reliably.
 */
export async function discoverShields(timeoutMs = 8000): Promise<DiscoveredShield[]> {
  const instance = new Bonjour();
  const found = new Map<string, DiscoveredShield>();

  return new Promise((resolve) => {
    // bonjour-service's types require `type`, but browsing with no filter
    // and matching client-side is the only approach confirmed working —
    // find({ type: 'androidtvremote2' }) returned nothing in live testing
    // even though the service is genuinely broadcasting.
    instance.find({} as Parameters<typeof instance.find>[0], (service) => {
      if (service.type !== 'androidtvremote2') return;
      const ipv4 = (service.addresses ?? []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
      if (!ipv4) return;
      found.set(service.name, { name: service.name, host: ipv4 });
    });

    setTimeout(() => {
      instance.destroy();
      resolve(Array.from(found.values()));
    }, timeoutMs);
  });
}
