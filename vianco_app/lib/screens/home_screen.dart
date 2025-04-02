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



class HomeScreen extends StatefulWidget {
  final String userId;
  const HomeScreen({super.key, required this.userId});

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

Future<void> fetchUserInfo() async {
  try {
    final response = await http.get(Uri.parse('http://localhost:3000/user_info/${widget.userId}'));
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      setState(() {
        apartment = int.tryParse(data['apartamento'].toString());
        userName = data['nombre'] ?? 'Usuario';
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
    body: SafeArea(
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
            const SizedBox(height: 40), // espacio extra abajo
          ],
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
            const CircleAvatar(
              radius: 24,
              backgroundImage: AssetImage('assets/images/usuario.png'),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Bienvenido, ${userName ?? 'Cargando...'}!',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const Text(
                  '¿Qué deseas hacer hoy?',
                  style: TextStyle(
                    color: Colors.white70,
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
            )
          ],
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(30),
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
            Container(
              padding: const EdgeInsets.all(12),
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.tune, color: Color(0xFF1E99D3)),
            )
          ],
        ),
      ],
    ),
  );
}

Widget _buildCreditCardSection() {
  return Padding(
    padding: const EdgeInsets.symmetric(horizontal: 20),
    child: Container(
      width: double.infinity, // Ancho máximo disponible
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.deepPurple.shade50,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 10, offset: Offset(0, 6)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch, // Ajusta el botón
        children: [
          Image.asset('assets/images/tarjeta.png', height: 140, fit: BoxFit.cover),
          const SizedBox(height: 16),
          SizedBox(
            height: 50, // Altura suficiente del botón
            child: ElevatedButton.icon(
              onPressed: () {
                Navigator.push(context, MaterialPageRoute(builder: (_) => NuevoPagoScreen(userId: widget.userId)));
              },
              icon: const Icon(Icons.upload_file, color: Colors.white),
              label: const Text(
                'Subir Pagos',
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.deepPurple,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}





  Widget _buildOptions() {
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
                }
              },
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 8),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, 4))],
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
                              decoration: const BoxDecoration(color: Colors.redAccent, shape: BoxShape.circle),
                              child: Text(
                                '$pendingDomicilios',
                                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                              ),
                            ),
                          )
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(room['name'], style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
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
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, 4))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Usuario ID: ${widget.userId}', style: const TextStyle(fontSize: 16)),
            const SizedBox(height: 4),
            Text('Apartamento: ${apartment ?? 'Cargando...'}', style: const TextStyle(fontSize: 16)),
          ],
        ),
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
                              launchUrlString('https://tiktok.com/@tuempresa');
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
              icon: const Icon(Icons.chat_bubble_outline),
              iconSize: 28,
              color: Colors.purple,
              onPressed: () {},
            ),
            IconButton(
              icon: const Icon(Icons.person_outline),
              iconSize: 28,
              color: Colors.purple,
              onPressed: () {},
            ),
          ],
        ),
      ),
      Positioned(
        bottom: 35,
        child: GestureDetector(
          onTap: () {
            // acción del botón central
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