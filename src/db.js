const mysql = require('mysql2');

// Crear la conexión a la base de datos
const pool = mysql.createPool({
    host: '147.93.118.246',
    user: 'root',
    password: 'F32fBsITy7PywBEMtC3Es6rmWowYGNGzgiwot7TL7UedJSSZUbgxBvARocHO2y6G',
    database: 'cerceta',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '-05:00', // ✅ Correcto para hora de Colombia

}).promise();  // Esto convierte el pool en una versión que utiliza promesas

// Exportar la conexión para usarla en otros módulos
module.exports = pool;
