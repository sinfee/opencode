import { loadRuntimeModules, resolveHostPackageRoots, type RuntimeModuleLoader } from "./runtime-modules.js"

const foreignPkgSuffix = String.raw`(?:node_modules[/\\](@opencode[/\\]plugin|effect)|(@opencode[/\\]plugin|effect)@[^/\\]+@@@\d+)`
let installed: Readonly<Record<string, RuntimeModuleLoader>> | undefined

export function provides(specifier: string) {
  return installed !== undefined && Object.hasOwn(installed, specifier)
}

export function ensurePluginRuntime() {
  // 本分支只交付 Node 宿主：Node 侧插件模块由 globalThis 符号注入提供，不依赖 Bun 插件运行时。
  if ((process.versions as { bun?: string }).bun === undefined) return {}
  if (installed) return installed
  const modules = loadRuntimeModules()
  installed = modules
  // Bun 专属的模块钩子注册依赖 Bun 运行时，Node 宿主无法实现。
  throw new Error("opencode Bun 插件运行时在 Node 宿主上不可用")
}

export function createForeignPackageFilter(rootsInput: Iterable<string> = resolveHostPackageRoots()) {
  const suffix = String.raw`[/\\]${foreignPkgSuffix}[/\\].*\.[cm]?[jt]sx?(?:[?#].*)?$`
  const roots = [...new Set(rootsInput)]
  if (roots.length === 0) return new RegExp(suffix)
  const escaped = roots
    .map((value) =>
      value
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/(?:\\\/|\\\\|\/)+/g, "[/\\\\]"),
    )
    .join("|")
  return new RegExp(`^(?!(?:${escaped})[/\\\\]).*${suffix}`)
}
