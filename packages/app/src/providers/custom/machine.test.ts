import { describe, expect, test } from "bun:test"
import type { CustomProviderResult } from "./form"
import {
  customProviderBusy,
  transitionCustomProvider,
  type CustomProviderEvent,
  type CustomProviderState,
} from "./machine"

const result = (key?: string): CustomProviderResult => ({
  providerID: "custom",
  name: "Custom",
  key,
  config: {
    name: "Custom",
    package: "aisdk:@ai-sdk/openai-compatible",
    settings: { baseURL: "https://api.example.com/v1" },
    models: { model: { name: "Model" } },
  },
})

const replay = (events: readonly CustomProviderEvent[]) =>
  events.reduce(
    (current, event) => {
      const next = transitionCustomProvider(current.state, event)

      return { state: next.state, effects: [...current.effects, ...next.effects] }
    },
    {
      state: { status: "editing" } as CustomProviderState,
      effects: [] as ReturnType<typeof transitionCustomProvider>["effects"],
    },
  )

describe("transitionCustomProvider", () => {
  test("saves the config, then stores the key before finishing", () => {
    const input = result("secret")
    const done = replay([
      { type: "submitted", result: input },
      { type: "config.saved" },
      { type: "key.settled", stored: true },
    ])

    expect(done.state).toEqual({ status: "closed" })
    expect(done.effects).toEqual([
      { type: "save-config", result: input },
      { type: "store-key", result: input, key: "secret" },
      { type: "finish", result: input, keyStored: true },
    ])
  })

  test("finishes without a key step when no key was entered", () => {
    const input = result()
    const done = replay([{ type: "submitted", result: input }, { type: "config.saved" }])

    expect(done.effects.at(-1)).toEqual({ type: "finish", result: input, keyStored: true })
  })

  test("returns to editing when the config write fails", () => {
    const failed = replay([
      { type: "submitted", result: result("secret") },
      { type: "config.failed", error: "boom" },
    ])

    expect(failed.state).toEqual({ status: "editing" })
    expect(failed.effects.at(-1)).toEqual({ type: "report-failure", error: "boom" })
  })

  test("closes and reports a key that could not be stored", () => {
    const input = result("secret")
    const done = replay([
      { type: "submitted", result: input },
      { type: "config.saved" },
      { type: "key.settled", stored: false },
    ])

    expect(done.effects.at(-1)).toEqual({ type: "finish", result: input, keyStored: false })
  })

  test("ignores a second submit while busy and results after disposal", () => {
    const saving = replay([{ type: "submitted", result: result() }])

    expect(customProviderBusy(saving.state)).toBe(true)
    expect(transitionCustomProvider(saving.state, { type: "submitted", result: result() }).state).toBe(saving.state)

    const disposed = transitionCustomProvider(saving.state, { type: "disposed" }).state

    expect(transitionCustomProvider(disposed, { type: "config.saved" })).toEqual({ state: disposed, effects: [] })
  })
})
