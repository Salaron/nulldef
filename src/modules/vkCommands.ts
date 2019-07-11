import { voiceRecognition } from "./witAi"
import { Connection } from "../core/database"
import Utils from "../core/utils";

namespace vkCommands {
  export async function stt(connection: Connection, message: vkMessage, args: string[]) {
    if (typeof message.reply_message === 'undefined' && message.fwd_messages.length === 0 && !args.includes("force")) return `Нет пересланных сообщений`

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
    if (message.attachments) message.attachments.forEach((att: vkAttachment) => {
      if (att.type === "audio_message" && att.audio_message.duration < 20) urlList.push(att.audio_message.link_mp3)
    })
    if (message.fwd_messages && message.fwd_messages.length > 0) {
      message.fwd_messages.forEach(async (message: vkMessageMin) => {
        checkAllFwd(message)
      })
    } else if (typeof message.reply_message != 'undefined') {
      checkAllReplies(message.reply_message)
    }
    if (urlList.length === 0) return `Здесь нет аудио сообщений`

    await urlList.forEachAsync(async (url: string) => {
      counter += 1
      if (urlList.length != 1) result += `--------{#${counter}}--------\n`
      result += await voiceRecognition(url) + `\n`
    })
    return result
  }
  export async function autostt(connection: Connection, message: vkMessage, args: string[]) {
    let statements: any = {
      0: "Автоматическое распознование голосовых сообщений отключено.",
      1: "Автоматическое распознование голосовых сообщение включено."
    }
    let params = await (new Utils(connection)).getChatParams(message.peer_id, ["autostt"])
    if (typeof params["autostt"] === "number") {
      await connection.query(`UPDATE chat_params SET value = :val WHERE peer_id = :peer AND param = "autostt"`, {
        val: Math.abs(params["autostt"] - 1),
        peer: message.peer_id
      })
      return statements[Math.abs(params["autostt"] - 1)]
    }
    await connection.query(`INSERT INTO chat_params (peer_id, param, value) VALUES (:peer, "autostt", 0)`, {
      peer: message.peer_id
    })
    return statements[0]
  }
  export async function help(connection: Connection, message: vkMessage, args: string[]) {

  }
}

export default vkCommands