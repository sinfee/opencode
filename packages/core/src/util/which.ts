import whichPkg from "which"
import path from "path"
import { lstatSync, statSync } from "fs"

export function which(cmd: string, env?: NodeJS.ProcessEnv, bin?: string) {
  const base = env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path ?? ""
  const full = base && bin ? base + path.delimiter + bin : base || bin
  return (
    whichPkg.sync(cmd, {
      nothrow: true,
      path: full,
      pathExt: env?.PATHEXT ?? env?.PathExt ?? process.env.PATHEXT ?? process.env.PathExt,
    }) ?? appExecutionAlias(cmd, full)
  )
}

// Microsoft Store apps, such as PowerShell 7, put app execution aliases in WindowsApps on PATH. They launch like
// any executable, but stat rejects them with EACCES, so `which` skips them.
export function isAppExecutionAlias(file: string) {
  // Windows 上 existsSync 会跟随重解析点调用 stat 并因 EACCES 返回 false，
  // 对 Microsoft Store 应用执行别名需在 lstat 确认为符号链接后放行 EACCES，同时拒绝普通断链（ENOENT）。
  if (process.platform !== "win32") return false
  if (lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink() !== true) return false
  try {
    return statSync(file).isFile()
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === "EACCES"
  }
}

function appExecutionAlias(cmd: string, search: string | undefined) {
  if (process.platform !== "win32" || !search || path.win32.dirname(cmd) !== ".") return null
  const name = path.win32.extname(cmd).toLowerCase() === ".exe" ? cmd : cmd + ".exe"
  return (
    search
      .split(path.win32.delimiter)
      .filter(Boolean)
      .map((dir) => path.win32.join(dir.replace(/^"(.*)"$/, "$1"), name))
      .find(isAppExecutionAlias) ?? null
  )
}
