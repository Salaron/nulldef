import "../config"
import { Log, LEVEL } from "./log"
import { timeStamp } from "./utils"
import request from "request-promise-native"
import crypto from "crypto"
import querystring from "querystring"
import WebSocket from "ws"
import moment from "moment"

const cheerio = require("cheerio")
const cheerioTable = require("cheerio-tableparser")

interface SgoOptions {
  logger?: Log
  logLevel?: LEVEL
  host?: string
  username: string
  password: string
}
interface SgoSession {
  AT: string
  userId: number
  name: string
  VER: number
  LT: number
  requestCount: number
  lastRequestDate: number
  sessionStarted: number
}
interface SendRequestOptions {
  data?: any
  method: "POST" | "GET"
  json?: boolean
}
interface Subject {
  name: string
  marks: {
    date: string
    marks: string[]
    marksRemoved: string[]
    marksAdded: string[]
  }[]
  haveChanges: boolean
  avgMark: string
}
interface UserInfo {
  schoolId: number
  userId: number
  nickName: string
  roles: string
  eMs: string
  class: null | string
}

export default class SGO {
  public HOST = "https://sgo.edu-74.ru/"
  public session: SgoSession

  public log: Log
  public headers = {
    Connection: "keep-alive",
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.39 Safari/537.36",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language":
      "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7,ja-JP;q=0.6,ja;q=0.5",
    Referer: "https://sgo.edu-74.ru/",
    at: undefined
  }

  protected cookie = request.jar()
  protected username: string
  protected password: string

  constructor(options: SgoOptions) {
    if (options.logger instanceof Log) this.log = options.logger
    else this.log = new Log("SGO")

    this.username = options.username
    this.password = options.password
  }

  public async startNewSession(username = this.username, pass = this.password) {
    this.session = {
      AT: "",
      name: "",
      userId: 0,
      VER: 0,
      LT: 0,
      requestCount: 0,
      lastRequestDate: timeStamp(),
      sessionStarted: timeStamp()
    }

    // load login form
    await this.sendRequest(`webapi/logindata`, {
      json: true,
      method: "GET"
    })

    let authData = await this.sendRequest(`webapi/auth/getdata`, {
      json: true,
      method: "POST"
    })
    this.session.LT = authData.lt
    this.session.VER = authData.ver

    let pw2 = crypto
      .createHash("MD5")
      .update(
        authData.salt +
        crypto
          .createHash("MD5")
          .update(pass)
          .digest("hex")
      )
      .digest("hex")

    let requestData = {
      LoginType: 1,
      cid: 2,
      sid: 1,
      pid: 31,
      cn: 91,
      sft: 2,
      scid: 1086,
      UN: username,
      PW: pw2.slice(0, pass.length),
      lt: authData.lt,
      pw2: pw2,
      ver: authData.ver
    }
    let response = await this.sendRequest(`webapi/login`, {
      json: true,
      data: requestData,
      method: "POST"
    })
    if (response.entryPoint != `/angular/school/studentdiary/`)
      this.log.warn(
        `You have ${
        response.requestData.atlist.split("\u0001").length
        } active sessions`,
        `Login`
      )

    this.session.AT = this.headers.at = response.at
    this.log.debug(`Got 'AT Token': ${response.at}`, "Login")

    await this.sendRequest("angular/school/studentdiary/", {
      data: { at: this.session.AT },
      method: "POST"
    })
    let diary = await this.sendRequest("webapi/student/diary/init", {
      method: "GET",
      json: true
    })
    this.session.userId = diary.students[0].studentId
    this.session.name = diary.students[0].nickName
    this.log.info(`Successfully logged in as ${diary.students[0].nickName}`)
    return response
  }

  public async getOnlineUsers() {
    let users: UserInfo[] = await this.sendRequest("webapi/context/activeSessions", {
      json: true,
      method: "GET"
    })
    let result = {
      users: users,
      students: 0,
      teachers: 0,
      parents: 0
    }

    for (const user of users) {
      let roles: string[] = user.roles.split(" ")
      if (roles.includes("У")) result.teachers += 1
      if (roles.includes("Ученик")) result.students += 1
      if (roles.includes("Родитель")) result.parents += 1
    }
    return result
  }

  public async logout(): Promise<boolean> {
    try {
      let requestData = {
        at: this.session.AT.toString(),
        ver: this.session.VER
      }
      let response = await this.sendRequest(`asp/logout.asp`, {
        data: requestData,
        method: "POST"
      })
      if (!response) return false
      return true
    } catch (err) {
      this.log.error(err)
      return false
    }
  }

  public async connectToQueueHub() {
    let requestData: any = {
      clientProtocol: 1.5,
      at: this.session.AT,
      connectionData: "[{\"name\":\"queuehub\"}]"
    }
    let negotiateRes = await this.sendRequest(
      `WebApi/signalr/negotiate?${querystring.stringify(requestData)}`,
      {
        json: true,
        method: "GET"
      }
    )

    // connect to signalr using webSocket
    requestData.transport = "webSockets"
    requestData.connectionToken = negotiateRes.ConnectionToken
    requestData.tid = Math.floor(Math.random() * 11)
    let ws = new WebSocket(
      `wss://sgo.edu-74.ru/WebApi/signalr/connect?${querystring.stringify(
        requestData
      )}`,
      {
        headers: {
          Cookie: this.cookie.getCookieString(this.HOST)
        },
        handshakeTimeout: 300000
      }
    )
    ws.on("open", () => this.log.debug(`Websocket opened`))
    ws.on("close", () => this.log.debug(`Websocket destroyed`))

    requestData.tid = undefined // remove tid
    let signalrRes = await this.sendRequest(
      `WebApi/signalr/start?${querystring.stringify(requestData)}`,
      {
        json: true,
        method: "GET"
      }
    )
    if (signalrRes.Response != "started") throw new Error(signalrRes)

    return ws
  }

  public async getReportFileId(
    studentId: number,
    pclid: number,
    startDate: string,
    endDate: string,
    websocket?: WebSocket
  ): Promise<string> {
    let startTS = timeStamp()
    let ws =
      typeof websocket === "undefined"
        ? await this.connectToQueueHub()
        : websocket

    let queueReqData = {
      selectedData: [
        {
          filterId: "SID",
          filterValue: studentId.toString(),
          filterText: ""
        },
        {
          filterId: "PCLID",
          filterValue: pclid.toString(),
          filterText: ""
        },
        {
          filterId: "period",
          filterValue: `${moment(startDate, "DD.MM.YYYY")
            .add(5, "h")
            .toISOString()} - ${moment(endDate, "DD.MM.YYYY")
              .add(5, "h")
              .toISOString()}`,
          filterText: `${moment(startDate, "DD.MM.YYYY").format(
            "DD.MM.YYYY"
          )} - ${moment(endDate, "DD.MM.YYYY").format("DD.MM.YYYY")}`
        }
      ],
      params: [
        {
          name: "SCHOOLYEARID",
          value: "623126"
        },
        {
          name: "SERVERTIMEZONE",
          value: 5
        },
        {
          name: "FULLSCHOOLNAME",
          value: ""
        },
        {
          name: "DATEFORMAT",
          value: "d\u0001mm\u0001yy\u0001."
        }
      ]
    }
    let reportId = await this.sendRequest(`webapi/reports/StudentTotal/queue`, {
      json: true,
      data: queueReqData,
      method: "POST"
    })
    if (typeof reportId != "number")
      throw new Error(`ReportId is not a number; ${reportId}`)

    return new Promise((res, rej) => {
      let maxAttempts = 15
      let attempts = 0
      function sendMsg() {
        if (attempts >= maxAttempts) return rej("Max attempts reached")
        attempts += 1
        setTimeout(() => {
          if (ws.readyState === 1) {
            ws.send(`{"H":"queuehub","M":"StartTask","A":[${reportId}],"I":0}`)
          } else {
            sendMsg()
          }
        }, 5)
      }
      sendMsg()

      ws.on("message", function (data) {
        try {
          let msg = data.toString("utf-8")
          if (timeStamp() - startTS > 30) {
            throw new Error("Connection timeout")
          }
          let parsed = JSON.parse(msg)
          if (
            parsed["M"] &&
            parsed["M"].length > 0 &&
            parsed["M"][0]["M"] === "complete"
          ) {
            let fileName = parsed["M"][0]["A"][0]["Data"]
            if (typeof websocket === "undefined") ws.close()
            return res(fileName)
          }
        } catch (err) {
          if (typeof websocket === "undefined") ws.close()
          rej(err)
        }
      })
    })
  }

  public async parseReport(
    fileId: string,
    year: number,
    studentId: number
  ) {
    let table = await this.sendRequest("webapi/files/" + fileId, {
      method: "GET"
    })
    const months: { [month: string]: number } = {
      Январь: 1,
      Февраль: 2,
      Март: 3,
      Апрель: 4,
      Май: 5,
      Июнь: 6,
      Июль: 7,
      Август: 8,
      Сентябрь: 9,
      Октябрь: 10,
      Ноябрь: 11,
      Декабрь: 12
    }

    let $ = cheerio.load(table)

    let subjectList: { [name: string]: Subject } = {}

    let haveChanges = false
    let _lastMonth = null
    cheerioTable($)
    const user = $(".select").eq(3).text().substring(8)
    let data = $(".table-print").parsetable(true, true, true)
    // first element is a header of table (subjects list)
    for (let tr = 0; tr < data.length; tr++) {
      for (let th = 2; th < data[tr].length; th++) {
        if (data[tr][0] === "Предмет") {
          let name = data[tr][th].trimEnd()
          if (name[name.length - 1] === ".") name = name.slice(0, -1)
          subjectList[th] = {
            name: name,
            marks: [],
            haveChanges: false,
            avgMark: ""
          }
        }

        if (months[data[tr][0]] && data[tr][th] != "") {
          if (_lastMonth != null && months[data[tr][0]] < _lastMonth) year += 1
          let dayDetail = {
            date: `${months[data[tr][0]]}-${data[tr][1]}`,
            marks: data[tr][th].split(/\s+/g),
            marksRemoved: <string[]>[],
            marksAdded: <string[]>[]
          }

          // what marks did removed
          let existingMarks = (await MySQLconnectionPool.query(
            "SELECT mark FROM sgo_marks WHERE user_id = :user AND date = :date AND subject = :subject",
            {
              user: studentId,
              subject: subjectList[th].name,
              date: new Date(`${year}-${months[data[tr][0]]}-${data[tr][1]}`)
            }
          )).map(
            (mark: any) => {
              if (!dayDetail.marks.includes(mark.mark)) {
                subjectList[th].haveChanges = true
                haveChanges = true
                dayDetail.marksRemoved.push(mark.mark)
              }
              return mark.mark
            }
          )

          let _insertValues = []
          // what marks did added
          for (let mark of dayDetail.marks) {
            if (!existingMarks.includes(mark)) {
              dayDetail.marksAdded.push(mark)
              haveChanges = true
              subjectList[th].haveChanges = true
              _insertValues.push(`(:user, :subject, :date, '${mark}')`)
            }
          }

          if (dayDetail.marksRemoved.length > 0) {
            await MySQLconnectionPool.query(
              `DELETE FROM sgo_marks WHERE user_id = :user AND date = :date AND subject = :subject AND mark IN ("${dayDetail.marksRemoved.join('", "')}")`,
              {
                user: studentId,
                subject: subjectList[th].name,
                date: new Date(`${year}-${months[data[tr][0]]}-${data[tr][1]}`)
              }
            )
          }
          if (_insertValues.length > 0) {
            await MySQLconnectionPool.query(
              "INSERT INTO sgo_marks (user_id, subject, date, mark) VALUES " +
              _insertValues.join(","),
              {
                user: studentId,
                subject: subjectList[th].name,
                date: new Date(`${year}-${months[data[tr][0]]}-${data[tr][1]}`)
              }
            )
          }

          subjectList[th].marks.push(dayDetail)
          _lastMonth = months[data[tr][0]]
        }

        if (data[tr][0] === "Средняя оценка") {
          subjectList[th].avgMark = data[tr][th]
        }
      }
    }

    return {
      user,
      haveChanges,
      result: Object.values(subjectList)
    }
  }

  protected async sendRequest(
    url: string,
    options: SendRequestOptions
  ): Promise<any> {
    this.log.debug(`Sending request to endpoint: ${url}`, "Send Request")
    if (options && options.data) this.log.verbose(options.data, "Send Request")

    // after 1 hour session will be expired
    if (timeStamp() - this.session.lastRequestDate > 3600 || timeStamp() - this.session.sessionStarted > 86399) {
      this.log.warn(
        "Current session is expired\nAttempt to login again...",
        "Send Request"
      )
      await this.startNewSession()
    }
    this.session.lastRequestDate = timeStamp()
    this.session.requestCount += 1

    let response = await request({
      timeout: 300000,
      url: this.HOST + url,
      headers: this.headers,
      jar: this.cookie,
      gzip: true,
      form: options.data,
      json: options.json,
      method: options.method
    })
    return response
  }
}
