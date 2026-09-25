/**
 * InMemoryStore<T> — generic deterministic in-memory key-value store.
 *
 * All state lives in a plain Map. No persistence, no I/O.
 * The store is type-safe and supports tenant-scoped listing.
 *
 * Items must have at least { id: string; tenantId: string } to support
 * the tenant-scoped helpers.
 */

export interface Identifiable {
  readonly id: string;
}

export interface TenantScoped extends Identifiable {
  readonly tenantId: string;
}

export class InMemoryStore<T extends Identifiable> {
  private readonly data = new Map<string, T>();

  /** Store or overwrite a record by its id. */
  set(item: T): void {
    this.data.set(item.id, item);
  }

  /** Retrieve a record by id. Returns undefined if not found. */
  get(id: string): T | undefined {
    return this.data.get(id);
  }

  /** Delete a record by id. Returns true if it existed. */
  delete(id: string): boolean {
    return this.data.delete(id);
  }

  /** Return true if a record with the given id exists. */
  has(id: string): boolean {
    return this.data.has(id);
  }

  /** List all records in insertion order. */
  list(): T[] {
    return Array.from(this.data.values());
  }

  /** List all records matching a predicate. */
  listWhere(predicate: (item: T) => boolean): T[] {
    return this.list().filter(predicate);
  }

  /** Return the total number of records. */
  size(): number {
    return this.data.size;
  }

  /** Remove all records. Useful for test teardown. */
  clear(): void {
    this.data.clear();
  }
}

/**
 * TenantStore<T> — InMemoryStore for tenant-scoped resources.
 * Adds listByTenant as a convenience; authorization must still be
 * enforced at the service layer — not here.
 */
export class TenantStore<T extends TenantScoped> extends InMemoryStore<T> {
  /** List all records belonging to the given tenant. */
  listByTenant(tenantId: string): T[] {
    return this.listWhere((item) => item.tenantId === tenantId);
  }
}
