const express = require('express');
const session = require('express-session');
const hbs = require('hbs');
const pool = require('./db'); // Importamos la configuración de la base de datos
const path = require('path');
const moment = require('moment-timezone');
const fs = require('fs');
const cron = require('node-cron');

const app = express();
const fileUpload = require('express-fileupload');
const jwt = require('jsonwebtoken'); // Importa jsonwebtoken
const SECRET_KEY = 'MiClaveSuperSegura!$%&/()=12345';
const admin = require('firebase-admin');

app.use(session({
    secret: 'mysecret',  // Cambia este secreto
    resave: false,
    saveUninitialized: true
}));

// Configurar el motor de plantillas
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));  // Asegúrate de que apunte correctamente a tu carpeta de vistas
app.use(express.static(__dirname + '/public'));

// Middleware para parsing
app.use(express.urlencoded({ extended: false }));


// Ruta para mostrar el formulario de login
app.get('/login', (req, res) => {
    res.render('login/login');
});

// Asegúrate de que Express pueda manejar datos en formato JSON
app.use(express.json());



hbs.registerHelper('formatDate', (date) => {
    return moment(date).format('DD/MM/YYYY');
});


// Registrar el helper 'eq' para comparar dos valores
hbs.registerHelper('eq', (a, b) => {
    return a === b;
});




hbs.registerHelper('incluye', function (array, valor, options) {
    return array && array.includes(valor) ? options.fn(this) : options.inverse(this);
  });
  hbs.registerHelper('noIncluye', function (array, valor, options) {
    return !array.includes(valor) ? options.fn(this) : options.inverse(this);
  });

app.use(express.static('public', {
    etag: false,
    maxAge: 0
  }));
  



// Ruta para manejar el login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Consulta para verificar si el usuario existe con el correo, contraseña dados y está activo
        const [results] = await pool.query(
            'SELECT * FROM usuarios WHERE email = ? AND password = ?',
            [email, password]
        );

        if (results.length > 0) {
            const user = results[0];

            // Verificar si el estado del usuario es activo
            if (user.estado !== 'activo') {
                // Devolver un mensaje de usuario inactivo sin destruir la sesión
                return res.json({ status: 'inactive', message: 'Usuario inactivo' });
            } else {
                // Almacena los datos del usuario en la sesión
                req.session.user = user;  // Almacena el objeto completo del usuario
                req.session.userId = user.id; // Guarda el `userId` en la sesión
                req.session.name = user.nombre;  // Guarda el nombre del usuario en la sesión
                req.session.loggedin = true;  // Establece el estado de sesión como conectado
                req.session.roles = user.role;  // Guarda los roles en la sesión
                req.session.cargo = user.cargo; // Almacena el cargo en la sesión

                const role = user.role;  // Obtiene el rol del usuario

                // Redirige basado en el rol del usuario
                if (role === 'admin') {
                    return res.redirect('/menuAdministrativo');
                } else if (role === 'tecnico') {
                    return res.redirect('/tecnico');
                } else if (role === 'residentes') {
                    return res.redirect('/menu_residentes');
                }
            }
        } else {
            // Muestra la página de login con mensaje de error si las credenciales son incorrectas
            res.render('login/login', { error: 'Correo, contraseña incorrectos o usuario inactivo' });
        }
    } catch (err) {
        // Maneja los errores y envía una respuesta 500 en caso de problemas con la base de datos o el servidor
        res.status(500).json({ error: err.message });
    }
});



// Verifica que el código se ejecuta en el navegador antes de registrar el Service Worker
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js")
        .then((registration) => {
          console.log("✅ Service Worker registrado correctamente:", registration);
        })
        .catch((error) => console.error("❌ Error al registrar el Service Worker:", error));
    });
  
    // Recargar la página cuando se active un nuevo SW
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      console.log("♻️ Nueva versión activa, recargando página...");
      window.location.reload();
    });
  }
  







  app.get('/geolocalizacion', (req, res) => {
    if (req.session.loggedin === true) {
        const userId = req.session.userId;
        const nombreUsuario = req.session.user.name;

        // Procesar roles
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        console.log(`🔐 Usuario en geolocalización: ${nombreUsuario} (ID: ${userId})`);
        console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

        res.render('administrativo/mapa/ver_mapa.hbs', {
            nombreUsuario,
            userId,
            roles: cargos // <-- pasa roles como array a la vista
        });
    } else {
        res.redirect('/login');
    }
});



// Ruta para mostrar la página de restablecimiento de contraseña
app.get('/reset-password', (req, res) => {
    res.render('login/reset-password');
});



const formatDateForMySQL = (date) => {
    return date.toISOString().slice(0, 19).replace('T', ' ');
};

// ✅ Ruta para solicitar restablecimiento de contraseña
app.post('/request-password-reset', async (req, res) => {
    try {
        const { email } = req.body;

        // Verificar si el usuario existe
        const [users] = await pool.query(
            'SELECT reset_token, reset_token_exp FROM usuarios WHERE email = ?',
            [email]
        );

        let token;
        let expireTime = new Date(Date.now() + 3600000); // Sumar 1 hora en UTC
        let mysqlExpireTime = formatDateForMySQL(expireTime);

        if (users.length > 0 && users[0].reset_token && new Date(users[0].reset_token_exp) > new Date()) {
            // Si el usuario ya tiene un token válido, reutilizarlo
            token = users[0].reset_token;
            mysqlExpireTime = users[0].reset_token_exp; // Mantener la fecha de expiración original
        } else {
            // Generar un nuevo token y actualizar en la base de datos
            token = crypto.randomBytes(32).toString('hex');
            const [result] = await pool.query(
                'UPDATE usuarios SET reset_token = ?, reset_token_exp = ? WHERE email = ?',
                [token, mysqlExpireTime, email]
            );

            if (result.affectedRows === 0) {
                return res.status(400).json({ message: 'No se pudo actualizar el token, verifica el correo.' });
            }
        }

        console.log("✅ Token generado:", token);
        console.log("✅ Fecha de expiración guardada:", mysqlExpireTime);

        // Verificar que el token realmente se guardó en la base de datos
        const [checkToken] = await pool.query(
            'SELECT reset_token, reset_token_exp FROM usuarios WHERE email = ?', 
            [email]
        );
        console.log("🔍 Token en la BD después de la actualización:", checkToken[0]?.reset_token);
        console.log("🔍 Expiración en la BD:", checkToken[0]?.reset_token_exp);

        // Construir enlace de restablecimiento
        const resetLink = `http://sistemacerceta.com/reset-password/${encodeURIComponent(token)}`;

        // Configuración del correo
        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
        user: 'cercetasolucionempresarial@gmail.com', // ← Faltaba cerrar comillas aquí
                pass: 'yuumpbszqtbxscsq'
            }
        });

        // Enviar el correo con el enlace
        await transporter.sendMail({
            from: 'cercetasolucionempresarial@gmail.com',
            to: email,
            subject: `Restablece tu contraseña`,
            html: `<p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p>
                   <a href="${resetLink}">${resetLink}</a>`
        });

        res.json({ message: 'Se ha enviado un enlace a tu correo.' });

    } catch (error) {
        console.error("❌ Error en /request-password-reset:", error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

// ✅ Ruta para validar el token y mostrar el formulario de restablecimiento
app.get('/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;
        console.log("🔑 Token recibido en la URL:", token);

        // Verificar si el token es válido y no ha expirado
        const [users] = await pool.query(
            'SELECT id FROM usuarios WHERE reset_token = ? AND CONVERT_TZ(reset_token_exp, "+00:00", "+00:00") > UTC_TIMESTAMP()', 
            [token]
        );
        
        console.log("🔎 Resultado de la consulta:", users);

        if (!users || users.length === 0) {
            return res.send("⚠️ El enlace para restablecer la contraseña es inválido o ha expirado.");
        }

        res.render('login/change-password.hbs', { token });

    } catch (error) {
        console.error("❌ Error en /reset-password/:token:", error);
        res.status(500).send("Error en el servidor.");
    }
});






app.post('/update-password', async (req, res) => {
    try {
        const { token, password, confirmPassword } = req.body;

        if (password !== confirmPassword) {
            return res.status(400).json({ message: 'Las contraseñas no coinciden.' });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
        }

        const [users] = await pool.query(
            'SELECT id, reset_token_exp FROM usuarios WHERE reset_token = ? AND reset_token_exp > UTC_TIMESTAMP()', 
            [token]
        );

        if (users.length === 0) {
            return res.status(400).json({ message: 'El enlace para restablecer la contraseña es inválido o ha expirado.' });
        }

        const userId = users[0].id;

        await pool.query(
            'UPDATE usuarios SET password = ?, reset_token = NULL, reset_token_exp = NULL WHERE id = ?', 
            [password, userId]
        );

        res.json({ message: "Contraseña actualizada con éxito.", redirect: "/login" });

    } catch (error) {
        console.error("❌ Error en /update-password:", error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});



app.get('/menu_residentes', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;

        try {
            // Consulta para obtener el edificio_id del usuario
            const [userResult] = await pool.query('SELECT edificio FROM usuarios WHERE id = ?', [userId]);
            if (userResult.length === 0) {
                return res.status(404).send('Usuario no encontrado');
            }
            
            const edificioId = userResult[0].edificio;
            console.log("Edificio ID del usuario:", edificioId);

            // Consulta para obtener las publicaciones del edificio
            const [resultados] = await pool.query('SELECT * FROM publicaciones WHERE edificio_id = ? ORDER BY fecha DESC', [edificioId]);
            console.log("Resultados de publicaciones:", resultados);

            // Convertir los datos binarios a base64
            const blogPosts = resultados.map((post) => ({
                ...post,
                imagen: post.imagen ? post.imagen.toString('base64') : null,
                pdf: post.pdf ? post.pdf.toString('base64') : null,
                word: post.word ? post.word.toString('base64') : null,
                excel: post.excel ? post.excel.toString('base64') : null
            }));

            res.render('Residentes/home_residentes.hbs', { name, userId, blogPosts, layout: 'layouts/nav_residentes.hbs' });
        } catch (err) {
            console.error(err);
            res.status(500).send('Error al obtener las entradas del blog');
        }
    } else {
        res.redirect('/login');
    }
});



// En tu configuración de Handlebars
hbs.registerHelper('ifCond', function (v1, v2, options) {
    return (v1 === v2) ? options.fn(this) : options.inverse(this);
});




app.get('/subir_pago_residentes', async (req, res) => {
    if (req.session.loggedin === true) {
        const userId = req.session.userId;

        try {
            // Consulta para obtener edificio y apartamento del usuario
            const query = 'SELECT edificio, apartamento FROM usuarios WHERE id = ?';
            const [rows] = await pool.query(query, [userId]);

            if (rows.length > 0) {
                const { edificio, apartamento } = rows[0];

                // Procesar roles del usuario desde la sesión
                const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

                console.log('📍 Usuario:', req.session.user.name);
                console.log('🏢 Edificio:', edificio, '| 🏠 Apartamento:', apartamento);
                console.log('🎯 Roles asignados:', cargos);

                res.render('Residentes/pagos/subir_mi_pago.hbs', {
                    nombreUsuario: req.session.user.name,
                    userId,
                    roles: cargos, // <- importante
                    edificioSeleccionado: edificio,
                    apartamentoSeleccionado: apartamento,
                    layout: 'layouts/nav_residentes.hbs'
                });
            } else {
                res.redirect('/login');
            }
        } catch (error) {
            console.error('❌ Error al obtener edificio y apartamento:', error);
            res.status(500).send('Error interno del servidor');
        }
    } else {
        res.redirect('/login');
    }
});




























// Ruta para manejar el cierre de sesión
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Error al cerrar sesión' });
        }
        res.redirect('/login');  // Redirige al usuario a la página de login
    });
});






const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid'); // Utiliza UUID para generar IDs únicos

// Configurar el transporter con nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
         user: 'cercetasolucionempresarial@gmail.com', // ← Faltaba cerrar comillas aquí
                pass: 'yuumpbszqtbxscsq'
    },
    messageId: uuidv4(), // Genera un Message-ID único para cada correo enviado
});

const crypto = require('crypto'); // Importa el módulo crypto



hbs.registerHelper('json', function(context) {
    return JSON.stringify(context);
});



app.get("/menuAdministrativo", (req, res) => {
    if (req.session.loggedin === true) {
        try {
            const userId = req.session.userId;
            const nombreUsuario = req.session.name || req.session.user.name;
            req.session.nombreGuardado = nombreUsuario;

            const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

            console.log(`🔐 Usuario autenticado: ${nombreUsuario} (ID: ${userId})`);
            console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

            res.render("administrativo/menuadministrativo.hbs", {
                layout: 'layouts/nav_admin.hbs',
                name: nombreUsuario,
                userId,
                roles: cargos // pasamos el array directamente
            });
        } catch (error) {
            console.error('Error al cargar el menú administrativo:', error);
            res.status(500).send('Error interno');
        }
    } else {
        res.redirect("/login");
    }
});


















app.get("/menu_inmuebles", async (req, res) => {
    if (req.session.loggedin === true) {
        try {
            const userId = req.session.userId;
            const nombreUsuario = req.session.name || req.session.user.name;
            req.session.nombreGuardado = nombreUsuario;

            // Procesar roles como array de números en string
            const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

            console.log(`🔐 Usuario autenticado: ${nombreUsuario} (ID: ${userId})`);
            console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

            res.render("administrativo/Operaciones/ClientesEdificios/menu_inmuebles.hbs", {
                layout: 'layouts/nav_admin.hbs',
                name: nombreUsuario,
                userId,
                roles: cargos // <-- aquí se pasa a la vista
            });
        } catch (error) {
            console.error('❌ Error al cargar el menú de inmuebles:', error);
            res.status(500).send('Error al cargar el menú de inmuebles');
        }
    } else {
        res.redirect("/login");
    }
});





app.get("/menu_contabilidad", async (req, res) => {
    if (req.session.loggedin === true) {
        try {
            const userId = req.session.userId;
            const nombreUsuario = req.session.name || req.session.user.name;
            req.session.nombreGuardado = nombreUsuario;

            // Procesar cargos como array de strings con números
            const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

            console.log(`🔐 Usuario autenticado: ${nombreUsuario} (ID: ${userId})`);
            console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

            // Renderizar la vista
            res.render("administrativo/CONTABILIDAD/validarPagos/menu_contablidad.hbs", {
                layout: 'layouts/nav_admin.hbs',
                name: nombreUsuario,
                userId,
                roles: cargos // <- pasamos el array de roles a la vista
            });
        } catch (error) {
            console.error('❌ Error al cargar el menú contabilidad:', error);
            res.status(500).send('Error al cargar el menú contabilidad');
        }
    } else {
        res.redirect("/login");
    }
});






app.get("/menu_appresidentes", async (req, res) => {
    if (req.session.loggedin === true) {
        try {
            const userId = req.session.userId;
            const nombreUsuario = req.session.name || req.session.user.name;
            req.session.nombreGuardado = nombreUsuario;

            // Obtener los roles como arreglo de strings
            const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

            console.log(`🔐 Usuario autenticado: ${nombreUsuario} (ID: ${userId})`);
            console.log(`🎯 Roles asignados: ${roles}`);

            res.render("Aplicacione_residentes/menu.hbs", {
                layout: 'layouts/nav_admin.hbs',
                name: nombreUsuario,
                userId,
                roles
            });
        } catch (error) {
            console.error('Error al cargar el menú administrativo:', error);
            res.status(500).send('Error al cargar el menú');
        }
    } else {
        res.redirect("/login");
    }
});





app.get("/menu_comunicados", async (req, res) => {
    if (req.session.loggedin === true) {
        try {
            const userId = req.session.userId;
            const nombreUsuario = req.session.name || req.session.user.name;
            req.session.nombreGuardado = nombreUsuario;

            // Obtener roles como arreglo de strings numéricos
            const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

            console.log(`🔐 Usuario autenticado: ${nombreUsuario} (ID: ${userId})`);
            console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

            res.render("administrativo/Operaciones/comunicadoApartmamentos/menu_comunicados.hbs", {
                layout: 'layouts/nav_admin.hbs',
                name: nombreUsuario,
                userId,
                roles: cargos
            });
        } catch (error) {
            console.error('❌ Error al cargar el menú de comunicados:', error);
            res.status(500).send('Error al cargar el menú de comunicados');
        }
    } else {
        res.redirect("/login");
    }
});




app.get("/menu_documental", async (req, res) => {
    if (req.session.loggedin === true) {
        try {
            const userId = req.session.userId;
            const nombreUsuario = req.session.name || req.session.user.name;
            req.session.nombreGuardado = nombreUsuario;

            const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

            console.log(`🔐 Usuario autenticado: ${nombreUsuario} (ID: ${userId})`);
            console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

            // Bloquear acceso si solo tiene rol "1"
            if (cargos.includes('1') && cargos.length === 1) {
                console.log("⛔ Acceso denegado para el rol 1");
                return res.redirect("/menuAdministrativo"); // o puedes hacer: res.status(403).send("Acceso denegado");
            }

            res.render("administrativo/informes/menu_documental.hbs", {
                layout: 'layouts/nav_admin.hbs',
                name: nombreUsuario,
                userId,
                roles: cargos
            });
        } catch (error) {
            console.error('❌ Error al cargar el menú documental:', error);
            res.status(500).send('Error al cargar el menú documental');
        }
    } else {
        res.redirect("/login");
    }
});









app.get("/menu_Blog", async (req, res) => {
    if (req.session.loggedin === true) {
        try {
            const userId = req.session.userId;
            const nombreUsuario = req.session.name || req.session.user.name;
            req.session.nombreGuardado = nombreUsuario;

            const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

            console.log(`🔐 Usuario autenticado: ${nombreUsuario} (ID: ${userId})`);
            console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

            // Bloquear acceso si solo tiene el rol 1
            if (cargos.includes('1') && cargos.length === 1) {
                console.log("⛔ Acceso denegado para el rol 1");
                return res.redirect("/menuAdministrativo");
            }

            res.render("blog/menu_blog.hbs", {
                layout: 'layouts/nav_admin.hbs',
                name: nombreUsuario,
                userId,
                roles: cargos
            });
        } catch (error) {
            console.error('❌ Error al cargar el menú del blog:', error);
            res.status(500).send('Error al cargar el menú del blog');
        }
    } else {
        res.redirect("/login");
    }
});






app.get("/menu_alertas", async (req, res) => {
    if (req.session.loggedin === true) {
        try {
            const userId = req.session.userId;
            const nombreUsuario = req.session.name || req.session.user.name;
            req.session.nombreGuardado = nombreUsuario;

            const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

            console.log(`🔐 Usuario autenticado: ${nombreUsuario} (ID: ${userId})`);
            console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

            // Bloquear acceso si solo tiene rol "1"
            if (cargos.includes('1') && cargos.length === 1) {
                console.log("⛔ Acceso denegado para el rol 1");
                return res.redirect("/menuAdministrativo");
            }

            res.render("administrativo/alertas/menu_alertas.hbs", {
                layout: 'layouts/nav_admin.hbs',
                name: nombreUsuario,
                userId,
                roles: cargos
            });
        } catch (error) {
            console.error('❌ Error al cargar el menú de alertas:', error);
            res.status(500).send('Error al cargar el menú de alertas');
        }
    } else {
        res.redirect("/login");
    }
});






app.get('/agregar_edificio', (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

        res.render('administrativo/Operaciones/ClientesEdificios/agregaredificio.hbs', { 
            name, 
            userId, 
            roles, 
            layout: 'layouts/nav_admin.hbs' 
        });
    } else {
        res.redirect('/login');
    }
});


const multer = require('multer');
// Configuración de multer para manejar la subida de archivos
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


app.post('/agregar-edificio', upload.single('foto'), async (req, res) => {
    const {
        fechaincio,
        nombre,
        nit,
        cedula_representante_legal,
        nombre_representante_legal,
        direccion,
        correorepresentante,
        telefono,
        miembro1,
        direccion1,
        correo1,
        telefono1,
        miembro2,
        direccion2,
        correo2,
        telefono2,
        miembro3,
        direccion3,
        correo3,
        telefono3,
        miembro_comite1_nombre,
        miembro_comite1_cedula,
        miembro_comite1_celular,
        miembro_comite1_correo,
        miembro_comite2_nombre,
        miembro_comite2_cedula,
        miembro_comite2_celular,
        miembro_comite2_correo,
        miembro_comite3_nombre,
        miembro_comite3_cedula,
        miembro_comite3_celular,
        miembro_comite3_correo,
        miembro_comite4_nombre,
        miembro_comite4_cedula,
        miembro_comite4_celular,
        miembro_comite4_correo,
        miembro_comite5_nombre,
        miembro_comite5_cedula,
        miembro_comite5_celular,
        miembro_comite5_correo
    } = req.body;

    // Si no hay archivo, foto será null
    const foto = req.file ? req.file.buffer : null;

    const sql = `INSERT INTO edificios (
        fechaincio, nombre, nit, cedula_representante_legal, nombre_representante_legal,
        direccion, correorepresentante, telefono, 
        miembro1_nombre, miembro1_direccion, miembro1_correo, miembro1_telefono,
        miembro2_nombre, miembro2_direccion, miembro2_correo, miembro2_telefono,
        miembro3_nombre, miembro3_direccion, miembro3_correo, miembro3_telefono,
        miembro_comite1_nombre, miembro_comite1_cedula, miembro_comite1_celular, miembro_comite1_correo,
        miembro_comite2_nombre, miembro_comite2_cedula, miembro_comite2_celular, miembro_comite2_correo,
        miembro_comite3_nombre, miembro_comite3_cedula, miembro_comite3_celular, miembro_comite3_correo,
           miembro_comite4_nombre,
        miembro_comite4_cedula,
        miembro_comite4_celular,
        miembro_comite4_correo,
        miembro_comite5_nombre,
        miembro_comite5_cedula,
        miembro_comite5_celular,
        miembro_comite5_correo,
        foto
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?,?,?,?,?,?)`;

    const values = [
        fechaincio, nombre, nit, cedula_representante_legal, nombre_representante_legal,
        direccion, correorepresentante, telefono, 
        miembro1, direccion1, correo1, telefono1,
        miembro2, direccion2, correo2, telefono2,
        miembro3, direccion3, correo3, telefono3,
        miembro_comite1_nombre, miembro_comite1_cedula, miembro_comite1_celular, miembro_comite1_correo,
        miembro_comite2_nombre, miembro_comite2_cedula, miembro_comite2_celular, miembro_comite2_correo,
        miembro_comite3_nombre, miembro_comite3_cedula, miembro_comite3_celular, miembro_comite3_correo,
        miembro_comite4_nombre,
        miembro_comite4_cedula,
        miembro_comite4_celular,
        miembro_comite4_correo,
        miembro_comite5_nombre,
        miembro_comite5_cedula,
        miembro_comite5_celular,
        miembro_comite5_correo,
        foto
    ];

    try {
        const [results] = await pool.query(sql, values);
        res.status(200).json({ message: 'Edificio agregado exitosamente' });
    } catch (err) {
        console.error('Error inserting data:', err);
        res.status(500).json({ error: 'Error al agregar el edificio' });
    }
});




app.get('/agregar_apartamento', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;

        // Procesar roles como array de strings numéricos
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        console.log(`🔐 Usuario autenticado: ${name} (ID: ${userId})`);
        console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

        // Bloquear si solo tiene rol "1"
        if (cargos.includes('1') && cargos.length === 1) {
            console.log("⛔ Acceso denegado a agregar_apartamento para el rol 1");
            return res.redirect("/menuAdministrativo");
        }

        try {
            const [edificios] = await pool.query('SELECT id, nombre FROM edificios');
            res.render('administrativo/Operaciones/apartementos/agregarapartamento.hbs', {
                name,
                userId,
                edificios,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (error) {
            console.error('❌ Error al obtener edificios:', error);
            res.status(500).send('Error al obtener edificios');
        }
    } else {
        res.redirect('/login');
    }
});





app.get('/api/edificios', async (req, res) => {
    if (req.session.loggedin === true) {
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        // Bloquear si solo tiene rol "1"
        if (cargos.includes('1') && cargos.length === 1) {
            console.log("⛔ Acceso denegado a /api/edificios para rol 1");
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        try {
            const [rows] = await pool.query('SELECT id, nombre FROM edificios');
            res.json(rows);
        } catch (error) {
            console.error('❌ Error al obtener edificios:', error);
            res.status(500).send('Error al obtener edificios');
        }
    } else {
        res.status(401).json({ error: 'No autenticado' });
    }
});


app.post('/agregar_apartamento', upload.single('foto'), async (req, res) => {
    const {
        numero,
        edificio,  // Este será el ID del edificio
        responsable,
        piso,
        celular,
        correo
    } = req.body;

    // Si no hay archivo, foto será un buffer vacío
    const foto = req.file ? req.file.buffer : Buffer.alloc(0); // Crea un buffer vacío si no se sube archivo

    const sql = `INSERT INTO apartamentos (
        numero, edificio_id, responsable, piso, celular, correo, foto
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`;

    const values = [
        numero, edificio, responsable, piso, celular, correo, foto
    ];

    try {
        const [results] = await pool.query(sql, values);
        res.status(200).json({ message: 'Apartamento agregado exitosamente' });
    } catch (err) {
        console.error('Error inserting data:', err);
        res.status(500).json({ error: 'Error al agregar el apartamento' });
    }
});





app.get('/consultar_edificios', async (req, res) => {
    if (req.session.loggedin === true) {
        const userId = req.session.userId;
        const nombreUsuario = req.session.name;

        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];
        console.log(`🔐 Usuario autenticado: ${nombreUsuario} (ID: ${userId})`);
        console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

        // Bloquear si solo tiene el rol 1
        if (cargos.includes('1') && cargos.length === 1) {
            console.log("⛔ Acceso denegado a consultar_edificios para rol 1");
            return res.redirect('/menuAdministrativo');
        }

        try {
            const [edificios] = await pool.query('SELECT * FROM edificios');

            // Convertir imagen a base64
            edificios.forEach(edificio => {
                if (edificio.foto) {
                    edificio.foto = Buffer.from(edificio.foto).toString('base64');
                }
            });

            res.render('administrativo/Operaciones/ClientesEdificios/consultaredificios.hbs', {
                nombreUsuario,
                edificios,
                userId,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (error) {
            console.error('❌ Error al obtener edificios:', error);
            res.status(500).send('Error al obtener edificios');
        }
    } else {
        res.redirect('/login');
    }
});



app.get('/editar_miembros_comite', async (req, res) => {
    if (req.session.loggedin !== true) {
        return res.redirect('/login');
    }

    const edificioId = req.query.edificioId;
    const nombreUsuario = req.session.name;
    const userId = req.session.userId;
    const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

    console.log(`🔐 Usuario autenticado: ${nombreUsuario} (ID: ${userId})`);
    console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

    // Bloquear acceso si solo tiene el rol 1
    if (cargos.includes('1') && cargos.length === 1) {
        console.log("⛔ Acceso denegado a editar_miembros_comite para rol 1");
        return res.redirect("/menuAdministrativo");
    }

    try {
        const [edificio] = await pool.query('SELECT * FROM edificios WHERE id = ?', [edificioId]);
        if (edificio.length > 0) {
            res.render('administrativo/Operaciones/ClientesEdificios/editar_miembros_comite.hbs', {
                edificio: edificio[0],
                layout: 'layouts/nav_admin.hbs',
                nombreUsuario,
                userId,
                roles: cargos
            });
        } else {
            res.status(404).send('Edificio no encontrado');
        }
    } catch (error) {
        console.error('❌ Error al obtener edificio:', error);
        res.status(500).send('Error al obtener los detalles del edificio');
    }
});




app.post('/guardar_miembros_comite', async (req, res) => {
    const {
        edificioId,
        miembro_comite1_nombre,
        miembro_comite1_cedula,
        miembro_comite1_celular,
        miembro_comite1_correo,
        miembro_comite2_nombre,
        miembro_comite2_cedula,
        miembro_comite2_celular,
        miembro_comite2_correo,
        miembro_comite3_nombre,
        miembro_comite3_cedula,
        miembro_comite3_celular,
        miembro_comite3_correo
    } = req.body;

    const sql = `
        UPDATE edificios SET 
            miembro_comite1_nombre = ?, miembro_comite1_cedula = ?, miembro_comite1_celular = ?, miembro_comite1_correo = ?,
            miembro_comite2_nombre = ?, miembro_comite2_cedula = ?, miembro_comite2_celular = ?, miembro_comite2_correo = ?,
            miembro_comite3_nombre = ?, miembro_comite3_cedula = ?, miembro_comite3_celular = ?, miembro_comite3_correo = ?
        WHERE id = ?`;

    const values = [
        miembro_comite1_nombre, miembro_comite1_cedula, miembro_comite1_celular, miembro_comite1_correo,
        miembro_comite2_nombre, miembro_comite2_cedula, miembro_comite2_celular, miembro_comite2_correo,
        miembro_comite3_nombre, miembro_comite3_cedula, miembro_comite3_celular, miembro_comite3_correo,
        edificioId
    ];

    try {
        await pool.query(sql, values);
        res.redirect(`/ver_edificio?edificioId=${edificioId}`);
    } catch (error) {
        console.error('Error updating committee members:', error);
        res.status(500).send('Error al guardar los cambios de los miembros del comité');
    }
});



app.post('/getApartamentos_envio', async (req, res) => {
    const { edificiosSeleccionados } = req.body;

    console.log('Edificios seleccionados:', edificiosSeleccionados); // Verifica que los datos lleguen bien

    if (!edificiosSeleccionados || edificiosSeleccionados.length === 0) {
        return res.status(400).send({ error: 'No se seleccionaron edificios' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM apartamentos WHERE edificio_id IN (?)', [edificiosSeleccionados]);
        console.log('Apartamentos:', rows); // Verifica que los apartamentos se obtienen correctamente
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Error al obtener los apartamentos' });
    }
});






app.get('/Consulta_apartamentos', (req, res) => {
    if (req.session.loggedin === true) {
        const userId = req.session.userId;
        const name = req.session.name;

        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        console.log(`🔐 Usuario autenticado: ${name} (ID: ${userId})`);
        console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

        // Bloquear si solo tiene rol 1
        if (cargos.includes('1') && cargos.length === 1) {
            console.log("⛔ Acceso denegado a Consulta_apartamentos para rol 1");
            return res.redirect('/menuAdministrativo');
        }

        res.render('administrativo/Operaciones/apartementos/consulta_apartamentos', {
            name,
            userId,
            roles: cargos,
            layout: 'layouts/nav_admin.hbs'
        });
    } else {
        res.redirect('/login');
    }
});





app.get('/getEdificios', async (req, res) => {
    if (req.session.loggedin === true) {
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        console.log(`🔐 API /getEdificios llamada por usuario ID ${req.session.userId}`);
        console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

        // Bloquear si solo tiene rol 1
        if (cargos.includes('1') && cargos.length === 1) {
            console.log("⛔ Acceso denegado a /getEdificios para rol 1");
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        try {
            const [rows] = await pool.query('SELECT * FROM edificios');
            res.json({ edificios: rows });
        } catch (error) {
            console.error('❌ Error al obtener los edificios:', error);
            res.status(500).json({ error: 'Error al obtener los edificios' });
        }
    } else {
        res.status(401).json({ error: 'No autenticado' });
    }
});



app.get('/getApartamentos', async (req, res) => {
    if (!req.session.loggedin) {
        return res.status(401).json({ error: 'No autenticado' });
    }

    const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];
    const userId = req.session.userId;

    console.log(`🔐 API /getApartamentos llamada por usuario ID ${userId}`);
    console.log(`🎯 Roles asignados: [${cargos.join(', ')}]`);

    // Bloquear si solo tiene rol "1"
    if (cargos.includes('1') && cargos.length === 1) {
        console.log("⛔ Acceso denegado a /getApartamentos para rol 1");
        return res.status(403).json({ error: 'Acceso denegado' });
    }

    const edificioId = req.query.edificioId;
    if (!edificioId) {
        return res.status(400).json({ error: 'El ID del edificio es requerido' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM apartamentos WHERE edificio_id = ?', [edificioId]);
        res.json({ apartamentos: rows });
    } catch (error) {
        console.error('❌ Error al obtener los apartamentos:', error);
        res.status(500).json({ error: 'Error al obtener los apartamentos' });
    }
});



// Ruta para obtener los detalles de un apartamento
app.get('/getApartamentoDetalles', async (req, res) => {
    const apartamentoId = req.query.apartamentoId;
    if (!apartamentoId) {
        return res.status(400).send({ error: 'El ID del apartamento es requerido' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM apartamentos WHERE id = ?', [apartamentoId]);
        const apartamento = rows[0];

        if (apartamento && apartamento.foto) {
            apartamento.foto = apartamento.foto.toString('base64');
        }

        res.json({ apartamento });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Error al obtener los detalles del apartamento' });
    }
});









app.get('/editar_apartamento', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        const apartamentoId = req.query.apartamentoId;
        if (!apartamentoId) {
            return res.status(400).send('El ID del apartamento es requerido');
        }

        try {
            const [rows] = await pool.query('SELECT * FROM apartamentos WHERE id = ?', [apartamentoId]);
            const apartamento = rows[0];

            if (apartamento && apartamento.foto) {
                apartamento.foto = apartamento.foto.toString('base64');
            }

            res.render('administrativo/Operaciones/apartementos/editar_apartamentos', {
                name,
                userId,
                apartamento,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (error) {
            console.error('❌ Error al obtener apartamento:', error);
            res.status(500).send('Error al obtener los detalles del apartamento');
        }
    } else {
        res.redirect('/login');
    }
});


app.post('/update_apartamento', async (req, res) => {
    if (req.session.loggedin === true) {
        const { id, numero, piso, responsable, celular, correo } = req.body;

        try {
            await pool.query(
                'UPDATE apartamentos SET numero = ?, piso = ?, responsable = ?, celular = ?, correo = ? WHERE id = ?',
                [numero, piso, responsable, celular, correo, id]
            );
            res.redirect(`/Consulta_apartamentos`);
        } catch (error) {
            console.error(error);
            res.status(500).send('Error al actualizar los detalles del apartamento');
        }
    } else {
        res.redirect('/login');
    }
});






app.get('/editar_edificio', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        const edificioId = req.query.edificioId;
        if (!edificioId) {
            return res.status(400).send('El ID del edificio es requerido');
        }

        try {
            const [rows] = await pool.query('SELECT * FROM edificios WHERE id = ?', [edificioId]);
            const edificio = rows[0];

            if (edificio && edificio.fechaincio) {
                edificio.fechaincio = new Date(edificio.fechaincio).toISOString().split('T')[0];
            }

            if (edificio && edificio.foto) {
                edificio.foto = edificio.foto.toString('base64');
            }

            res.render('administrativo/Operaciones/ClientesEdificios/editar_edificios.hbs', {
                name,
                userId,
                edificio,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (error) {
            console.error('❌ Error al obtener el edificio:', error);
            res.status(500).send('Error al obtener los detalles del edificio');
        }
    } else {
        res.redirect('/login');
    }
});







app.post('/update_edificio', async (req, res) => {
    if (req.session.loggedin === true) {
        const { id, nombre, fechaincio, nombre_representante_legal, nit, cedula_representante_legal, direccion, correorepresentante, telefono } = req.body;

        try {
            await pool.query(
                'UPDATE edificios SET nombre = ?, fechaincio = ?, nombre_representante_legal = ?, nit = ?, cedula_representante_legal = ?, direccion = ?, correorepresentante = ?, telefono = ? WHERE id = ?',
                [nombre, fechaincio, nombre_representante_legal, nit, cedula_representante_legal, direccion, correorepresentante, telefono, id]
            );
            res.redirect(`/consultar_edificios`);
        } catch (error) {
            console.error(error);
            res.status(500).send('Error al actualizar los detalles del edificio');
        }
    } else {
        res.redirect('/login');
    }
});







app.get('/editar_miembros_consejo', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        const edificioId = req.query.edificioId;
        if (!edificioId) {
            return res.status(400).send('El ID del edificio es requerido');
        }

        try {
            const [rows] = await pool.query('SELECT * FROM edificios WHERE id = ?', [edificioId]);
            const edificio = rows[0];

            res.render('administrativo/Operaciones/ClientesEdificios/editar_miembros_consejo.hbs', {
                name,
                userId,
                edificio,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (error) {
            console.error('❌ Error al obtener los detalles del edificio:', error);
            res.status(500).send('Error al obtener los detalles del edificio');
        }
    } else {
        res.redirect('/login');
    }
});




app.post('/update_miembros_consejo', async (req, res) => {
    if (req.session.loggedin === true) {
        const {
            id, miembro1_nombre, miembro1_direccion, miembro1_correo, miembro1_telefono,
            miembro2_nombre, miembro2_direccion, miembro2_correo, miembro2_telefono,
            miembro3_nombre, miembro3_direccion, miembro3_correo, miembro3_telefono
        } = req.body;

        try {
            await pool.query(
                `UPDATE edificios SET miembro1_nombre = ?, miembro1_direccion = ?, miembro1_correo = ?, 
                miembro1_telefono = ?, miembro2_nombre = ?, miembro2_direccion = ?, miembro2_correo = ?, 
                miembro2_telefono = ?, miembro3_nombre = ?, miembro3_direccion = ?, miembro3_correo = ?, 
                miembro3_telefono = ? WHERE id = ?`,
                [miembro1_nombre, miembro1_direccion, miembro1_correo, miembro1_telefono,
                miembro2_nombre, miembro2_direccion, miembro2_correo, miembro2_telefono,
                miembro3_nombre, miembro3_direccion, miembro3_correo, miembro3_telefono, id]
            );
            res.redirect(`/consultar_edificios`);
        } catch (error) {
            console.error(error);
            res.status(500).send('Error al actualizar los detalles del edificio');
        }
    } else {
        res.redirect('/login');
    }
});





app.get('/ComunicadosGeneral', async (req, res) => {
    if (req.session.loggedin === true) {
        const userId = req.session.userId;
        const nombreUsuario = req.session.name;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        const query = 'SELECT * FROM edificios';

        try {
            const [results] = await pool.query(query);
            res.render('administrativo/Operaciones/comunicadoGeneral/nuevocomunicadoGeneral.hbs', {
                name: nombreUsuario,
                userId,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs',
                edificios: results
            });
        } catch (err) {
            console.error('❌ Error al obtener los edificios:', err);
            res.status(500).send('Error al obtener los edificios');
        }
    } else {
        res.redirect('/login');
    }
});





app.post('/enviarComunicado', upload.array('archivos'), async (req, res) => {
    let { edificiosSeleccionados, mensaje, asunto } = req.body; // Recibe el asunto desde el formulario
    let archivos = req.files;

    if (edificiosSeleccionados.includes('all')) {
        const queryAll = 'SELECT id FROM edificios';
        try {
            const [resultsAll] = await pool.query(queryAll);
            edificiosSeleccionados = resultsAll.map(row => row.id);
        } catch (err) {
            console.error(err);
            return res.status(500).send('Error al obtener todos los edificios');
        }
    }

    const query = `
        SELECT correo 
        FROM apartamentos 
        WHERE edificio_id IN (?)
    `;

    try {
        const [results] = await pool.query(query, [edificiosSeleccionados]);
        const correos = results.map(row => row.correo);

        // Configuración de nodemailer
        let transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
user: 'cercetasolucionempresarial@gmail.com', // ← Faltaba cerrar comillas aquí
                pass: 'yuumpbszqtbxscsq'
            }
        });

        // Construir lista de adjuntos
        let attachments = archivos.map(file => ({
            filename: file.originalname,
            content: file.buffer,
            cid: file.originalname.split('.')[0]
        }));

        // Opciones del correo
        let mailOptions = {
            from: '"Cerceta" <cercetasolucionempresarial@gmail.com>',
            to: correos.join(','), // Lista de destinatarios
            subject: asunto || 'Comunicado General', // Usa el asunto proporcionado o uno predeterminado
            text: mensaje,
            html: `
                <h1>Comunicado Importante</h1>
                <p>${mensaje}</p>
                ${attachments.map(att => `<img src="cid:${att.cid}"/>`).join('')}
            `,
            attachments: attachments
        };

        // Enviar el correo
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error(error);
                return res.status(500).send('Error al enviar el comunicado');
            }
            console.log('Message sent: %s', info.messageId);
            res.send('Comunicado enviado correctamente.');
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error al enviar el comunicado');
    }
});






app.get('/envio_apartamentos', async (req, res) => {
    if (req.session.loggedin === true) {
        const nombreUsuario = req.session.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        try {
            const [results] = await pool.query('SELECT * FROM edificios');
            res.render('administrativo/Operaciones/comunicadoApartmamentos/comunicado_individual.hbs', {
                name: nombreUsuario,
                userId,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs',
                edificios: results
            });
        } catch (err) {
            console.error('❌ Error al obtener los edificios:', err);
            res.status(500).send('Error al obtener los edificios');
        }
    } else {
        res.redirect('/login');
    }
});







// Ruta para obtener los apartamentos de los edificios seleccionados
app.post('/getApartamentos', async (req, res) => {
    const { edificiosSeleccionados } = req.body;
    const query = `
        SELECT * 
        FROM apartamentos 
        WHERE edificio_id IN (?)
    `;
    try {
        const [results] = await pool.query(query, [edificiosSeleccionados]);
        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al obtener los apartamentos');
    }
});







// Ruta para enviar el comunicado
app.post('/enviarComunicado_individual', upload.array('archivos'), async (req, res) => {
    const { apartamentosSeleccionados, mensaje, asunto } = req.body; // Recibir el asunto desde el cuerpo del formulario
    
    let archivos = req.files;

    const query = `
        SELECT correo 
        FROM apartamentos 
        WHERE id IN (?)
    `;

    try {
        const [results] = await pool.query(query, [apartamentosSeleccionados]);
        const correos = results.map(row => row.correo);

        // Configuración de nodemailer
        let transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                        user: 'cercetasolucionempresarial@gmail.com',
                pass: 'yuumpbszqtbxscsq'
            }
        });

        // Construir lista de adjuntos
        let attachments = archivos.map(file => ({
            filename: file.originalname,
            content: file.buffer,
            cid: file.originalname.split('.')[0] // usar el nombre del archivo sin extensión como cid
        }));

        // Opciones del correo
        let mailOptions = {
            from: '"Cerceta" <cercetasolucionempresarial@gmail.com>', // dirección del remitente
            to: correos.join(','), // lista de destinatarios
            subject: asunto, // Usar el asunto proporcionado por el usuario
            text: mensaje, // cuerpo del texto plano
            html: `
                <h1>Comunicado Importante</h1>
                <p>${mensaje}</p>
                ${attachments.map(att => `<img src="cid:${att.cid}"/>`).join('')}
            `, // cuerpo del html
            attachments: attachments
        };

        // Enviar el correo
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
                return res.status(500).send('Error al enviar el comunicado');
            }
            console.log('Message sent: %s', info.messageId);
            res.send('Comunicado enviado correctamente.');
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error al enviar el comunicado');
    }
});












app.get('/validar_pagos', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        try {
            const [results] = await pool.query('SELECT * FROM edificios');
            res.render('administrativo/CONTABILIDAD/validarPagos/validarpagos.hbs', {
                name,
                userId,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs',
                edificios: results
            });
        } catch (err) {
            console.error('❌ Error al obtener los edificios:', err);
            res.status(500).send('Error al obtener los edificios');
        }
    } else {
        res.redirect('/login');
    }
});



app.post('/getApartamentosss', async (req, res) => {
    const { edificioSeleccionado } = req.body;
    console.log("Edificio seleccionado:", edificioSeleccionado); // Verifica el valor del edificio seleccionado

    const query = `
        SELECT a.id, a.numero, e.nombre AS nombre_edificio
        FROM apartamentos a
        JOIN edificios e ON a.edificio_id = e.id
        WHERE a.edificio_id = ?
    `;
    try {
        const [results] = await pool.query(query, [edificioSeleccionado]);
        console.log("Apartamentos encontrados:", results); // Verifica los resultados de la consulta
        res.json(results); // Envía los resultados como JSON
    } catch (err) {
        console.error('Error al obtener los apartamentos:', err);
        res.status(500).send('Error al obtener los apartamentos');
    }
});




// Ruta para validar el pago del apartamento con documento de pago
app.post('/validarPago', upload.single('documento_pago'), async (req, res) => {
    const { apartamentoSeleccionado, fecha_pago, valor_pago } = req.body;
    const documentoPago = req.file; // El archivo subido
    
    // Verificar que se haya subido un archivo
    if (!documentoPago) {
        return res.status(400).send('Debe subir un documento de pago.');
    }

    // Convertir el archivo a BLOB para almacenarlo en la base de datos
    const documentoBuffer = documentoPago.buffer;

    // Consulta para verificar si el pago ya existe
    const querySelect = `
        SELECT * 
        FROM pagos_apartamentos 
        WHERE apartamento_id = ? AND fecha_pago = ?
    `;
    // Consulta para insertar el nuevo pago, incluyendo nombre de edificio y número de apartamento
    const queryInsert = `
        INSERT INTO pagos_apartamentos (apartamento_id, nombre_edificio, numero_apartamento, fecha_pago, valor_pago, documento_pago, estado)
        VALUES (?, ?, ?, ?, ?, ?, 'Pagado')
    `;
    // Consulta para obtener los detalles del apartamento seleccionado
    const queryApartamentoDetalles = `
        SELECT a.id AS apartamento_id, a.numero AS numero_apartamento, e.nombre AS nombre_edificio
        FROM apartamentos a
        JOIN edificios e ON a.edificio_id = e.id
        WHERE a.id = ?
    `;

    try {
        // Verificar si ya existe un pago para el apartamento y fecha especificada
        const [results] = await pool.query(querySelect, [apartamentoSeleccionado, fecha_pago]);
        if (results.length > 0) {
            return res.status(400).send('Ya existe un pago registrado para esta fecha.');
        }
        
        // Obtener los detalles del apartamento seleccionado
        const [apartamentoDetalles] = await pool.query(queryApartamentoDetalles, [apartamentoSeleccionado]);
        if (apartamentoDetalles.length === 0) {
            return res.status(404).send('No se encontró el apartamento seleccionado.');
        }

        const { nombre_edificio, numero_apartamento } = apartamentoDetalles[0];

        // Insertar el pago en la base de datos y obtener el ID del pago
        const [insertResult] = await pool.query(queryInsert, [apartamentoSeleccionado, nombre_edificio, numero_apartamento, fecha_pago, valor_pago, documentoBuffer]);
        const numeroSeguimiento = insertResult.insertId; // ID de pago generado

        // Consulta para obtener el correo electrónico del apartamento seleccionado
        const queryCorreo = `
            SELECT correo 
            FROM apartamentos 
            WHERE id = ?
        `;
        const [correoResults] = await pool.query(queryCorreo, [apartamentoSeleccionado]);
        if (correoResults.length === 0) {
            return res.status(404).send('Pago validado, pero no se encontró un correo asociado al apartamento.');
        }

        const correoDestinatario = correoResults[0].correo;

        // Configuración del mensaje de correo
        const mailOptions = {
            from: 'cercetasolucionempresarial@gmail.com', // Reemplaza con tu correo
            to: correoDestinatario,
            subject: 'Confirmación de Pago - Cerceta',
            text: `Estimado propietario,

Hemos recibido su pago correspondiente al edificio ${nombre_edificio}, apartamento ${numero_apartamento}. Agradecemos su cumplimiento y esperamos seguir brindándole un excelente servicio.

Con este número de seguimiento (${numeroSeguimiento}) puede realizar el respectivo seguimiento de su pago.

Atentamente,
Cerceta`
        };

        // Enviar el correo
        transporter.sendMail(mailOptions, function(error, info) {
            if (error) {
                console.error('Error al enviar el correo:', error);
                return res.status(500).send('Pago registrado, pero no se pudo enviar el correo de confirmación.');
            } else {
                console.log('Correo enviado: ' + info.response);
                return res.send('Pago validado correctamente y correo de confirmación enviado.');
            }
        });

    } catch (err) {
        console.error(err);
        return res.status(500).send('Error al validar el pago');
    }
});




app.get('/Consulta_Comprobantes_de_Pago', (req, res) => {
    if (req.session.loggedin === true) {
        const userId = req.session.userId;
        const name = req.session.name;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        res.render('administrativo/CONTABILIDAD/validarPagos/consultar_pagos.hbs', {
            name,
            userId,
            roles: cargos,
            layout: 'layouts/nav_admin.hbs'
        });
    } else {
        res.redirect('/login');
    }
});



app.post('/buscarPagos', async (req, res) => {
    if (req.session.loggedin === true) {
        const { id, apartamento_num, fecha_inicio, fecha_fin, nombre_edificio, numero_apartamento } = req.body;

        let query = "SELECT * FROM pagos_apartamentos WHERE 1=1";
        const params = [];

        if (id) {
            query += " AND id = ?";
            params.push(id);
        }
        if (apartamento_num) {
            query += " AND numero_apartamento = ?";
            params.push(apartamento_num);
        }
        if (fecha_inicio && fecha_fin) {
            query += " AND fecha_pago BETWEEN ? AND ?";
            params.push(fecha_inicio, fecha_fin);
        }
        if (nombre_edificio) {
            query += " AND nombre_edificio LIKE ?";
            params.push(`%${nombre_edificio}%`);
        }
        if (numero_apartamento) {
            query += " AND numero_apartamento LIKE ?";
            params.push(`%${numero_apartamento}%`);
        }

        try {
            const [results] = await pool.query(query, params);
            res.render('administrativo/CONTABILIDAD/validarPagos/consultar_pagos.hbs', {
                name: req.session.name,
                pagos: results,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (error) {
            console.error("Error al consultar los pagos:", error);
            res.status(500).send("Error en la consulta de pagos");
        }
    } else {
        res.redirect('/login');
    }
});

app.get('/descargarDocumento/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query("SELECT documento_pago FROM pagos_apartamentos WHERE id = ?", [id]);
        
        if (rows.length > 0 && rows[0].documento_pago) {
            const documento = rows[0].documento_pago;
            res.setHeader('Content-Disposition', 'attachment; filename=comprobante_pago.png'); // Forzar extensión .png
            res.setHeader('Content-Type', 'image/png'); // Tipo MIME para PNG
            res.send(documento);
        } else {
            res.status(404).send("Documento no encontrado");
        }
    } catch (error) {
        console.error("Error al descargar el documento:", error);
        res.status(500).send("Error al descargar el documento");
    }
});



// Ruta para obtener edificios
app.get('/obtenerEdificios', async (req, res) => {
    try {
        const [edificios] = await pool.query("SELECT DISTINCT nombre_edificio FROM pagos_apartamentos");
        res.json(edificios);
    } catch (error) {
        console.error("Error al obtener edificios:", error);
        res.status(500).json({ error: "Error al obtener edificios" });
    }
});

// Ruta para obtener los apartamentos de un edificio específico
app.get('/obtenerApartamentos/:nombre_edificio', async (req, res) => {
    const nombre_edificio = req.params.nombre_edificio;
    try {
        const [apartamentos] = await pool.query("SELECT DISTINCT numero_apartamento FROM pagos_apartamentos WHERE nombre_edificio = ?", [nombre_edificio]);
        res.json(apartamentos);
    } catch (error) {
        console.error("Error al obtener apartamentos:", error);
        res.status(500).json({ error: "Error al obtener apartamentos" });
    }
});



// Ruta para descargar el comprobante de pago
app.get('/descargar_comprobante/:id', (req, res) => {
    const { id } = req.params;

    const query = `SELECT documento_pago FROM pagos_apartamentos WHERE id = ?`;
    pool.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error al obtener el comprobante:', err);
            res.status(500).json({ message: 'Error al obtener el comprobante' });
        } else {
            if (results.length > 0 && results[0].documento_pago) {
                res.setHeader('Content-Disposition', `attachment; filename=comprobante_${id}.pdf`);
                res.setHeader('Content-Type', 'application/pdf');
                res.send(results[0].documento_pago);
            } else {
                res.status(404).json({ message: 'Comprobante no encontrado' });
            }
        }
    });
});

app.get('/api/edificios-count', async (req, res) => {
    try {
        const [results] = await pool.query('SELECT COUNT(*) AS count FROM edificios');  // No necesitas .promise() aquí
        const count = results[0].count;
        res.json({ count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el conteo de edificios' });
    }
});


app.get('/api/apartamentos-count', async (req, res) => {
    try {
        const [results] = await pool.query('SELECT COUNT(*) AS count FROM apartamentos');  // No necesitas .promise() aquí
        const count = results[0].count;
        res.json({ count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el conteo de edificios' });
    }
});






app.get('/agregar_usuarios', async (req, res) => {
    if (req.session.loggedin === true) {
        const userId = req.session.userId;
        const nombreUsuario = req.session.name;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        try {
            const [edificios] = await pool.query('SELECT id, nombre FROM edificios');

            res.render('administrativo/usuarios/crear_usuarios.hbs', {
                nombreUsuario,
                userId,
                edificios,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (error) {
            console.error('❌ Error al obtener edificios:', error);
            res.status(500).send('Error al cargar los edificios');
        }
    } else {
        res.redirect('/login');
    }
});











// Ruta para obtener apartamentos según el edificio seleccionado
app.get('/api/apartamentosss/:edificioId', async (req, res) => {
    const { edificioId } = req.params;
    try {
        const [apartamentos] = await pool.query(
            'SELECT id, numero FROM apartamentos WHERE edificio_id = ?',
            [edificioId]
        );
        res.json(apartamentos); // Devolver los apartamentos como JSON
    } catch (error) {
        console.error('Error al obtener apartamentos:', error);
        res.status(500).json({ message: 'Error al obtener apartamentos' });
    }
});


app.get('/plantilla_blog', (req, res) => {
    if (req.session.loggedin === true) {
        const userId = req.session.userId;
        const nombreUsuario = req.session.name;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        res.render('blog/plantilla_simple.hbs', {
            nombreUsuario,
            userId,
            roles: cargos,
            layout: 'layouts/nav_admin.hbs'
        });
    } else {
        res.redirect('/login');
    }
});




app.get('/subir_publicacion', async (req, res) => {
    if (req.session.loggedin === true) {
        try {
            const [edificios] = await pool.query('SELECT id, nombre FROM edificios');
            const userId = req.session.userId;
            const name = req.session.name;
            const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

            res.render('blog/agregar_blog.hbs', {
                name,
                edificios,
                userId,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (error) {
            console.error('❌ Error al obtener los edificios:', error);
            res.status(500).send('Error interno del servidor');
        }
    } else {
        res.redirect('/login');
    }
});







// Servir las imágenes desde la carpeta "uploads"
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));












app.post('/guardar-blog', (req, res) => {
    const { blogContent, imageIds } = req.body;  // Suponiendo que envías el contenido del blog y los IDs de las imágenes

    // Guardar las imágenes desde memoria a disco (o base de datos)
    imageIds.forEach(id => {
        const file = temporaryFiles[id];
        if (file) {
            // Aquí puedes guardar el archivo en disco
            const filePath = `uploads/${file.originalname}`;
            require('fs').writeFileSync(filePath, file.buffer);

            // O puedes guardarlo en la base de datos como BLOB
            // db.query('INSERT INTO images (data, mimetype) VALUES (?, ?)', [file.buffer, file.mimetype]);
        }
    });

    // Limpiar los archivos temporales de la memoria
    imageIds.forEach(id => delete temporaryFiles[id]);

    // Guardar el contenido del blog en la base de datos
    // db.query('INSERT INTO blogs (content) VALUES (?)', [blogContent]);

    res.status(200).json({ message: 'Blog guardado con éxito' });
});



app.post('/subir_publicacion', upload.fields([
    { name: 'imagen', maxCount: 1 },
    { name: 'pdf', maxCount: 1 },
    { name: 'word', maxCount: 1 },
    { name: 'excel', maxCount: 1 }
]), async (req, res) => {
    if (req.session.loggedin === true) {
        const { edificio, titulo, fecha, descripcion } = req.body;
        const archivos = req.files;

        // Variables para almacenar los datos de los archivos
        let imagen = null, imagenMime = null;
        let pdf = null, pdfMime = null;
        let word = null, wordMime = null;
        let excel = null, excelMime = null;

        // Asignar valores si los archivos han sido subidos
        if (archivos.imagen) {
            imagen = archivos.imagen[0].buffer;
            imagenMime = archivos.imagen[0].mimetype;
        }
        if (archivos.pdf) {
            pdf = archivos.pdf[0].buffer;
            pdfMime = archivos.pdf[0].mimetype;
        }
        if (archivos.word) {
            word = archivos.word[0].buffer;
            wordMime = archivos.word[0].mimetype;
        }
        if (archivos.excel) {
            excel = archivos.excel[0].buffer;
            excelMime = archivos.excel[0].mimetype;
        }

        try {
            // Insertar la publicación en la base de datos
            const query = `
                INSERT INTO publicaciones (
                    edificio_id, titulo, fecha, descripcion, 
                    imagen, imagen_mime, 
                    pdf, pdf_mime, 
                    word, word_mime, 
                    excel, excel_mime
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await pool.query(query, [
                edificio, titulo, fecha, descripcion,
                imagen, imagenMime,
                pdf, pdfMime,
                word, wordMime,
                excel, excelMime
            ]);

            res.status(200).send('Publicación subida con éxito');
        } catch (error) {
            console.error('Error al guardar la publicación:', error);
            res.status(500).send('Error interno del servidor');
        }
    } else {
        res.redirect('/login');
    }
});



app.get('/estados_cuenta', (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        res.render('administrativo/CONTABILIDAD/validarPagos/estados_cuanta.hbs', {
            name,
            userId,
            roles: cargos,
            layout: 'layouts/nav_admin.hbs'
        });
    } else {
        res.redirect('/login');
    }
});


// Ruta para obtener todos los edificios con sus apartamentos
app.get('/obtenerEdificiosConApartamentos', async (req, res) => {
    try {
        const [resultados] = await pool.query(`
            SELECT nombre_edificio, numero_apartamento 
            FROM pagos_apartamentos
            ORDER BY nombre_edificio, numero_apartamento
        `);

        // Organizar los datos en un formato adecuado para la vista
        const edificios = resultados.reduce((acc, { nombre_edificio, numero_apartamento }) => {
            if (!acc[nombre_edificio]) {
                acc[nombre_edificio] = [];
            }
            acc[nombre_edificio].push(numero_apartamento);
            return acc;
        }, {});

        res.json(edificios);
    } catch (error) {
        console.error("Error al obtener edificios con apartamentos:", error);
        res.status(500).json({ error: "Error al obtener edificios con apartamentos" });
    }
});



app.get('/obtenerEdificiosConPagos', async (req, res) => {
    try {
        const [resultados] = await pool.query(`
            SELECT nombre_edificio, numero_apartamento, 
                   YEAR(fecha_pago) AS year, MONTH(fecha_pago) AS month, 
                   SUM(valor_pago) AS total_pago
            FROM pagos_apartamentos
            GROUP BY nombre_edificio, numero_apartamento, year, month
            ORDER BY nombre_edificio, numero_apartamento, year, month
        `);

        // Organize data for the frontend, filling in missing months with 0
        const edificios = {};

        resultados.forEach(({ nombre_edificio, numero_apartamento, year, month, total_pago }) => {
            if (!edificios[nombre_edificio]) {
                edificios[nombre_edificio] = {};
            }
            if (!edificios[nombre_edificio][numero_apartamento]) {
                edificios[nombre_edificio][numero_apartamento] = Array(12).fill(0); // Initialize 12 months with 0
            }
            edificios[nombre_edificio][numero_apartamento][month - 1] = total_pago; // Set the total for the specific month
        });

        res.json(edificios);
    } catch (error) {
        console.error("Error al obtener datos de pagos:", error);
        res.status(500).json({ error: "Error al obtener datos de pagos" });
    }
});






app.get('/seleccionar_edificio_blog', (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        pool.query('SELECT id, nombre FROM edificios')
            .then(([resultados]) => {
                res.render('blog/seleccionar_edificio.hbs', {
                    name,
                    userId,
                    roles: cargos,
                    edificios: resultados,
                    layout: 'layouts/nav_admin.hbs'
                });
            })
            .catch(err => {
                console.error('❌ Error al obtener edificios:', err);
                res.status(500).send('Error al obtener edificios');
            });
    } else {
        res.redirect('/login');
    }
});


app.get("/menu_usuarios", async (req, res) => {
    if (req.session.loggedin === true) {
        try {
            const userId = req.session.userId;
            const nombreUsuario = req.session.name || req.session.user.name;
            req.session.nombreGuardado = nombreUsuario;

            // Convertir el campo cargo en array de strings numéricos
            const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

            console.log(`🔐 Usuario autenticado: ${nombreUsuario} (ID: ${userId})`);
            console.log(`🎯 Roles del usuario:`, cargos);

            res.render("administrativo/usuarios/menu_usuarios.hbs", {
                layout: 'layouts/nav_admin.hbs',
                name: nombreUsuario,
                userId,
                roles: cargos
            });
        } catch (error) {
            console.error('❌ Error al cargar el menú de usuarios:', error);
            res.status(500).send('Error interno');
        }
    } else {
        res.redirect("/login");
    }
});










app.get('/ver_blog_admin', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;

        const edificioId = req.query.edificio_id;

        try {
            const [resultados] = await pool.query('SELECT * FROM publicaciones WHERE edificio_id = ? ORDER BY fecha DESC', [edificioId]);
            
            // Convertir los datos binarios a base64
            const blogPosts = resultados.map((post) => {
                return {
                    ...post,
                    imagen: post.imagen ? post.imagen.toString('base64') : null,
                    pdf: post.pdf ? post.pdf.toString('base64') : null,
                    word: post.word ? post.word.toString('base64') : null,
                    excel: post.excel ? post.excel.toString('base64') : null
                };
            });

            res.render('blog/consulta_admin.hbs', { name,userId ,blogPosts, layout: 'layouts/nav_admin.hbs' });
        } catch (err) {
            console.error(err);
            res.status(500).send('Error al obtener las entradas del blog');
        }
    } else {
        res.redirect('/login');
    }
});





app.get('/informe_operativo', (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        res.render('administrativo/informes/crear_informe_operativo.hbs', {
            name,
            roles: cargos,
            layout: 'layouts/nav_admin.hbs'
        });
    } else {
        res.redirect('/login');
    }
});



app.get('/crear_informe_mantenimiento', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        try {
            const [results] = await pool.query('SELECT id, nombre FROM edificios');

            res.render('administrativo/informes/crear/mantenimiento.hbs', {
                name,
                edificios: results,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (error) {
            console.error('❌ Error al obtener edificios:', error);
            res.status(500).send("Error al obtener edificios");
        }
    } else {
        res.redirect('/login');
    }
});









app.post('/guardar_informe', upload.fields([
    { name: 'imagen_antes', maxCount: 1 },
    { name: 'imagen_durante', maxCount: 1 },
    { name: 'imagen_despues', maxCount: 1 },
    { name: 'bitacoraPng', maxCount: 1 }
]), async (req, res) => {
    if (!req.body.fecha_informe) {
        return res.status(400).send("La fecha del informe es obligatoria.");
    }

    // Definir la carpeta y archivo de la bitácora
    const directoryPath = path.join(__dirname, 'public', 'bitacoras');
    const fileName = `bitacora_${Date.now()}.png`;
    const bitacoraFilePath = path.join(directoryPath, fileName); // Ruta completa para guardar el archivo

    // Guardar solo la ruta relativa para la base de datos
    const relativeFilePath = `bitacoras/${fileName}`;

    // Verificar y crear la carpeta si no existe
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
    }

    // Guardar el archivo `bitacoraPng` en la carpeta
    if (req.files['bitacoraPng']) {
        fs.writeFileSync(bitacoraFilePath, req.files['bitacoraPng'][0].buffer);
    }

    // Datos para guardar en la base de datos
    const data = {
        fecha_informe: req.body.fecha_informe,
        realizado_por: req.body.realizado_por,
        edificio_id: req.body.edificio,
        transformador: req.body.transformador,
        transformador_obs: req.body.transformador_obs,
        planta_electrica: req.body.planta_electrica,
        planta_electrica_obs: req.body.planta_electrica_obs,
        motobomba_piscina: req.body.motobomba_piscina,
        motobomba_piscina_obs: req.body.motobomba_piscina_obs,
        bombas_sumergibles: req.body.bombas_sumergibles,
        bombas_sumergibles_obs: req.body.bombas_sumergibles_obs,
        tanque_reserva: req.body.tanque_reserva,
        tanque_reserva_obs: req.body.tanque_reserva_obs,
        equipo_gym: req.body.equipo_gym,
        equipo_gym_obs: req.body.equipo_gym_obs,
        sauna: req.body.sauna,
        sauna_obs: req.body.sauna_obs,
        turco: req.body.turco,
        turco_obs: req.body.turco_obs,
        piscina: req.body.piscina,
        piscina_obs: req.body.piscina_obs,
        cancha_tenis: req.body.cancha_tenis,
        cancha_tenis_obs: req.body.cancha_tenis_obs,
        juegos_infantiles: req.body.juegos_infantiles,
        juegos_infantiles_obs: req.body.juegos_infantiles_obs,
        salon_social: req.body.salon_social,
        salon_social_obs: req.body.salon_social_obs,
        otros: req.body.otros,
        otros_obs: req.body.otros_obs,
        imagen_antes: req.files['imagen_antes'] ? req.files['imagen_antes'][0].buffer : null,
        imagen_durante: req.files['imagen_durante'] ? req.files['imagen_durante'][0].buffer : null,
        imagen_despues: req.files['imagen_despues'] ? req.files['imagen_despues'][0].buffer : null,
        bitacoraFilePath: relativeFilePath // Guardar solo la ruta relativa en la base de datos
    };

    try {
        const query = `INSERT INTO bitacora_mantenimiento_equipos SET ?`;
        await pool.query(query, data);

        // Verificar si se desea compartir el informe
        if (req.body.compartirInforme === 'si') {
            // Obtener correos del edificio
            const emailsQuery = `SELECT correo FROM apartamentos WHERE edificio_id = ?`;
            const [emails] = await pool.query(emailsQuery, [req.body.edificio]);

            // Enviar correos con el archivo adjunto
            const transporter = nodemailer.createTransport({
                service: 'gmail', // Cambia esto según tu proveedor de correo
                auth: {
                            user: 'cercetasolucionempresarial@gmail.com',
                pass: 'yuumpbszqtbxscsq'
                }
            });

            const attachments = [{
                path: bitacoraFilePath // Ruta del archivo que se guarda
            }];

            // Agregar las imágenes a los adjuntos si están disponibles
            if (req.files['imagen_antes']) {
                const imagenAntesPath = path.join(directoryPath, `imagen_antes_${Date.now()}.png`);
                fs.writeFileSync(imagenAntesPath, req.files['imagen_antes'][0].buffer);
                attachments.push({ path: imagenAntesPath });
            }
            if (req.files['imagen_durante']) {
                const imagenDurantePath = path.join(directoryPath, `imagen_durante_${Date.now()}.png`);
                fs.writeFileSync(imagenDurantePath, req.files['imagen_durante'][0].buffer);
                attachments.push({ path: imagenDurantePath });
            }
            if (req.files['imagen_despues']) {
                const imagenDespuesPath = path.join(directoryPath, `imagen_despues_${Date.now()}.png`);
                fs.writeFileSync(imagenDespuesPath, req.files['imagen_despues'][0].buffer);
                attachments.push({ path: imagenDespuesPath });
            }

            const mailOptions = {
                from: 'cercetasolucionempresarial@gmail.com',
                to: emails.map(email => email.correo).join(','),
                subject: 'Informe de Mantenimiento',
                text: 'Adjunto el informe de mantenimiento correspondiente.',
                attachments: attachments // Usar el array de adjuntos
            };

            await transporter.sendMail(mailOptions);
            res.send("Informe de mantenimiento guardado y notificaciones enviadas con éxito.");
        } else {
            res.send("Informe de mantenimiento guardado con éxito sin enviar notificaciones.");
        }
    } catch (error) {
        console.error("Error al guardar el informe o enviar el correo:", error);
        res.status(500).send("Error al guardar el informe o enviar la notificación.");
    }
});








app.post('/guardar_usuario', upload.single('foto'), async (req, res) => {
    const { nombre, user_email, role, fecha_cumpleaños, cargo } = req.body;
    const edificio = req.body.edificio || null;
    const apartamento = req.body.apartamento || null;

    const foto = req.file ? req.file.buffer : null;

    try {
        const checkQuery = 'SELECT * FROM usuarios WHERE email = ?';
        const [rows] = await pool.query(checkQuery, [user_email]);

        if (rows.length > 0) {
            res.send('<script>alert("El correo ya está en uso."); window.location.href="/agregar_usuarios";</script>');
        } else {
            const generatedPassword = crypto.randomBytes(4).toString('hex');

            const insertQuery = `
                INSERT INTO usuarios 
                    (nombre, email, password, role, cargo, fecha_cumpleaños, edificio, apartamento, foto) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            await pool.query(insertQuery, [
                nombre,
                user_email,
                generatedPassword,
                role,
                cargo,
                fecha_cumpleaños,
                role === "residentes" ? edificio : null,
                role === "residentes" ? apartamento : null,
                foto
            ]);

            await enviarCorreoInvitacion(user_email, nombre, generatedPassword);

            res.send('<script>alert("Usuario guardado y correo enviado."); window.location.href="/agregar_usuarios";</script>');
        }
    } catch (error) {
        console.error('Error al guardar el usuario:', error);
        res.send('<script>alert("Hubo un error al guardar el usuario."); window.location.href="/agregar_usuarios";</script>');
    }
});





// **Función para enviar el correo**
async function enviarCorreoInvitacion(email, nombre, password) {
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Usa otro servicio si no es Gmail
        auth: {
          user: 'cercetasolucionempresarial@gmail.com',
                pass: 'yuumpbszqtbxscsq'
        }
    });

    const mailOptions = {
        from: 'cercetasolucionempresarial@gmail.com',
        to: email,
        subject: 'Invitación a la plataforma',
        text: `Hola ${nombre},\n\nSe ha creado una cuenta para ti en nuestra plataforma.\n\nTus credenciales de acceso son:\nEmail: ${email}\nContraseña: ${password}\n\nPor favor, inicia sesión y cambia tu contraseña por seguridad.\n\nSaludos.`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Correo enviado a ${email}`);
    } catch (error) {
        console.error('Error al enviar el correo:', error);
    }
}






app.get('/crear_alerta', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        try {
            const [administradores] = await pool.query(`SELECT id, nombre, email FROM usuarios WHERE role = 'admin'`);
            const [edificios] = await pool.query(`SELECT id, nombre FROM edificios`);

            res.render('administrativo/alertas/crear_alerta.hbs', { 
                name,
                roles: cargos,
                administradores,
                edificios,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (error) {
            console.error("❌ Error al obtener datos:", error);
            res.status(500).send("Hubo un problema al cargar los datos.");
        }
    } else {
        res.redirect('/login');
    }
});





app.post('/crear_alerta', async (req, res) => {
    try {
        console.log(req.body); // Verificar qué datos están llegando

        const {
            nombreActividad,
            fechaEjecucion,
            frecuenciaAlerta,
            diasAntesAlerta,
            prioridad,
            tiempoRecordatorio,
            responsable,
            edificio // Nuevo campo
        } = req.body;

        // Acceder a los métodos de notificación seleccionados
        let metodoNotificacion = req.body['metodoNotificacion[]'];

        // Si solo hay un valor seleccionado, lo convertimos en un array
        if (!Array.isArray(metodoNotificacion)) {
            metodoNotificacion = metodoNotificacion ? [metodoNotificacion] : [];
        }

        const metodosNotificacion = metodoNotificacion.join(',');

        console.log("Métodos de Notificación antes de la consulta:", metodosNotificacion);

        // Inserción en la tabla alertas incluyendo el edificio
        const query = `INSERT INTO alertas 
            (nombre_actividad, fecha_ejecucion, frecuencia_alerta, dias_antes_alerta, metodo_notificacion, prioridad, tiempo_recordatorio, responsable_id, edificio_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        await pool.query(query, [
            nombreActividad,
            fechaEjecucion,
            frecuenciaAlerta,
            diasAntesAlerta !== "" ? diasAntesAlerta : null,
            metodosNotificacion, 
            prioridad,
            tiempoRecordatorio !== "" ? tiempoRecordatorio : null,
            responsable,
            edificio
        ]);

        console.log("Alerta creada exitosamente con métodos de notificación:", metodosNotificacion);
        res.redirect('/crear_alerta'); 

    } catch (error) {
        console.error("Error al crear alerta:", error);
        res.status(500).send("Hubo un problema al crear la alerta.");
    }
});






async function verificarAlertasPendientes() {
    try {
        console.log("Iniciando verificación de alertas...");

        const query = `
        SELECT 
            a.id, a.nombre_actividad, a.fecha_ejecucion, a.frecuencia_alerta, a.dias_antes_alerta, 
            a.metodo_notificacion, a.prioridad, a.tiempo_recordatorio, u.email, u.nombre, u.id AS responsable_id
        FROM 
            alertas a 
        JOIN 
            usuarios u ON a.responsable_id = u.id 
        WHERE 
            NOW() <= a.fecha_ejecucion
    `;
    
        const [alertas] = await pool.query(query);

        console.log("Alertas encontradas:", alertas.length);

        for (const alerta of alertas) {
            const hoy = moment();
            const fechaEjecucion = moment(alerta.fecha_ejecucion);

            // Determina si la notificación debe enviarse según la frecuencia
            let enviarNotificacion = false;
            switch (alerta.frecuencia_alerta) {
                case 'diaria':
                    enviarNotificacion = true; // Notificar todos los días hasta la fecha de ejecución
                    break;
                case 'semanal':
                    enviarNotificacion = hoy.diff(fechaEjecucion, 'days') % 7 === 0;
                    break;
                case 'quincenal':
                    enviarNotificacion = hoy.diff(fechaEjecucion, 'days') % 14 === 0;
                    break;
                case 'mensual':
                    enviarNotificacion = hoy.isSame(fechaEjecucion, 'day'); // Notificar una vez al mes en el día de ejecución
                    break;
                case 'personalizada':
                    if (alerta.dias_antes_alerta) {
                        const diasDiferencia = fechaEjecucion.diff(hoy, 'days');
                        enviarNotificacion = diasDiferencia === alerta.dias_antes_alerta;
                    }
                    break;
            }

            if (enviarNotificacion) {
                console.log("Procesando alerta:", alerta);

                // Procesar cada método de notificación seleccionado
                const metodos = alerta.metodo_notificacion.split(',');
                for (const metodo of metodos) {
                    switch (metodo.trim()) {
                        case 'email':
                            console.log("Enviando correo a:", alerta.email);
                            await sendEmail(alerta.email, alerta.nombre_actividad, alerta.fecha_ejecucion);
                            break;
                        case 'sms':
                            console.log("Enviando SMS a:", alerta.email);
                            await sendSMS(alerta.email, alerta.nombre_actividad);
                            break;
                        case 'push':
                            console.log("Enviando notificación push a:", alerta.email);
                            await sendPushNotification(alerta.email, alerta.nombre_actividad);
                            break;
                            case 'app':
                                console.log("Enviando notificación en app al usuario con ID:", alerta.responsable_id);
                                await sendAppNotification(alerta.responsable_id, alerta.nombre_actividad, alerta.fecha_ejecucion);
                                break;
                            
                            
                        default:
                            console.log(`Método de notificación no soportado: ${metodo}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error al verificar alertas:", error);
    }
}



// Métodos de notificación
async function sendEmail(to, actividad, fecha) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
                   user: 'cercetasolucionempresarial@gmail.com',
                   pass: 'yuumpbszqtbxscsq'
                }
    });

    const mailOptions = {
        from: 'cercetasolucionempresarial@gmail.com',
        to: to,
        subject: `Recordatorio de Actividad: ${actividad}`,
        text: `Hola, tienes la actividad "${actividad}" programada para el ${moment(fecha).format('DD/MM/YYYY')}. ¡No olvides realizarla!`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error(`Error al enviar el correo: ${error}`);
        } else {
            console.log(`Correo enviado: ${info.response}`);
        }
    });
}



async function sendSMS(to, actividad) {
    console.log(`Enviando SMS a ${to} para la actividad ${actividad}`);
    // Implementación del envío de SMS (puedes usar Twilio, por ejemplo)
}


async function sendPushNotification(to, actividad) {
    console.log(`Enviando notificación push a ${to} para la actividad ${actividad}`);
    // Implementación del envío de notificación push
}


async function sendAppNotification(userId, actividad, fechaEjecucion) {
    if (!userId) {
        console.error("El user_id es null o indefinido. No se puede enviar la notificación.");
        return;
    }

    console.log(`Registrando notificación en app para el usuario con ID ${userId} sobre la actividad ${actividad}`);

    const query = `
        INSERT INTO notificaciones (user_id, actividad, fecha, leido)
        VALUES (?, ?, ?, 0)
    `;
    
    await pool.query(query, [userId, actividad, fechaEjecucion]); // Guardar fecha_ejecucion en la columna de fecha
}














app.get('/notificaciones', async (req, res) => {
    const userId = req.session.userId; // Asegúrate de que el ID de usuario esté en la sesión

    try {
        const [notificaciones] = await pool.query(`
            SELECT * FROM notificaciones WHERE user_id = ? AND leido = 0
        `, [userId]);

        console.log("Notificaciones para el usuario:", notificaciones); // Asegúrate de que esto tenga datos
        res.json({ notificaciones });
    } catch (error) {
        console.error("Error al obtener notificaciones:", error);
        res.status(500).json({ error: "Error al obtener notificaciones" });
    }
});





app.get('/notificaciones', async (req, res) => {
    const userId = req.session.userId; // Asegúrate de que el ID de usuario esté en la sesión
    console.log("User ID de la sesión:", userId); // Verifica el ID del usuario

    try {
        const [notificaciones] = await pool.query(`
            SELECT * FROM notificaciones WHERE user_id = ? AND leido = 0
        `, [userId]);

        console.log("Notificaciones encontradas:", notificaciones); // Verifica si hay notificaciones
        res.json({ notificaciones });
    } catch (error) {
        console.error("Error al obtener notificaciones:", error);
        res.status(500).json({ error: "Error al obtener notificaciones" });
    }
});






app.post('/marcarNotificacionesComoLeidas/:user_id', async (req, res) => {
    const userId = req.params.user_id; // Se recibe correctamente el user_id
    console.log("Intentando marcar como leídas las notificaciones para el user_id:", userId);

    try {
        const [result] = await pool.query('UPDATE notificaciones SET leido = 1 WHERE user_id = ? AND leido = 0', [userId]);

        if (result.affectedRows > 0) {
            console.log("Notificaciones marcadas como leídas para el user_id:", userId);
            res.json({ success: true, message: 'Notificaciones marcadas como leídas', affectedRows: result.affectedRows });
        } else {
            console.log("No había notificaciones para marcar como leídas para el user_id:", userId);
            res.json({ success: false, message: 'No había notificaciones para marcar como leídas' });
        }
    } catch (error) {
        console.error('Error al marcar notificaciones como leídas:', error);
        res.status(500).json({ success: false, message: 'Error al marcar notificaciones como leídas' });
    }
});


app.get('/consultar_alertas', async (req, res) => { 
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        try {
            const [alertas] = await pool.query(`
                SELECT 
                    a.*, 
                    u.nombre AS responsable_nombre, 
                    e.nombre AS nombre_edificio
                FROM alertas a
                LEFT JOIN usuarios u ON a.responsable_id = u.id
                LEFT JOIN edificios e ON a.edificio_id = e.id
                ORDER BY a.fecha_creacion DESC
            `);

            res.render('administrativo/alertas/consultar_todas.hbs', {
                name,
                userId,
                roles: cargos,
                alertas,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (error) {
            console.error('❌ Error al obtener alertas:', error);
            res.status(500).send('Error al obtener alertas');
        }
    } else {
        res.redirect('/login');
    }
});


hbs.registerHelper('ifEquals', function(arg1, arg2, options) {
    return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
});





// Registrar helper "contains"
hbs.registerHelper('contains', function (value, substring, options) {
    if (typeof value === 'string' && value.includes(substring)) {
        return options.fn(this); // Renderiza el contenido dentro del `{{#contains}}...{{/contains}}`
    }
    return options.inverse(this); // Si no se encuentra, no se renderiza
});


app.get('/editar_alerta/:id', async (req, res) => {
    if (req.session.loggedin) {
        try {
            const [alerta] = await pool.query('SELECT * FROM alertas WHERE id = ?', [req.params.id]);
            const [usuarios] = await pool.query('SELECT id, nombre FROM usuarios'); // Lista de usuarios
            const [edificios] = await pool.query('SELECT id, nombre FROM edificios'); // Lista de edificios

            if (alerta.length > 0) {
                // Formatear la fecha para el input "date"
                if (alerta[0].fecha_ejecucion) {
                    const fecha = new Date(alerta[0].fecha_ejecucion);
                    alerta[0].fecha_ejecucion = fecha.toISOString().split('T')[0]; // Formato YYYY-MM-DD
                }

                res.render('administrativo/alertas/editar_alerta.hbs', { 
                    alerta: alerta[0], 
                    usuarios, 
                    edificios, // Pasamos la lista de edificios
                    layout: 'layouts/nav_admin.hbs' 
                });
            } else {
                res.status(404).send('Alerta no encontrada');
            }
        } catch (error) {
            console.error("Error al obtener la alerta:", error);
            res.status(500).send("Error interno");
        }
    } else {
        res.redirect('/login');
    }
});






app.post('/editar_alerta/:id', async (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }

    try {
        const { 
            nombre_actividad, 
            fecha_ejecucion, 
            frecuencia_alerta, 
            prioridad, 
            metodo_notificacion, 
            dias_antes, 
            tiempo_recordatorio, 
            responsable,
            edificio_id // Usamos edificio_id directamente
        } = req.body;
        
        const id = req.params.id;
        const responsable_id = Number(responsable) || null;
        const edificio_id_num = Number(edificio_id) || null; // Convertir a número o null
        const metodo_notificacion_str = Array.isArray(metodo_notificacion) ? metodo_notificacion.join(',') : metodo_notificacion;

        const [alertaExistente] = await pool.query('SELECT id FROM alertas WHERE id = ?', [id]);
        if (alertaExistente.length === 0) {
            return res.status(404).send("La alerta no existe.");
        }

        await pool.query(
            'UPDATE alertas SET nombre_actividad = ?, fecha_ejecucion = ?, frecuencia_alerta = ?, prioridad = ?, metodo_notificacion = ?, dias_antes_alerta = ?, tiempo_recordatorio = ?, responsable_id = ?, edificio_id = ? WHERE id = ?',
            [nombre_actividad, fecha_ejecucion, frecuencia_alerta, prioridad, metodo_notificacion_str, dias_antes, tiempo_recordatorio, responsable_id, edificio_id_num, id]
        );

        res.redirect('/consultar_alertas'); 
    } catch (error) {
        console.error("Error al actualizar la alerta:", error);
        res.status(500).send("Error interno al actualizar la alerta.");
    }
});






// Ruta para eliminar alerta
app.delete('/eliminar_alerta/:id', async (req, res) => {
    if (req.session.loggedin) {
        try {
            await pool.query('DELETE FROM alertas WHERE id = ?', [req.params.id]);
            res.json({ success: true });
        } catch (error) {
            console.error("Error al eliminar la alerta:", error);
            res.status(500).json({ success: false });
        }
    } else {
        res.status(401).json({ success: false });
    }
});









const obtenerEdificios = async () => {
    const [rows] = await pool.query('SELECT id, nombre FROM edificios'); // Ajusta el nombre de tu tabla
    return rows;
};

app.get('/Informe_supervisor', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        // Suponiendo que tienes una función para obtener los edificios
        const edificios = await obtenerEdificios();

        res.render('administrativo/informes/crear/supervisor.hbs', {
            name,
            userId,
            roles: cargos,
            edificios,
            layout: 'layouts/nav_admin.hbs'
        });
    } else {
        res.redirect('/login');
    }
});




const cors = require('cors');
app.use(cors());





// Ruta para guardar inspección
app.post('/guardar-supervision', upload.none(), async (req, res) => {
    try {
        console.log(req.body); // Check the parsed data

        // Parse the signature data
        const firmaSupervisorBinaria = req.body.firma_supervisor
            ? Buffer.from(req.body.firma_supervisor.split(',')[1], 'base64')
            : null;
        const firmaEncargadoBinaria = req.body.firma_encargado
            ? Buffer.from(req.body.firma_encargado.split(',')[1], 'base64')
            : null;



    const {
        edificio,       
        cumple_area1,
        no_cumple_area1,
        observaciones_area1,
        dia_area1,
        mes_area1,
        año_area1,
        cumple_area2,
        no_cumple_area2,
        observaciones_area2,
        dia_area2,
        mes_area2,
        año_area2,
        cumple_area3,
        no_cumple_area3,
        observaciones_area3,
        dia_area3,
        mes_area3,
        año_area3,
        cumple_area4,
        no_cumple_area4,
        observaciones_area4,
        dia_area4,
        mes_area4,
        año_area4,
        cumple_recepcion1,
        no_cumple_recepcion1,
        observaciones_recepcion1,
        dia_recepcion1,
        mes_recepcion1,
        año_recepcion1,
        cumple_piso1,
        no_cumple_piso1,
        observaciones_piso1,
        dia_piso1,
        mes_piso1,
        año_piso1,
        cumple_piso2,
        no_cumple_piso2,
        observaciones_piso2,
        dia_piso2,
        mes_piso2,
        año_piso2,
        cumple_piso3,
        no_cumple_piso3,
        observaciones_piso3,
        dia_piso3,
        mes_piso3,
        año_piso3,
        cumple_piso4,
        no_cumple_piso4,
        observaciones_piso4,
        dia_piso4,
        mes_piso4,
        año_piso4,
        cumple_piso5,
        no_cumple_piso5,
        observaciones_piso5,
        dia_piso5,
        mes_piso5,
        año_piso5,
        cumple_piso6,
        no_cumple_piso6,
        observaciones_piso6,
        dia_piso6,
        mes_piso6,
        año_piso6,
        cantidad_pasamanos,
        cumple_pasamanos,
        no_cumple_pasamanos,
        observaciones_pasamanos,
        dia_pasamanos,
        mes_pasamanos,
        año_pasamanos,
        cumple_bano_1,
        no_cumple_bano_1,
        observaciones_bano_1,
        dia_bano_1,
        mes_bano_1,
        año_bano_1,
        cumple_bano_2,
        no_cumple_bano_2,
        observaciones_bano_2,
        dia_bano_2,
        mes_bano_2,
        año_bano_2,
        cumple_bano_3,
        no_cumple_bano_3,
        observaciones_bano_3,
        dia_bano_3,
        mes_bano_3,
        año_bano_3,
        cumple_bano_4,
        no_cumple_bano_4,
        observaciones_bano_4,
        dia_bano_4,
        mes_bano_4,
        año_bano_4,
        cumple_bano_5,
        no_cumple_bano_5,
        observaciones_bano_5,
        dia_bano_5,
        mes_bano_5,
        año_bano_5,
        cumple_ventanas,
        no_cumple_ventanas,
        observaciones_ventanas,
        dia_ventanas,
        mes_ventanas,
        año_ventanas,
        cumple_parqueadero_1,
        no_cumple_parqueadero_1,
        observaciones_parqueadero_1,
        dia_parqueadero_1,
        mes_parqueadero_1,
        año_parqueadero_1,
        cumple_parqueadero_2,
        no_cumple_parqueadero_2,
        observaciones_parqueadero_2,
        dia_parqueadero_2,
        mes_parqueadero_2,
        año_parqueadero_2,
        cumple_parqueadero_3,
        no_cumple_parqueadero_3,
        observaciones_parqueadero_3,
        dia_parqueadero_3,
        mes_parqueadero_3,
        año_parqueadero_3,
        cumple_parqueadero_4,
        no_cumple_parqueadero_4,
        observaciones_parqueadero_4,
        dia_parqueadero_4,
        mes_parqueadero_4,
        año_parqueadero_4,
        cumple_ascensor,
        no_cumple_ascensor,
        observaciones_ascensor,
        dia_ascensor,
        mes_ascensor,
        año_ascensor,
        cumple_shut,
        no_cumple_shut,
        observaciones_shut,
        dia_shut,
        mes_shut,
        año_shut,
        cumple_cuarto_shut,
        no_cumple_cuarto_shut,
        observaciones_cuarto_shut,
        dia_cuarto_shut,
        mes_cuarto_shut,
        año_cuarto_shut,
        cumple_cocina,
        no_cumple_cocina,
        observaciones_cocina,
        dia_cocina,
        mes_cocina,
        año_cocina,
        cumple_terraza,
        no_cumple_terraza,
        observaciones_terraza,
        dia_terraza,
        mes_terraza,
        año_terraza,
        cumple_monta_coches,
        no_cumple_monta_coches,
        observaciones_monta_coches,
        dia_monta_coches,
        mes_monta_coches,
        año_monta_coches,
        cumple_jardin,
        no_cumple_jardin,
        observaciones_jardin,
        dia_jardin,
        mes_jardin,
        año_jardin,
        cumple_cargo,
        no_cumple_cargo,
        observaciones_cargo,
        dia_cargo,
        mes_cargo,
        año_cargo,
        cumple_presentacion,
        no_cumple_presentacion,
        observaciones_presentacion,
        dia_presentacion,
        mes_presentacion,
        año_presentacion,
        cumple_presentacion_personal,
        no_cumple_presentacion_personal,
        observaciones_presentacion_personal,
        dia_presentacion_personal,
        mes_presentacion_personal,
        año_presentacion_personal,
        cumple_disposicion_servicio,
        no_cumple_disposicion_servicio,
        observaciones_disposicion_servicio,
        dia_disposicion_servicio,
        mes_disposicion_servicio,
        año_disposicion_servicio,
        firma_supervisor,
        firma_encargado,

    } = req.body;
    const values = [
        edificio,       
        cumple_area1,
        no_cumple_area1,
        observaciones_area1,
        dia_area1,
        mes_area1,
        año_area1,
        cumple_area2,
        no_cumple_area2,
        observaciones_area2,
        dia_area2,
        mes_area2,
        año_area2,
        cumple_area3,
        no_cumple_area3,
        observaciones_area3,
        dia_area3,
        mes_area3,
        año_area3,
        cumple_area4,
        no_cumple_area4,
        observaciones_area4,
        dia_area4,
        mes_area4,
        año_area4,
        cumple_recepcion1,
        no_cumple_recepcion1,
        observaciones_recepcion1,
        dia_recepcion1,
        mes_recepcion1,
        año_recepcion1,
        cumple_piso1,
        no_cumple_piso1,
        observaciones_piso1,
        dia_piso1,
        mes_piso1,
        año_piso1,
        cumple_piso2,
        no_cumple_piso2,
        observaciones_piso2,
        dia_piso2,
        mes_piso2,
        año_piso2,
        cumple_piso3,
        no_cumple_piso3,
        observaciones_piso3,
        dia_piso3,
        mes_piso3,
        año_piso3,
        cumple_piso4,
        no_cumple_piso4,
        observaciones_piso4,
        dia_piso4,
        mes_piso4,
        año_piso4,
        cumple_piso5,
        no_cumple_piso5,
        observaciones_piso5,
        dia_piso5,
        mes_piso5,
        año_piso5,
        cumple_piso6,
        no_cumple_piso6,
        observaciones_piso6,
        dia_piso6,
        mes_piso6,
        año_piso6,
        cantidad_pasamanos,
        cumple_pasamanos,
        no_cumple_pasamanos,
        observaciones_pasamanos,
        dia_pasamanos,
        mes_pasamanos,
        año_pasamanos,
        cumple_bano_1,
        no_cumple_bano_1,
        observaciones_bano_1,
        dia_bano_1,
        mes_bano_1,
        año_bano_1,
        cumple_bano_2,
        no_cumple_bano_2,
        observaciones_bano_2,
        dia_bano_2,
        mes_bano_2,
        año_bano_2,
        cumple_bano_3,
        no_cumple_bano_3,
        observaciones_bano_3,
        dia_bano_3,
        mes_bano_3,
        año_bano_3,
        cumple_bano_4,
        no_cumple_bano_4,
        observaciones_bano_4,
        dia_bano_4,
        mes_bano_4,
        año_bano_4,
        cumple_bano_5,
        no_cumple_bano_5,
        observaciones_bano_5,
        dia_bano_5,
        mes_bano_5,
        año_bano_5,
        cumple_ventanas,
        no_cumple_ventanas,
        observaciones_ventanas,
        dia_ventanas,
        mes_ventanas,
        año_ventanas,
        cumple_parqueadero_1,
        no_cumple_parqueadero_1,
        observaciones_parqueadero_1,
        dia_parqueadero_1,
        mes_parqueadero_1,
        año_parqueadero_1,
        cumple_parqueadero_2,
        no_cumple_parqueadero_2,
        observaciones_parqueadero_2,
        dia_parqueadero_2,
        mes_parqueadero_2,
        año_parqueadero_2,
        cumple_parqueadero_3,
        no_cumple_parqueadero_3,
        observaciones_parqueadero_3,
        dia_parqueadero_3,
        mes_parqueadero_3,
        año_parqueadero_3,
        cumple_parqueadero_4,
        no_cumple_parqueadero_4,
        observaciones_parqueadero_4,
        dia_parqueadero_4,
        mes_parqueadero_4,
        año_parqueadero_4,
        cumple_ascensor,
        no_cumple_ascensor,
        observaciones_ascensor,
        dia_ascensor,
        mes_ascensor,
        año_ascensor,
        cumple_shut,
        no_cumple_shut,
        observaciones_shut,
        dia_shut,
        mes_shut,
        año_shut,
        cumple_cuarto_shut,
        no_cumple_cuarto_shut,
        observaciones_cuarto_shut,
        dia_cuarto_shut,
        mes_cuarto_shut,
        año_cuarto_shut,
        cumple_cocina,
        no_cumple_cocina,
        observaciones_cocina,
        dia_cocina,
        mes_cocina,
        año_cocina,
        cumple_terraza,
        no_cumple_terraza,
        observaciones_terraza,
        dia_terraza,
        mes_terraza,
        año_terraza,
        cumple_monta_coches,
        no_cumple_monta_coches,
        observaciones_monta_coches,
        dia_monta_coches,
        mes_monta_coches,
        año_monta_coches,
        cumple_jardin,
        no_cumple_jardin,
        observaciones_jardin,
        dia_jardin,
        mes_jardin,
        año_jardin,
        cumple_cargo,
        no_cumple_cargo,
        observaciones_cargo,
        dia_cargo,
        mes_cargo,
        año_cargo,
        cumple_presentacion,
        no_cumple_presentacion,
        observaciones_presentacion,
        dia_presentacion,
        mes_presentacion,
        año_presentacion,
        cumple_presentacion_personal,
        no_cumple_presentacion_personal,
        observaciones_presentacion_personal,
        dia_presentacion_personal,
        mes_presentacion_personal,
        año_presentacion_personal,
        cumple_disposicion_servicio,
        no_cumple_disposicion_servicio,
        observaciones_disposicion_servicio,
        dia_disposicion_servicio,
        mes_disposicion_servicio,
        año_disposicion_servicio,
        firmaSupervisorBinaria,
        firmaEncargadoBinaria,
        
    ];

    const query = `
    INSERT INTO inspecciones_supervisor (
        edificio,       
        cumple_area1,
        no_cumple_area1,
        observaciones_area1,
        dia_area1,
        mes_area1,
        año_area1,
        cumple_area2,
        no_cumple_area2,
        observaciones_area2,
        dia_area2,
        mes_area2,
        año_area2,
        cumple_area3,
        no_cumple_area3,
        observaciones_area3,
        dia_area3,
        mes_area3,
        año_area3,
        cumple_area4,
        no_cumple_area4,
        observaciones_area4,
        dia_area4,
        mes_area4,
        año_area4,
        cumple_recepcion1,
        no_cumple_recepcion1,
        observaciones_recepcion1,
        dia_recepcion1,
        mes_recepcion1,
        año_recepcion1,
        cumple_piso1,
        no_cumple_piso1,
        observaciones_piso1,
        dia_piso1,
        mes_piso1,
        año_piso1,
        cumple_piso2,
        no_cumple_piso2,
        observaciones_piso2,
        dia_piso2,
        mes_piso2,
        año_piso2,
        cumple_piso3,
        no_cumple_piso3,
        observaciones_piso3,
        dia_piso3,
        mes_piso3,
        año_piso3,
        cumple_piso4,
        no_cumple_piso4,
        observaciones_piso4,
        dia_piso4,
        mes_piso4,
        año_piso4,
        cumple_piso5,
        no_cumple_piso5,
        observaciones_piso5,
        dia_piso5,
        mes_piso5,
        año_piso5,
        cumple_piso6,
        no_cumple_piso6,
        observaciones_piso6,
        dia_piso6,
        mes_piso6,
        año_piso6,
        cantidad_pasamanos,
        cumple_pasamanos,
        no_cumple_pasamanos,
        observaciones_pasamanos,
        dia_pasamanos,
        mes_pasamanos,
        año_pasamanos,
        cumple_bano_1,
        no_cumple_bano_1,
        observaciones_bano_1,
        dia_bano_1,
        mes_bano_1,
        año_bano_1,
        cumple_bano_2,
        no_cumple_bano_2,
        observaciones_bano_2,
        dia_bano_2,
        mes_bano_2,
        año_bano_2,
        cumple_bano_3,
        no_cumple_bano_3,
        observaciones_bano_3,
        dia_bano_3,
        mes_bano_3,
        año_bano_3,
        cumple_bano_4,
        no_cumple_bano_4,
        observaciones_bano_4,
        dia_bano_4,
        mes_bano_4,
        año_bano_4,
        cumple_bano_5,
        no_cumple_bano_5,
        observaciones_bano_5,
        dia_bano_5,
        mes_bano_5,
        año_bano_5,
        cumple_ventanas,
        no_cumple_ventanas,
        observaciones_ventanas,
        dia_ventanas,
        mes_ventanas,
        año_ventanas,
        cumple_parqueadero_1,
        no_cumple_parqueadero_1,
        observaciones_parqueadero_1,
        dia_parqueadero_1,
        mes_parqueadero_1,
        año_parqueadero_1,
        cumple_parqueadero_2,
        no_cumple_parqueadero_2,
        observaciones_parqueadero_2,
        dia_parqueadero_2,
        mes_parqueadero_2,
        año_parqueadero_2,
        cumple_parqueadero_3,
        no_cumple_parqueadero_3,
        observaciones_parqueadero_3,
        dia_parqueadero_3,
        mes_parqueadero_3,
        año_parqueadero_3,
        cumple_parqueadero_4,
        no_cumple_parqueadero_4,
        observaciones_parqueadero_4,
        dia_parqueadero_4,
        mes_parqueadero_4,
        año_parqueadero_4,
        cumple_ascensor,
        no_cumple_ascensor,
        observaciones_ascensor,
        dia_ascensor,
        mes_ascensor,
        año_ascensor,
        cumple_shut,
        no_cumple_shut,
        observaciones_shut,
        dia_shut,
        mes_shut,
        año_shut,
        cumple_cuarto_shut,
        no_cumple_cuarto_shut,
        observaciones_cuarto_shut,
        dia_cuarto_shut,
        mes_cuarto_shut,
        año_cuarto_shut,
        cumple_cocina,
        no_cumple_cocina,
        observaciones_cocina,
        dia_cocina,
        mes_cocina,
        año_cocina,
        cumple_terraza,
        no_cumple_terraza,
        observaciones_terraza,
        dia_terraza,
        mes_terraza,
        año_terraza,
        cumple_monta_coches,
        no_cumple_monta_coches,
        observaciones_monta_coches,
        dia_monta_coches,
        mes_monta_coches,
        año_monta_coches,
        cumple_jardin,
        no_cumple_jardin,
        observaciones_jardin,
        dia_jardin,
        mes_jardin,
        año_jardin,
        cumple_cargo,
        no_cumple_cargo,
        observaciones_cargo,
        dia_cargo,
        mes_cargo,
        año_cargo,
        cumple_presentacion,
        no_cumple_presentacion,
        observaciones_presentacion,
        dia_presentacion,
        mes_presentacion,
        año_presentacion,
        cumple_presentacion_personal,
        no_cumple_presentacion_personal,
        observaciones_presentacion_personal,
        dia_presentacion_personal,
        mes_presentacion_personal,
        año_presentacion_personal,
        cumple_disposicion_servicio,
        no_cumple_disposicion_servicio,
        observaciones_disposicion_servicio,
        dia_disposicion_servicio,
        mes_disposicion_servicio,
        año_disposicion_servicio,
        firma_supervisor,
        firma_encargado
     
    ) VALUES (${Array(values.length).fill('?').join(', ')});
`;
      await pool.query(query, values);

        res.status(200).json({ message: 'Inspección guardada exitosamente.' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Error al guardar la inspección.' });
    }
});



















// Endpoint to download the template
app.get('/download-template', (req, res) => {
    const filePath = path.join(__dirname, 'template.pdf'); // Path to your PDF template
    res.download(filePath, 'supervision_template.pdf', err => {
        if (err) {
            console.error('Error downloading the file:', err);
            res.status(500).send('Error downloading the template');
        }
    });
});





app.post('/enviar-png', upload.single('image'), async (req, res) => {
    const { edificioId } = req.body;
    const image = req.file;

    if (!image) {
        return res.status(400).json({ success: false, message: 'Por favor, suba una imagen en formato PNG' });
    }

    try {
        // Obtener el correo del representante usando `edificioId`
        const [rows] = await pool.query('SELECT correorepresentante FROM edificios WHERE id = ?', [edificioId]);
        const email = rows[0]?.correorepresentante;
        if (!email) return res.status(404).json({ success: false, message: 'No se encontró el correo del edificio seleccionado' });

        // Configurar nodemailer para enviar el correo con la imagen adjunta
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
 user: 'cercetasolucionempresarial@gmail.com', // ← Faltaba cerrar comillas aquí
                pass: 'yuumpbszqtbxscsq'
            }
        });

        // Opciones de correo, incluyendo el archivo de imagen como adjunto
        const mailOptions = {
            from: 'cercetasolucionempresarial@gmail.com',
            to: email,
            subject: 'Supervisión - Informe en Imagen',
            text: 'Adjuntamos el informe de supervisión en formato PNG.',
            attachments: [
                {
                    filename: 'plantilla.png',
                    content: image.buffer,
                    contentType: 'image/png'
                }
            ]
        };

        // Enviar el correo
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Correo enviado exitosamente con la plantilla en formato PNG adjunta' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al enviar el correo.' });
    }
});






app.get('/consultar_informe_supervisor', async (req, res) => {
    if (req.session.loggedin === true) {
        const nombreUsuario = req.session.user.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        const fecha = req.query.fecha;
        const idInspeccion = req.query.id_inspeccion;

        const query = 'SELECT * FROM inspecciones_supervisor WHERE DATE_FORMAT(created_at, "%Y-%m-%d") = ? AND id = ?';

        try {
            const [results] = await pool.query(query, [fecha, idInspeccion]);

            results.forEach(result => {
                if (result.firma_supervisor) {
                    result.firmaSupervisorBase64 = result.firma_supervisor.toString('base64');
                }
                if (result.firma_encargado) {
                    result.firmaEncargadoBase64 = result.firma_encargado.toString('base64');
                }
            });

            res.render('administrativo/informes/consultar/supervisor_consulta.hbs', {
                name: nombreUsuario,
                userId,
                roles: cargos,
                results,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (err) {
            console.error('Error al obtener la lista de inspecciones:', err);
            res.status(500).send('Error en el servidor');
        }
    } else {
        res.redirect('/login');
    }
});



app.get('/obtener_ids_inspeccion', async (req, res) => {
    const fecha = req.query.fecha;

    try {
        const query = 'SELECT id FROM inspecciones_supervisor WHERE DATE_FORMAT(created_at, "%Y-%m-%d") = ?';
        const [ids] = await pool.query(query, [fecha]);
        res.json(ids); // Devolver los IDs en formato JSON para que el frontend los reciba
    } catch (err) {
        console.error('Error al obtener los IDs de inspección:', err);
        res.status(500).send('Error en el servidor');
    }
});










app.get('/FOTO', (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

        res.render('administrativo/informes/crear_informe_operativo.hbs', { 
            name, 
            layout: 'layouts/nav_admin.hbs',
            roles 
        });
    } else {
        res.redirect('/login');
    }
});

app.get('/consultar_usuarios', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

        try {
            // Obtener todos los usuarios
            const [usuariosRaw] = await pool.query(`
                SELECT id, nombre, email, role, cargo, fecha_cumpleaños, edificio, apartamento, estado, foto
                FROM usuarios
            `);

            // Convertir las fotos a Base64
            const usuarios = usuariosRaw.map(usuario => {
                if (usuario.foto) {
                    usuario.foto = Buffer.from(usuario.foto).toString('base64');
                }
                return usuario;
            });

            // Obtener todos los edificios
            const [edificios] = await pool.query(`
                SELECT id, nombre FROM edificios
            `);

            res.render('administrativo/usuarios/consultar_usuarios.hbs', { 
                name, 
                usuarios,
                edificios,
                roles,
                layout: 'layouts/nav_admin.hbs' 
            });
        } catch (error) {
            console.error(error);
            res.status(500).send('Error al obtener los usuarios');
        }
    } else {
        res.redirect('/login');
    }
});











app.get('/obtener_apartamentos_usuarios/:edificioId', async (req, res) => {
    const { edificioId } = req.params;
    try {
        const [apartamentos] = await pool.query(
            'SELECT id, numero FROM apartamentos WHERE edificio_id = ?', [edificioId]
        );
        res.json(apartamentos);
    } catch (error) {
        console.error('Error al obtener apartamentos:', error);
        res.status(500).send('Error al obtener los apartamentos');
    }
});





app.get('/buscar_usuarios', async (req, res) => {
    const { nombre, email } = req.query;
    
    let query = 'SELECT id, nombre, email, role, cargo, fecha_cumpleaños FROM usuarios WHERE 1=1';
    const params = [];

    if (nombre) {
        query += ' AND nombre LIKE ?';
        params.push(`%${nombre}%`);
    }
    if (email) {
        query += ' AND email LIKE ?';
        params.push(`%${email}%`);
    }

    try {
        const [results] = await pool.query(query, params);
        res.json(results); // Enviar los resultados como JSON
    } catch (error) {
        console.error(error);
        res.status(500).send('Error al buscar usuarios');
    }
});







app.post('/editar_usuario/:id', upload.single('foto'), async (req, res) => {
    const { id } = req.params;
    const { nombre, email, role, cargo, fechaCumpleaños, edificio, apartamento, estado } = req.body;
    let fotoBase64 = null;

    if (req.file) {
        // Convertir el buffer de la foto a base64
        fotoBase64 = req.file.buffer.toString('base64');
    }

    try {
        await pool.query(`
            UPDATE usuarios 
            SET nombre = ?, email = ?, role = ?, cargo = ?, fecha_cumpleaños = ?, 
                edificio = ?, apartamento = ?, estado = ?, foto = ?
            WHERE id = ?
        `, [nombre, email, role, cargo, fechaCumpleaños, edificio, apartamento, estado, fotoBase64, id]);

        res.status(200).json({ message: 'Usuario actualizado correctamente', foto: fotoBase64 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar el usuario' });
    }
});




// Función para enviar correos de cumpleaños
function enviarCorreoCumple(nombre, email) {
    const mailOptions = {
        from: 'ccercetasolucionempresarial@gmail.com',
        to: email,
        subject: `¡Feliz cumpleaños, ${nombre}! 🎉`,
        text: `¡Hola ${nombre}!\n\nTodo el equipo te desea un feliz cumpleaños. Esperamos que tengas un día maravilloso.\n\n¡Feliz cumpleaños! 🎂🥳`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error al enviar correo:', error);
        } else {
            console.log('Correo enviado: ' + info.response);
        }
    });

}




const verificarCumpleanios = async () => {
    const hoy = moment().format('YYYY-MM-DD'); // Fecha completa como YYYY-MM-DD
    console.log("Fecha de hoy:", hoy);

    try {
        // Consulta para obtener todos los usuarios y verificar fechas de cumpleaños
        const [usuarios] = await pool.query(`SELECT nombre, email, fecha_cumpleaños FROM usuarios`);
        
        // Muestra todos los usuarios y sus fechas de cumpleaños para verificar formato
        console.log("Usuarios en la base de datos:", usuarios);

        // Consulta específica para cumpleaños hoy
        const [results] = await pool.query(`SELECT nombre, email FROM usuarios WHERE DATE_FORMAT(fecha_cumpleaños, '%Y-%m-%d') = ?`, [hoy]);
        
        console.log("Resultados de cumpleaños:", results); // Verificar resultados de la consulta

        if (results.length === 0) {
            console.log("No hay cumpleaños hoy.");
            return;
        }

        // Envía un correo de prueba para verificar que la función de envío funciona
        enviarCorreoCumple("cerceta", "cercetasolucionempresarial@gmail.com");

        results.forEach((usuario) => {
            console.log("Enviando correo a:", usuario.email); // Registrar cada envío de correo
            enviarCorreoCumple(usuario.nombre, usuario.email);
        });
    } catch (error) {
        console.error('Error al consultar la base de datos:', error);
    }
};

// Llama a la función una vez al inicio para verificar
verificarCumpleanios();

cron.schedule('40 10 * * *', () => {
    console.log("Cron para cumpleaños ejecutándose...");
    verificarCumpleanios();
});




cron.schedule('1 12 * * *', () => {
    console.log("Cron para alertas ejecutándose...");
    verificarAlertasPendientes();
});

app.post('/guardarUbicacion', async (req, res) => {
    const { nombre, latitud, longitud } = req.body;

    try {
        // Obtener la hora exacta de Colombia
        const fechaColombia = moment().tz("America/Bogota").format("YYYY-MM-DD HH:mm:ss");

        await pool.query(
            'INSERT INTO ubicaciones (nombre, latitud, longitud, fecha) VALUES (?, ?, ?, ?)',
            [nombre, latitud, longitud, fechaColombia]
        );

        res.status(200).send({ mensaje: 'Ubicación guardada con éxito' });
    } catch (error) {
        console.error("Error al guardar ubicación:", error);
        res.status(500).send({ error: 'Error al guardar ubicación' });
    }
});




// Ruta que renderiza la vista
app.get('/ver_ubicaciones', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        res.render('administrativo/geolocalizador/ver_ubicaciones.hbs', {
            name,
            userId,
            roles: cargos,
            layout: 'layouts/nav_admin.hbs'
        });
    } else {
        res.redirect('/login');
    }
});

// Ruta API que entrega las ubicaciones actualizadas
app.get('/api/ubicaciones', async (req, res) => {
    try {
        const [ubicaciones] = await pool.query(`
            SELECT u.*
            FROM ubicaciones u
            INNER JOIN (
                SELECT MAX(id) AS id
                FROM ubicaciones
                GROUP BY nombre
            ) ultimas ON u.id = ultimas.id
        `);

        // Ajustar fecha a hora Colombia (UTC-5)
        const ubicacionesConFecha = ubicaciones.map(u => ({
            ...u,
            fecha: moment(u.fecha).tz("America/Bogota").format("YYYY-MM-DD HH:mm:ss")
        }));

        res.json(ubicacionesConFecha);
    } catch (error) {
        console.error("Error al obtener ubicaciones:", error);
        res.status(500).json({ error: 'Error al obtener ubicaciones' });
    }
});




app.get('/Consulta_Comprobantes_de_Pago_residentes', async (req, res) => {
    if (req.session.loggedin === true) {
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        try {
            const query = 'SELECT edificio, apartamento FROM usuarios WHERE id = ?';
            const [rows] = await pool.query(query, [userId]);

            if (rows.length > 0) {
                const { edificio, apartamento } = rows[0];
                console.log('Edificio:', edificio, 'Apartamento:', apartamento);

                res.render('Residentes/pagos/consultar_mispagos.hbs', { 
                    name: req.session.name,
                    userId,
                    edificioSeleccionado: edificio,
                    apartamentoSeleccionado: apartamento,
                    roles: cargos,
                    layout: 'layouts/nav_residentes.hbs'
                });
            } else {
                res.redirect('/login');
            }
        } catch (error) {
            console.error('Error al obtener edificio y apartamento:', error);
            res.status(500).send('Error interno del servidor');
        }
    } else {
        res.redirect('/login');
    }
});





app.post('/buscarPagos_mispagos', async (req, res) => {
    if (req.session.loggedin === true) {
        const userId = req.session.userId;

        try {
            // Paso 1: Obtener el ID del edificio y apartamento del usuario
            const [userRows] = await pool.query('SELECT edificio AS edificio_id, apartamento AS apartamento_id FROM usuarios WHERE id = ?', [userId]);

            if (userRows.length > 0) {
                const { edificio_id, apartamento_id } = userRows[0];
                const { fecha_inicio, fecha_fin } = req.body;

                // Paso 2: Obtener el nombre del edificio usando el ID del edificio
                const [edificioRows] = await pool.query('SELECT nombre FROM edificios WHERE id = ?', [edificio_id]);
                if (edificioRows.length === 0) {
                    console.error("Edificio no encontrado");
                    return res.status(404).send("Edificio no encontrado");
                }
                const nombre_edificio = edificioRows[0].nombre;

                // Paso 3: Obtener el número del apartamento usando el ID del apartamento y edificio_id
                const [apartamentoRows] = await pool.query('SELECT numero FROM apartamentos WHERE id = ? AND edificio_id = ?', [apartamento_id, edificio_id]);
                if (apartamentoRows.length === 0) {
                    console.error("Apartamento no encontrado");
                    return res.status(404).send("Apartamento no encontrado");
                }
                const numero_apartamento = apartamentoRows[0].numero;

                // Paso 4: Buscar pagos en pagos_apartamentos usando nombre_edificio y numero_apartamento
                let query = "SELECT * FROM pagos_apartamentos WHERE nombre_edificio = ? AND numero_apartamento = ?";
                const params = [nombre_edificio, numero_apartamento];

                // Añadir filtros de fechas si están presentes
                if (fecha_inicio && fecha_fin) {
                    query += " AND fecha_pago BETWEEN ? AND ?";
                    params.push(fecha_inicio, fecha_fin);
                }

                console.log("Consulta final:", query, "Parámetros:", params);

                // Ejecutar la consulta
                const [results] = await pool.query(query, params);
                console.log("Resultados obtenidos:", results);
                res.render('Residentes/pagos/consultar_mispagos.hbs', {
                    name: req.session.name,
                    pagos: results,
                    layout: 'layouts/nav_residentes.hbs'
                });
            } else {
                res.redirect('/login'); // Redirige si no se encuentra el usuario
            }
        } catch (error) {
            console.error("Error al consultar los pagos:", error);
            res.status(500).send("Error en la consulta de pagos");
        }
    } else {
        res.redirect('/login');
    }
});

  
app.get('/crear_bitacora_administrativa', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        try {
            const [edificios] = await pool.query('SELECT id, nombre FROM edificios');
            
            res.render('administrativo/Bitacora/crear_bitacora_administrativa.hbs', { 
                name, 
                edificios,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs' 
            });
        } catch (error) {
            console.error('Error al obtener edificios:', error);
            res.status(500).send('Error al cargar los datos de los edificios');
        }
    } else {
        res.redirect('/login');
    }
});




app.post('/guardarBitacora', upload.single('contenidoPng'), async (req, res) => {
    const { edificioId, tipoMantenimiento, fecha } = req.body;
    const contenidoBuffer = req.file.buffer;

    try {
        const query = `
            INSERT INTO bitacora_mantenimientos (edificio_id, tipo_mantenimiento, fecha, contenido_png)
            VALUES (?, ?, ?, ?)
        `;
        await pool.query(query, [edificioId, tipoMantenimiento, fecha, contenidoBuffer]);

        res.json({ success: true, message: 'Bitácora guardada correctamente' });
    } catch (error) {
        console.error('Error al guardar la bitácora:', error);
        res.json({ success: false, message: 'Error al guardar la bitácora' });
    }
});



app.get('/Crear_bitacora_completa', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        try {
            const query = `
                SELECT DISTINCT b.edificio_id, e.nombre
                FROM bitacora_mantenimientos b
                LEFT JOIN edificios e ON b.edificio_id = e.id
            `;
            const [edificios] = await pool.query(query);

            res.render('administrativo/Bitacora/biitacora_completa.hbs', {
                name,
                userId,
                edificios,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (error) {
            console.error("Error al obtener datos:", error);
            res.status(500).send("Error en el servidor.");
        }
    } else {
        res.redirect('/login');
    }
});






app.post('/Crear_bitacora_completa', async (req, res) => { 
    if (req.session.loggedin === true) {
        const { tipo_mantenimiento, fecha_inicio, fecha_fin, edificio_id } = req.body; // Capturar parámetros del formulario

        let query;
        let queryParams = [fecha_inicio, fecha_fin];

        // Ajustar la consulta según si el usuario seleccionó "todos" o un edificio específico
        if (edificio_id && edificio_id !== 'todos') {
            // Usuario seleccionó un edificio específico
            if (tipo_mantenimiento === 'todos') {
                query = `
                    SELECT * 
                    FROM bitacora_mantenimientos 
                    WHERE fecha BETWEEN ? AND ? AND edificio_id = ?`;
                queryParams.push(edificio_id);
            } else {
                query = `
                    SELECT * 
                    FROM bitacora_mantenimientos 
                    WHERE tipo_mantenimiento = ? AND fecha BETWEEN ? AND ? AND edificio_id = ?`;
                queryParams = [tipo_mantenimiento, ...queryParams, edificio_id];
            }
        } else {
            // Usuario no seleccionó un edificio específico
            if (tipo_mantenimiento === 'todos') {
                query = 'SELECT * FROM bitacora_mantenimientos WHERE fecha BETWEEN ? AND ?';
            } else {
                query = 'SELECT * FROM bitacora_mantenimientos WHERE tipo_mantenimiento = ? AND fecha BETWEEN ? AND ?';
                queryParams.unshift(tipo_mantenimiento);
            }
        }

        try {
            const [results] = await pool.query(query, queryParams);

            // Convertir contenido_png a base64 para cada resultado
            const mantenimientos = results.map(row => {
                return {
                    ...row,
                    contenido_png: row.contenido_png ? Buffer.from(row.contenido_png).toString('base64') : null
                };
            });

            res.render('administrativo/Bitacora/biitacora_completa.hbs', {
                name: req.session.name,
                userId: req.session.userId,
                layout: 'layouts/nav_admin.hbs',
                mantenimientos: mantenimientos
            });
        } catch (error) {
            console.error("Error al obtener datos de bitácora:", error);
            res.status(500).send("Error en el servidor.");
        }
    } else {
        res.redirect('/login');
    }
});













app.get('/fechas', async (req, res) => {
    try {
      // Consulta para obtener las fechas de ejecución de la tabla 'alertas'
      const [rows] = await pool.query('SELECT fecha_ejecucion FROM alertas WHERE fecha_ejecucion IS NOT NULL');
      
      // Extraer solo las fechas de ejecución y enviarlas al frontend
      const fechas = rows.map(row => row.fecha_ejecucion.toISOString().split('T')[0]); // Asegurarse de que la fecha esté en formato 'YYYY-MM-DD'
      console.log(fechas); // Agregar esto para verificar las fechas en la consola
      res.json(fechas);
    } catch (err) {
      // Manejo de errores
      console.error('Error al obtener las fechas:', err.message);
      res.status(500).json({ error: err.message });
    }
  });














  // Ruta para obtener las fechas de ejecución desde la tabla 'alertas'
  app.get('/actividades-mes', async (req, res) => {
    try {
      // Obtener el mes y año actuales
      const today = new Date();
      const mes = today.getMonth() + 1;  // Los meses en JavaScript empiezan en 0
      const anio = today.getFullYear();
  
      // Consulta SQL para obtener las actividades del mes actual
      const query = `
        SELECT nombre_actividad, DATE_FORMAT(fecha_ejecucion, '%H:%i') as hora 
        FROM alertas 
        WHERE YEAR(fecha_ejecucion) = ? AND MONTH(fecha_ejecucion) = ?
      `;
      
      const [rows] = await pool.query(query, [anio, mes]);
      
      // Enviar las actividades al frontend
      res.json(rows);
    } catch (err) {
      console.error('Error al obtener las actividades:', err.message);
      res.status(500).json({ error: err.message });
    }
  });



  const sharp = require('sharp'); // Asegúrate de instalar sharp si no lo tienes


  app.get('/Blog_administrativo', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const cargos = req.session.cargo?.split(',').map(c => c.trim()) || [];

        try {
            const [resultados] = await pool.query(`
                SELECT p.*, u.nombre AS usuario_nombre
                FROM posts_admin p
                JOIN usuarios u ON p.usuario_id = u.id
                ORDER BY p.fecha DESC
            `);

            for (let post of resultados) {
                if (post.imagen) {
                    const buffer = post.imagen;
                    const imageBuffer = await sharp(buffer).png().toBuffer();
                    post.imagen_base64 = imageBuffer.toString('base64');
                    console.log(`Imagen convertida para el post ${post.id}: ${post.imagen_base64.substring(0, 30)}...`);
                }
            }

            res.render('blog_administrativo/blog_admin.hbs', { 
                name, 
                userId,
                posts: resultados,
                roles: cargos,
                layout: 'layouts/nav_admin.hbs'
            });

        } catch (err) {
            console.error('Error al obtener publicaciones:', err);
            res.status(500).send('Error en el servidor');
        }

    } else {
        res.redirect('/login');
    }
});




app.post('/blog/crear', upload.single('imagen'), async (req, res) => {
    const { titulo, contenido } = req.body;
    const imagen = req.file ? req.file.buffer : null; // Convertimos la imagen en un buffer binario
    const userId = req.session.userId; // Obtener el userId de la sesión

    try {
        // Inserción en la base de datos incluyendo el usuario_id
        await pool.query(
            'INSERT INTO posts_admin (titulo, contenido, imagen, usuario_id) VALUES (?, ?, ?, ?)',
            [titulo, contenido, imagen, userId] // Añadimos el userId a los parámetros
        );
        res.redirect('/Blog_administrativo');
    } catch (err) {
        console.error('Error al crear publicación:', err);
        res.status(500).send('Error en el servidor');
    }
});




app.post('/like', (req, res) => {
    const { post_id, usuario_id } = req.body;

    // Verificar si el usuario ya ha dado like a la publicación
    pool.query('SELECT * FROM likes WHERE post_id = ? AND usuario_id = ?', [post_id, usuario_id], (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (results.length > 0) {
            // Si ya existe un like, eliminarlo
            pool.query('DELETE FROM likes WHERE post_id = ? AND usuario_id = ?', [post_id, usuario_id], (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                // Decrementar el contador de likes en la tabla de publicaciones
                pool.query('UPDATE posts_admin SET likes = likes - 1 WHERE id = ?', [post_id], (err) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.status(200).json({ message: 'Like eliminado' });
                });
            });
        } else {
            // Si no existe un like, insertarlo
            pool.query('INSERT INTO likes (post_id, usuario_id) VALUES (?, ?)', [post_id, usuario_id], (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                // Incrementar el contador de likes en la tabla de publicaciones
                pool.query('UPDATE posts_admin SET likes = likes + 1 WHERE id = ?', [post_id], (err) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.status(200).json({ message: 'Like registrado' });
                });
            });
        }
    });
});










app.post('/login_app', async (req, res) => {
    console.log('🔹 Solicitud recibida:', req.body);

    const { email, password, fcm_token } = req.body;
    // Incluimos los campos "role" y "estado" en la consulta
    const query = 'SELECT id, email, password, role, estado FROM usuarios WHERE email = ? AND password = ?';

    try {
        console.log('🔍 Ejecutando consulta SQL...');
        const [result] = await pool.execute(query, [email, password]);

        console.log('🔹 Resultado de la consulta:', result);

        if (result.length > 0) {
            const user = result[0];

            // Validar que el rol sea "residentes"
            if (user.role !== 'residentes') {
                console.log('❌ Usuario no es residente');
                return res.status(403).json({ message: 'No eres residente' });
            }

            // Validar que el estado sea "activo"
            if (user.estado !== 'activo') {
                if (user.estado === 'pendiente') {
                    console.log('❌ La cuenta aún está en verificación');
                    return res.status(403).json({ message: 'Su cuenta aún está en verificación' });
                } else {
                    console.log('❌ Cuenta inactiva');
                    return res.status(403).json({ message: 'Cuenta inactiva' });
                }
            }

            const userId = user.id;
            console.log(`✅ Usuario encontrado. ID: ${userId}`);

            // Actualizar el token FCM en la base de datos
            const updateQuery = 'UPDATE usuarios SET fcm_token = ? WHERE email = ?';
            await pool.execute(updateQuery, [fcm_token, email]);

            console.log('✅ Token FCM actualizado correctamente.');

            // Generar el token JWT
            const token = jwt.sign({ userId, email }, SECRET_KEY, { expiresIn: '7d' });

            res.json({ message: 'Login exitoso', user_id: userId, token });
        } else {
            console.log('❌ Credenciales incorrectas');
            res.status(401).json({ message: 'Email o contraseña incorrectos' });
        }
    } catch (err) {
        console.error('❌ Error en la base de datos:', err);
        res.status(500).json({ message: 'Error en la base de datos', error: err });
    }
});



app.get('/crear_domicilios', async (req, res) => {
    if (req.session.loggedin === true) {
        try {
            const [edificios] = await pool.query('SELECT id, nombre FROM edificios');
            const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

            res.render('Aplicacione_residentes/domicilios/crear.hbs', { 
                name: req.session.name, 
                edificios, 
                roles,
                layout: 'layouts/nav_admin.hbs' 
            });
        } catch (error) {
            console.error('Error obteniendo edificios:', error);
            res.status(500).send('Error en el servidor');
        }
    } else {
        res.redirect('/login');
    }
});



app.get('/obtener_apartamentos/:edificio_id', async (req, res) => {
    try {
        const { edificio_id } = req.params;
        const [apartamentos] = await pool.query('SELECT id, numero FROM apartamentos WHERE edificio_id = ?', [edificio_id]);

        res.json(apartamentos);
    } catch (error) {
        console.error('Error obteniendo apartamentos:', error);
        res.status(500).json({ error: 'Error al obtener los apartamentos' });
    }
});






const serviceAccount = require('../src/public/serviceAccountKey.json');


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});






app.post('/guardar_domicilio', upload.single('foto'), async (req, res) => {
    try {
        console.log('📌 Recibiendo solicitud en /guardar_domicilio');

        const { edificio, apartamento, observaciones } = req.body;
        const foto = req.file ? req.file.buffer : null;

        console.log('📋 Datos recibidos:', { edificio, apartamento, observaciones, foto: foto ? '✅ Foto recibida' : '❌ Sin foto' });

        if (!edificio || !apartamento || !observaciones || !foto) {
            console.log('⚠️ Faltan datos obligatorios');
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }

        // Insertar un nuevo domicilio con estado = 1
        const [result] = await pool.query(
            'INSERT INTO domicilios (edificio_id, apartamento_id, observaciones, foto, estado) VALUES (?, ?, ?, ?, 1)', // Se agrega el valor 1 a estado
            [edificio, apartamento, observaciones, foto]
        );

        const domicilioId = result.insertId;
        console.log('✅ Domicilio insertado con ID:', domicilioId);

        // Buscar el token de FCM del usuario
        const [usuarios] = await pool.query(
            'SELECT fcm_token FROM usuarios WHERE edificio = ? AND apartamento = ? LIMIT 1',
            [edificio, apartamento]
        );

        console.log('🔎 Usuarios encontrados:', usuarios);

        if (usuarios.length > 0 && usuarios[0].fcm_token) {
            const fcmToken = usuarios[0].fcm_token;
            console.log('📡 FCM Token encontrado:', fcmToken);

            if (fcmToken) {
                const message = {
                    notification: {
                        title: 'Nuevo Domicilio Registrado',
                        body: `Se ha registrado un nuevo domicilio en el edificio ${edificio}, apartamento ${apartamento}.`,
                    },
                    token: fcmToken
                };

                try {
                    console.log('📤 Enviando notificación a FCM Token:', fcmToken);
                    const response = await admin.messaging().send(message);
                    console.log('📩 Notificación enviada con éxito:', response);
                } catch (error) {
                    console.error('❌ Error al enviar la notificación:', error);
                }
            }
        } else {
            console.log('⚠️ No se encontró FCM Token para este usuario.');
        }

        res.json({ success: true, message: 'Domicilio registrado con éxito', domicilioId });
    } catch (error) {
        console.error('❌ Error al guardar domicilio:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});


app.get("/domicilios/:userId", async (req, res) => {
    const { userId } = req.params;
  
    try {
      // 1️⃣ Buscar el ID del apartamento del usuario
      const [userResult] = await pool.query(
        "SELECT apartamento FROM usuarios WHERE id = ?",
        [userId]
      );
  
      if (userResult.length === 0) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
  
      const apartamentoId = userResult[0].apartamento;  // Ahora es 'apartamento'
  
      // 2️⃣ Buscar los domicilios relacionados con ese apartamento, incluyendo el campo 'foto'
      const [domicilios] = await pool.query(
        "SELECT id, created_at, observaciones, estado, foto FROM domicilios WHERE apartamento_id = ?",
        [apartamentoId]
      );
      
      // Convertir la foto a base64 si existe
      const domiciliosConFoto = domicilios.map(domicilio => {
        if (domicilio.foto) {
          domicilio.foto = domicilio.foto.toString('base64'); // Convertir la foto a base64
        }
        return domicilio;
      });
  
      res.json(domiciliosConFoto);
    } catch (error) {
      console.error("Error en la consulta:", error);
      res.status(500).json({ error: "Error al obtener domicilios" });
    }
  });
  




  app.get("/domicilios_pendientes/:userId", async (req, res) => {
    const { userId } = req.params;
  
    try {
      // 1️⃣ Buscar el ID del apartamento del usuario
      const [userResult] = await pool.query(
        "SELECT apartamento FROM usuarios WHERE id = ?",
        [userId]
      );
  
      if (userResult.length === 0) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
  
      const apartamentoId = userResult[0].apartamento;  // Ahora es 'apartamento'
  
      // 2️⃣ Buscar los domicilios relacionados con ese apartamento, incluyendo el campo 'foto'
      const [domicilios] = await pool.query(
        "SELECT id, created_at, observaciones, estado FROM domicilios WHERE apartamento_id = ?",
        [apartamentoId]
      );
      
      // Convertir la foto a base64 si existe
      const domiciliosConFoto = domicilios.map(domicilio => {
        if (domicilio.foto) {
          domicilio.foto = domicilio.foto.toString('base64'); // Convertir la foto a base64
        }
        return domicilio;
      });
  
      res.json(domiciliosConFoto);
    } catch (error) {
      console.error("Error en la consulta:", error);
      res.status(500).json({ error: "Error al obtener domicilios" });
    }
  });
  

  app.get("/user_info/:userId", async (req, res) => {
    const { userId } = req.params;
  
    try {
      const [userResult] = await pool.query(
        `SELECT 
           u.apartamento, 
           u.nombre, 
           a.edificio_id, 
           e.nombre AS edificio_nombre,
           a.responsable, 
           a.piso, 
           a.correo 
         FROM usuarios u
         LEFT JOIN apartamentos a ON u.apartamento = a.id
         LEFT JOIN edificios e ON a.edificio_id = e.id
         WHERE u.id = ?`,
        [userId]
      );
  
      if (userResult.length === 0) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
  
      const data = userResult[0];
      res.json(data);
    } catch (error) {
      console.error("Error en la consulta:", error);
      res.status(500).json({ error: "Error al obtener datos del usuario" });
    }
  });
  





  
  app.put("/domicilio/:id", async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;
  
    try {
      const [result] = await pool.execute(
        "UPDATE domicilios SET estado = ? WHERE id = ?",
        [estado, id]
      );
  
      if (result.affectedRows > 0) {
        return res.status(200).json({ message: "Domicilio actualizado con éxito" });
      } else {
        return res.status(404).json({ message: "Domicilio no encontrado" });
      }
    } catch (error) {
      console.error("Error al actualizar el domicilio:", error);
      return res.status(500).json({ message: "Error al actualizar el domicilio" });
    }
  });
  






  app.get('/bitacora_aseo', async (req, res) => {
    if (req.session.loggedin === true) {
      const name = req.session.name;
      const userId = req.session.userId;
  
      try {
        const [edificios] = await pool.query('SELECT id, nombre FROM edificios');
        const [admins] = await pool.query('SELECT id, nombre FROM usuarios WHERE role = "admin"');
  
        // Agregamos los roles desde sesión
        const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];
  
        res.render('administrativo/Bitacora/Aseo/crear.hbs', {
          name,
          userId,
          edificios,
          admins,
          roles,
          layout: 'layouts/nav_admin.hbs'
        });
      } catch (err) {
        console.error("Error al obtener edificios:", err);
        res.status(500).send("Error en el servidor");
      }
    } else {
      res.redirect('/login');
    }
  });
  



app.post('/bitacora_aseo/guardar', async (req, res) => {
  if (req.session.loggedin === true) {
    try {
        
      // Extrae los datos del encabezado y del checklist
      const { edificio, puesto_inspeccionado, inspeccionado_por, cargo, fecha, checklist, firmaSupervisorData, firmaSupervisadoData  } = req.body;
      const data = JSON.parse(checklist);



    // 🔁 Mapeo: corrige las claves que vienen bien escritas desde el frontend
    const map = {
        "pasillos de cada piso": "pasillos de las piso limpias",
        "zona de los parqueadetros limpios": "zona de los parqueadetros limpios",
    
        "barandas limpias": "varandas limpias",
        "shut de basura limpio": "shup de basura limpio",
        "terraza limpia y en orden": "teraza limpia y en orden"
      };

      for (const [keyCorrecto, keyBaseMal] of Object.entries(map)) {
        if (data[keyCorrecto]) {
          data[keyBaseMal] = data[keyCorrecto];
        }
      }


      // Extraer para cada ítem (para este ejemplo, se muestran dos; debes extenderlo para todos)
      const paredes = data["Las paredes estan limpias y en buen estado"]?.answer || "";
      const paredes_accion = data["Las paredes estan limpias y en buen estado"]?.accion || "";
      const paredes_observacion = data["Las paredes estan limpias y en buen estado"]?.observacion || "";

      const ventanas = data["ventanas limpias de la porteria"]?.answer || "";
      const ventanas_accion = data["ventanas limpias de la porteria"]?.accion || "";
      const ventanas_observacion = data["ventanas limpias de la porteria"]?.observacion || "";

      const pasillos = data["pasillos de las piso limpias"]?.answer || "";
      const pasillos_accion = data["pasillos de las piso limpias"]?.accion || "";
      const pasillos_observacion = data["pasillos de las piso limpias"]?.observacion || "";

      const varandas = data["varandas limpias"]?.answer || "";
      const varandas_accion = data["varandas limpias"]?.accion || "";
      const varandas_observacion = data["varandas limpias"]?.observacion || "";

      const salon = data["salon social limpio y en orden"]?.answer || "";
      const salon_accion = data["salon social limpio y en orden"]?.accion || "";
      const salon_observacion = data["salon social limpio y en orden"]?.observacion || "";

      const shup = data["shup de basura limpio"]?.answer || "";
      const shup_accion = data["shup de basura limpio"]?.accion || "";
      const shup_observacion = data["shup de basura limpio"]?.observacion || "";

      const teraza = data["teraza limpia y en orden"]?.answer || "";
      const teraza_accion = data["teraza limpia y en orden"]?.accion || "";
      const teraza_observacion = data["teraza limpia y en orden"]?.observacion || "";

      const zona = data["zona de los parqueadetros limpios"]?.answer || "";
      const zona_accion = data["zona de los parqueadetros limpios"]?.accion || "";
      const zona_observacion = data["zona de los parqueadetros limpios"]?.observacion || "";

      const jardineria = data["jardineria en orden"]?.answer || "";
      const jardineria_accion = data["jardineria en orden"]?.accion || "";
      const jardineria_observacion = data["jardineria en orden"]?.observacion || "";

      const areas = data["areas comunes limpias"]?.answer || "";
      const areas_accion = data["areas comunes limpias"]?.accion || "";
      const areas_observacion = data["areas comunes limpias"]?.observacion || "";

      const porteria = data["porteria (recepcion) limpia"]?.answer || "";
      const porteria_accion = data["porteria (recepcion) limpia"]?.accion || "";
      const porteria_observacion = data["porteria (recepcion) limpia"]?.observacion || "";

      // Realiza el INSERT en la tabla (asegúrate de incluir todas las columnas según tu esquema)
      await pool.query(
        `INSERT INTO bitacora_aseo (
          edificio, puesto_inspeccionado, inspeccionado_por, cargo, fecha,
          \`Las paredes estan limpias y en buen estado\`,
          \`Las paredes estan limpias y en buen estado_Accion propuesta\`,
          \`Las paredes estan limpias y en buen estado_Observacion\`,
          \`ventanas limpias de la porteria\`,
          \`ventanas limpias de la porteria_Accion propuesta\`,
          \`ventanas limpias de la porteria_Observacion\`,
          \`pasillos de las piso limpias\`,
          \`pasillos de las piso limpias_Accion propuesta\`,
          \`pasillos de las piso limpias_Observacion\`,
          \`varandas limpias\`,
          \`varandas limpias_Accion propuesta\`,
          \`varandas limpias_Observacion\`,
          \`salon social limpio y en orden\`,
          \`salon social limpio y en orden_Accion propuesta\`,
          \`salon social limpio y en orden_Observacion\`,
          \`shup de basura limpio\`,
          \`shup de basura limpio_Accion propuesta\`,
          \`shup de basura limpio_Observacion\`,
          \`teraza limpia y en orden\`,
          \`teraza limpia y en orden_Accion propuesta\`,
          \`teraza limpia y en orden_Observacion\`,
          \`zona de los parqueadetros limpios\`,
          \`zona de los parqueadetros limpios_Accion propuesta\`,
          \`zona de los parqueadetros limpios_Observacion\`,
          \`jardineria en orden\`,
          \`jardineria en orden_Accion propuesta\`,
          \`jardineria en orden_Observacion\`,
          \`areas comunes limpias\`,
          \`areas comunes limpias_Accion propuesta\`,
          \`areas comunes limpias_Observacion\`,
          \`porteria (recepcion) limpia\`,
          \`porteria (recepcion) limpia_Accion propuesta\`,
          \`porteria (recepcion) limpia_Observacion\`,
              firmaSupervisorData, 
    firmaSupervisadoData 
        ) VALUES (?, ?, ?, ?, ?,
                  ?, ?, ?,
                  ?, ?, ?,
                  ?, ?, ?,
                  ?, ?, ?,
                  ?, ?, ?,
                  ?, ?, ?,
                  ?, ?, ?,
                  ?, ?, ?,
                  ?, ?, ?,
                  ?, ?, ?,
                  ?, ?, ?,
                  ?,?)`
        ,
        [
          edificio, puesto_inspeccionado, inspeccionado_por, cargo, fecha,
          paredes, paredes_accion, paredes_observacion,
          ventanas, ventanas_accion, ventanas_observacion,
          pasillos, pasillos_accion, pasillos_observacion,
          varandas, varandas_accion, varandas_observacion,
          salon, salon_accion, salon_observacion,
          shup, shup_accion, shup_observacion,
          teraza, teraza_accion, teraza_observacion,
          zona, zona_accion, zona_observacion,
          jardineria, jardineria_accion, jardineria_observacion,
          areas, areas_accion, areas_observacion,
          porteria, porteria_accion, porteria_observacion,
          firmaSupervisorData,  // Aquí se corrige
          firmaSupervisadoData  // Aquí se corrige
        ]
      );
      res.redirect('/bitacora_aseo');
    } catch (err) {
      console.error("Error al guardar la bitácora de aseo:", err);
      res.status(500).send("Error en el servidor");
    }
  } else {
    res.redirect('/login');
  }
});








app.get('/bitacora_conserje', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;

        try {
            const [edificios] = await pool.query('SELECT id, nombre FROM edificios');
            const [admins] = await pool.query('SELECT id, nombre FROM usuarios WHERE role = "admin"');

            const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

            res.render('administrativo/Bitacora/conserje/crear.hbs', { 
                name,
                userId,
                edificios,
                admins,
                roles,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (err) {
            console.error("Error al obtener datos:", err);
            res.status(500).send("Error en el servidor");
        }
    } else {
        res.redirect('/login');
    }
});




  app.post('/bitacora_conserje/guardar', async (req, res) => {
    if (req.session.loggedin === true) {
        try {
            console.log("Datos recibidos en el body:", req.body);
            
            const { edificio, puesto_inspeccionado, inspeccionado_por, cargo, fecha, checklist,firmaSupervisorData, firmaSupervisadoData } = req.body;
            console.log("Encabezado extraído:", { edificio, puesto_inspeccionado, inspeccionado_por, cargo, fecha });

            const data = JSON.parse(checklist);
            console.log("Checklist procesado:", data);

            const values = [
                edificio, puesto_inspeccionado, inspeccionado_por, cargo, fecha,
                data["Presentacion personal"]?.answer || "", data["Presentacion personal"]?.accion || "", data["Presentacion personal"]?.observacion || "",
                data["Uso de los elementos que fueron entregados por la empresa"]?.answer || "", data["Uso de los elementos que fueron entregados por la empresa"]?.accion || "", data["Uso de los elementos que fueron entregados por la empresa"]?.observacion || "",
                data["Diligenciamiento de las minutas"]?.answer || "", data["Diligenciamiento de las minutas"]?.accion || "", data["Diligenciamiento de las minutas"]?.observacion || "",
                data["Cumplimiento de los horarios"]?.answer || "", data["Cumplimiento de los horarios"]?.accion || "", data["Cumplimiento de los horarios"]?.observacion || "",
                data["Cumplimiento del manual de funciones"]?.answer || "", data["Cumplimiento del manual de funciones"]?.accion || "", data["Cumplimiento del manual de funciones"]?.observacion || "",
                data["Mantener el puesto limpio y organizado"]?.answer || "", data["Mantener el puesto limpio y organizado"]?.accion || "", data["Mantener el puesto limpio y organizado"]?.observacion || "",
                data["Realizar los recorridos y dejando las evidencia"]?.answer || "", data["Realizar los recorridos y dejando las evidencia"]?.accion || "", data["Realizar los recorridos y dejando las evidencia"]?.observacion || "",
                data["Realizar el mantenimiento del edifico limpio"]?.answer || "", data["Realizar el mantenimiento del edifico limpio"]?.accion || "", data["Realizar el mantenimiento del edifico limpio"]?.observacion || "",
                data["Realizar la limpieza de los vidrios"]?.answer || "", data["Realizar la limpieza de los vidrios"]?.accion || "", data["Realizar la limpieza de los vidrios"]?.observacion || "",
                data["Realizar la limpieza de los shup de basuras"]?.answer || "", data["Realizar la limpieza de los shup de basuras"]?.accion || "", data["Realizar la limpieza de los shup de basuras"]?.observacion || "",
                data["Mantener las areas de los parqueaderos limpias"]?.answer || "", data["Mantener las areas de los parqueaderos limpias"]?.accion || "", data["Mantener las areas de los parqueaderos limpias"]?.observacion || "",
                data["Informar las novedades que se presentan"]?.answer || "", data["Informar las novedades que se presentan"]?.accion || "", data["Informar las novedades que se presentan"]?.observacion || "",
                firmaSupervisorData || "", firmaSupervisadoData || ""
            ];

            console.log("Cantidad de elementos en el arreglo:", values.length);
            console.log("Valores a insertar:", values);

            await pool.query(
                `INSERT INTO bitacora_conserje (
                    \`edificio\`, \`puesto_inspeccionado\`, \`inspeccionado_por\`, \`cargo\`, \`fecha\`,
                    \`presentacion\`, \`presentacion_acc\`, \`presentacion_obs\`,
                    \`elementos\`, \`elementos_acc\`, \`elementos_obs\`,
                    \`minutas\`, \`minutas_acc\`, \`minutas_obs\`,
                    \`horarios\`, \`horarios_acc\`, \`horarios_obs\`,
                    \`manual\`, \`manual_acc\`, \`manual_obs\`,
                    \`puesto_limpio\`, \`puesto_limpio_acc\`, \`puesto_limpio_obs\`,
                    \`recorridos\`, \`recorridos_acc\`, \`recorridos_obs\`,
                    \`mantenimiento\`, \`mantenimiento_acc\`, \`mantenimiento_obs\`,
                    \`vidrios\`, \`vidrios_acc\`, \`vidrios_obs\`,
                    \`shup\`, \`shup_acc\`, \`shup_obs\`,
                    \`parqueaderos\`, \`parqueaderos_acc\`, \`parqueaderos_obs\`,
                    \`novedades\`, \`novedades_acc\`, \`novedades_obs\`,
                    \`firmaSupervisorData\`, \`firmaSupervisadoData\`
                ) VALUES (${values.map(() => '?').join(', ')})`,
                values
            );
            

            console.log("Inserción en la base de datos completada.");
            res.redirect('/bitacora_conserje');
        } catch (err) {
            console.error("Error al guardar la bitácora de conserje:", err);
            res.status(500).send("Error en el servidor");
        }
    } else {
        res.redirect('/login');
    }
});




app.get('/crear_alerta_app', async (req, res) => {
    if (req.session.loggedin === true) {
        try {
            const [edificios] = await pool.query('SELECT id, nombre FROM edificios'); // Obtener edificios

            const name = req.session.name;
            const userId = req.session.userId;
            const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

            res.render('Aplicacione_residentes/alertas/crear.hbs', { 
                name,
                userId,
                roles,
                edificios,
                layout: 'layouts/nav_admin.hbs' 
            });
        } catch (error) {
            console.error('Error obteniendo edificios:', error);
            res.status(500).send('Error en el servidor');
        }
    } else {
        res.redirect('/login');
    }
});




let deferredPrompt;

if (typeof window !== 'undefined') {
    // Código que solo debe ejecutarse en el navegador
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installButton.style.display = 'block';

        installButton.addEventListener('click', () => {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('El usuario aceptó el prompt de A2HS');
                } else {
                    console.log('El usuario desestimó el prompt de A2HS');
                }
                deferredPrompt = null;
            });
        });
    });
}



app.get('/info_ususuario/:id', async (req, res) => {
    const userId = req.params.id;
  
    try {
      const [rows] = await pool.query(
        'SELECT edificio, apartamento FROM usuarios WHERE id = ?',
        [userId]
      );
  
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
  
      const { edificio, apartamento } = rows[0];
      res.json({ edificio, apartamento }); // 👈 asegúrate que se devuelvan ambos
    } catch (error) {
      console.error('Error consultando usuario:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  });

  

  app.get('/edificios/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const [rows] = await pool.query('SELECT nombre FROM edificios WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Edificio no encontrado' });
      res.json(rows[0]);
    } catch (error) {
      console.error('Error al obtener edificio:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  });
  

  app.get('/apartamentos/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const [rows] = await pool.query('SELECT numero FROM apartamentos WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Apartamento no encontrado' });
      res.json(rows[0]);
    } catch (error) {
      console.error('Error al obtener apartamento:', error);
      res.status(500).json({ error: 'Error del servidor' });
    }
  });
  


  app.post('/api/pagos', upload.single('documento_pago'), async (req, res) => {
    try {
      const {
        apartamento_id,
        fecha_pago,
        valor_pago,
        estado,
        edificio_id,
      } = req.body;
  
      const documento_pago = req.file ? req.file.buffer : null;
  
      const sql = `
        INSERT INTO pagos_apartamentos (
          apartamento_id,
          fecha_pago,
          valor_pago,
          documento_pago,
          estado,
          edificio_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;
  
      const [result] = await pool.execute(sql, [
        apartamento_id,
        fecha_pago,
        valor_pago,
        documento_pago,
        estado,
        edificio_id
      ]);
  
      res.status(200).json({ message: 'Pago registrado exitosamente', id: result.insertId });
    } catch (error) {
      console.error('Error al registrar el pago:', error);
      res.status(500).json({ error: 'Error al guardar el pago' });
    }
  });
  





  app.get('/api/edificios_app', async function (req, res) {
    try {
      const [rows] = await pool.query('SELECT id, nombre FROM edificios');
      res.json(rows);
    } catch (error) {
      console.error('❌ Error al obtener edificios:', error);
      res.status(500).json({ message: 'Error al obtener edificios' });
    }
  });


// Endpoint para obtener apartamentos filtrados por edificio_id
app.get('/api/apartamentos_app', async (req, res) => {
    try {
      const { edificio_id } = req.query;
      if (!edificio_id) {
        return res.status(400).json({ error: 'El parámetro edificio_id es requerido' });
      }
  
      // Consulta a la base de datos filtrando por el edificio_id recibido
      const [rows] = await pool.query(
        'SELECT id, numero FROM apartamentos WHERE edificio_id = ?',
        [edificio_id]
      );
  
      res.json(rows);
    } catch (error) {
      console.error('Error en la consulta de apartamentos: ', error);
      res.status(500).json({ error: 'Error interno en el servidor' });
    }
  });


  app.post('/api/register', async (req, res) => {
    try {
      // Extraemos los datos enviados en el cuerpo de la petición
      const { nombre, email, password, role, cargo, fecha_cumpleaños, edificio, apartamento } = req.body;
  
      // Validamos que los campos requeridos existan
      if (!nombre || !email || !password || !fecha_cumpleaños || !edificio || !apartamento) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
      }
  
      // Se asigna el estado "pendiente" de forma predeterminada
      const estado = "pendiente";
  
      // Consulta para insertar el nuevo usuario en la base de datos
      const [result] = await pool.query(
        `INSERT INTO usuarios (nombre, email, password, role, cargo, fecha_cumpleaños, edificio, apartamento, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, email, password, role, cargo, fecha_cumpleaños, edificio, apartamento, estado]
      );
  
      res.status(201).json({ message: 'Usuario registrado correctamente', userId: result.insertId });
    } catch (error) {
      console.error('Error al registrar usuario: ', error);
      res.status(500).json({ error: 'Error interno en el servidor' });
    }
  });
  

  app.get('/validar_usuarios', async (req, res) => {
    if (req.session.loggedin === true) {
      const name = req.session.name;
      const userId = req.session.userId;
      const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];
  
      try {
        const [usuariosPendientes] = await pool.query(
          `SELECT 
             u.id, 
             u.nombre, 
             u.email, 
             u.fecha_cumpleaños, 
             e.id AS edificio_id,
             e.nombre AS edificio, 
             a.numero AS apartamento,
             a.id AS apartamento_id
           FROM usuarios u
           JOIN edificios e ON u.edificio = e.id
           JOIN apartamentos a ON u.apartamento = a.id
           WHERE u.estado = 'pendiente'`
        );
  
        const [edificios] = await pool.query('SELECT id, nombre FROM edificios');
  
        res.render('administrativo/usuarios/validar_usuarios.hbs', { 
          name, 
          userId,
          roles,
          usuarios: usuariosPendientes,
          edificios,
          layout: 'layouts/nav_admin.hbs' 
        });
      } catch (error) {
        console.error('Error al obtener usuarios pendientes:', error);
        res.status(500).send('Error al obtener usuarios');
      }
    } else {
      res.redirect('/login');
    }
  });
  








  
  app.get('/api/apartamentos/:edificio_id', async (req, res) => {
    const edificioId = req.params.edificio_id;
    console.log('Buscando apartamentos para edificio:', edificioId);
    try {
      const [apartamentos] = await pool.query(
        'SELECT id, numero FROM apartamentos WHERE edificio_id = ?',
        [edificioId]
      );
      res.json(apartamentos);
    } catch (error) {
      console.error('Error al obtener apartamentos:', error);
      res.status(500).json({ error: 'Error al obtener apartamentos' });
    }
  });
  














  app.get('/aprobar_usuario/:id', async (req, res) => {
    if (req.session.loggedin === true) {
      const id = req.params.id;
      try {
        // Recupera email y password del usuario
        const [rows] = await pool.query(
          'SELECT email, password FROM usuarios WHERE id = ?',
          [id]
        );
        if (rows.length === 0) {
          return res.status(404).send('Usuario no encontrado');
        }
        const user = rows[0];
  
        // Actualiza el estado del usuario a 'activo'
        await pool.query(
          'UPDATE usuarios SET estado = ? WHERE id = ?',
          ['activo', id]
        );
  
        // Configura el transporter de nodemailer
        const nodemailer = require('nodemailer');
        let transporter = nodemailer.createTransport({
          service: 'Gmail',
          auth: {
        user: 'cercetasolucionempresarial@gmail.com', // ← Faltaba cerrar comillas aquí
                pass: 'yuumpbszqtbxscsq'
          }
        });
  
        // Define el contenido del correo
        let mailOptions = {
          from: 'cercetasolucionempresarial@gmail.com',             // Remitente
          to: user.email,                           // Destinatario (email del usuario)
          subject: 'Cuenta verificada - App cercerta',
          text: `Su cuenta de la App cercerta ha sido verificada correctamente, ya puedes ingresar a la aplicación.
  
  Recuerda tus credenciales son:
  Email: ${user.email}
  Password: ${user.password}`
        };
  
        // Envía el correo
        await transporter.sendMail(mailOptions);
  
        res.redirect('/validar_usuarios');
      } catch (error) {
        console.error('Error al aprobar usuario:', error);
        res.status(500).send('Error al aprobar usuario');
      }
    } else {
      res.redirect('/login');
    }
  });
  



  app.post('/editar_usuario_app/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, email, edificio, apartamento } = req.body;
    
    try {
        await pool.query(`
            UPDATE usuarios 
            SET nombre = ?, email = ?, edificio = ?, apartamento = ?
            WHERE id = ?
        `, [nombre, email, edificio, apartamento, id]);

        // Redireccionamos a la misma página para que se recargue
        res.redirect('/validar_usuarios'); // Ajusta la ruta según tu configuración
    } catch (error) {
        console.error(error);
        res.status(500).send('Error al actualizar el usuario');
    }
});



app.get('/eliminar_usuario/:id', async (req, res) => {
    const { id } = req.params;
  
    try {
      // 1. Obtener el email del usuario
      const [rows] = await pool.query('SELECT email FROM usuarios WHERE id = ?', [id]);
  
      if (rows.length === 0) {
        return res.status(404).send('Usuario no encontrado');
      }
  
      const emailUsuario = rows[0].email;
  
      // 2. Enviar el correo
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
         user: 'cercetasolucionempresarial@gmail.com', // ← Faltaba cerrar comillas aquí
                pass: 'yuumpbszqtbxscsq'
        }
      });
  
      const mailOptions = {
        from: 'cercetasolucionempresarial@gmail.com',
        to: emailUsuario,
        subject: 'Validación no aprobada - Cerceta',
        text: 'Lo sentimos, la validación no fue aprobada. No cumples con los datos correctos para usar la aplicación de Cerceta.'
      };
  
      await transporter.sendMail(mailOptions);
  
      // 3. Eliminar al usuario
      await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
  
      res.redirect('/validar_usuarios');
    } catch (error) {
      console.error('Error al eliminar usuario y enviar correo:', error);
      res.status(500).send('Error al eliminar el usuario');
    }
  });
  

  const bufferToBase64 = (buffer) => {
    return buffer.toString('base64');
  };
  
  app.get('/api/blog', async (req, res) => {
      const userId = req.query.userId;
  
      if (!userId) {
          return res.status(400).json({ error: 'Falta el userId' });
      }
  
      try {
          // Obtener el edificio del usuario
          const [userRows] = await pool.query('SELECT edificio FROM usuarios WHERE id = ?', [userId]);
  
          if (userRows.length === 0) {
              return res.status(404).json({ error: 'Usuario no encontrado' });
          }
  
          const edificioId = userRows[0].edificio;
          console.log(`🏢 Edificio del usuario ${userId}:`, edificioId);
  
          // Obtener publicaciones del edificio
          const [publicaciones] = await pool.query('SELECT * FROM publicaciones WHERE edificio_id = ?', [edificioId]);
          console.log(`📚 Publicaciones para edificio ${edificioId}:`, publicaciones);
  
          // Convertir los buffers a base64 para las imágenes y archivos
          const publicacionesConBase64 = publicaciones.map((publicacion) => {
              return {
                  ...publicacion,
                  imagen: publicacion.imagen ? bufferToBase64(publicacion.imagen) : null,
                  pdf: publicacion.pdf ? bufferToBase64(publicacion.pdf) : null,
                  word: publicacion.word ? bufferToBase64(publicacion.word) : null,
                  excel: publicacion.excel ? bufferToBase64(publicacion.excel) : null,
              };
          });
  
          res.json(publicacionesConBase64);
      } catch (error) {
          console.error('Error al obtener publicaciones:', error);
          res.status(500).json({ error: 'Error interno del servidor' });
      }
  });
  





  app.get('/blog_residentes_app/:id', async (req, res) => {
    const userId = req.params.id;

    try {
        const [userResult] = await pool.query('SELECT edificio FROM usuarios WHERE id = ?', [userId]);
        if (userResult.length === 0) {
            return res.status(404).send('Usuario no encontrado');
        }

        const edificioId = userResult[0].edificio;
        console.log("Edificio ID del usuario:", edificioId);

        // Consulta para obtener las publicaciones del edificio
        const [resultados] = await pool.query(
            'SELECT * FROM publicaciones WHERE edificio_id = ? ORDER BY fecha DESC',
            [edificioId]
        );
        console.log("Resultados de publicaciones:", resultados);

        // Convertir los datos binarios a base64
        const blogPosts = resultados.map((post) => ({
            ...post,
            imagen: post.imagen ? post.imagen.toString('base64') : null,
            pdf: post.pdf ? post.pdf.toString('base64') : null,
            word: post.word ? post.word.toString('base64') : null,
            excel: post.excel ? post.excel.toString('base64') : null
        }));

        res.render('blog/ver_blog.residentes.hbs', {
            blogPosts,
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error al obtener las entradas del blog');
    }
});

   
app.post('/enviar_pqrs', async (req, res) => {
    const { userId, tipo, descripcion } = req.body;
  
    if (!userId || !tipo || !descripcion) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
  
    try {
      // 1. Guardar en la base de datos
      const [result] = await pool.query(
        'INSERT INTO pqrs (user_id, tipo, descripcion) VALUES (?, ?, ?)',
        [userId, tipo, descripcion]
      );
  
      // 2. Configurar Nodemailer dentro del endpoint
      const nodemailer = require('nodemailer');
  
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
             user: 'cercetasolucionempresarial@gmail.com', // ← Faltaba cerrar comillas aquí
                pass: 'yuumpbszqtbxscsq'
        },
      });
  
      // 3. Enviar el correo
      await transporter.sendMail({
        from: 'cercetasolucionempresarial@gmail.com',
        to: 'cercetasolucionempresarial@gmail.com',
        subject: 'Nueva PQRS registrada',
        text: `Se ha registrado una nueva PQRS:\n\nUsuario: ${userId}\nTipo: ${tipo}\nDescripción: ${descripcion}`,
      });
  
      // 4. Responder al cliente
      res.status(200).json({
        message: 'PQRS registrada y correo enviado correctamente',
        id: result.insertId,
      });
  
    } catch (error) {
      console.error('Error al guardar PQRS o enviar correo:', error);
      res.status(500).json({ error: 'Error del servidor al guardar PQRS o enviar correo' });
    }
  });
  


  app.get('/acta_reunion', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

        try {
            const [edificios] = await pool.query('SELECT id, nombre FROM edificios');
            const [admins] = await pool.query('SELECT id, nombre FROM usuarios WHERE role = "admin"');

            res.render('administrativo/informes/crear/acta_reunion.hbs', { 
                name,
                userId,
                roles,
                edificios,
                admins,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (err) {
            console.error("Error al obtener datos:", err);
            res.status(500).send("Error en el servidor");
        }
    } else {
        res.redirect('/login');
    }
});



app.get('/acta_puestos', async (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const userId = req.session.userId;
        const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

        try {
            const [edificios] = await pool.query('SELECT id, nombre FROM edificios');
            const [admins] = await pool.query('SELECT id, nombre FROM usuarios WHERE role = "admin"');

            res.render('administrativo/informes/crear/acta_puestos.hbs', { 
                name,
                userId,
                roles,
                edificios,
                admins,
                layout: 'layouts/nav_admin.hbs'
            });
        } catch (err) {
            console.error("Error al obtener datos:", err);
            res.status(500).send("Error en el servidor");
        }
    } else {
        res.redirect('/login');
    }
});





app.post('/guardar_acta_puesto', async (req, res) => {
    try {
      console.log('📥 Datos completos recibidos en req.body:', req.body);
  
      const {
        fecha,
        hora,
        instalacion,
        levantamiento,
        nombre_puesto,
        empresa_recibe,
        empresa_entrega,
        responsable_recibe,
        responsable_entrega,
        representante_cliente,
        observaciones,
        firma_cliente,
        firma_recibe,
        firma_entrega
      } = req.body;
  
      // 🛡️ Función para forzar conversión a array
      const parseToArray = value => Array.isArray(value) ? value : (value ? [value] : []);
  
      // ✅ Acceder correctamente a los campos múltiples (aunque solo haya una fila)
      const propiedad_cliente_articulo = parseToArray(req.body['propiedad_cliente_articulo[]']);
      const propiedad_cliente_cantidad = parseToArray(req.body['propiedad_cliente_cantidad[]']);
      const propiedad_cliente_observaciones = parseToArray(req.body['propiedad_cliente_observaciones[]']);
  
      const inventario_puesto_articulo = parseToArray(req.body['inventario_puesto_articulo[]']);
      const inventario_puesto_cantidad = parseToArray(req.body['inventario_puesto_cantidad[]']);
      const inventario_puesto_observaciones = parseToArray(req.body['inventario_puesto_observaciones[]']);
  
      // 🧩 Insertar acta
      const [result] = await pool.query(`
        INSERT INTO acta_puestos (
          fecha, hora, instalacion, levantamiento, nombre_puesto,
          empresa_recibe, empresa_entrega, responsable_recibe,
          responsable_entrega, representante_cliente, observaciones,
          firma_cliente, firma_recibe, firma_entrega
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        fecha,
        hora,
        !!instalacion,
        !!levantamiento,
        nombre_puesto,
        empresa_recibe,
        empresa_entrega,
        responsable_recibe,
        responsable_entrega,
        representante_cliente,
        observaciones,
        firma_cliente,
        firma_recibe,
        firma_entrega
      ]);
  
      const actaId = result.insertId;
      console.log('🆔 ID de acta guardada:', actaId);
  
      // 🔍 Recolectar estados dinámicos
      const propiedadEstados = [];
      const inventarioEstados = [];
  
      for (let i = 0; i < propiedad_cliente_articulo.length; i++) {
        const estado = req.body[`propiedad_cliente_estado_${i}`];
        console.log(`🧾 propiedad_cliente_estado_${i}:`, estado);
        propiedadEstados.push(estado || null);
      }
  
      for (let i = 0; i < inventario_puesto_articulo.length; i++) {
        const estado = req.body[`inventario_puesto_estado_${i}`];
        console.log(`📦 inventario_puesto_estado_${i}:`, estado);
        inventarioEstados.push(estado || null);
      }
  
      // ✅ Insertar propiedad_cliente
      if (propiedad_cliente_articulo.length > 0) {
        const propiedadData = propiedad_cliente_articulo.map((_, i) => [
          actaId,
          propiedad_cliente_articulo[i],
          propiedad_cliente_cantidad[i],
          propiedad_cliente_observaciones[i],
          propiedadEstados[i]
        ]);
        console.log('📤 Insertando propiedad_cliente:', propiedadData);
        await pool.query(
          `INSERT INTO propiedad_cliente (acta_puesto_id, articulo, cantidad, observaciones, estado) VALUES ?`,
          [propiedadData]
        );
      }
  
      // ✅ Insertar inventario_puesto
      if (inventario_puesto_articulo.length > 0) {
        const inventarioData = inventario_puesto_articulo.map((_, i) => [
          actaId,
          inventario_puesto_articulo[i],
          inventario_puesto_cantidad[i],
          inventario_puesto_observaciones[i],
          inventarioEstados[i]
        ]);
        console.log('📤 Insertando inventario_puesto:', inventarioData);
        await pool.query(
          `INSERT INTO inventario_puesto (acta_puesto_id, articulo, cantidad, observaciones, estado) VALUES ?`,
          [inventarioData]
        );
      }
  
      res.send('✅ Acta y detalles guardados correctamente');
    } catch (error) {
      console.error('❌ Error al guardar acta:', error);
      res.status(500).send('Error al guardar acta');
    }
  });
  
  





app.post('/acta_reunion', async (req, res) => {
    try {
      const {
        fecha,
        horaInicio,
        horaFin,
        tema,
        agenda,
        conclusiones,
        asistentes = [],
        acciones = []
      } = req.body;
  
      // Insertar acta
      const [actaResult] = await pool.query(`
        INSERT INTO actas (fecha, hora_inicio, hora_fin, tema, agenda, conclusiones)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [fecha, horaInicio, horaFin, tema, agenda, conclusiones]
      );
      const actaId = actaResult.insertId;
  
      // Insertar asistentes
      for (const asistente of asistentes) {
        const { cargo, nombre, firma } = asistente;
        await pool.query(`
          INSERT INTO asistentes (acta_id, cargo, nombre, firma)
          VALUES (?, ?, ?, ?)`,
          [actaId, cargo, nombre, firma]
        );
      }
  
      // Insertar acciones
      for (const accion of acciones) {
        const { plan, responsable, fecha, recursos } = accion;
        await pool.query(`
          INSERT INTO acciones (acta_id, plan, responsable, fecha, recursos)
          VALUES (?, ?, ?, ?, ?)`,
          [actaId, plan, responsable, fecha, recursos]
        );
      }
  
      res.status(201).json({ message: 'Acta guardada correctamente', actaId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error al guardar el acta' });
    }
  });
















  app.get('/Ver_acta_r', (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

        res.render('administrativo/informes/consultar/consultar_acta.hbs', { 
            name,
            roles,
            layout: 'layouts/nav_admin.hbs' 
        });
    } else {
        res.redirect('/login');
    }
});





  app.get('/actas', async (req, res) => {
    const { desde, hasta } = req.query;
  
    if (!desde || !hasta) {
      return res.status(400).json({ message: 'Parámetros "desde" y "hasta" son requeridos' });
    }
  
    try {
      // Obtener las actas en el rango de fechas
      const [actas] = await pool.query(
        `SELECT * FROM actas WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC`,
        [desde, hasta]
      );
  
      // Para cada acta, obtener sus asistentes y acciones
      const resultados = [];
  
      for (const acta of actas) {
        const [asistentes] = await pool.query(
          'SELECT cargo, nombre, firma FROM asistentes WHERE acta_id = ?',
          [acta.id]
        );
  
        const [acciones] = await pool.query(
          'SELECT plan, responsable, fecha, recursos FROM acciones WHERE acta_id = ?',
          [acta.id]
        );
  
        resultados.push({
          ...acta,
          asistentes,
          acciones
        });
      }
  
      res.json(resultados);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error al consultar actas' });
    }
  });
  







  app.get('/Consulta_aseo', (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

        res.render('administrativo/Bitacora/Aseo/consultar.hbs', { 
            name,
            roles,
            layout: 'layouts/nav_admin.hbs' 
        });
    } else {
        res.redirect('/login');
    }
});







app.post('/bitacora_aseo/consultar', async (req, res) => {
    if (req.session.loggedin === true) {
      const { desde, hasta } = req.body;
  
      try {
        const [resultados] = await pool.query(`
     SELECT 
  ba.id,
  ba.edificio,
  e.nombre AS nombre_edificio,
  ba.puesto_inspeccionado,
  ba.inspeccionado_por,
  u.nombre AS nombre_inspector,  -- Aquí se agrega el nombre del usuario
  ba.cargo,
  ba.fecha_creacion AS fecha,

  
            \`Las paredes estan limpias y en buen estado\` AS paredes,
            \`Las paredes estan limpias y en buen estado_Accion propuesta\` AS paredes_accion,
            \`Las paredes estan limpias y en buen estado_Observacion\` AS paredes_obs,
  
            \`ventanas limpias de la porteria\` AS ventanas,
            \`ventanas limpias de la porteria_Accion propuesta\` AS ventanas_accion,
            \`ventanas limpias de la porteria_Observacion\` AS ventanas_obs,
  
            \`pasillos de las piso limpias\` AS pasillos,
            \`pasillos de las piso limpias_Accion propuesta\` AS pasillos_accion,
            \`pasillos de las piso limpias_Observacion\` AS pasillos_obs,
  
            \`varandas limpias\` AS varandas,
            \`varandas limpias_Accion propuesta\` AS varandas_accion,
            \`varandas limpias_Observacion\` AS varandas_obs,
  
            \`salon social limpio y en orden\` AS salon,
            \`salon social limpio y en orden_Accion propuesta\` AS salon_accion,
            \`salon social limpio y en orden_Observacion\` AS salon_obs,
  
            \`shup de basura limpio\` AS shup,
            \`shup de basura limpio_Accion propuesta\` AS shup_accion,
            \`shup de basura limpio_Observacion\` AS shup_obs,
  
            \`teraza limpia y en orden\` AS terraza,
            \`teraza limpia y en orden_Accion propuesta\` AS terraza_accion,
            \`teraza limpia y en orden_Observacion\` AS terraza_obs,
  
            \`zona de los parqueadetros limpios\` AS parqueaderos,
            \`zona de los parqueadetros limpios_Accion propuesta\` AS parqueaderos_accion,
            \`zona de los parqueadetros limpios_Observacion\` AS parqueaderos_obs,
  
            \`jardineria en orden\` AS jardineria,
            \`jardineria en orden_Accion propuesta\` AS jardineria_accion,
            \`jardineria en orden_Observacion\` AS jardineria_obs,
  
            \`areas comunes limpias\` AS areas_comunes,
            \`areas comunes limpias_Accion propuesta\` AS areas_comunes_accion,
            \`areas comunes limpias_Observacion\` AS areas_comunes_obs,
  
            \`porteria (recepcion) limpia\` AS porteria,
            \`porteria (recepcion) limpia_Accion propuesta\` AS porteria_accion,
            \`porteria (recepcion) limpia_Observacion\` AS porteria_obs,
  
            firmaSupervisorData,
            firmaSupervisadoData
  
FROM bitacora_aseo AS ba
LEFT JOIN edificios AS e ON ba.edificio = e.id
LEFT JOIN usuarios AS u ON ba.inspeccionado_por = u.id
WHERE DATE(ba.fecha_creacion) BETWEEN ? AND ?

ORDER BY ba.fecha_creacion DESC
        `, [desde, hasta]);
  
        res.render('administrativo/Bitacora/Aseo/consultar.hbs', {
          registros: resultados,
          desde,
          hasta,
          name: req.session.name,
          layout: 'layouts/nav_admin.hbs'
        });
  
      } catch (err) {
        console.error("Error al consultar bitácora:", err);
        res.status(500).send("Error al obtener los datos");
      }
    } else {
      res.redirect('/login');
    }
  });
  





  app.get('/Consulta_conserje', (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

        res.render('administrativo/Bitacora/conserje/consulta.hbs', { 
            name, 
            roles, 
            layout: 'layouts/nav_admin.hbs' 
        });
    } else {
        res.redirect('/login');
    }
});







app.post('/bitacora_conserje/consultar', async (req, res) => {
    if (req.session.loggedin === true) {
      const { desde, hasta } = req.body;
  
      try {
        const [resultados] = await pool.query(`
         SELECT
  bc.id,
  bc.edificio,
  e.nombre AS nombre_edificio,
  bc.puesto_inspeccionado,
  bc.inspeccionado_por,
  u.nombre AS nombre_inspector,
  bc.cargo,
  bc.fecha,
  bc.presentacion,
  bc.presentacion_acc,
  bc.presentacion_obs,
  bc.elementos,
  bc.elementos_acc,
  bc.elementos_obs,
  bc.minutas,
  bc.minutas_acc,
  bc.minutas_obs,
  bc.horarios,
  bc.horarios_acc,
  bc.horarios_obs,
  bc.manual,
  bc.manual_acc,
  bc.manual_obs,
  bc.puesto_limpio,
  bc.puesto_limpio_acc,
  bc.recorridos,
  bc.recorridos_acc,
  bc.mantenimiento,
  bc.mantenimiento_acc,
  bc.mantenimiento_obs,
  bc.vidrios,
  bc.vidrios_acc,
  bc.vidrios_obs,
  bc.shup,
  bc.shup_obs,
  bc.parqueaderos,
  bc.parqueaderos_acc,
  bc.parqueaderos_obs,
  bc.novedades,
  bc.novedades_acc,
  bc.novedades_obs,
  bc.firmaSupervisorData,
  bc.firmaSupervisadoData
FROM bitacora_conserje AS bc
LEFT JOIN edificios AS e ON bc.edificio = e.id
LEFT JOIN usuarios AS u ON bc.inspeccionado_por = u.id
WHERE bc.fecha BETWEEN ? AND ?
ORDER BY bc.fecha DESC
          `, [desde, hasta]);
          
  
        res.render('administrativo/Bitacora/conserje/consulta.hbs', {
          registros: resultados,
          desde,
          hasta,
          name: req.session.name,
          layout: 'layouts/nav_admin.hbs'
        });
  
      } catch (err) {
        console.error("Error al consultar bitácora:", err);
        res.status(500).send("Error al obtener los datos");
      }
    } else {
      res.redirect('/login');
    }
  });
  
  
  




















  app.get('/Consulta_acta_puestos', (req, res) => {
    if (req.session.loggedin === true) {
        const name = req.session.name;
        const hoy = new Date().toISOString().split('T')[0];
        const roles = req.session.cargo?.split(',').map(r => r.trim()) || [];

        res.render('administrativo/informes/consultar/acta_de_puestos.hbs', {
            name,
            desde: hoy,
            hasta: hoy,
            registros: [],
            roles,
            layout: 'layouts/nav_admin.hbs'
        });
    } else {
        res.redirect('/login');
    }
});


  app.post('/Consulta_acta_puestos', async (req, res) => {
    try {
      const { desde, hasta } = req.body;
  
      // 1. Obtener actas
      const [actas] = await pool.query(`
        SELECT * FROM acta_puestos
        WHERE fecha BETWEEN ? AND ?
        ORDER BY fecha DESC
      `, [desde, hasta]);
  
      // 2. Obtener propiedad_cliente
      const [propiedades] = await pool.query(`
        SELECT * FROM propiedad_cliente
        WHERE acta_puesto_id IN (
          SELECT id FROM acta_puestos WHERE fecha BETWEEN ? AND ?
        )
      `, [desde, hasta]);
  
      // 3. Obtener inventario_puesto
      const [inventarios] = await pool.query(`
        SELECT * FROM inventario_puesto
        WHERE acta_puesto_id IN (
          SELECT id FROM acta_puestos WHERE fecha BETWEEN ? AND ?
        )
      `, [desde, hasta]);
  
      // 4. Agrupar
      const registros = actas.map(acta => {
        const propiedad_cliente = propiedades.filter(p => p.acta_puesto_id === acta.id);
        const inventario_puesto = inventarios.filter(i => i.acta_puesto_id === acta.id);
        return {
          ...acta,
          propiedad_cliente,
          inventario_puesto
        };
      });
  
      res.render('administrativo/informes/consultar/acta_de_puestos.hbs', {
        name: req.session.name,
        layout: 'layouts/nav_admin.hbs',
        registros,
        desde,
        hasta
      });
  
    } catch (error) {
      console.error('❌ Error al consultar actas:', error);
      res.status(500).send('Error al consultar actas');
    }
  });
  
  
  


app.get('/', (req, res) => {
    res.redirect('/login');
});

app.listen(3000, () => {
    console.log('Servidor corriendo en el puerto 3000');
});
