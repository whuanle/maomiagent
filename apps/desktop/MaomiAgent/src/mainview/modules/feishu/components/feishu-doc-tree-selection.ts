type TreeNodeLike = {
  key: string
  children?: TreeNodeLike[]
}

function findNode(nodes: TreeNodeLike[], key: string): TreeNodeLike | null {
  for (const node of nodes) {
    if (node.key === key) {
      return node
    }
    if (!node.children?.length) {
      continue
    }
    const nested = findNode(node.children, key)
    if (nested) {
      return nested
    }
  }
  return null
}

function collectKeys(node: TreeNodeLike): string[] {
  return [
    node.key,
    ...(node.children?.flatMap((child) => collectKeys(child)) ?? []),
  ]
}

export function collectNodeAndDescendantKeys(nodes: TreeNodeLike[], key: string): string[] {
  const node = findNode(nodes, key)
  return node ? collectKeys(node) : []
}

export function mergeCheckedKeys(current: string[], next: string[]): string[] {
  return [...new Set([...current, ...next])]
}

export function removeDescendantKeys(input: {
  tree: TreeNodeLike[]
  checkedKeys: string[]
  parentKeys: string[]
}): string[] {
  const blocked = new Set<string>()

  for (const parentKey of input.parentKeys) {
    const descendantKeys = collectNodeAndDescendantKeys(input.tree, parentKey).slice(1)
    for (const key of descendantKeys) {
      blocked.add(key)
    }
  }

  return input.checkedKeys.filter((key) => !blocked.has(key))
}
