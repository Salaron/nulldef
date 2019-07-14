import { voiceRecognition } from "./witAi"
import { Connection } from "../core/database"
import Utils from "../core/utils"
import Config from "../config"
const { version } = require("../../package.json")

export default class vkCommands {
  private connection: Connection
  private message: vkMessage
  private args: string[]
  constructor(connection: Connection, message: vkMessage, args: string[]) {
    this.connection = connection
    this.message = message
    this.args = args
  }

  public async stt(helpUsage: boolean = false) {
    if (helpUsage) return `перевод голосового сообщения в текстовое. Лимит -- 20 секунд. Ответьте или перешлите сообщение, которое нужно распознать.`

    if (typeof this.message.reply_message === 'undefined' && this.message.fwd_messages.length === 0 && !this.args.includes("force")) return `Нет пересланных сообщений`

    let counter = 0
    let urlList: string[] = []
    let result = `Аудио -> Текст:\n`

    function checkAllReplies(message: vkMessage | vkMessageMin | undefined) {
      if (!message) return
      if (message.attachments) message.attachments.forEach((att: vkAttachment) => {
        if (att.type === "audio_message" && att.audio_message.duration < 20) urlList.push(att.audio_message.link_mp3)
      })
      if ((<vkMessage>message).reply_message) checkAllReplies((<vkMessage>message).reply_message)
    }
    function checkAllFwd(message: vkMessage | vkMessageMin) {
      if (message.attachments) message.attachments.forEach((att: vkAttachment) => {
        if (att.type === "audio_message" && att.audio_message.duration < 20) urlList.push(att.audio_message.link_mp3)
      })
      if ((<vkMessage>message).fwd_messages && (<vkMessage>message).fwd_messages.length > 0) {
        (<vkMessage>message).fwd_messages.forEach(async (message: vkMessageMin) => {
          checkAllFwd(message)
        })
      }
      if (typeof (<vkMessage>message).reply_message != 'undefined') {
        checkAllReplies((<vkMessage>message).reply_message)
      }
    }
    if (this.message.attachments) this.message.attachments.forEach((att: vkAttachment) => {
      if (att.type === "audio_message" && att.audio_message.duration < 20) urlList.push(att.audio_message.link_mp3)
    })

    // ignore fwd & reply messages on autostt
    if (this.message.fwd_messages && this.message.fwd_messages.length > 0 && !this.args.includes("force")) {
      this.message.fwd_messages.forEach(async (message: vkMessageMin) => {
        checkAllFwd(message)
      })
    } else if (typeof this.message.reply_message != 'undefined' && !this.args.includes("force")) {
      checkAllReplies(this.message.reply_message)
    }
    if (urlList.length === 0) return `Здесь нет аудио сообщений`

    await urlList.forEachAsync(async (url: string) => {
      counter += 1
      if (urlList.length != 1) result += `--------{#${counter}}--------\n`
      result += await voiceRecognition(url) + `\n`
    })
    return result
  }
  public async autostt(helpUsage: boolean = false) {
    if (helpUsage) return `включение/отключение автоматического распознования голосовых сообщений.`

    let statements: any = {
      0: "Автоматическое распознование голосовых сообщений отключено.",
      1: "Автоматическое распознование голосовых сообщение включено."
    }
    let params = await (new Utils(this.connection)).getChatParams(this.message.peer_id, ["autostt"])
    if (typeof params["autostt"] === "number") {
      await this.connection.query(`UPDATE chat_params SET value = :val WHERE peer_id = :peer AND param = "autostt"`, {
        val: Math.abs(params["autostt"] - 1),
        peer: this.message.peer_id
      })
      return statements[Math.abs(params["autostt"] - 1)]
    }
    await this.connection.query(`INSERT INTO chat_params (peer_id, param, value) VALUES (:peer, "autostt", 0)`, {
      peer: this.message.peer_id
    })
    return statements[0]
  }
  public async help(helpUsage: boolean = false) {
    if (helpUsage) return `справка.`

    let methods = Object.getOwnPropertyNames(vkCommands.prototype)
    let result = `NullDef v${version}\n\nСписок доступных команд:\n`
    await methods.forEachAsync(async (method) => {
      if (method === "constructor") return
      let class_ = this as any
      let usage = await class_[method](true)
      result += `${Config.bot.commandFlag}${method} -- ${usage}\n\n`
    })
    return result
  }
}