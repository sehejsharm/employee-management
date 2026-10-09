/**
 * Org chart helpers. Pure — used by the chart UI and by the server actions
 * that validate edits.
 */

export interface OrgEdge {
  id: string;
  managerId: string | null;
}

/** True if making `managerId` the manager of `userId` would create a loop. */
export function wouldCreateCycle(edges: OrgEdge[], userId: string, managerId: string | null) {
  if (!managerId) return false;
  if (managerId === userId) return true;
  const parent = new Map(edges.map((e) => [e.id, e.managerId]));
  const seen = new Set<string>();
  let cursor: string | null | undefined = managerId;
  while (cursor) {
    if (cursor === userId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = parent.get(cursor) ?? null;
  }
  return false;
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
