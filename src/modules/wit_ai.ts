import { NlModule } from "../core/module"
import { MessageForward } from "vk-io"
import request from "request-promise-native"
import Config from "../config"
import { ErrorNotice } from "../models/errors"
import { INullMessageContext } from "../handlers/message"

export default class extends NlModule {
  public regExp = [/^stt$/i, /^autostt$/i]
  public loadByDefault = true
  public restrictUnload = false

  public async init() {
    return
  }

  public async execute(msgCtx: INullMessageContext, triggeredRegExp: number) {
    switch (triggeredRegExp) {
      case 0: {
        await this.stt(msgCtx)
        return
      }
      case 1: {
        await this.autostt(msgCtx)
        return
      }
    }
  }

  public async stt(msgCtx: INullMessageContext) {
    let counter = 0
    const urlList: { url: string, duraction: number }[] = []
    let result = `Аудио -> Текст:\n`

    if (msgCtx.replyMessage) {
      for (const audio of msgCtx.replyMessage.getAttachments("audio_message")) {
        if (audio.duration && audio.duration < 20 && audio.mp3Url) urlList.push({
          url: audio.mp3Url,
          duraction: audio.duration
        })
      }
    }
    function checkForwards(messages: MessageForward[]) {
      for (const fwd of messages) {
        for (const audio of fwd.getAttachments("audio_message")) {
          if (audio.duration && audio.duration < 20 && audio.mp3Url) urlList.push({
            url: audio.mp3Url,
            duraction: audio.duration
          })
        }
        if (fwd.forwards) checkForwards(fwd.forwards)
      }
    }
    for (const audio of msgCtx.getAttachments("audio_message")) {
      if (audio.duration && audio.duration < 20 && audio.mp3Url) urlList.push({
        url: audio.mp3Url,
        duraction: audio.duration
      })
    }
    checkForwards(msgCtx.forwards)

    if (urlList.length === 0) throw new ErrorNotice("Аудиосообщения не найдены, либо длина превышает 20 секунд.")
    for (const url of urlList) {
      counter += 1
      if (urlList.length != 1) result += `———— { #${counter} (00:${url.duraction}) } ————\n`
      result += await this.voiceRecognition(url.url) + "\n"
    }

    await msgCtx.send(result)
  }
  private async autostt(context: INullMessageContext) {
    await context.connection.execute(`INSERT INTO null_peer_params (peer_id, name, value) VALUES (:peer, :name, :val) ON DUPLICATE KEY UPDATE value = :val`, {
      peer: context.peerId,
      name: "autostt",
      val: context.params.autostt == 0 ? 1 : 0
    })
    if (context.params.autostt == 0) {
      await context.send("Автоматическое распознавание аудиосообщений включено")
    } else {
      await context.send("Автоматическое распознавание аудиосообщений отключено")
    }
  }

  private async voiceRecognition(url: string) {
    const audioMsg = await request.get(url, {
      encoding: null
    })
    if (Config.witAi.token.length === 0) throw new Error(`Wit.AI token not exists`)
    // TODO: voice recognition more than 20 sec
    const response = await request.post("https://api.wit.ai/speech", {
      gzip: true,
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${Config.witAi.token}`,
        "Content-Type": "audio/mpeg3",
        "Transfer-Encoding": "chunked"
      },
      body: audioMsg,
      encoding: null
    })
    return JSON.parse(response)._text
  }
}
