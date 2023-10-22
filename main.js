const axios = require('axios');
const fs = require('fs');
const moment = require('moment');
const cron = require('node-cron');
const { createClient } = require("icqq");
const runQuery = require('./runQuery');
const XLSX = require('xlsx');
const alist = require('./alist');
const config = require("./config.json");

// ICQQ
const client = createClient({ platform: 3, sign_api_addr: 'http://127.0.0.1:8080/sign' });

let Cache = {
    "expireIn": 0,
    "accessToken": "",
    "userlist": [],
    "usermap": {},
    "offset": 0,
};

let Data = {
    "aliveUser": 0,
    "list": []
}

if (!fs.existsSync('./xlsx')) fs.mkdirSync('./xlsx');

// Read file
if (fs.existsSync("./cache.json")) Cache = JSON.parse(fs.readFileSync("./cache.json"));
if (fs.existsSync("./data.json")) Data = JSON.parse(fs.readFileSync("./data.json"));

// Write file
const SaveCache = () => fs.writeFileSync("./cache.json", JSON.stringify(Cache));
const saveData = () => fs.writeFileSync("./data.json", JSON.stringify(Data));

const accessToken = async () => {
    // Token expire
    if (Cache.expireIn < Math.round(new Date() / 1000)) {
        let accessToken = await axios({
            method: 'POST',
            url: "https://api.dingtalk.com/v1.0/oauth2/accessToken",
            data: {
                "appKey": config.appKey,
                "appSecret": config.appSecret
            }
        }).catch(err => {
            console.error("Get accessToken Error:", err);
        });

        Cache = {
            ...Cache,
            "expireIn": Math.round(new Date() / 1000) + accessToken.data.expireIn,
            "accessToken": accessToken.data.accessToken
        }

        // Get All sub department
        let subdept = await axios({
            method: 'POST',
            url: "https://oapi.dingtalk.com/topapi/v2/department/listsubid?access_token=" + Cache.accessToken,
            data: { "dept_id": config.dept_id }
        }).catch(err => {
            console.error("Get sub dept Error:", err);
        });

        if (subdept.data.errcode === 0) {
            for (let i in subdept.data.result.dept_id_list) {
                // Get sub department user (100 Max)
                let listid = await axios({
                    method: 'POST',
                    url: "https://oapi.dingtalk.com/topapi/v2/user/list?access_token=" + Cache.accessToken,
                    data: { "dept_id": subdept.data.result.dept_id_list[i], cursor: 0, size: 100 }
                }).catch(err => {
                    console.error("Get userlist Error:", err);
                });

                if (listid.data.errcode === 0) {
                    for (let i in listid.data.result.list) {
                        Cache.userlist.push(listid.data.result.list[i].userid)
                        Cache.usermap[listid.data.result.list[i].userid] = listid.data.result.list[i].name;
                    }
                } else console.error("Get userlist failed: " + listid.data.errmsg);
            }
        } else console.error("Get sub dept failed: " + listid.data.errmsg);

        SaveCache();
    }
}

const AddLog = (uid, name, time, type) => {
    runQuery("INSERT INTO logs (uid, name, time, type) VALUES (?, ?, ?, ?)", [uid, name, time, type])
        .then(() => { })
        .catch(err => console.log(err));
}

const OnDuty = async (userid, time) => {
    if (Data.list.indexOf(userid) === -1) {
        Data.aliveUser += 1;
        Data.list.push(userid);

        const name = Cache.usermap[userid];

        console.log(moment(new Date(time)).format("YYYY-MM-DD HH:mm:ss") + ` Logs: ${name} 上班记录推送`)
        try {
            await client.sendGroupMsg(config.user_push_group, `@${name ? name : `姓名缺失(${userid})`} 正在值班\n目前值班人数 ${Data.aliveUser}\n状态：正常营业中`)
        } catch (e) { }

        AddLog(String(userid), name, time, "OnDuty");
    };
}

const OffDuty = async (userid, time) => {
    let index = Data.list.indexOf(userid);
    if (index !== -1) {
        Data.aliveUser -= 1;
        Data.list.splice(index, 1);

        const name = Cache.usermap[userid];

        console.log(moment(new Date(time)).format("YYYY-MM-DD HH:mm:ss") + ` Logs: ${name} 下班记录推送`)

        if (Data.aliveUser !== 0)
            try {
                await client.sendGroupMsg(config.user_push_group, `@${name ? name : `姓名缺失(${userid})`} 下班了\n目前值班人数 ${Data.aliveUser}\n状态：正常营业中`)
            } catch (e) { }
        else
            try {
                await client.sendGroupMsg(config.user_push_group, `@${name ? name : `姓名缺失(${userid})`} 下班了\n目前没有人在值班\n状态：等待下一个人上班`)
            } catch (e) { }

        AddLog(String(userid), name, time, "OffDuty");
    };
}

const getAttendance = async () => {
    // For userlist (slice: 50 items)
    for (let iii = 0; iii < Cache.userlist.length; iii += 50) {
        const nowTime = moment(new Date()).format("YYYY-MM-DD 00:00:00");

        let attendance = await axios({
            method: 'POST',
            url: "https://oapi.dingtalk.com/attendance/list?access_token=" + Cache.accessToken,
            data: {
                "limit": 50,
                "workDateFrom": nowTime,
                "offset": Cache.offset,
                "workDateTo": nowTime,
                "userIdList": JSON.stringify(Cache.userlist.slice(iii, iii + 50))
            }
        }).catch(err => {
            console.error("Get attendance list Error:", err);
        });

        if (attendance.data.errcode === 0) {
            Cache.offset += attendance.data.recordresult.length;
            SaveCache();

            for (let i = 0; i < attendance.data.recordresult.length; i++) {
                switch (attendance.data.recordresult[i].checkType) {
                    case "OnDuty": OnDuty(attendance.data.recordresult[i].userId, attendance.data.recordresult[i].baseCheckTime); break;
                    case "OffDuty": OffDuty(attendance.data.recordresult[i].userId, attendance.data.recordresult[i].baseCheckTime); break;
                    default: console.log("Unknown checkType:", attendance.data.recordresult[i].checkType)
                }

                saveData();
            }
        } else console.log("Get attendance list failed: " + attendance.data.errmsg);
    }
}

const formatDuration = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    return `${Math.floor(totalSeconds / 3600)}h${Math.floor((totalSeconds % 3600) / 60)}m`;
}

const getAttendanceTime = async (t, o) => {
    const data = await runQuery("SELECT id, uid, name, time, type FROM logs WHERE time > ?", [t.getTime()]);

    const fd = {}, sd = {};
    for (let i = 0; i < data.length; i++) {
        switch (data[i].type) {
            case "OnDuty":
                fd[data[i].name] = data[i].time;
                break;
            case "OffDuty":
                if (fd[data[i].name] != undefined) {
                    sd[data[i].name] = (sd[data[i].name] ? sd[data[i].name] : 0) + (data[i].time - fd[data[i].name]);
                    delete fd[data[i].name];
                }
                break;
        }
    }

    if (o) return [data, sd];

    let text = moment(t).format("MM月DD日") + '到现在已结算时长:\n';

    for (let i in sd) {
        text += `${i}: ${formatDuration(sd[i])}\n`;
    }

    if (Object.keys(fd).length !== 0) {
        text += '\n正在进行的值班时长:\n';
        for (let i in fd) {
            text += `${i}: ${formatDuration(new Date() - fd[i])}\n`;
        }
    }

    return text.slice(0, text.length - 1);
}

// Bot Start
client.on("system.online", async () => {
    await accessToken();

    cron.schedule('50 9-59/10 * * * *', () => {
        getAttendance();
    }).start();

    // Reset Offset
    cron.schedule("0 0 0 * * *", () => {
        Cache.offset = 0;
        SaveCache();
    }).start();

    // Remove unchecked
    cron.schedule("50 59 23 * * *", async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const no = [];
        const data = await runQuery("SELECT uid, name, time, type FROM logs WHERE time > ?", [today.getTime()]);
        console.log(data)
        for (let i = 0; i < data.length; i++) {
            switch (data[i].type) {
                case "OnDuty":
                    if (no.indexOf(data[i].uid) === -1) no.push(data[i].uid);
                    break;
                case "OffDuty":
                    no.splice(no.indexOf(data[i].uid), 1);
            }
        }

        for (let i = 0; i < no.length; i++) {
            runQuery("DELETE FROM logs WHERE `id` = (SELECT MAX(`id`) FROM logs WHERE `uid` = ?);", [no[i]])
                .then(() => { })
                .catch(err => console.log(err));;
        }
    }).start();

    // Push file
    cron.schedule("0 59 23 * * 0", async () => {
        const authorization = await alist.login();

        const t = new Date();
        t.setHours(0, 0, 0, 0);
        const lasttime = new Date(t.getTime() - ((t.getDay() + 6) % 7) * 24 * 60 * 60 * 1000);
        const data = await getAttendanceTime(lasttime, true)

        const allname = [], dhlist = [];
        for (let i in Cache.usermap) allname.push(Cache.usermap[i]);

        let timelist = Object.entries(data[1]).sort((a, b) => b[1] - a[1]), datalist = [];
        for (let i = 0; i < timelist.length; i++) {
            timelist[i] = [i + 1, timelist[i][0], formatDuration(timelist[i][1])];
            allname.splice(allname.indexOf(timelist[i][0]), 1);
        }
        for (let i = 0; i < data[0].length; i++) datalist.push([data[0][i].id, data[0][i].name, moment(new Date(data[0][i].time)).format("YYYY-MM-DD HH:mm:ss"), data[0][i].type == "OnDuty" ? "上班" : "下班"])

        let dataindex = timelist.length;
        for (let i = 0; i < allname.length; i++) dhlist.push([dataindex++, allname[i], '0h0m']);

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
            ['排名', '姓名', '时间'],
            ...timelist,
            ...dhlist,
        ]), '值班时长');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
            ['ID', '姓名', '时间', '操作'],
            ...datalist,
        ]), '值班记录');

        const filename = `${moment(lasttime).format("YYYY-MM-DD")}到${moment(new Date()).format("YYYY-MM-DD")}值班记录.xlsx`
        XLSX.writeFile(workbook, "./xlsx/" + filename);

        const fileurl = await alist.upload(authorization, "./xlsx/" + filename, filename)
        client.sendGroupMsg(config.member_group, "机器人做好了这周的报表，可以在这里下载：\n" + fileurl);
    }).start();

    cron.schedule("0 0 22 * * 6", async () => {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        const lasttime = new Date(t.getTime() - ((t.getDay() + 6) % 7) * 24 * 60 * 60 * 1000);
        const data = await getAttendanceTime(lasttime, true)

        const allname = [], tpname = [];
        for (let i in Cache.usermap) allname.push(Cache.usermap[i]);

        let timelist = Object.entries(data[1]).sort((a, b) => b[1] - a[1]), datalist = [];
        for (let i = 0; i < timelist.length; i++) {
            if (timelist[i][1] < 3 * 60 * 60 * 1000) tpname.push(timelist[i][0]);
            allname.splice(allname.indexOf(timelist[i][0]), 1);
        }

        client.sendGroupMsg(config.member_group, `本周剩余时间不多了，以下是时间还未满 3 小时的成员:\n${[...allname, ...tpname].join("\n")}`)
    }).start();

    console.log("Bot running...");
});

client.on("message", e => {
    if (e.raw_message && e.raw_message !== "") {
        const t = new Date();

        switch (e.raw_message.split(' ')[0]) {
            case "/查询":
                if (Data.aliveUser !== 0) e.reply(`目前值班人数 ${Data.aliveUser}\n状态：正常营业中`).then(() => { }).catch(e => { });
                else e.reply(`目前没有人在值班\n状态：等待下一个人上班`).then(() => { }).catch(e => { });;
                break;
            case "/查询今日时长":
                t.setHours(0, 0, 0, 0);
                e.reply(getAttendanceTime(t)).then(() => { }).catch(e => { });
                break;
            case "/查询本周时长":
                t.setHours(0, 0, 0, 0);
                e.reply(getAttendanceTime(new Date(t.getTime() - ((t.getDay() + 6) % 7) * 24 * 60 * 60 * 1000))).then(() => { }).catch(e => { });
                break;
        }
    }
});

// Login
client.on('system.login.slider', (e) => {
    console.log('输入滑块地址获取的ticket后继续。\n滑块地址:    ' + e.url)
    process.stdin.once('data', (data) => {
        client.submitSlider(data.toString().trim())
    })
})
client.on('system.login.qrcode', (e) => {
    console.log('扫码完成后回车继续:    ')
    process.stdin.once('data', () => {
        client.login()
    })
})
client.on('system.login.device', (e) => {
    console.log('请选择验证方式:(1：短信验证   其他：扫码验证)')
    process.stdin.once('data', (data) => {
        if (data.toString().trim() === '1') {
            client.sendSmsCode()
            console.log('请输入手机收到的短信验证码:')
            process.stdin.once('data', (res) => {
                client.submitSmsCode(res.toString().trim())
            })
        } else {
            console.log('扫码完成后回车继续：' + e.url)
            process.stdin.once('data', () => {
                client.login()
            })
        }
    })
})
client.login(config.qq_number, config.qq_password)