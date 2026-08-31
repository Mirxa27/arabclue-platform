/**
 * Host classification for outbound requests built from user or operator input.
 *
 * Every server-side fetch whose destination is influenced by a request body has
 * to answer one question first: does this hostname point back inside our own
 * network? Cloud metadata (169.254.169.254), loopback, RFC1918, CGNAT and
 * `*.internal` service discovery are all reachable from the function and all
 * return secrets to whoever can read the response.
 *
 * Address literals are parsed rather than prefix-matched. WHATWG `URL` already
 * normalises decimal, hex, octal and short-form IPv4 (`0x7f000001`, `127.1`) to
 * dotted quads, but it preserves IPv6 literals — so `[::ffff:127.0.0.1]`
 * arrives as `[::ffff:7f00:1]`, which matches no dotted quad and no `fc`/`fe8`
 * prefix. Prefix matching lets that straight through to loopback.
 *
 * ponytail: this is a syntactic guard over the hostname. It does not defeat DNS
 * rebinding — a public name that resolves to a private address at connect time
 * still connects. Egress filtering is the control for that; the in-process
 * upgrade path is a custom undici dispatcher that re-checks the resolved IP at
 * socket level.
 */

/** Dotted-quad octets, or null when `host` is not an IPv4 literal. */
function parseIpv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  return octets.every((n) => n <= 255) ? octets : null;
}

/** Eight 16-bit groups, or null when `host` is not an IPv6 literal. */
function parseIpv6(host: string): number[] | null {
  if (!host.includes(":")) return null;

  // A trailing dotted quad ("::ffff:127.0.0.1") stands in for two groups.
  let text = host;
  const embedded = /:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
  if (embedded) {
    const octets = parseIpv4(embedded[1]);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, embedded.index + 1)}${high}:${low}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (!part) return [];
    const groups: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      groups.push(parseInt(g, 16));
    }
    return groups;
  };

  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;

  const gap = 8 - head.length - tail.length;
  if (gap < 0) return null;
  return [...head, ...Array<number>(gap).fill(0), ...tail];
}

function isNonPublicIpv4(octets: number[]): boolean {
  const [first, second] = octets;
  if (first === 0 || first === 10 || first === 127) return true;
  if (first === 169 && second === 254) return true; // link-local + cloud IMDS
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 100 && second >= 64 && second <= 127) return true; // CGNAT
  return first >= 224; // multicast and reserved
}

/** The IPv4 address carried in the low 32 bits of an IPv6 literal. */
function embeddedIpv4(groups: number[]): number[] {
  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
}

/** True when `hostname` is loopback, private, link-local, or internal-only. */
export function isNonPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || /\.(local|internal|localhost)$/.test(host)) {
    return true;
  }

  const v4 = parseIpv4(host);
  if (v4) return isNonPublicIpv4(v4);

  const v6 = parseIpv6(host);
  if (!v6) return false;

  // ::/96 (v4-compatible) and ::ffff:0:0/96 (v4-mapped) both reach an IPv4
  // destination, so the embedded address is what has to be judged.
  if (v6.slice(0, 5).every((g) => g === 0) && (v6[5] === 0 || v6[5] === 0xffff)) {
    // :: (unspecified) and ::1 (loopback) carry no meaningful IPv4.
    if (v6[5] === 0 && v6[6] === 0 && v6[7] <= 1) return true;
    return isNonPublicIpv4(embeddedIpv4(v6));
  }
  // 64:ff9b::/96 — NAT64, same embedded-IPv4 reasoning.
  if (v6[0] === 0x64 && v6[1] === 0xff9b && v6.slice(2, 6).every((g) => g === 0)) {
    return isNonPublicIpv4(embeddedIpv4(v6));
  }

  if ((v6[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((v6[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}
