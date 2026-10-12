/**
 * Org chart helpers. Pure — used by the chart UI and by the server actions
 * that validate edits.
 */

export interface OrgEdge {
  id: string;
  managerId: string | null;
}

/**
 * Reporting lines can have several bosses: the main manager plus any
 * additional ones. Pass one edge per line — the same person may appear more
 * than once (`{ id, managerId }` for each boss).
 */
function parentsOf(edges: OrgEdge[]) {
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (!e.managerId) continue;
    parents.set(e.id, [...(parents.get(e.id) ?? []), e.managerId]);
  }
  return parents;
}

/** Everyone above `userId` through any reporting line. Tolerates loops in stored data. */
function ancestors(parents: Map<string, string[]>, userId: string) {
  const seen = new Set<string>();
  const stack = [...(parents.get(userId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(parents.get(id) ?? []));
  }
  return seen;
}

/** True if making `managerId` a boss of `userId` would create a loop through any reporting line. */
export function wouldCreateCycle(edges: OrgEdge[], userId: string, managerId: string | null) {
  if (!managerId) return false;
  if (managerId === userId) return true;
  return ancestors(parentsOf(edges), managerId).has(userId);
}

/** True if `managerId` is above `userId` through any reporting line — a boss, a boss's boss, and so on. */
export function isAboveInReportingLine(edges: OrgEdge[], managerId: string, userId: string) {
  if (managerId === userId) return false;
  return ancestors(parentsOf(edges), userId).has(managerId);
}

/** One edge per reporting line: main managers plus additional ones. */
export function withAdditionalLines(
  people: OrgEdge[],
  additional: { userId: string; managerId: string }[],
): OrgEdge[] {
  return [...people, ...additional.map((a) => ({ id: a.userId, managerId: a.managerId }))];
}

export interface TreeNode<T> {
  item: T;
  children: TreeNode<T>[];
}

/** Builds a forest. Anyone whose manager is missing (or excluded) becomes a root. */
export function buildForest<T extends OrgEdge>(items: T[], sort?: (a: T, b: T) => number): TreeNode<T>[] {
  const ids = new Set(items.map((i) => i.id));
  const nodes = new Map<string, TreeNode<T>>(items.map((i) => [i.id, { item: i, children: [] }]));
  const roots: TreeNode<T>[] = [];
  for (const item of items) {
    const node = nodes.get(item.id)!;
    if (item.managerId && ids.has(item.managerId) && item.managerId !== item.id) {
      nodes.get(item.managerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Defensive: a loop in stored data would hide everyone in it. Promote one
  // member of any unreachable group to a root so nobody disappears.
  const reachable = new Set<string>();
  const mark = (n: TreeNode<T>) => {
    if (reachable.has(n.item.id)) return;
    reachable.add(n.item.id);
    n.children.forEach(mark);
  };
  roots.forEach(mark);
  for (const item of items) {
    if (reachable.has(item.id)) continue;
    const node = nodes.get(item.id)!;
    const parent = item.managerId ? nodes.get(item.managerId) : undefined;
    if (parent) parent.children = parent.children.filter((c) => c !== node);
    roots.push(node);
    mark(node);
  }

  if (sort) {
    const sortRec = (list: TreeNode<T>[]) => {
      list.sort((a, b) => sort(a.item, b.item));
      list.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
  }
  return roots;
}

export function countDescendants<T>(node: TreeNode<T>): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}
