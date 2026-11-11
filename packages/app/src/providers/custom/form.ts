const PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/

const OPENAI_COMPATIBLE = "aisdk:@ai-sdk/openai-compatible"

type Translator = (key: string, vars?: Record<string, string | number | boolean>) => string

export type ModelErr = {
  id?: string
  name?: string
}

export type HeaderErr = {
  key?: string
  value?: string
}

export type ModelRow = {
  row: string
  id: string
  name: string
  err: ModelErr
}

export type HeaderRow = {
  row: string
  key: string
  value: string
  err: HeaderErr
}

export type FormState = {
  providerID: string
  name: string
  baseURL: string
  apiKey: string
  models: ModelRow[]
  headers: HeaderRow[]
  err: {
    providerID?: string
    name?: string
    baseURL?: string
  }
}

export type CustomProviderResult = NonNullable<ReturnType<typeof validateCustomProvider>["result"]>

export function validateCustomProvider(input: { form: FormState; t: Translator; existingProviderIDs: Set<string> }) {
  const providerID = input.form.providerID.trim()
  const name = input.form.name.trim()
  const baseURL = input.form.baseURL.trim()
  const apiKey = input.form.apiKey.trim()

  // `{env:NAME}` 只登记环境变量名；明文密钥不写入配置，保存后交给凭据接口。
  const env = apiKey.match(/^\{env:([^}]+)\}$/)?.[1]?.trim()
  const key = apiKey && !env ? apiKey : undefined

  const idError = !providerID
    ? input.t("provider.custom.error.providerID.required")
    : !PROVIDER_ID.test(providerID)
      ? input.t("provider.custom.error.providerID.format")
      : input.existingProviderIDs.has(providerID)
        ? input.t("provider.custom.error.providerID.exists")
        : undefined

  const nameError = !name ? input.t("provider.custom.error.name.required") : undefined

  const urlError = !baseURL
    ? input.t("provider.custom.error.baseURL.required")
    : !/^https?:\/\//.test(baseURL)
      ? input.t("provider.custom.error.baseURL.format")
      : undefined

  const models = input.form.models.map((model, index, rows) => {
    const id = model.id.trim()

    return {
      id: !id
        ? input.t("provider.custom.error.required")
        : rows.findIndex((row) => row.id.trim() === id) !== index
          ? input.t("provider.custom.error.duplicate")
          : undefined,
      name: !model.name.trim() ? input.t("provider.custom.error.required") : undefined,
    }
  })

  const headers = input.form.headers.map((header, index, rows) => {
    const key = header.key.trim()
    const value = header.value.trim()

    if (!key && !value) return {}

    return {
      key: !key
        ? input.t("provider.custom.error.required")
        : rows.findIndex((row) => row.key.trim().toLowerCase() === key.toLowerCase()) !== index
          ? input.t("provider.custom.error.duplicate")
          : undefined,
      value: !value ? input.t("provider.custom.error.required") : undefined,
    }
  })

  const err = { providerID: idError, name: nameError, baseURL: urlError }

  const ok =
    !idError &&
    !nameError &&
    !urlError &&
    models.every((model) => !model.id && !model.name) &&
    headers.every((header) => !header.key && !header.value)

  if (!ok) return { err, models, headers }

  const headerConfig = Object.fromEntries(
    input.form.headers
      .map((header) => [header.key.trim(), header.value.trim()] as const)
      .filter(([key, value]) => !!key && !!value),
  )

  return {
    err,
    models,
    headers,
    result: {
      providerID,
      name,
      key,
      config: {
        name,
        package: OPENAI_COMPATIBLE,
        ...(env ? { env: [env] } : {}),
        settings: { baseURL },
        ...(Object.keys(headerConfig).length ? { headers: headerConfig } : {}),
        models: Object.fromEntries(input.form.models.map((model) => [model.id.trim(), { name: model.name.trim() }])),
      },
    },
  }
}

let row = 0

const nextRow = () => `row-${row++}`

export const modelRow = (): ModelRow => ({ row: nextRow(), id: "", name: "", err: {} })

export const headerRow = (): HeaderRow => ({ row: nextRow(), key: "", value: "", err: {} })
