const sqlite3 = require('sqlite3').verbose();

// DB
const db = new sqlite3.Database("./dab.db");

function runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

module.exports = runQuery;