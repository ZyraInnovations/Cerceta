import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:intl/intl.dart';  // Importar intl






class DetalleDomicilioScreen extends StatelessWidget {
  final Map<String, dynamic> domicilio;

  DetalleDomicilioScreen({required this.domicilio});

  String formatDate(String date) {
    final parsedDate = DateTime.parse(date);
    final formatter = DateFormat('d MMMM yyyy, HH:mm');
    return formatter.format(parsedDate);
  }

  @override
  Widget build(BuildContext context) {
    final estado = domicilio['estado'];
    final fotoBase64 = domicilio['foto']; // Foto en base64

    return Scaffold(
      appBar: AppBar(
        title: Text('Detalles del Domicilio'),
        backgroundColor: Colors.blueGrey[800],
        elevation: 0,
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Card(
            color: Colors.white, // Se quitó el fondo amarillo
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(25),
            ),
            elevation: 8,
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Foto del domicilio con GestureDetector para hacer clic
                  if (fotoBase64 != null && fotoBase64.isNotEmpty) 
                    GestureDetector(
                      onTap: () {
                        // Navegar a la pantalla de la imagen en pantalla completa
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => FullScreenImageScreen(fotoBase64: fotoBase64),
                          ),
                        );
                      },
                      child: Image.memory(
                        Base64Decoder().convert(fotoBase64),
                        height: 200,
                        fit: BoxFit.cover,
                      ),
                    ),
                  SizedBox(height: 20),
                  // Título
                  Text(
                    'Detalles del Domicilio',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: Colors.blueGrey[800],
                    ),
                  ),
                  SizedBox(height: 20),
                  // Fecha
                  Text(
                    'Fecha de Creación:',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w500,
                      color: Colors.blueGrey[700],
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    formatDate(domicilio['created_at']),
                    style: TextStyle(
                      fontSize: 18,
                      color: Colors.blueGrey[600],
                    ),
                  ),
                  SizedBox(height: 20),
                  // Observaciones
                  Text(
                    'Observaciones:',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w500,
                      color: Colors.blueGrey[700],
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    domicilio['observaciones'] ?? 'No hay observaciones.',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.blueGrey[600],
                    ),
                  ),
                  SizedBox(height: 20),
                  // Estado
                  Text(
                    'Estado:',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w500,
                      color: Colors.blueGrey[700],
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    domicilio['estado'] == 1 ? 'Pendiente' : 'Completado',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: domicilio['estado'] == 1
                          ? Colors.orange[700]
                          : Colors.green[700],
                    ),
                  ),
                  SizedBox(height: 30),
                  // Botones de acción en columna
                  Column(
                    children: [
                   ElevatedButton(
  onPressed: () {
    _recibirDomicilio(context, domicilio);  // Llamamos a la función cuando se presiona el botón
  },
                        child: Text('Recibir Domicilio'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green[600],
                          foregroundColor: Colors.white,
                          padding: EdgeInsets.symmetric(vertical: 15, horizontal: 50),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(30),
                          ),
                        ),
                      ),
                      SizedBox(height: 15), // Espacio entre botones
                      ElevatedButton(
                        onPressed: () {
                          // Acción para "Reportar Novedad"
                        },
                        child: Text('Reportar Novedad'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red[600],
                          foregroundColor: Colors.white,
                          padding: EdgeInsets.symmetric(vertical: 15, horizontal: 50),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(30),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}




class FullScreenImageScreen extends StatelessWidget {
  final String fotoBase64;

  FullScreenImageScreen({required this.fotoBase64});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: Icon(Icons.close, color: Colors.white),
            onPressed: () {
              Navigator.pop(context); // Cerrar la vista en pantalla completa
            },
          ),
        ],
      ),
      body: Center(
        child: GestureDetector(
          onTap: () {
            Navigator.pop(context); // Cerrar la vista en pantalla completa al tocar la imagen
          },
          child: Image.memory(
            Base64Decoder().convert(fotoBase64),
            fit: BoxFit.contain,
          ),
        ),
      ),
    );
  }
}







class DomiciliosScreen extends StatefulWidget {
  final String userId;

  DomiciliosScreen({required this.userId});

  @override
  _DomiciliosScreenState createState() => _DomiciliosScreenState();
}

class _DomiciliosScreenState extends State<DomiciliosScreen> {
  List<dynamic> domicilios = [];

  @override
  void initState() {
    super.initState();
    fetchDomicilios();
  }

  Future<void> fetchDomicilios() async {
    final url = Uri.parse('http://localhost:3000/domicilios/${widget.userId}');
    final response = await http.get(url);

    if (response.statusCode == 200) {
      setState(() {
        domicilios = json.decode(response.body);
      });
    } else {
      print("Error al obtener los domicilios");
    }
  }

  String formatDate(String date) {
    final parsedDate = DateTime.parse(date);  // Convertir el string en DateTime
    final formatter = DateFormat('d MMMM yyyy, HH:mm');  // Formato deseado
    return formatter.format(parsedDate);  // Formatear la fecha
  }

  // Función para mostrar el estado
  String getEstado(int estado) {
    return estado == 1 ? 'Pendiente' : 'Completado';  // Si estado es 1, mostrar "Pendiente"
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text("Domicilios", style: TextStyle(fontWeight: FontWeight.w600, fontSize: 22)),
        backgroundColor: Colors.blueGrey[800],
        elevation: 0,
      ),
      body: domicilios.isEmpty
          ? Center(child: CircularProgressIndicator())
          : ListView.builder(
              itemCount: domicilios.length,
              itemBuilder: (context, index) {
                final domicilio = domicilios[index];
                final estado = domicilio['estado'];

                return TweenAnimationBuilder(
                  tween: Tween<Offset>(
                    begin: Offset(1.0, 0.0),  // Comienza desde la derecha
                    end: Offset.zero,
                  ),
                  duration: Duration(milliseconds: 300),
                  builder: (context, Offset offset, child) {
                    return Card(
                      margin: EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                      color: estado == 1
                          ? Colors.amber[200] // Fondo amarillo suave si está pendiente
                          : (estado == 2 ? Colors.green[200] : Colors.white), // Fondo verde suave si está completado
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(25), // Bordes redondeados
                      ),
                      elevation: 5,
                      child: Transform.translate(
                        offset: offset, // Efecto de movimiento sutil
                        child: GestureDetector(
                          onTap: () {
                            // Navegar a la pantalla de detalles del domicilio
                            Navigator.push(
                              context,
                              MaterialPageRoute(
    builder: (context) => DetalleDomicilioScreen(domicilio: domicilio),
    
                              ),
                            );
                          },
                          child: ListTile(
                            contentPadding: EdgeInsets.symmetric(vertical: 16, horizontal: 20),
                            leading: Icon(Icons.delivery_dining, color: Colors.blueGrey, size: 30),
                            title: Text(
                              "Fecha: ${formatDate(domicilio['created_at'])}",
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.black87),
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                SizedBox(height: 8),
                                Text(
                                  "Observaciones: ${domicilio['observaciones']}",
                                  style: TextStyle(color: Colors.grey[700], fontSize: 14),
                                ),
                                SizedBox(height: 8),
                                Text(
                                  "Estado: ${getEstado(estado)}",
                                  style: TextStyle(
                                    color: estado == 1 ? Colors.black : Colors.white,
                                    fontWeight: FontWeight.w500,
                                    fontSize: 16,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
    );
  }
}


Future<void> _recibirDomicilio(BuildContext context, Map<String, dynamic> domicilio) async {
  final id = domicilio['id'];
  if (id == null) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('ID inválido.')));
    return;
  }

  final url = Uri.parse('http://localhost:3000/domicilio/$id');  // Pasar el ID en la URL
  final data = {'estado': 2};  // Cambiar estado a "Completado" (2)

  try {
    final response = await http.put(
      url,
      headers: {'Content-Type': 'application/json'},
      body: json.encode(data),
    );

    if (response.statusCode == 200) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Domicilio recibido con éxito.')));
      // Actualizar el estado localmente en la UI si es necesario
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error al recibir el domicilio.')));
    }
  } catch (e) {
    print("Error al realizar la solicitud: $e");
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Hubo un error al realizar la solicitud.')));
  }
}
