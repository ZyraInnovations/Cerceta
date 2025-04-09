import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher_string.dart';
import 'pagos.dart';
import 'domicilios.dart';
import 'login_screen.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'informes_screen.dart';
import 'pqrs_screen.dart';
import 'vista_general_page.dart';


class HomeScreen extends StatefulWidget {
  final String userId;
final VoidCallback? onToggleTheme;

const HomeScreen({
  super.key,
  required this.userId,
  this.onToggleTheme, // ✅ opcional
});



  @override
  State<HomeScreen> createState() => _HomeScreenState();
}



class _HomeScreenState extends State<HomeScreen> {
  Timer? _timer;
  int pendingDomicilios = 0;
  int? apartment;

final List<Map<String, dynamic>> rooms = [
  {"name": "Domicilios", "image": "assets/images/domicilios.png"},
  {"name": "Informes", "image": "assets/images/informe.png"},
  {"name": "PQRS", "image": "assets/images/pqrs.jpg"},
];



@override
void initState() {
  super.initState();
  fetchUserInfo(); // una sola llamada optimizada
  fetchDomiciliosPendientes();
  _timer = Timer.periodic(const Duration(seconds: 10), (_) => fetchDomiciliosPendientes());
}


  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

 


Future<void> _logout() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.remove('userId'); // o prefs.clear() si quieres borrar todo
  Navigator.pushAndRemoveUntil(
    context,
MaterialPageRoute(builder: (context) => LoginScreen()),
    (Route<dynamic> route) => false,
  );
}





  Future<void> fetchDomiciliosPendientes() async {
    try {
      final response = await http.get(Uri.parse('https://sistemacerceta.com/domicilios_pendientes/${widget.userId}'));
      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        final count = data.where((d) => d["estado"] == 1).length;
        setState(() {
          pendingDomicilios = count;
        });
      }
    } catch (_) {}
  }



String? userName;
String? responsible;
String? email;
String? buildingId;
String? floor;
String? buildingName;





Future<void> fetchUserInfo() async {
  try {
    final response = await http.get(Uri.parse('https://sistemacerceta.com/user_info/${widget.userId}'));
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      setState(() {
        apartment = int.tryParse(data['apartamento'].toString());
        userName = data['nombre'] ?? 'Usuario';
        buildingId = data['edificio_id']?.toString() ?? '';
        buildingName = data['edificio_nombre'] ?? 'Sin nombre';
        responsible = data['responsable'] ?? '';
        floor = data['piso']?.toString() ?? '';
        email = data['correo'] ?? '';
      });
    } else {
      setState(() {
        userName = 'Usuario';
      });
    }
  } catch (_) {
    setState(() {
      userName = 'Usuario';
    });
  }
}




@override
Widget build(BuildContext context) {
  return Scaffold(
      extendBody: true, // 👈 esto permite que el botón se salga visualmente del nav
   backgroundColor: Theme.of(context).brightness == Brightness.dark
      ? const Color(0xFF2B2B2E) // 👈 gris oscuro suave
      : const Color(0xFFF5F6FA), // fondo claro habitual
body: SafeArea(
  child: Container(
    color: Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF2B2B2E) // gris suave
        : const Color(0xFFF5F6FA),
    child: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: 20),
          _buildCreditCardSection(),
          const SizedBox(height: 20),
          _buildOptions(),
          const SizedBox(height: 20),
          _buildBlogSection(),
          const SizedBox(height: 20),
          _buildUserInfo(),
          const SizedBox(height: 40),
        ],
      ),
    ),
  ),
),
bottomNavigationBar: _buildBottomNav(context), // ✅ ¡Así funciona!
  );
}






Widget _buildHeader() {
  return Container(
    padding: const EdgeInsets.all(20),
    decoration: const BoxDecoration(
      color: Color(0xFF1E99D3),
      borderRadius: BorderRadius.only(
        bottomLeft: Radius.circular(30),
        bottomRight: Radius.circular(30),
      ),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
          Container(
  padding: const EdgeInsets.all(6), // Espaciado interno
  decoration: BoxDecoration(
    color: Colors.white, // Fondo blanco para resaltar el logo
    borderRadius: BorderRadius.circular(12), // Bordes redondeados
    boxShadow: [
      BoxShadow(
        color: Colors.black26,
        blurRadius: 4,
        offset: Offset(0, 2),
      ),
    ],
  ),
  child: const CircleAvatar(
    radius: 24,
    backgroundColor: Colors.white, // por si el logo tiene fondo transparente
    backgroundImage: AssetImage('assets/images/2022cercetafinal_blanco.png'),
  ),
),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
Text(
  'Bienvenido, ${userName ?? 'Cargando...'}!',
  style: TextStyle(
    color: Theme.of(context).colorScheme.onPrimary,
    fontSize: 20,
    fontWeight: FontWeight.bold,
  ),
),
Text(
  '¿Qué deseas hacer hoy?',
  style: TextStyle(
    color: Theme.of(context).colorScheme.onPrimary.withOpacity(0.7),
    fontSize: 14,
  ),
),
              ],
            ),
            const Spacer(),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: const BoxDecoration(
                color: Colors.white24,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.notifications_none, color: Colors.white, size: 26),
            ),
          ],
        ),
        const SizedBox(height: 20),



        Row(
          children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
  color: Theme.of(context).cardColor, // ✅ dinámico según tema
  borderRadius: BorderRadius.circular(24),
  boxShadow: [
    BoxShadow(
      color: Theme.of(context).brightness == Brightness.dark
          ? Colors.black54
          : Colors.black12,
      blurRadius: 12,
      offset: const Offset(0, 6),
    ),
  ],
),

                child: const TextField(
                  decoration: InputDecoration(
                    border: InputBorder.none,
                    hintText: 'Buscar...',
                    icon: Icon(Icons.search, color: Colors.grey),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            GestureDetector(
              onTap: () {
                showModalBottomSheet(
                  context: context,
                  shape: const RoundedRectangleBorder(
                    borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                  ),
  backgroundColor: Theme.of(context).scaffoldBackgroundColor,
                  builder: (context) => _buildSettingsPanel(),
                );
              },
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.tune, color: Color(0xFF1E99D3)),
              ),
            ),
          ],
        ),
      ],
    ),
  );
}







Widget _buildSettingsPanel() {
  bool isDarkMode = Theme.of(context).brightness == Brightness.dark;
  return StatefulBuilder(
    builder: (context, setModalState) {
      return Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text("Configuraciones", style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 20),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text("Modo oscuro"),
Switch(
  value: isDarkMode,
  onChanged: (value) {
    setModalState(() {
      isDarkMode = value;
    });

    widget.onToggleTheme?.call(); // ✅ ¡Esto es lo correcto!
  },
),
              ],
            ),
            const SizedBox(height: 10),
            ListTile(
              leading: const Icon(Icons.support_agent, color: Colors.purple),
              title: const Text("Soporte / Contacto"),
              onTap: () {
                launchUrlString("https://wa.me/573118952249");
              },
            ),
          ],
        ),
      );
    },
  );
}








Widget _buildCreditCardSection() {
  final isDark = Theme.of(context).brightness == Brightness.dark;

  return Padding(
    padding: const EdgeInsets.symmetric(horizontal: 20),
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        image: const DecorationImage(
          image: AssetImage('assets/images/tarjeta.png'), // Imagen de fondo tipo tarjeta
          fit: BoxFit.cover,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 100), // Espacio para el fondo (puedes ajustar según diseño)
          ElevatedButton.icon(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => NuevoPagoScreen(userId: widget.userId),
                ),
              );
            },
            icon: const Icon(Icons.upload_file),
            label: const Text(
              'Subir Pagos',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.deepPurple.shade400,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(30),
              ),
              elevation: 6,
              shadowColor: Colors.black45,
            ),
          ),
        ],
      ),
    ),
  );
}









Widget _buildOptions() {
  final cardBackgroundColor = Theme.of(context).brightness == Brightness.dark
      ? const Color(0xFF2A2A2D) // Un gris elegante que sí contrasta
      : Theme.of(context).cardColor;

  return Padding(
    padding: const EdgeInsets.symmetric(horizontal: 20),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: rooms.map((room) {
        final isDomicilio = room['name'] == 'Domicilios';
        return Expanded(
          child: GestureDetector(
            onTap: () {
              if (room['name'] == 'Domicilios') {
                Navigator.push(context, MaterialPageRoute(builder: (_) => PedidosScreen(userId: widget.userId)));
              } else if (room['name'] == 'Pagos') {
                Navigator.push(context, MaterialPageRoute(builder: (_) => NuevoPagoScreen(userId: widget.userId)));
              } else if (room['name'] == 'Informes') {
                Navigator.push(context, MaterialPageRoute(builder: (_) => InformesScreen(userId: widget.userId)));
              } else if (room['name'] == 'PQRS') {
                Navigator.push(context, MaterialPageRoute(builder: (_) => PqrsScreen(userId: widget.userId)));
              }
            },
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 8),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: cardBackgroundColor,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.black54
                        : Colors.black12,
                    blurRadius: 10,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Stack(
                    children: [
                      Image.asset(room['image'], height: 50),
                      if (isDomicilio && pendingDomicilios > 0)
                        Positioned(
                          right: 0,
                          top: 0,
                          child: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: const BoxDecoration(
                              color: Colors.redAccent,
                              shape: BoxShape.circle,
                            ),
                            child: Text(
                              '$pendingDomicilios',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        )
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    room['name'],
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    ),
  );
}




Widget _buildBlogSection() {
  return Padding(
    padding: const EdgeInsets.symmetric(horizontal: 20),
    child: GestureDetector(
      onTap: () async {
        final url = 'https://sistemacerceta.com/blog_residentes_app/${widget.userId}';
        if (await canLaunchUrlString(url)) {
          await launchUrlString(url, mode: LaunchMode.externalApplication);
        }
      },
      child: Container(
        height: 200,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(30),
          boxShadow: const [
            BoxShadow(
              color: Colors.black26,
              blurRadius: 15,
              offset: Offset(0, 8),
            ),
          ],
          image: const DecorationImage(
            image: AssetImage('assets/images/blog.png'),
            fit: BoxFit.cover,
          ),
        ),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(30),
            gradient: LinearGradient(
              colors: [Colors.black.withOpacity(0.6), Colors.transparent],
              begin: Alignment.bottomCenter,
              end: Alignment.topCenter,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                const Text(
                  'Explora las últimas noticias',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: const [
                    Text(
                      'Ir al Blog',
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 16,
                      ),
                    ),
                    SizedBox(width: 8),
                    Icon(Icons.arrow_forward, color: Colors.white70)
                  ],
                )
              ],
            ),
          ),
        ),
      ).animate().fade(duration: 600.ms).slideY(begin: 0.3, curve: Curves.easeOut),
    ),
  );
}





Widget _buildUserInfo() {
  return Padding(
    padding: const EdgeInsets.symmetric(horizontal: 20),
    child: Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 12, offset: Offset(0, 6)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text("Información del Usuario",
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          _buildInfoRow("ID Usuario", widget.userId.toString()),
          _buildInfoRow("Apartamento", apartment?.toString() ?? 'Cargando...'),
    _buildInfoRow("Edificio", buildingName ?? 'Cargando...'),
          _buildInfoRow("Piso", floor ?? 'Cargando...'),
          _buildInfoRow("Responsable", responsible ?? 'Cargando...'),
          _buildInfoRow("Correo", email ?? 'Cargando...'),
        ],
      ),
    ),
  );
}


Widget _buildInfoRow(String label, String value) {
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
        Flexible(
          child: Text(value,
              textAlign: TextAlign.end,
              style: const TextStyle(fontSize: 16, color: Colors.black87)),
        ),
      ],
    ),
  );
}





Widget _buildBottomNav(BuildContext context) {
  return Stack(
    alignment: Alignment.bottomCenter,
    children: [
      Container(
        height: 80,
        margin: const EdgeInsets.only(top: 30),
        padding: const EdgeInsets.symmetric(horizontal: 24),
        decoration: const BoxDecoration(
          color: Color(0xFFF7F5FD),
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(30),
            topRight: Radius.circular(30),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black12,
              blurRadius: 20,
              offset: Offset(0, -6),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            IconButton(
              icon: const Icon(Icons.home_rounded),
              iconSize: 28,
              color: Colors.purple,
              onPressed: () {},
            ),
            IconButton(
              icon: const Icon(Icons.public),
              iconSize: 28,
              color: Colors.purple,
              onPressed: () {
                showModalBottomSheet(
                  context: context,
                  shape: const RoundedRectangleBorder(
                    borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                  ),
                  backgroundColor: Colors.white,
                  builder: (context) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Síguenos en:',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: Colors.purple,
                            ),
                          ),
                          const SizedBox(height: 12),
                          ListTile(
                            leading: const Icon(Icons.language, color: Colors.purple),
                            title: const Text('Página Web'),
                            onTap: () {
                              launchUrlString('https://cercetasolucionesempresariales.com');
                            },
                          ),
                          ListTile(
                            leading: const Icon(Icons.facebook, color: Colors.blue),
                            title: const Text('Facebook'),
                            onTap: () {
                              launchUrlString('https://facebook.com/tuempresa');
                            },
                          ),
                          ListTile(
                            leading: const Icon(Icons.camera_alt, color: Colors.pink),
                            title: const Text('Instagram'),
                            onTap: () {
                              launchUrlString('https://instagram.com/tuempresa');
                            },
                          ),
                          ListTile(
                            leading: const Icon(Icons.music_note, color: Colors.black),
                            title: const Text('TikTok'),
                            onTap: () {
                              launchUrlString('https://www.tiktok.com/@cerceta.solucion?_t=ZS-8v2GfV6wzLE&_r=1');
                            },
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
            const SizedBox(width: 60),
            IconButton(
              icon: const Icon(Icons.settings), // Cambiado a configuración
              iconSize: 28,
              color: Colors.purple,
              onPressed: () {},
            ),
    IconButton(
  icon: const Icon(Icons.logout), // Cambiado a cerrar sesión
  iconSize: 28,
  color: Colors.purple,
  onPressed: _logout,
),
          ],
        ),
      ),
      Positioned(
        bottom: 35,
        child: GestureDetector(
  onTap: () {
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (context) => VistaGeneralPage(userId: widget.userId),
    ),
  );
},

          child: Container(
            height: 60,
            width: 60,
            decoration: BoxDecoration(
              color: Colors.purple,
              borderRadius: BorderRadius.circular(20),
              boxShadow: const [
                BoxShadow(
                  color: Colors.black38,
                  blurRadius: 10,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: const Icon(Icons.list, color: Colors.white, size: 30),
          ),
        ),
      ),
    ],
  );
}

}