import { describe, expect, test } from "bun:test"
import { validateCustomProvider, type FormState } from "./form"

const t = (key: string) => key

const form = (input: Partial<FormState>): FormState => ({
  providerID: "custom-provider",
  name: "Provider",
  baseURL: "https://api.example.com",
  apiKey: "",
  models: [{ row: "m0", id: "model-a", name: "Model A", err: {} }],
  headers: [{ row: "h0", key: "", value: "", err: {} }],
  err: {},
  ...input,
})

describe("validateCustomProvider", () => {
  test("builds a trimmed provider config and registers an env key by name", () => {
    const result = validateCustomProvider({
      form: form({
        name: " Custom Provider ",
        baseURL: "https://api.example.com ",
        apiKey: " {env: CUSTOM_PROVIDER_KEY} ",
        models: [{ row: "m0", id: " model-a ", name: " Model A ", err: {} }],
        headers: [
          { row: "h0", key: " X-Test ", value: " enabled ", err: {} },
          { row: "h1", key: "", value: "", err: {} },
        ],
      }),
      t,
      existingProviderIDs: new Set(),
    })

    expect(result.result).toEqual({
      providerID: "custom-provider",
      name: "Custom Provider",
      key: undefined,
      config: {
        name: "Custom Provider",
        package: "aisdk:@ai-sdk/openai-compatible",
        env: ["CUSTOM_PROVIDER_KEY"],
        settings: { baseURL: "https://api.example.com" },
        headers: { "X-Test": "enabled" },
        models: { "model-a": { name: "Model A" } },
      },
    })
  })

  test("keeps a literal key out of the provider config", () => {
    const result = validateCustomProvider({ form: form({ apiKey: " secret " }), t, existingProviderIDs: new Set() })

    expect(result.result?.key).toBe("secret")
    expect(JSON.stringify(result.result?.config)).not.toContain("secret")
  })

  test("flags existing provider IDs and duplicate rows", () => {
    const result = validateCustomProvider({
      form: form({
        models: [
          { row: "m0", id: "model-a", name: "Model A", err: {} },
          { row: "m1", id: "model-a", name: "Model A 2", err: {} },
        ],
        headers: [
          { row: "h0", key: "Authorization", value: "one", err: {} },
          { row: "h1", key: "authorization", value: "two", err: {} },
        ],
      }),
      t,
      existingProviderIDs: new Set(["custom-provider"]),
    })

    expect(result.result).toBeUndefined()
    expect(result.err.providerID).toBe("provider.custom.error.providerID.exists")
    expect(result.models).toEqual([
      { id: undefined, name: undefined },
      { id: "provider.custom.error.duplicate", name: undefined },
    ])
    expect(result.headers).toEqual([
      { key: undefined, value: undefined },
      { key: "provider.custom.error.duplicate", value: undefined },
    ])
  })

  test("requires a valid ID, name, URL and model", () => {
    const result = validateCustomProvider({
      form: form({
        providerID: "Bad ID",
        name: " ",
        baseURL: "api.example.com",
        models: [{ row: "m0", id: "", name: "", err: {} }],
      }),
      t,
      existingProviderIDs: new Set(),
    })

    expect(result.result).toBeUndefined()
    expect(result.err).toEqual({
      providerID: "provider.custom.error.providerID.format",
      name: "provider.custom.error.name.required",
      baseURL: "provider.custom.error.baseURL.format",
    })
    expect(result.models).toEqual([{ id: "provider.custom.error.required", name: "provider.custom.error.required" }])
  })
})
