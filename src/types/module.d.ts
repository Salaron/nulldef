import { MessageContext } from "vk-io/typings/index"

interface nullModule {
  regExp: RegExp[]
  loadByDefault: boolean
  help?: string
  execute(ctx: MessageContext, pattern: number): Promise<void>
}