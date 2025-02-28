import 'package:flutter/material.dart';
import 'domicilios.dart'; // Importa tu nueva pantalla

class HomeScreen extends StatelessWidget {
  final String userId;

  HomeScreen({required this.userId});

  final List<Map<String, dynamic>> rooms = [
    {"name": "Pagos", "devices": 10, "image": "assets/images/pagos.png"},
    {"name": "Domicilios", "devices": 5, "image": "assets/images/domicilios.png"},
    {"name": "Informes", "devices": 3, "image": "assets/images/informe.png"},
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      body: SingleChildScrollView(
        child: Column(
          children: [
            // Contenedor principal
            Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 5)],
              ),
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          "My Home",
                          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                        ),
                        Icon(Icons.more_vert, color: Colors.grey[600]),
                      ],
                    ),
                  ),

                  Container(
                    width: double.infinity,
                    padding: EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0xFF1E99D3), Color(0xFF1565C0)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.home, size: 30, color: Colors.white),
                            SizedBox(width: 10),
                            Text(
                              "Apartamento",
                              style: TextStyle(color: Colors.white, fontSize: 16),
                            ),
                          ],
                        ),
                        Text(
                          "43 Devices",
                          style: TextStyle(color: Colors.white),
                        ),
                      ],
                    ),
                  ),

                  Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: GridView.builder(
                      shrinkWrap: true,
                      physics: NeverScrollableScrollPhysics(),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                        childAspectRatio: 1,
                      ),
                      itemCount: rooms.length,
                      itemBuilder: (context, index) {
                        final room = rooms[index];
                        return GestureDetector(
                     onTap: () {
  if (room["name"] == "Domicilios") {
    Navigator.push(
      context,
      MaterialPageRoute(
builder: (context) => PedidosScreen(userId: userId),
      ),
    );
  }
},

                          child: Container(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 5)],
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Image.asset(room["image"], width: 50, height: 50), // Imagen en lugar del icono
                                SizedBox(height: 8),
                                Text(
                                  room["name"],
                                  style: TextStyle(fontWeight: FontWeight.bold),
                                ),
                                Text(
                                  "${room["devices"]} Devices",
                                  style: TextStyle(color: Colors.grey[600]),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),

      // Barra de navegación inferior correctamente posicionada
      bottomNavigationBar: Container(
        height: 60,
        width: double.infinity,
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 5)],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            Icon(Icons.home, color: Colors.purple),
            Icon(Icons.article, color: Colors.grey),
            Icon(Icons.notifications, color: Colors.grey),
            Icon(Icons.settings, color: Colors.grey),
          ],
        ),
      ),
    );
  }
}
