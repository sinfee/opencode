import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { TextInput } from "@opencode/ui/text-input"
import { batch, createSignal, For, type JSX, onCleanup, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { useData } from "@/runtime/server/current"
import { formatServerError } from "@/runtime/server/errors"
import { showToast } from "@/shell/notifications/toast"
import { type CustomProviderResult, type FormState, headerRow, modelRow, validateCustomProvider } from "./form"
import {
  customProviderBusy,
  transitionCustomProvider,
  type CustomProviderEffect,
  type CustomProviderEvent,
  type CustomProviderState,
} from "./machine"

// 配置写入后服务端异步重载，供应商对应的集成稍后才出现；密钥只能在其出现后保存。
const INTEGRATION_POLL_MS = 250
const INTEGRATION_POLL_LIMIT = 60

/** 添加 OpenAI 兼容的自定义供应商：定义写入全局配置，API 密钥经凭据接口保存，不进配置文件。 */
export function DialogCustomProvider(props: { directory?: string }) {
  const dialog = useDialog()
  const data = useData()
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const location = props.directory ? { directory: props.directory } : undefined
  const [machine, setMachine] = createSignal<CustomProviderState>({ status: "editing" })
  const pending = () => customProviderBusy(machine())

  const [form, setForm] = createStore<FormState>({
    providerID: "",
    name: "",
    baseURL: "",
    apiKey: "",
    models: [modelRow()],
    headers: [headerRow()],
    err: {},
  })

  const setField = (key: "providerID" | "name" | "baseURL" | "apiKey", value: string) => {
    setForm(key, value)

    if (key === "apiKey") return
    setForm("err", key, undefined)
  }

  const setModel = (index: number, key: "id" | "name", value: string) => {
    batch(() => {
      setForm("models", index, key, value)
      setForm("models", index, "err", key, undefined)
    })
  }

  const setHeader = (index: number, key: "key" | "value", value: string) => {
    batch(() => {
      setForm("headers", index, key, value)
      setForm("headers", index, "err", key, undefined)
    })
  }

  const validate = () => {
    const output = validateCustomProvider({
      form,
      t: language.t,
      existingProviderIDs: new Set([
        ...(data.location.provider.list(location) ?? []).map((provider) => provider.id),
        ...(data.location.integration.list(location) ?? []).map((integration) => integration.id),
      ]),
    })

    batch(() => {
      setForm("err", output.err)
      output.models.forEach((err, index) => setForm("models", index, "err", err))
      output.headers.forEach((err, index) => setForm("headers", index, "err", err))
    })

    return output.result
  }

  const integrationReady = async (integrationID: string, remaining = INTEGRATION_POLL_LIMIT): Promise<boolean> => {
    const found = await serverSDK.api.integration.get({ integrationID, location }).then(
      () => true,
      () => false,
    )

    if (found || remaining <= 1) return found
    await new Promise((resolve) => setTimeout(resolve, INTEGRATION_POLL_MS))

    return integrationReady(integrationID, remaining - 1)
  }

  const storeKey = async (result: CustomProviderResult, key: string) => {
    if (!(await integrationReady(result.providerID))) return false

    return serverSDK.api.integration.connect.key({ integrationID: result.providerID, location, key }).then(
      () => true,
      () => false,
    )
  }

  const run = (effect: CustomProviderEffect) => {
    if (effect.type === "save-config")
      return void serverSDK.api.experimental.config
        .update({ providers: { [effect.result.providerID]: effect.result.config } })
        .then(
          () => dispatch({ type: "config.saved" }),
          (error: unknown) => dispatch({ type: "config.failed", error }),
        )

    if (effect.type === "store-key")
      return void storeKey(effect.result, effect.key).then((stored) => dispatch({ type: "key.settled", stored }))

    if (effect.type === "report-failure")
      return void showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: formatServerError(effect.error, language.t),
      })

    dialog.close()

    if (!effect.keyStored)
      return void showToast({
        variant: "error",
        title: language.t("provider.custom.toast.keyFailed.title", { provider: effect.result.name }),
        description: language.t("provider.custom.toast.keyFailed.description"),
      })

    showToast({
      variant: "success",
      icon: "circle-check",
      title: language.t("provider.connect.toast.connected.title", { provider: effect.result.name }),
      description: language.t("provider.connect.toast.connected.description", { provider: effect.result.name }),
    })
  }

  const dispatch = (event: CustomProviderEvent) => {
    const next = transitionCustomProvider(machine(), event)

    setMachine(next.state)
    next.effects.forEach(run)
  }

  onCleanup(() => dispatch({ type: "disposed" }))

  const save = (event: SubmitEvent) => {
    event.preventDefault()

    if (pending()) return
    const result = validate()

    if (result) dispatch({ type: "submitted", result })
  }

  return (
    <Dialog
      preventBackdropDismiss
      containerClass="!rounded-[12px] !bg-v2-background-bg-base !w-[min(calc(100vw_-_16px),640px)] !h-[min(calc(100vh_-_16px),680px)]"
      class="[font-family:var(--v2-font-family-sans)]"
    >
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("provider.custom.title")}
          description={language.t("provider.custom.description")}
        />
      </DialogHeader>
      <DialogBody class="min-h-0 flex-1 overflow-hidden">
        <form
          data-scrollable
          onSubmit={save}
          class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-muted"
        >
          <Field
            label={language.t("provider.custom.field.providerID.label")}
            description={language.t("provider.custom.field.providerID.description")}
            error={form.err.providerID}
          >
            <TextInput
              class="!w-full"
              autofocus
              data-input="custom-provider-id"
              placeholder={language.t("provider.custom.field.providerID.placeholder")}
              value={form.providerID}
              invalid={!!form.err.providerID}
              onInput={(event) => setField("providerID", event.currentTarget.value)}
              autocomplete="off"
              spellcheck={false}
            />
          </Field>
          <Field label={language.t("provider.custom.field.name.label")} error={form.err.name}>
            <TextInput
              class="!w-full"
              data-input="custom-provider-name"
              placeholder={language.t("provider.custom.field.name.placeholder")}
              value={form.name}
              invalid={!!form.err.name}
              onInput={(event) => setField("name", event.currentTarget.value)}
              autocomplete="off"
            />
          </Field>
          <Field label={language.t("provider.custom.field.baseURL.label")} error={form.err.baseURL}>
            <TextInput
              class="!w-full"
              data-input="custom-provider-base-url"
              placeholder={language.t("provider.custom.field.baseURL.placeholder")}
              value={form.baseURL}
              invalid={!!form.err.baseURL}
              onInput={(event) => setField("baseURL", event.currentTarget.value)}
              autocomplete="off"
              spellcheck={false}
            />
          </Field>
          <Field
            label={language.t("provider.custom.field.apiKey.label")}
            description={language.t("provider.custom.field.apiKey.description")}
          >
            <TextInput
              class="!w-full"
              type="password"
              data-input="custom-provider-api-key"
              placeholder={language.t("provider.custom.field.apiKey.placeholder")}
              value={form.apiKey}
              onInput={(event) => setField("apiKey", event.currentTarget.value)}
              autocomplete="off"
              spellcheck={false}
            />
          </Field>

          <div class="flex flex-col gap-2">
            <div class="font-[530] leading-4 text-v2-text-text-base">{language.t("provider.custom.models.label")}</div>
            <For each={form.models}>
              {(model, index) => (
                <div class="flex items-start gap-2" data-row={model.row}>
                  <Cell error={model.err.id}>
                    <TextInput
                      class="!w-full"
                      aria-label={language.t("provider.custom.models.id.label")}
                      placeholder={language.t("provider.custom.models.id.placeholder")}
                      value={model.id}
                      invalid={!!model.err.id}
                      onInput={(event) => setModel(index(), "id", event.currentTarget.value)}
                      autocomplete="off"
                      spellcheck={false}
                    />
                  </Cell>
                  <Cell error={model.err.name}>
                    <TextInput
                      class="!w-full"
                      aria-label={language.t("provider.custom.models.name.label")}
                      placeholder={language.t("provider.custom.models.name.placeholder")}
                      value={model.name}
                      invalid={!!model.err.name}
                      onInput={(event) => setModel(index(), "name", event.currentTarget.value)}
                      autocomplete="off"
                    />
                  </Cell>
                  <IconButton
                    type="button"
                    icon={<Icon name="trash" />}
                    variant="ghost"
                    class="mt-0.5"
                    disabled={form.models.length <= 1}
                    aria-label={language.t("provider.custom.models.remove")}
                    onClick={() =>
                      setForm(
                        "models",
                        produce((rows) => void rows.splice(index(), 1)),
                      )
                    }
                  />
                </div>
              )}
            </For>
            <Button
              type="button"
              size="small"
              variant="ghost"
              icon="plus-small"
              class="self-start"
              onClick={() =>
                setForm(
                  "models",
                  produce((rows) => void rows.push(modelRow())),
                )
              }
            >
              {language.t("provider.custom.models.add")}
            </Button>
          </div>

          <div class="flex flex-col gap-2">
            <div class="font-[530] leading-4 text-v2-text-text-base">{language.t("provider.custom.headers.label")}</div>
            <For each={form.headers}>
              {(header, index) => (
                <div class="flex items-start gap-2" data-row={header.row}>
                  <Cell error={header.err.key}>
                    <TextInput
                      class="!w-full"
                      aria-label={language.t("provider.custom.headers.key.label")}
                      placeholder={language.t("provider.custom.headers.key.placeholder")}
                      value={header.key}
                      invalid={!!header.err.key}
                      onInput={(event) => setHeader(index(), "key", event.currentTarget.value)}
                      autocomplete="off"
                      spellcheck={false}
                    />
                  </Cell>
                  <Cell error={header.err.value}>
                    <TextInput
                      class="!w-full"
                      aria-label={language.t("provider.custom.headers.value.label")}
                      placeholder={language.t("provider.custom.headers.value.placeholder")}
                      value={header.value}
                      invalid={!!header.err.value}
                      onInput={(event) => setHeader(index(), "value", event.currentTarget.value)}
                      autocomplete="off"
                      spellcheck={false}
                    />
                  </Cell>
                  <IconButton
                    type="button"
                    icon={<Icon name="trash" />}
                    variant="ghost"
                    class="mt-0.5"
                    disabled={form.headers.length <= 1}
                    aria-label={language.t("provider.custom.headers.remove")}
                    onClick={() =>
                      setForm(
                        "headers",
                        produce((rows) => void rows.splice(index(), 1)),
                      )
                    }
                  />
                </div>
              )}
            </For>
            <Button
              type="button"
              size="small"
              variant="ghost"
              icon="plus-small"
              class="self-start"
              onClick={() =>
                setForm(
                  "headers",
                  produce((rows) => void rows.push(headerRow())),
                )
              }
            >
              {language.t("provider.custom.headers.add")}
            </Button>
          </div>

          <Button
            type="submit"
            variant="contrast"
            class="self-start"
            data-action="custom-provider-submit"
            disabled={pending()}
            aria-busy={pending()}
          >
            {pending() ? language.t("common.saving") : language.t("common.submit")}
          </Button>
        </form>
      </DialogBody>
    </Dialog>
  )
}

function Field(props: { label: string; description?: string; error?: string; children: JSX.Element }) {
  return (
    <label class="flex w-full flex-col gap-2 font-[530] leading-4 text-v2-text-text-base">
      {props.label}
      {props.children}
      <Show when={props.error ?? props.description}>
        {(text) => (
          <span
            role={props.error ? "alert" : undefined}
            class="text-xs font-[440]"
            classList={{ "text-v2-state-fg-danger": !!props.error, "text-v2-text-text-faint": !props.error }}
          >
            {text()}
          </span>
        )}
      </Show>
    </label>
  )
}

function Cell(props: { error?: string; children: JSX.Element }) {
  return (
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      {props.children}
      <Show when={props.error}>
        {(error) => (
          <span role="alert" class="text-xs text-v2-state-fg-danger">
            {error()}
          </span>
        )}
      </Show>
    </div>
  )
}
