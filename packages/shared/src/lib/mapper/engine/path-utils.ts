function getValueAtPath(source: unknown, path: string): unknown {
    const segments = path.split('.')
    let current: unknown = source
    for (const segment of segments) {
        if (current === null || typeof current !== 'object') {
            return undefined
        }
        current = (current as Record<string, unknown>)[segment]
    }
    return current
}

function setValueAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const segments = path.split('.')
    let current = target
    for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i]
        const next = current[segment]
        if (next === null || typeof next !== 'object' || Array.isArray(next)) {
            current[segment] = {}
        }
        current = current[segment] as Record<string, unknown>
    }
    current[segments[segments.length - 1]] = value
}

export const mapperPathUtils = { getValueAtPath, setValueAtPath }
