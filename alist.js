const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const config = require('./config.json');

const login = () => {
    return new Promise((resolve, reject) => {
        axios({
            method: "POST",
            url: config.alist.url + '/api/auth/login',
            data: { "username": config.alist.user, "password": config.alist.pass, "otp_code": "" }
        }).then(r => {
            if (r.data.code == 200) resolve(r.data.data.token);
            else reject("Alist Error: Auth");
        })
    });
}

const upload = (auth, path, filename) => {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(path), filename);

        axios.put(config.alist.url + '/api/fs/form', formData, {
            headers: { authorization: auth, 'Content-Type': 'multipart/form-data', 'File-Path': encodeURIComponent('/' + filename) }
        }).then(r => {
            resolve(config.alist.url + '/d' + config.alist.path + '/' + encodeURIComponent(filename))
        })
    })
}

module.exports = {
    upload, login
}