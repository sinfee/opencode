import type { CustomProviderResult } from "./form"

/** 保存自定义供应商的生命周期：先写配置，再在集成出现后保存密钥。 */
export type CustomProviderState =
  | { readonly status: "editing" }
  | { readonly status: "saving"; readonly result: CustomProviderResult }
  | { readonly status: "storing-key"; readonly result: CustomProviderResult }
  | { readonly status: "closed" }

export type CustomProviderEvent =
  | { readonly type: "submitted"; readonly result: CustomProviderResult }
  | { readonly type: "config.saved" }
  | { readonly type: "config.failed"; readonly error: unknown }
  | { readonly type: "key.settled"; readonly stored: boolean }
  | { readonly type: "disposed" }

export type CustomProviderEffect =
  | { readonly type: "save-config"; readonly result: CustomProviderResult }
  | { readonly type: "store-key"; readonly result: CustomProviderResult; readonly key: string }
  | { readonly type: "report-failure"; readonly error: unknown }
  // 配置已写入后一律关闭：密钥没存上时不能留在表单里重试，因为该 ID 已存在。
  | { readonly type: "finish"; readonly result: CustomProviderResult; readonly keyStored: boolean }

type Transition = { readonly state: CustomProviderState; readonly effects: readonly CustomProviderEffect[] }

const unchanged = (state: CustomProviderState): Transition => ({ state, effects: [] })

export function transitionCustomProvider(state: CustomProviderState, event: CustomProviderEvent): Transition {
  if (event.type === "disposed")
    return state.status === "closed" ? unchanged(state) : { state: { status: "closed" }, effects: [] }

  if (state.status === "editing") {
    if (event.type !== "submitted") return unchanged(state)

    return {
      state: { status: "saving", result: event.result },
      effects: [{ type: "save-config", result: event.result }],
    }
  }

  if (state.status === "saving") {
    if (event.type === "config.failed")
      return { state: { status: "editing" }, effects: [{ type: "report-failure", error: event.error }] }

    if (event.type !== "config.saved") return unchanged(state)

    if (state.result.key)
      return {
        state: { status: "storing-key", result: state.result },
        effects: [{ type: "store-key", result: state.result, key: state.result.key }],
      }

    return { state: { status: "closed" }, effects: [{ type: "finish", result: state.result, keyStored: true }] }
  }

  if (state.status === "storing-key") {
    if (event.type !== "key.settled") return unchanged(state)

    return { state: { status: "closed" }, effects: [{ type: "finish", result: state.result, keyStored: event.stored }] }
  }

  return unchanged(state)
}

export const customProviderBusy = (state: CustomProviderState) =>
  state.status === "saving" || state.status === "storing-key"
