import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

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
    final url = Uri.parse('https://sistemacerceta.com/domicilios/${widget.userId}'); // Ajusta el puerto según tu servidor
    final response = await http.get(url);

    if (response.statusCode == 200) {
      setState(() {
        domicilios = json.decode(response.body);
      });
    } else {
      print("Error al obtener los domicilios");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("Domicilios")),
      body: domicilios.isEmpty
          ? Center(child: CircularProgressIndicator())
          : ListView.builder(
              itemCount: domicilios.length,
              itemBuilder: (context, index) {
                final domicilio = domicilios[index];
                return ListTile(
                  leading: Icon(Icons.home),
                  title: Text("Fecha: ${domicilio['created_at']}"),
                  subtitle: Text("Observaciones: ${domicilio['observaciones']}"),
                );
              },
            ),
    );
  }
}
