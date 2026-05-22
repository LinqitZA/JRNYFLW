import { mapperPathUtils } from './path-utils'

type PartitionParams = {
    rows: unknown[]
    groupBy: string[]
}

export function partitionByKey({ rows, groupBy }: PartitionParams): unknown[][] {
    const order: string[] = []
    const buckets = new Map<string, unknown[]>()
    for (const row of rows) {
        const composite = groupBy.map((key) => mapperPathUtils.getValueAtPath(row, key))
        const hash = JSON.stringify(composite)
        if (!buckets.has(hash)) {
            buckets.set(hash, [])
            order.push(hash)
        }
        buckets.get(hash)!.push(row)
    }
    return order.map((hash) => buckets.get(hash)!)
}
