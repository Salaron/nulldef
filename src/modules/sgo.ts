import { NlModule } from "../core/module"
import { timeStamp } from "../core/utils"
import { Log } from "../core/log"
import sgo from "../core/sgo"
import moment from "moment"
import Config from "../config"
import { INullMessageContext } from "../handlers/message"
import { ErrorNotice } from "../models/errors"

const log = new Log("SGO")

export default class extends NlModule {
  public regExp = [/^online$/i, /^marks$/i, /^lastLogin$/i]
  public loadByDefault = Config.sgo.userName.length > 0 && Config.sgo.password.length > 0
  public restrictUnload = false
  private client = new sgo({
    username: Config.sgo.userName,
    password: Config.sgo.password,
    logger: log
  })

  public async init() {
    if (Config.sgo.userName.length === 0 || Config.sgo.password.length === 0) throw new Error(`credentials is missing`)
    const that = this
    that.client.startNewSession()
    setInterval(async () => {
      try {
        await that.updateOnline()
      } catch (err) {
        log.error(err)
      }
    }, 60000) // 60 sec

    // logout from sgo on any fatal error
    if (process.platform === "win32") {
      const rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
      })

      rl.on("SIGINT", () => {
        process.emit(<any>"SIGINT")
      })
    }

    process.on("SIGINT", async () => {
      log.info(`Logout...`)
      if (timeStamp() - that.client.session.lastRequestDate < 3600) await that.client.logout()
      process.exit()
    })
  }

  public async execute(context: INullMessageContext, triggeredRegExp: number) {
    switch (triggeredRegExp) {
      case 0: {
        await context.send(await this.updateOnline())
        return
      }
      case 1: {
        await this.updateMarks(context)
        return
      }
      case 2: {
        if (context.text.substr(8).length === 0) throw new ErrorNotice("Имя отсутствует!")
        await context.send(await this.getLastLogin(context.text.substr(8)))
        return
      }
    }
  }

  private async updateOnline() {
    const online = await this.client.getOnlineUsers()
    let result = `Сейчас в сетевой хуите ${online.students + online.parents + online.teachers} человеков:\n`
    await Promise.all(online.users.map(async user => {
      user.class = ""
      result += `-- ${user.nickName}\n`
      await MySQLconnectionPool.query(`INSERT INTO sgo_users VALUES (:userId, :class, :schoolId, :eMs, :nickName, :roles, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE last_login = CURRENT_TIMESTAMP`, user)
    }))
    result += `\nУчеников: ${online.students}\nРодителей: ${online.parents}\nУчителей: ${online.teachers}`
    return result
  }

  private async updateMarks(ctx: INullMessageContext) {

    let result: any[] = []
    const classes = {
      1045714: ["1564535", "1564536", "1564591", "1564592", "1558608", "1564537", "1564538", "1564540", "1564541", "1564543", "1564547", "1564594", "1564596", "1564548", "1564549", "1564600", "1564553", "1564554", "1564605", "1564555", "1564556", "1564557", "1564559", "1564560", "1564610", "1564563"],
      1045715: ["1564588", "1564564", "1564565", "1564566", "1564567", "1564568", "1564570", "1564571", "3713550", "1564572", "1564573", "1564575", "1568141", "1564578", "1564580", "1564581", "1564584", "1564585", "1564586", "1564587"]
    }
    for (const cl of Object.keys(classes)) {
      result = [].concat(await Promise.all(classes[cl].map(async (user: string) => {
        try {
          const file = await this.client.getReportFileId(parseInt(user), parseInt(cl), `01.01.2019`, moment().add(1, "week").format("DD.MM.YYYY"))
          return await this.client.parseReport(file, new Date().getFullYear(), parseInt(user))
        } catch (err) {
          await ctx.send(`Во время обработки одного из отчётов произошла ошибка: ${err.message}`)
        }
      })), result)
    }

    let r = ""
    let updated = false
    result.map(userMarks => {
      if (!userMarks || userMarks.haveChanges === false) return
      updated = true
      r += `${userMarks.user}:\n`
      userMarks.result.map(subject => {
        if (subject.avgMark === "" || subject.haveChanges === false) return
        r += `-- ${subject.name} { `
        let init = false
        subject.marks.map(day => {
          if (init === true && (day.marksRemoved.length > 0 || day.marksAdded.length > 0)) r += `, `
          if (day.marksRemoved.length > 0) {
            init = true
            r += `${day.marksRemoved.join(` (rm) [${day.date}], `)}`
            r += ` (rm) [${day.date}] ` // last date
          }
          if (day.marksAdded.length > 0) {
            init = true
            r += `${day.marksAdded.join(` [${day.date}], `)}`
            r += ` [${day.date}]` // last date
          }
        })
        r += ` } (avg: ${subject.avgMark})\n`
      })
      r += `\n\n`
    })
    if (!updated) r = `Пока ничего нового :с`

    while (r.length != 0) {
      const short = r.slice(0, 4000)
      r = r.replace(short, "")
      await ctx.send(short)
    }
    return r
  }

  private async getLastLogin(name: string) {
    const data = await MySQLconnectionPool.first(`SELECT last_login FROM sgo_users WHERE name LIKE "%${name}%"`)
    if (!data) throw new ErrorNotice(`Пользователь отсутствует в базе данных!`)
    return data.lastLogin
  }
}
