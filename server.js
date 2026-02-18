const DB_CONFIG = {
  host: process.env.MYSQLHOST || 'localhost',
  port: process.env.MYSQLPORT || 3306,
  database: process.env.MYSQLDATABASE || '4537_lab4',
  adminUser: process.env.MYSQL_ADMIN_USER || 'admin',
  adminPassword: process.env.MYSQL_ADMIN_PASSWORD || 'admin_password',  
  guestUser: process.env.MYSQL_GUEST_USER || 'guest',
  guestPassword: process.env.MYSQL_GUEST_PASSWORD || 'guest_password'
};

const PORT = process.env.PORT || 3000;
// const ALLOWED_ORIGIN = '*';
const ALLOWED_ORIGIN = 'https://illustrious-bubblegum-77febb.netlify.app';

const PATIENTS = [
  { name: 'Sara Brown', dateOfBirth: '1901-01-01' },
  { name: 'John Smith', dateOfBirth: '1941-01-01' },
  { name: 'Jack Ma', dateOfBirth: '1961-01-30' },
  { name: 'Elon Musk', dateOfBirth: '1999-01-01' }
];

const http = require('http'); // for server set up
const url = require('url'); // for parsing URL
const mysql = require('mysql2/promise'); // for connecting to MySQL, and handles promises

// pool allows you to connect to DB as different users
// create 2 pools, 1 as admin (select/create/insert), and 1 as guest (select)
let adminPool, guestPool; 

// initialize pools
function initializePools() {
  adminPool = mysql.createPool({
    host: DB_CONFIG.host,
    user: DB_CONFIG.adminUser,
    password: DB_CONFIG.adminPassword,
    database: DB_CONFIG.database
  });

  guestPool = mysql.createPool({
    host: DB_CONFIG.host,
    user: DB_CONFIG.guestUser,
    password: DB_CONFIG.guestPassword,
    database: DB_CONFIG.database
  });  
}

// create table if not exists
// using pool for admin
async function createTable() {
  const connection = await adminPool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS patient (
        patientId INT(11) NOT NULL AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        dateOfBirth DATETIME NOT NULL,
        PRIMARY KEY (patientId)
      ) ENGINE=InnoDB;
    `);
  } finally {
    connection.release();
  }
}

// insert sample patient rows
// using pool for admin
async function insertRows() {
  await createTable();
  const connection = await adminPool.getConnection();
  try {
    for (const p of PATIENTS) {
      await connection.query('INSERT INTO patient (name, dateOfBirth) VALUES (?, ?)', [p.name, p.dateOfBirth]);
    }
    return { success: true, rowsInserted: PATIENTS.length };
  } finally {
    connection.release();
  }
}

// execute SQL query
// using pool for guest
async function executeQuery(sqlQuery) {  
  const connection = await guestPool.getConnection();
  try {
    const [rows] = await connection.query(sqlQuery);
    return { success: true, data: rows, rowCount: rows.length };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    connection.release();
  }
}

// server configuration
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true); // true to parse into JS obj
  
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN); // tell browser which origins can access this server
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); // tell browser those origins can use get/post/options
  res.setHeader('Content-Type', 'application/json'); // this server response content-type is JSON

  // handle pre-flight
  if (req.method === 'OPTIONS') {
    res.writeHead(204); // no content
    res.end();
    return;
  }
  
  try {
    // POST /api/v1/insert
    if (req.method === 'POST' && parsedUrl.pathname === '/api/v1/insert') {
      const result = await insertRows();
      res.writeHead(200);
      res.end(JSON.stringify(result)); // response as JSON
    }
    // GET /api/v1/sql/QUERY
    else if (req.method === 'GET' && parsedUrl.pathname.startsWith('/api/v1/sql/')) {
      const parts = parsedUrl.pathname.split('/sql/'); 
      const query = decodeURIComponent(parts[1]); // URI is encoded (eg. SELECT%20*%20FROM%20patient), so need to decode
      const result = await executeQuery(query);
      res.writeHead(200);
      res.end(JSON.stringify(result)); // response as JSON
    }
    else {
      res.writeHead(404); // not found
      res.end(JSON.stringify({ error: 'Not found' })); // response as JSON
    }
  } catch (error) {
    res.writeHead(400); // bad request
    res.end(JSON.stringify({ success: false, error: error.message })); // response as JSON
  }
});

// set up pools and start the server
async function start() {
  await initializePools();
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();