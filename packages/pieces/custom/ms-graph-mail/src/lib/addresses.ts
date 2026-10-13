// People paste lists from Outlook (semicolons) as often as typed lists (commas), one per line or not.
function parse(text: string | undefined): string[] {
    const seen = new Set<string>();
    const addresses: string[] = [];
    for (const raw of (text ?? '').split(/[,;\n\r]+/)) {
        const address = raw.trim();
        if (address === '') {
            continue;
        }
        if (!isEmail(address)) {
            throw new Error(`Not an email address: ${address}`);
        }
        if (!seen.has(address.toLowerCase())) {
            seen.add(address.toLowerCase());
            addresses.push(address);
        }
    }
    return addresses;
}

function isEmail(value: string): boolean {
    return EMAIL.test(value);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const mailAddresses = { parse, isEmail };
