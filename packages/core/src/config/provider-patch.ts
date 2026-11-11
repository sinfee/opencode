export * as ConfigProviderPatch from "./provider-patch.js"

import { applyEdits, findNodeAtLocation, modify, parse, parseTree, type JSONPath } from "jsonc-parser"
import { Schema } from "effect"
import { isRecord } from "@opencode/util/record"
import type { Patch } from "@opencode/schema/config"
import { ConfigProvider } from "@opencode/schema/config/provider"

const formattingOptions = { tabSize: 2, insertSpaces: true }

/**
 * 把供应商补丁按 JSON Merge Patch（RFC 7396）语义合并进全局配置文本的 `providers`：
 * 值为 null 表示删除对应键，对象逐键合并，其余值整体替换。只做定点编辑，
 * 未涉及的字段、注释和 `{env:...}` 原始写法保持不变。
 */
export function apply(text: string, providers: Patch["providers"]) {
  if (!providers) return text
  const legacy: unknown = parse(text, [], { allowTrailingComma: true })?.provider
  const conflict = Object.keys(providers).find((id) => isRecord(legacy) && id in legacy)
  // 旧版 `provider` 与新版 `providers` 读取时会合并，同名项写两处会互相覆盖。
  if (conflict) throw new Error(`供应商 ${conflict} 由旧版 provider 键定义，请先手工迁移到 providers`)
  const updated = Object.entries(providers).reduce(
    (result, [id, value]) => merge(result, ["providers", id], value),
    text,
  )
  const written: unknown = parse(updated, [], { allowTrailingComma: true })?.providers
  // 写盘前按配置模式校验结果，避免把无法加载的供应商写进全局配置。
  for (const [id, value] of Object.entries(providers)) {
    if (value === null) continue
    Schema.decodeUnknownSync(ConfigProvider.Info)(isRecord(written) ? written[id] : undefined)
  }
  return updated
}

function merge(text: string, location: JSONPath, value: unknown): string {
  if (value === null) return edit(text, location, undefined)
  if (!isRecord(value)) return edit(text, location, value)
  const tree = parseTree(text, [], { allowTrailingComma: true })
  // 目标不是对象时没有可合并的内容，直接写入去掉 null 的新值。
  if (!tree || findNodeAtLocation(tree, location)?.type !== "object") return edit(text, location, prune(value))
  return Object.entries(value).reduce((result, [key, item]) => merge(result, [...location, key], item), text)
}

function edit(text: string, location: JSONPath, value: unknown) {
  return applyEdits(text, modify(text, location, value, { formattingOptions }))
}

function prune(value: unknown): unknown {
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== null)
      .map(([key, item]) => [key, prune(item)]),
  )
}
