import SGO from "../core/sgo"
import moment from "moment"

// tslint:disable-next-line: no-var-requires
const cheerio = require("cheerio")
// tslint:disable-next-line: no-var-requires
const cheerioTable = require("cheerio-tableparser")

export interface ISubject {
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
export class StudentTotalReport {
  public fileId: string
  private client: SGO
  constructor(fileId: string, client: SGO) {
    this.fileId = fileId
    this.client = client
  }

  public async parseReport(
    year: number,
    studentId: number
  ) {
    const table = await this.client.sendRequest("webapi/files/" + this.fileId, {
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

    const $ = cheerio.load(table)

    const subjectList: { [name: string]: ISubject } = {}

    let haveChanges = false
    let _lastMonth = null // tslint:disable-line
    cheerioTable($)
    const user = $(".select").eq(3).text().substring(8)
    const data = $(".table-print").parsetable(true, true, true)
    // first element is a header of table (subjects list)
    for (let tr = 0; tr < data.length; tr++) { // tslint:disable-line
      for (let th = 2; th < data[tr].length; th++) {
        if (data[tr][0] === "Предмет") {
          let name = data[tr][th].trimEnd()
          if (name[name.length - 1] === ".") name = name.slice(0, -1)
          subjectList[th] = {
            name,
            marks: [],
            haveChanges: false,
            avgMark: ""
          }
        }

        if (months[data[tr][0]] && data[tr][th] != "") {
          if (_lastMonth != null && months[data[tr][0]] < _lastMonth) year += 1
          const dayDetail = {
            date: `${months[data[tr][0]]}-${data[tr][1]}`,
            marks: data[tr][th].split(/\s+/g),
            marksRemoved: <string[]>[],
            marksAdded: <string[]>[]
          }

          // what marks did removed
          const existingMarks = (await MySQLconnectionPool.query(
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

          let _insertValues = [] // tslint:disable-line
          // what marks did added
          for (const mark of dayDetail.marks) {
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
}

export class JournalAccessReport {
  public fileId: string
  private client: SGO
  constructor(fileId: string, client: SGO) {
    this.fileId = fileId
    this.client = client
  }

  public async parseReport() {
    const table = await this.client.sendRequest("webapi/files/" + this.fileId, {
      method: "GET"
    })
    const $ = cheerio.load(table)
    cheerioTable($)

    const data = $(".table-print").first().parsetable(true, true, true)
    const out: any[] = []

    for (let i = 1; i < data.length; i++) {

      let currentRow = ""
      for (let j = 0; j < data[i].length; j++) {
        if (j === 0) {

          currentRow = data[i][j]
          continue
        }
        if (!out[j - 1]) out.push({})
        out[j - 1][currentRow] = data[i][j]
      }
    }
    // desc sort by date
    out.sort((a, b) => {
      if (moment(a["Дата и время изменений"], "DD.MM.YYYY HH:mm").isSame(moment(b["Дата и время изменений"], "DD.MM.YYYY HH:mm"))) return 0
      if (moment(a["Дата и время изменений"], "DD.MM.YYYY HH:mm").isAfter(moment(b["Дата и время изменений"], "DD.MM.YYYY HH:mm"))) return -1
      return 1
    })
    return {
      updateDate: out.length > 0 ? out[0]["Дата и время изменений"] : null,
      accessJournal: out
    }
  }
}
