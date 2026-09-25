/**
 * M3 — Authority policy: scope-sensitive, partial-order dominance.
 *
 * There is NO universal numeric authority ranking.
 * Each AuthorityPolicy covers one scopeId and carries an explicit
 * set of pairwise dominance relations (higher > lower).
 *
 * Transitive dominance is computed deterministically.
 * Cycles are detected and rejected.
 * Incomparable authority classes are explicitly left incomparable.
 */

import type { AuthorityClass } from "../events.js";

// ---------------------------------------------------------------------------
// AuthorityPolicy — scope-specific partial order
// ---------------------------------------------------------------------------

export interface DominanceRelation {
  readonly higher: AuthorityClass;
  readonly lower: AuthorityClass;
}

export interface AuthorityPolicy {
  readonly scopeId: string;
  readonly dominance: readonly DominanceRelation[];
}

// ---------------------------------------------------------------------------
// PolicyError — thrown when a policy is invalid
// ---------------------------------------------------------------------------

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

// ---------------------------------------------------------------------------
// buildTransitiveClosure — compute full reachable dominance set
//
// Returns a Map<higher, Set<lower>> for all directly and transitively
// dominated pairs. Throws PolicyError on cycle detection.
// ---------------------------------------------------------------------------

export function buildTransitiveClosure(
  relations: readonly DominanceRelation[]
): Map<AuthorityClass, Set<AuthorityClass>> {
  // Initialise adjacency: direct dominance only
  const direct = new Map<AuthorityClass, Set<AuthorityClass>>();
  for (const { higher, lower } of relations) {
    if (!direct.has(higher)) direct.set(higher, new Set());
    direct.get(higher)!.add(lower);
  }

  // Topological sort with cycle detection (DFS)
  // All nodes reachable from the relation set
  const allNodes = new Set<AuthorityClass>();
  for (const { higher, lower } of relations) {
    allNodes.add(higher);
    allNodes.add(lower);
  }

  const PERMANENT = new Set<AuthorityClass>();
  const TEMPORARY = new Set<AuthorityClass>();
  const sorted: AuthorityClass[] = [];

  function visit(node: AuthorityClass): void {
    if (PERMANENT.has(node)) return;
    if (TEMPORARY.has(node)) {
      throw new PolicyError(
        `Authority policy contains a cycle involving "${node}". ` +
          "Cyclic dominance is not allowed."
      );
    }
    TEMPORARY.add(node);
    for (const child of direct.get(node) ?? []) {
      visit(child);
    }
    TEMPORARY.delete(node);
    PERMANENT.add(node);
    sorted.push(node);
  }

  for (const node of allNodes) {
    visit(node);
  }

  // Now compute full transitive closure using the topological order
  // (process in reverse topological order so dependents are done first)
  const closure = new Map<AuthorityClass, Set<AuthorityClass>>();
  for (const node of sorted) {
    const reachable = new Set<AuthorityClass>(direct.get(node) ?? []);
    for (const child of direct.get(node) ?? []) {
      for (const transitiveChild of closure.get(child) ?? []) {
        reachable.add(transitiveChild);
      }
    }
    closure.set(node, reachable);
  }

  return closure;
}

// ---------------------------------------------------------------------------
// PolicyEvaluator — compiled evaluator for one AuthorityPolicy
// ---------------------------------------------------------------------------

export class PolicyEvaluator {
  private readonly closure: Map<AuthorityClass, Set<AuthorityClass>>;
  readonly scopeId: string;

  constructor(policy: AuthorityPolicy) {
    this.scopeId = policy.scopeId;
    this.closure = buildTransitiveClosure(policy.dominance);
  }

  /**
   * Returns true if `higher` strictly dominates `lower` in this scope.
   * Dominance is transitive. Reflexive case (a dominates a) returns false.
   */
  dominates(higher: AuthorityClass, lower: AuthorityClass): boolean {
    if (higher === lower) return false;
    return this.closure.get(higher)?.has(lower) ?? false;
  }

  /**
   * Given a set of AuthorityClasses, return the maximal (non-dominated) subset.
   * A class is maximal if no other class in the set dominates it.
   */
  maximal(classes: readonly AuthorityClass[]): AuthorityClass[] {
    return classes.filter(
      (c) => !classes.some((other) => other !== c && this.dominates(other, c))
    );
  }
}
