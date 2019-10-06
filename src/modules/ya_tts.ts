import { NlModule } from "../core/module"
import { MessageContext } from "vk-io"
import request from "request-promise-native"
import Config from "../config"
import qs from "querystring"
import { vk } from "../nulldef"


export default class extends NlModule {
  public regExp = [/^tts/i]
  public loadByDefault = true
  public restrictUnload = false
  public commandUsage = `${Config.commandFlag}say{1-6}[1-3] <текст> -- преобразует текст в речь. От 1 до 6 голос, от 1 до 3 интонация`

  public async execute(msgCtx: MessageContext, triggeredRegExp: number) {
    switch (triggeredRegExp) {
      case 0: {
        await this.tts(msgCtx)
        return
      }
    }
  }

  public async tts(msgCtx: MessageContext) {
    if (msgCtx.text.substr(5).length === 0) throw new ErrorNotice("Текст отсутствует!")
    let audio = await this.textToSpeech(msgCtx.text.substr(5), parseInt(msgCtx.text[3]), parseInt(msgCtx.text[4]) || 1)
    
    const attachment = await vk.upload.audioMessage({
			peer_id: msgCtx.peerId,

			source: Buffer.from(audio, "binary")
    });
    // @ts-ignore
    await vk.api.messages.send({
      peer_id: msgCtx.peerId,

      ...({attachment})
    })
  }

  private async textToSpeech(text: string, voiceId = 1, emotionId = 1) {
    if (Config.yaToken.length === 0)
      throw new Error(`Yandex OAuth token not exists`)
    let iamToken = await request.post(
      "https://iam.api.cloud.yandex.net/iam/v1/tokens",
      {
        form: JSON.stringify({
          yandexPassportOauthToken: Config.yaToken
        }),
        json: true
      }
    )
    const voices: any = {
      1: "oksana",
      2: "alyss",
      3: "jane",
      4: "omazh",
      5: "zahar",
      6: "ermil"
    }
    const emotions: any = {
      1: "neutral",
      2: "evil",
      3: "good"
    }

    return await request.post(
      "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize?" +
      qs.stringify({
        folderId: Config.yaFolderId
      }),
      {
        gzip: true,
        encoding: "binary",
        headers: {
          Authorization: `Bearer ${iamToken.iamToken}`
        },
        form: {
          text,
          voice: voices[voiceId],
          emotion: emotions[emotionId],
          speed: "1.15"
        }
      }
    )
  }
}
