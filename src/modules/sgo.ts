import moment from "moment"
import { DocumentAttachment } from "vk-io"
import Config from "../config"
import { Logger } from "../core/logger"
import { Redis } from "../core/redis"
import { vk } from "../nulldef"
import SGO from "../sgo/client"

const logger = new Logger("Module: SGO")
let client: SGO

async function checkDiaryUpdates() {
  try {
    const diary = await client.API.getDiary(
      client.session.userId,
      moment().subtract(1, "week").format("YYYY-MM-DD"),
      moment().add(1, "week").format("YYYY-MM-DD")
    )
    const assignmentIDs = []
    for (const day of diary.weekDays) {
      for (const lesson of day.lessons) {
        if (!lesson.assignments || lesson.assignments.length === 0) continue
        for (const assignment of lesson.assignments) {
          assignmentIDs.push(assignment.id)
        }
      }
    }

    for (const assignmentID of assignmentIDs) {
      const check = await Redis.get(`SGO:assignments:${assignmentID}`)
      if (check !== null) continue // skip existing for now

      let result = ""
      const assignInfo = await client.API.getDiaryAssignment(assignmentID)
      await Redis.set(`SGO:assignments:${assignmentID}`, "here") // save into database
      const attachments = []
      if (assignInfo.attachments && assignInfo.attachments.length > 0) {
        for (const attachment of assignInfo.attachments) {
          const buffer = await client.API.downloadAttachment(attachment.id)
          attachments.push({
            name: attachment.originalFileName,
            buffer
          })
        }
      }
      result += `Предмет: ${assignInfo.subjectGroup.name}\n`
      result += `Домашнее задание: ${assignInfo.assignmentName}\n`
      if (assignInfo.description !== "") {
        result += `Подробности от учителя: ${assignInfo.description}\n`
      }
      result += `Выполнить до ${moment(assignInfo.date).locale("ru").format("LL")}`
      let vkAttachments: DocumentAttachment[] = []
      if (attachments.length !== 0) {
        result += `\n\nПриложенные файлы прикреплены к сообщению`
        vkAttachments = await Promise.all(attachments.map(async attachment => {
          return await vk.upload.messageDocument({
            title: attachment.name,
            source: attachment.buffer,
            peer_id: 2000000001
          })
        }))
      }
      await vk.api.messages.send({
        message: result,
        peer_id: 2000000001,
        attachment: vkAttachments.map(attachment => attachment.toString()).join(",")
      })
    }
  } catch (err) {
    logger.fatal(err)
  }
}

setInterval(checkDiaryUpdates, 1.8e+6) // every 30 mins

export async function setup() {
  client = await SGO.startSession(Config.sgo.username, Config.sgo.password)
  // await checkDiaryUpdates()

  vk.updates.hear("!sgo-дз", checkDiaryUpdates)
  vk.updates.hear("!sgo-онлайн", async (context) => {
    const users = await client.API.getCurrentOnline()
    const online = {
      users,
      students: 0,
      teachers: 0,
      parents: 0
    }

    for (const user of users) {
      const roles: string[] = user.roles.split(" ")
      if (roles.includes("У")) online.teachers += 1
      if (roles.includes("Ученик")) online.students += 1
      if (roles.includes("Родитель")) online.parents += 1
      // result += `-- ${user.nickName}\n`
    }
    let result = `Сейчас в сети ${online.students + online.parents + online.teachers} пользователей.\n`
    result += `Учеников: ${online.students}\nРодителей: ${online.parents}\nУчителей: ${online.teachers}`
    await context.send(result)
  })
}