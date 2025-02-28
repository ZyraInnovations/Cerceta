import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'domicilios.dart'; // Pantalla de Domicilios

// Widget para el badge animado con movimiento más notorio y bonito
class AnimatedBadge extends StatefulWidget {
  final int count;
  const AnimatedBadge({Key? key, required this.count}) : super(key: key);

  @override
  _AnimatedBadgeState createState() => _AnimatedBadgeState();
}

class _AnimatedBadgeState extends State<AnimatedBadge>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;
  
  @override
  void initState() {
    super.initState();
    // Animación pulsante de escala de 1.0 a 1.5 con una curva marcada y bonita.
    _controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: 800),
    )..repeat(reverse: true);
    _animation = Tween<double>(begin: 1.0, end: 1.5).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOutBack),
    );
  }
  
  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
  
  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _animation,
      child: Container(
        padding: EdgeInsets.all(10), // Tamaño mayor para el badge
        decoration: BoxDecoration(
          color: Colors.redAccent,
          shape: BoxShape.circle,
        ),
        child: Text(
          '${widget.count}',
          style: TextStyle(
            color: Colors.white,
            fontSize: 16, // Fuente algo más grande
            fontWeight: FontWeight.bold,
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

class HomeScreen extends StatefulWidget {
  final String userId;
  HomeScreen({required this.userId});

  @override
  _HomeScreenState createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Timer? _timer;

  // Lista estática para otros items
  final List<Map<String, dynamic>> rooms = [
    {
      "name": "Pagos",
      "devices": 10,
      "image": "assets/images/pagos.png",
      "pendientes": 2
    },
    // Para "Domicilios", se ignorará el valor estático de "pendientes"
    {
      "name": "Domicilios",
      "devices": 5,
      "image": "assets/images/domicilios.png",
      "pendientes": 0
    },
    {
      "name": "Informes",
      "devices": 3,
      "image": "assets/images/informe.png",
      "pendientes": 1
    },
  ];

  // Ruta de tu logo (colócalo en assets/images/)
  final String logoImage = 'assets/images/2022cercetafinal_blanco.png';

  @override
  void initState() {
    super.initState();
    // Configura un Timer que refresca la pantalla cada 3 segundos
    _timer = Timer.periodic(Duration(seconds: 3), (timer) {
      setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  /// Consulta el endpoint y retorna el número de domicilios cuyo estado sea "pendiente"
  Future<int> fetchDomiciliosPendientes(String userId) async {
    final url = 'https://appvianco.com/domicilios_pendientes/$userId'; // Reemplaza con la URL real de tu API
    final response = await http.get(Uri.parse(url));
    if (response.statusCode == 200) {
      final List<dynamic> data = jsonDecode(response.body);
      int count = data.where((d) => d["estado"] == 1).length;
      print("Cantidad de domicilios pendientes: $count");
      return count;
    } else {
      print("Error en la consulta: ${response.statusCode}");
      throw Exception("Error al cargar domicilios");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // Fondo con degradado sutil para toda la pantalla
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [Colors.blue[50]!, Colors.white],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              _buildAppBar(context),
              Expanded(child: _buildContent(context)),
            ],
          ),
        ),
      ),
      bottomNavigationBar: _buildBottomNavigationBar(context),
    );
  }

  Widget _buildAppBar(BuildContext context) {
    return Container(
      margin: EdgeInsets.only(bottom: 20),
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.black, Colors.grey[900]!],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(30)),
        boxShadow: [
          BoxShadow(
            color: Colors.black26,
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          // Logo a la izquierda
          Image.asset(
            logoImage,
            height: 40,
            fit: BoxFit.contain,
          ),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              "MENU PRINCIPAL",
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 28,
                color: Colors.white,
              ),
            ),
          ),
          Icon(Icons.notifications, color: Colors.white, size: 28),
        ],
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    return SingleChildScrollView(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Tarjeta informativa del apartamento
            _buildApartmentCard(),
            SizedBox(height: 30),
            Text(
              "Rooms",
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
            SizedBox(height: 20),
            _buildRoomsGrid(context),
            SizedBox(height: 30),
          ],
        ),
      ),
    );
  }

  Widget _buildApartmentCard() {
    return Container(
      padding: EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF1E99D3), Color(0xFF1565C0)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.shade400,
            blurRadius: 10,
            offset: Offset(0, 4),
          )
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Icon(Icons.home, size: 32, color: Colors.white),
              SizedBox(width: 12),
              Text(
                "Apartamento",
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          Text(
            "43 Devices",
            style: TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRoomsGrid(BuildContext context) {
    return GridView.builder(
      itemCount: rooms.length,
      shrinkWrap: true,
      physics: NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2, crossAxisSpacing: 16, mainAxisSpacing: 16, childAspectRatio: 1.1),
      itemBuilder: (context, index) {
        final room = rooms[index];
        return GestureDetector(
          onTap: () {
            if (room["name"] == "Domicilios") {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => PedidosScreen(userId: widget.userId),
                ),
              );
            }
          },
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: LinearGradient(
                colors: [Colors.white, Colors.grey.shade50],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.grey.shade300,
                  blurRadius: 8,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: Stack(
              children: [
                Center(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Image.asset(
                      room["image"],
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
                // Para "Domicilios", se usa la consulta al endpoint
                if (room["name"] == "Domicilios")
                  FutureBuilder<int>(
                    future: fetchDomiciliosPendientes(widget.userId),
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting) {
                        return Positioned(
                          right: 12,
                          top: 12,
                          child: Container(
                            width: 24,
                            height: 24,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: Colors.redAccent,
                              shape: BoxShape.circle,
                            ),
                            child: CircularProgressIndicator(
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              strokeWidth: 2,
                            ),
                          ),
                        );
                      }
                      if (snapshot.hasError) {
                        print("Error en FutureBuilder: ${snapshot.error}");
                        return Positioned(
                          right: 12,
                          top: 12,
                          child: Icon(Icons.error, color: Colors.redAccent, size: 24),
                        );
                      }
                      if (snapshot.hasData && snapshot.data! > 0) {
                        return Positioned(
                          right: 12,
                          top: 12,
                          child: AnimatedBadge(count: snapshot.data!),
                        );
                      }
                      return Container();
                    },
                  )
                // Para otros rooms, se usa el valor estático si es mayor a 0
                else if (room["pendientes"] > 0)
                  Positioned(
                    right: 12,
                    top: 12,
                    child: Container(
                      padding: EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: Colors.redAccent,
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        '${room["pendientes"]}',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildBottomNavigationBar(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.grey.shade400,
            blurRadius: 10,
            offset: Offset(0, -2),
          ),
        ],
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(20),
          topRight: Radius.circular(20),
        ),
      ),
      child: BottomNavigationBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        items: [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.article), label: 'Articles'),
          BottomNavigationBarItem(icon: Icon(Icons.notifications), label: 'Notifications'),
          BottomNavigationBarItem(icon: Icon(Icons.settings), label: 'Settings'),
        ],
        currentIndex: 0,
        selectedItemColor: Colors.deepPurple,
        unselectedItemColor: Colors.grey,
        type: BottomNavigationBarType.fixed,
        onTap: (index) {
          // Implementa la navegación según el índice
        },
      ),
    );
  }
}
