import { describe, expect, test } from "bun:test"

import {
  collectNodeAndDescendantKeys,
  mergeCheckedKeys,
  removeDescendantKeys,
} from "./feishu-doc-tree-selection"

const tree = [{
  key: "root",
  title: "root",
  children: [
    {
      key: "child-a",
      title: "child-a",
      children: [
        {
          key: "leaf-a1",
          title: "leaf-a1",
        },
      ],
    },
    {
      key: "child-b",
      title: "child-b",
    },
  ],
}]

describe("feishu doc tree selection helpers", () => {
  test("collects a node with all descendants", () => {
    expect(collectNodeAndDescendantKeys(tree as never, "root")).toEqual([
      "root",
      "child-a",
      "leaf-a1",
      "child-b",
    ])
  })

  test("removes descendants while preserving the parent key", () => {
    expect(removeDescendantKeys({
      tree: tree as never,
      checkedKeys: ["root", "child-a", "leaf-a1", "child-b"],
      parentKeys: ["root"],
    })).toEqual(["root"])
  })

  test("deduplicates merged checked keys", () => {
    expect(mergeCheckedKeys(["root", "child-a"], ["child-a", "child-b"])).toEqual([
      "root",
      "child-a",
      "child-b",
    ])
  })
})
