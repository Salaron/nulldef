import crypto from "crypto"
import createDebug from "debug"
import got, { Got } from "got"
import { CookieJar } from "tough-cookie"
import { timeStamp, createObjCopy } from "../core/utils"
import { API } from "./api"

const debug = createDebug("SGO")

interface ISGOSession {
  AT: string
  VER: number
  LT: number
  userId: number
  yearId: number
  name: string
  requestCount: number
  lastRequestDate: number
  sessionStarted: number
}
interface ISendRequestOptions {
  requestData?: any
  method?: "POST" | "GET"
  responseType?: "text" | "json" | "buffer"
}

export const defaultSession: ISGOSession = {
  AT: "",
  name: "",
  userId: 0,
  yearId: 0,
  VER: 0,
  LT: 0,
  requestCount: 0,
  lastRequestDate: timeStamp(),
  sessionStarted: timeStamp()
}

export default class SGO {
  public API = new API(this)
  public session: ISGOSession = createObjCopy(defaultSession)

  protected HOST = "https://sgo.edu-74.ru/"
  protected headers: { [name: string]: string } = {
    "connection": "keep-alive",
    "accept": "*/*",
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7,ja-JP;q=0.6,ja;q=0.5",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.39 Safari/537.36",
    "origin": "https://sgo.edu-74.ru",
    "referer": "https://sgo.edu-74.ru/",
    "x-requested-with": "XMLHttpRequest"
  }
  protected username: string
  protected password: string
  protected httpClient: Got

  public static async startSession(username: string, password: string) {
    const client = new SGO()
    client.username = username
    client.password = password
    await client.resetInstance()
    return client
  }

  public async sendRequest(endpoint: string, options?: ISendRequestOptions): Promise<any> {
    debug(`Sending request to endpoint: ${endpoint}`)
    if (options && options.requestData) debug(options.requestData)

    if (
      timeStamp() - this.session.lastRequestDate > 3600 || // after 1 hour session will be expired
      timeStamp() - this.session.sessionStarted > 86399    // or after 1 day since we're logged in
    ) {
      debug("Current session is expired. Attempt to login again...")
      await this.resetInstance()
    }
    this.session.lastRequestDate = timeStamp()
    this.session.requestCount += 1

    try {
      const response = await this.httpClient(endpoint, {
        method: options?.method,
        headers: this.headers,
        resolveBodyOnly: true,
        form: options?.method === "POST" ? options.requestData : undefined,
        searchParams: !options?.method || options.method === "GET" ? options?.requestData : undefined,
        responseType: options?.responseType
      })
      return response
    } catch (err) {
      if (err.name === "HTTPError" && err.response && err.response.statusCode && err.response.statusCode === 401) {
        await this.resetInstance()
        // retry request
        return await this.sendRequest(endpoint, options)
      } else {
        throw err
      }
    }
  }

  private async resetInstance() {
    await this.API.logout()
    this.session = createObjCopy(defaultSession)
    this.httpClient = got.extend({
      prefixUrl: "https://sgo.edu-74.ru",
      cookieJar: new CookieJar()
    })

    const authData = await this.sendRequest("webapi/auth/getdata", {
      responseType: "json",
      method: "POST"
    })
    this.session.LT = authData.lt
    this.session.VER = authData.ver

    const pw2 = crypto
      .createHash("MD5")
      .update(
        authData.salt +
        crypto
          .createHash("MD5")
          .update(this.password)
          .digest("hex")
      )
      .digest("hex")

    // I'm toooo lazy, sorry
    const requestData = {
      LoginType: 1,
      cid: 2,
      sid: 1,
      pid: 31,
      cn: 91,
      sft: 2,
      scid: 1086,
      UN: this.username,
      PW: pw2.slice(0, this.password.length),
      lt: authData.lt,
      pw2,
      ver: authData.ver
    }
    const response = await this.sendRequest("webapi/login", {
      responseType: "json",
      requestData,
      method: "POST"
    })
    this.session.AT = this.headers.at = response.at

    const diaryPage = await this.sendRequest("angular/school/studentdiary/", {
      requestData: { at: this.session.AT, VER: authData.ver },
      method: "POST"
    })
    const diary = await this.sendRequest("webapi/student/diary/init", {
      method: "GET",
      responseType: "json"
    })
    this.session.userId = diary.students[0].studentId
    this.session.name = diary.students[0].nickName
    this.session.yearId = parseInt(diaryPage.match(/appContext.yearId = "[0-9]+"/)[0].match(/[0-9]+/), 10)
    debug(`Successfully logged in as ${this.session.name}`)
  }
}
