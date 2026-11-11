import { describe, expect, test } from "bun:test"
import { parse } from "jsonc-parser"
import { ConfigProviderPatch } from "@opencode/core/config/provider-patch"

const provider = {
  name: "My API",
  package: "aisdk:@ai-sdk/openai-compatible",
  settings: { baseURL: "https://api.example.com/v1" },
  models: { "model-a": { name: "Model A" } },
}

describe("ConfigProviderPatch.apply", () => {
  test("leaves the text untouched without a providers patch", () => {
    expect(ConfigProviderPatch.apply('{ "shell": "pwsh" }\n', undefined)).toBe('{ "shell": "pwsh" }\n')
  })

  test("adds a provider and preserves comments and other fields", () => {
    const text = '{\n  // 保留的注释\n  "shell": "pwsh"\n}\n'
    const updated = ConfigProviderPatch.apply(text, { myapi: provider })
    expect(updated).toContain("// 保留的注释")
    expect(parse(updated)).toEqual({ shell: "pwsh", providers: { myapi: provider } })
  })

  test("merges into an existing provider without touching unrelated keys", () => {
    const text = JSON.stringify({
      providers: {
        myapi: {
          ...provider,
          settings: { baseURL: "https://old.example.com/v1", apiKey: "{env:MYAPI_KEY}" },
          headers: { "X-Keep": "{env:TOKEN}", "X-Drop": "1" },
          models: { "model-a": { name: "Model A", limit: { context: 1000 } }, "model-b": { name: "Model B" } },
        },
      },
    })
    const updated = ConfigProviderPatch.apply(text, {
      myapi: {
        settings: { baseURL: "https://new.example.com/v1" },
        headers: { "X-Drop": null },
        models: { "model-a": { name: "Renamed" }, "model-b": null, "model-c": { name: "Model C" } },
      },
    })
    expect(parse(updated).providers.myapi).toEqual({
      ...provider,
      settings: { baseURL: "https://new.example.com/v1", apiKey: "{env:MYAPI_KEY}" },
      headers: { "X-Keep": "{env:TOKEN}" },
      models: {
        "model-a": { name: "Renamed", limit: { context: 1000 } },
        "model-c": { name: "Model C" },
      },
    })
  })

  test("removes a provider with null", () => {
    const text = JSON.stringify({ providers: { myapi: provider, other: provider } })
    expect(parse(ConfigProviderPatch.apply(text, { myapi: null })).providers).toEqual({ other: provider })
  })

  test("rejects a provider defined under the legacy provider key", () => {
    const text = JSON.stringify({ provider: { myapi: { npm: "@ai-sdk/openai-compatible" } } })
    expect(() => ConfigProviderPatch.apply(text, { myapi: provider })).toThrow("provider")
  })

  test("rejects a result that does not decode as a provider", () => {
    expect(() => ConfigProviderPatch.apply("{}", { myapi: { models: "invalid" } })).toThrow()
  })
})
