/** MariaDB can return COUNT/SUM values as bigint, which JSON.stringify rejects. */
export function customerSummaries(customers, orderStats) {
    const statsByCustomer = new Map(orderStats.map((row) => [row.userId, row]));
    return customers.map((customer) => {
        const stats = statsByCustomer.get(customer.id);
        return {
            ...customer,
            orders: Number(stats?.orders ?? 0),
            spentCents: Number(stats?.spentCents ?? 0)
        };
    });
}
