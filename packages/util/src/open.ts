import open from "open"
import { spawn } from "node:child_process"

export async function openUrl(input: string) {
  const url = URL.canParse(input) ? new URL(input) : undefined
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:"))
    return Promise.reject(new Error(`Only http and https links can be opened in the browser: ${input}`))
  if (process.platform === "win32" && process.env.OPENCODE_WIN7 === "1") {
    const launcher = process.env.OPENCODE_WIN7_BROWSER_LAUNCHER
    if (!launcher) return Promise.reject(new Error("包内浏览器入口未配置"))
    return new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [launcher, url.href], { windowsHide: true, stdio: "ignore" })
      child.once("error", reject)
      child.once("close", (code) => code === 0 ? resolve() : reject(new Error("包内浏览器启动失败")))
    })
  }
  return open(url.href)
}

export function openPath(path: string) {
  return open(path)
}
