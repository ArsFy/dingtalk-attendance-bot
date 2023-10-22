# Dingtalk attendance bot

> 注意：本考勤 Bot 只适用于使用值班模式的考勤

QQ 群内的钉钉考勤查询和推送机器人，用于在群内推送和查询成员的上下班消息

### Create application

本程序使用钉钉企业内部应用 API 创建，请先申请创建 H5 微应用并赋予对应权限。

- 钉钉开放平台应用开发：https://open-dev.dingtalk.com/fe/app#/corp/app
- 需要的权限：
    - 通讯录只读权限（用于获取部门成员）
    - 考勤管理的全部权限

### Edit Config

重命名 `config.example.json` 到 `config.json`

```json
{
    "appKey": "",
    "appSecret": "",
    "dept_id": 1,        // 需要考勤统计的部门 ID
    "qq_number": 0,      // QQ 机器人的 QQ 号
    "qq_password": "",   // QQ 机器人的密码
    "user_push_group": 0, // 用户群（需要推送消息的群）
    "member_group": 0,    // 成员群（需要推送报表的群）
    "alist": {    // Alist 用于传送统计报表，如果不需要这个功能可以注释相关定时任务
        "url": "http://0.0.0.0",
        "user": "",
        "pass": "",
        "path": "/"
    }
}
```

### Rename DB file

重命名 `dab.example.db` 到 `dab.db`

### Start

```json
node main.js
```

-------

### Linux Service

- Service Script: https://github.com/ArsFy/add_service